class_name QsNativeSession
extends Node

## Native Colyseus transport and the same REST admission used by the web client.
## Long-lived credentials stay in memory and never enter URLs or logs.
signal status_changed(status: String, message: String)
signal snapshot_received(snapshot: Dictionary)
signal session_ended
signal account_changed(player: Dictionary)
signal game_event(event: Dictionary)

const Decoder = preload("res://src/network/wire_decoder.gd")
const Compatibility = preload("res://src/physics/compatibility_gate.gd")
const PROTOCOL := "campus-mp-0.9.0"
var api_base := "http://127.0.0.1:2568/v1"
var realtime_base := "http://127.0.0.1:2567"
var map_identity: Dictionary = {}
var player: Dictionary = {}
var player_id: String:
	get: return str(player.get("id", ""))
var snapshot: Dictionary = {}
var status := "idle"
var rtt_ms := 0.0
var _token := ""
var _operation := 0
var _client: Object
var _room: Object
var _room_callbacks: Array = []
var _queue: Dictionary = {}
var _decoder = Decoder.new()
var _controls := {"moveX": 0.0, "moveY": 0.0, "yaw": 0.0, "pitch": 0.0, "fire": false, "aim": false, "sprint": false, "crouch": false}
var _seq := 0
var _action_id := 0
var _actions: Array = []
var _batch: Array = []
var _sample_accumulator := 0.0
var _ping_accumulator := 0.0
var _last_tick := 0
var _last_snapshot_ms := 0
var _last_resync_ms := -1000
var _loading := true
var _last_loading_key := ""
var _last_event := 0
var _input_epoch := -1
var _generation := -1

func configure(api: String, realtime: String, identity: Dictionary) -> bool:
	if not _valid_endpoint(api) or not _valid_endpoint(realtime):
		_fail("连接地址不可用。")
		return false
	api_base = api.trim_suffix("/")
	if not api_base.ends_with("/v1"):
		api_base += "/v1"
	realtime_base = realtime.trim_suffix("/")
	map_identity = identity.duplicate(true)
	return true

func login(username: String, password: String) -> bool:
	leave_room()
	var operation := _operation
	var result: Dictionary = await _request(api_base + "/accounts/login", HTTPClient.METHOD_POST, {"username": username, "password": password})
	if operation != _operation:
		return false
	if not result.get("ok"):
		_fail(result.get("message", "暂时无法登录。"))
		return false
	var data: Dictionary = result.data
	if not data.get("token") is String or not data.get("player") is Dictionary:
		_fail("登录未完成，请重试。")
		return false
	_token = data.token
	player = data.player.duplicate(true)
	account_changed.emit(player)
	_set_status("idle", "已登录")
	return true

func list_rooms() -> Array:
	var result: Dictionary = await _request(realtime_base + "/v1/rooms")
	return result.get("data", {}).get("rooms", []) if result.get("ok") else []

func create_room(options: Dictionary) -> bool:
	var safe_options := options.duplicate(true)
	safe_options["ranked"] = false
	return await _join(safe_options, "")

func join_room(invite_code: String) -> bool:
	return await _join({}, invite_code.strip_edges().to_upper())

func _join(options: Dictionary, invite_code: String) -> bool:
	if not Compatibility.allows_endpoint(realtime_base):
		_fail("原生联机兼容检查尚未完成，当前测试版仅连接本机测试服务。")
		return false
	if _token.is_empty():
		_fail("请先登录账号。")
		return false
	if not ClassDB.class_exists("_ColyseusClient"):
		_fail("联机组件尚未安装，请运行组件准备脚本。")
		return false
	var sdk_version: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://addons/colyseus/version.json"))
	if not sdk_version is Dictionary or sdk_version.get("version") != "0.18.7":
		_fail("联机组件版本不一致，请重新准备测试组件。")
		return false
	leave_room()
	var operation := _operation
	_set_status("connecting", "正在连接")
	var room_id := ""
	if not invite_code.is_empty():
		var resolved: Dictionary = await _request(realtime_base + "/v1/rooms/resolve", HTTPClient.METHOD_POST, {"inviteCode": invite_code})
		if operation != _operation:
			return false
		if not resolved.get("ok"):
			_fail(resolved.get("message", "房间已结束或房间码不正确。"))
			return false
		var info: Dictionary = resolved.data
		room_id = info.roomId
		options = {"mode": info.mode, "variant": info.get("variant", "tdm"), "difficulty": info.get("difficulty", "standard")}
	var remote: Dictionary = await _request(realtime_base + "/map-identity")
	if operation != _operation:
		return false
	if not remote.get("ok"):
		_fail(remote.get("message", "暂时无法检查地图，请重试。"))
		return false
	if not _same_map(map_identity, remote.get("data", {})):
		_fail("地图版本不一致，请更新测试资源。")
		return false
	var ticket: Dictionary = await _request(api_base + "/multiplayer/tickets", HTTPClient.METHOD_POST, {"mode": options.get("mode", "coop"), "variant": options.get("variant", "tdm"), "roomId": room_id if not room_id.is_empty() else null, "inviteCode": invite_code if not invite_code.is_empty() else null}, _token)
	if operation != _operation:
		return false
	if not ticket.get("ok"):
		_fail(ticket.get("message", "暂时无法取得入场资格。"))
		return false
	var body := {"ticket": ticket.data.get("ticket", ""), "protocolVersion": PROTOCOL, "map": map_identity, "options": options, "create": invite_code.is_empty()}
	if not room_id.is_empty():
		body["roomId"] = room_id
	if not invite_code.is_empty():
		body["inviteCode"] = invite_code
	# A queue is a server-side side effect. Keep its result even after cancellation,
	# so its authenticated cancellation handle is released rather than abandoned.
	var response: Dictionary = await _request(realtime_base + "/v1/queue", HTTPClient.METHOD_POST, body)
	if not response.get("ok"):
		if operation == _operation:
			_fail(response.get("message", "暂时无法加入房间。"))
		return false
	var admission: Dictionary = response.data
	var handle := {"id": admission.get("queueId", ""), "token": admission.get("queueToken", "")}
	if operation != _operation:
		_cancel_queue(handle)
		return false
	_queue = handle
	var deadline := Time.get_ticks_msec() + 180000
	while admission.get("status") == "waiting" and Time.get_ticks_msec() < deadline:
		_set_status("queued", "正在等待空余房间")
		var delay_ms: int = clampi(int(admission.get("retryAfterMs", 0)), 0, 2000)
		if delay_ms > 0:
			await get_tree().create_timer(float(delay_ms) / 1000.0).timeout
		if operation != _operation:
			return false
		response = await _request(realtime_base + "/v1/queue/" + str(handle.id).uri_encode() + "?wait=8000", HTTPClient.METHOD_GET, {}, handle.token)
		if operation != _operation:
			return false
		if not response.get("ok"):
			_cancel_queue(handle)
			_queue.clear()
			_fail(response.get("message", "连接中断，请重试。"))
			return false
		admission = response.data
	if admission.get("status") != "ready" or not admission.get("reservation") is Dictionary:
		_cancel_queue(handle)
		_queue.clear()
		_fail("暂时没有可加入的席位，请重试。")
		return false
	_client = ClassDB.instantiate("_ColyseusClient")
	_client.call("set_endpoint", realtime_base.replace("http://", "ws://").replace("https://", "wss://"))
	_room = _client.call("consume_seat_reservation", JSON.stringify(admission.reservation))
	if _room == null:
		_cancel_queue(handle)
		_queue.clear()
		_fail("未能连接房间，请重试。")
		return false
	# The pinned 0.18.7 C call wrapper explicitly reference()s the returned room
	# before constructing its return Variant, leaving one extra ownership lease.
	# Our field already holds the normal Godot reference; balance only that lease.
	if _room is RefCounted and _room.get_reference_count() > 1:
		_room.unreference()
	_bind_room(_room, operation)
	return true

func _bind_room(room: Object, operation: int) -> void:
	room.call("set_reconnection_options", {"enabled": true, "min_delay_ms": 500, "max_delay_ms": 2000, "max_retries": 60})
	_connect_room(room, "joined", func():
		if operation != _operation or room != _room:
			room.call("leave")
			return
		_queue.clear()
		_decoder.reset()
		_set_status("lobby", "已进入房间")
		room.call("send_message", "resync", {})
	)
	_connect_room(room, "message_received", func(type: Variant, data: Variant):
		if operation == _operation and room == _room:
			_receive(str(type), data)
	)
	_connect_room(room, "error", func(_code: int, _message: String):
		if operation == _operation and room == _room:
			clear_controls()
			_fail("连接暂时中断，请重试。")
	)
	_connect_room(room, "left", func(_code: int, _reason: String):
		if operation == _operation and room == _room:
			_disconnect_room(room)
			_room = null
			clear_controls()
			_decoder.reset()
			_set_status("idle", "已离开房间")
			session_ended.emit()
	)
	_connect_room(room, "dropped", func(_code: int, _reason: String):
		if operation == _operation and room == _room:
			clear_controls()
			_set_status("reconnecting", "正在恢复原房间连接")
	)
	_connect_room(room, "reconnected", func():
		if operation == _operation and room == _room:
			clear_controls()
			_decoder.reset()
			_last_loading_key = ""
			_set_status("connecting", "正在同步对局")
			_send("resync", {})
	)

func _connect_room(room: Object, event: String, callback: Callable) -> void:
	room.connect(event, callback)
	_room_callbacks.append({"event": event, "callback": callback})

func _disconnect_room(room: Object) -> void:
	# Signal closures capture the native room. Disconnect before releasing it to
	# avoid a RefCounted room -> callable -> room ownership cycle.
	for binding in _room_callbacks:
		if room.is_connected(binding.event, binding.callback):
			room.disconnect(binding.event, binding.callback)
	_room_callbacks.clear()

func _receive(type: String, data: Variant) -> void:
	if not data is Dictionary:
		return
	if type == "snapshot":
		var decoded: Dictionary = _decoder.accept(data)
		if decoded.is_empty():
			if _decoder.last_error == "protocol":
				leave_room()
				_fail("联机版本已更新，请先更新客户端。")
				return
			if not _decoder.last_error.is_empty() and Time.get_ticks_msec() - _last_resync_ms >= 500:
				_last_resync_ms = Time.get_ticks_msec()
				_send("resync", {"afterSeq": _decoder.sequence})
			return
		snapshot = decoded
		_last_tick = int(snapshot.tick)
		_last_snapshot_ms = Time.get_ticks_msec()
		var self_state: Dictionary = snapshot.self
		var receipt: Dictionary = self_state.get("inputReceipt", {})
		if int(receipt.get("epoch", 0)) != _input_epoch:
			clear_controls()
			_input_epoch = int(receipt.get("epoch", 0))
		if int(self_state.get("generation", 0)) != _generation:
			_generation = int(self_state.get("generation", 0))
			_loading = true
			_last_loading_key = ""
			clear_controls()
		_seq = maxi(_seq, maxi(int(receipt.get("acceptedSeq", 0)), int(receipt.get("cancelledThrough", 0))))
		_action_id = maxi(_action_id, int(self_state.get("actionAck", 0)))
		for event in snapshot.get("events", []):
			if int(event.get("serial", 0)) > _last_event:
				_last_event = int(event.serial)
				game_event.emit(event)
		var next_status := "playing" if snapshot.phase == "playing" or snapshot.phase == "paused" else "lobby"
		if next_status != status:
			_set_status(next_status, "对局进行中" if next_status == "playing" else "房间准备")
		_send_loading()
		snapshot_received.emit(snapshot)
	elif type == "latency":
		rtt_ms = maxf(0.0, float(Time.get_ticks_msec()) - float(data.get("sentAt", Time.get_ticks_msec())))
		_send("latency-ack", {"nonce": data.get("nonce", "")})
	elif type == "loading-retry":
		_last_loading_key = ""
	elif type == "error":
		clear_controls()
		_fail(str(data.get("message", "此操作暂时无法完成。")))

func submit_controls(move: Vector2, yaw: float, pitch: float, fire := false, aim := false, sprint := false, crouch := false) -> void:
	_controls = {"moveX": clampf(move.x, -1, 1), "moveY": clampf(move.y, -1, 1), "yaw": yaw, "pitch": clampf(pitch, -1.35, 1.35), "fire": fire, "aim": aim, "sprint": sprint, "crouch": crouch}

func pulse_action(action: String) -> void:
	if action not in ["jump", "reload", "slide", "interact", "switch", "drop-task", "smoke", "use-gadget", "cycle-gadget"] or _loading or status != "playing":
		return
	_action_id += 1
	_actions.append({"id": _action_id, "type": action})

func clear_controls() -> void:
	_controls.merge({"moveX": 0.0, "moveY": 0.0, "fire": false, "aim": false, "sprint": false, "crouch": false}, true)
	_actions.clear()
	_batch.clear()

func set_loading(value: bool) -> void:
	if _loading == value:
		return
	_loading = value
	if value:
		clear_controls()
	_last_loading_key = ""
	_send_loading()

func _send_loading() -> void:
	if snapshot.is_empty() or _room == null:
		return
	var own: Dictionary = snapshot.self
	var key := str(own.get("generation", 0)) + ":" + str(own.get("loadingEpoch", 0)) + ":" + str(_loading)
	if key == _last_loading_key:
		return
	_last_loading_key = key
	_send("loading", {"epoch": own.get("loadingEpoch", 0), "generation": own.get("generation", 0), "ready": not _loading, "scopeReady": not _loading, "map": map_identity, "seq": _seq, "cancelActionThrough": _action_id, "yaw": _controls.yaw, "pitch": _controls.pitch})

func _physics_process(delta: float) -> void:
	if _room == null or snapshot.is_empty():
		return
	_ping_accumulator += delta
	if _ping_accumulator >= 2.0:
		_ping_accumulator = 0.0
		_send("latency", {"id": Time.get_ticks_msec(), "sentAt": Time.get_ticks_msec()})
	if status != "playing" or _loading:
		return
	# A stale native prototype must stop sending, not silently keep moving.
	if Time.get_ticks_msec() - _last_snapshot_ms > 1500:
		clear_controls()
		return
	_sample_accumulator += minf(delta, 0.05)
	var samples := 0
	while _sample_accumulator >= 1.0 / 60.0 and samples < 3:
		_sample_accumulator -= 1.0 / 60.0
		samples += 1
		_seq += 1
		var command := _controls.duplicate(true)
		var receipt: Dictionary = snapshot.self.get("inputReceipt", {})
		var estimated_tick := _last_tick + int(float(Time.get_ticks_msec() - _last_snapshot_ms) * 0.06)
		command.merge({"seq": _seq, "tick": estimated_tick, "inputEpoch": receipt.get("epoch", 0), "clientTick": _seq, "targetTick": estimated_tick + clampi(int(rtt_ms * 0.03) + 2, 2, 10), "renderTick": _last_tick, "actions": _actions.map(func(a): return a.type), "actionIds": _actions.duplicate(true)}, true)
		_actions.clear()
		_batch.append(command)
		if _batch.size() >= 2:
			_send("input", {"commands": _batch.duplicate(true)})
			_batch.clear()

func _process(_delta: float) -> void:
	# The raw native binding does not install the wrapper's automatic poller.
	# Poll on the scene thread so callbacks cannot race scene objects.
	if _client != null:
		_client.call("poll")

func set_ready(value: bool) -> void:
	_send("ready", {"ready": value})

func set_loadout(weapon: String, avatar := "campus-a") -> void:
	if weapon not in ["mp5", "m4a1", "ak47", "m249", "r870", "awm"]:
		return
	_send("loadout", {"weapon": weapon, "avatar": avatar})

func start_match() -> void:
	_send("start", {})

func _send(type: String, body: Dictionary) -> void:
	if _room != null:
		_room.call("send_message", type, body)

func leave_room() -> void:
	_operation += 1
	clear_controls()
	if not _queue.is_empty():
		_cancel_queue(_queue.duplicate())
		_queue.clear()
	if _room != null:
		_disconnect_room(_room)
		_room.call("leave")
	_room = null
	_client = null
	snapshot.clear()
	_decoder.reset()
	_last_event = 0
	_input_epoch = -1
	_generation = -1
	_seq = 0
	_action_id = 0
	_sample_accumulator = 0.0
	_ping_accumulator = 0.0
	_last_tick = 0
	_last_snapshot_ms = 0
	_last_resync_ms = -1000
	_last_loading_key = ""
	_set_status("idle", "")

func logout() -> void:
	leave_room()
	_token = ""
	player.clear()
	account_changed.emit(player)

func _cancel_queue(handle: Dictionary) -> void:
	if not str(handle.get("id", "")).is_empty() and not str(handle.get("token", "")).is_empty():
		await _request(realtime_base + "/v1/queue/" + str(handle.id).uri_encode(), HTTPClient.METHOD_DELETE, {}, str(handle.token))

func _request(url: String, method := HTTPClient.METHOD_GET, body: Dictionary = {}, bearer := "") -> Dictionary:
	var request := HTTPRequest.new()
	request.timeout = 15.0
	request.body_size_limit = 2 * 1024 * 1024
	request.max_redirects = 0
	add_child(request)
	var headers := PackedStringArray(["Content-Type: application/json", "Accept: application/json"])
	if not bearer.is_empty():
		headers.append("Authorization: Bearer " + bearer)
	var error := request.request(url, headers, method, JSON.stringify(body) if method != HTTPClient.METHOD_GET else "")
	if error != OK:
		request.queue_free()
		return {"ok": false, "message": "网络暂时不可用，请重试。"}
	var response: Array = await request.request_completed
	request.queue_free()
	var parsed: Variant = JSON.parse_string(response[3].get_string_from_utf8())
	if response[0] != HTTPRequest.RESULT_SUCCESS or not parsed is Dictionary:
		return {"ok": false, "message": "连接未完成，请重试。"}
	if int(response[1]) < 200 or int(response[1]) >= 300:
		return {"ok": false, "code": parsed.get("code", ""), "message": parsed.get("message", "暂时无法完成此操作。")}
	return {"ok": true, "data": parsed}

func _valid_endpoint(value: String) -> bool:
	return not value.contains("@") and not value.contains("?") and not value.contains("#") and (value.begins_with("https://") or value.begins_with("http://127.0.0.1:") or value.begins_with("http://localhost:"))

func _same_map(local: Dictionary, remote: Dictionary) -> bool:
	for key in ["sourceVersion", "collisionHash", "navigationHash", "manifestHash", "visionHash"]:
		if local.get(key, "") != remote.get(key, ""):
			return false
	return not str(local.get("manifestHash", "")).is_empty()

func _set_status(value: String, message: String) -> void:
	status = value
	status_changed.emit(value, message)

func _fail(message: String) -> void:
	_set_status("error", message)

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_FOCUS_OUT or what == NOTIFICATION_APPLICATION_PAUSED:
		clear_controls()

func _exit_tree() -> void:
	_operation += 1
	clear_controls()
	if _room != null:
		_disconnect_room(_room)
		_room.call("leave")
	_room = null
	_token = ""
