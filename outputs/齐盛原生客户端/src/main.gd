extends Node3D

const Campus = preload("res://src/map/campus_streamer.gd")
const Controller = preload("res://src/map/local_preview_controller.gd")
const Shell = preload("res://src/ui/client_shell.gd")
const Hud = preload("res://src/ui/combat_hud.gd")
const Session = preload("res://src/network/native_session.gd")
const Prediction = preload("res://src/physics/native_prediction.gd")
const Presentation = preload("res://src/combat_presenter.gd")
const Preferences = preload("res://src/client_settings.gd")
const Compatibility = preload("res://src/physics/compatibility_gate.gd")
var campus: QsCampusStreamer
var player: QsLocalPreviewController
var shell: QsClientShell
var hud: QsCombatHud
var session: QsNativeSession
var prediction: QsNativePrediction
var presentation: QsCombatPresenter
var preferences := Preferences.new()
var metadata: Dictionary = {}
var scene_camera: Camera3D
var world_owner: Node3D
var sun: DirectionalLight3D
var loading_cover: ColorRect
var loading_label: Label
var mobile := false
var preview := false
var network_preview := false
var _booting := false
var _session_epoch := 0
var _paused := false
var _controls: Dictionary = {}
var _hud_left := 0.0
var _loading_ready := false
var _confirmation: ConfirmationDialog
var _confirmation_action := ""
var updater: Node
var _offline_actions: Array[String] = []
var diagnostics := preload("res://src/runtime_diagnostics.gd").new()
var world_look: QsWorldEnvironment
var menu_audio: QsMenuAudio
var _solo_weather := "clear"
var _display_confirmation: ConfirmationDialog
var _display_timer: Timer
var _display_seconds := 0
var _settings_save_timer: Timer

func _ready() -> void:
	get_window().title = "齐盛Online · 原生 Preview "+str(ProjectSettings.get_setting("application/config/version"))
	mobile = OS.get_name() == "Android" or "--mobile-ui" in OS.get_cmdline_user_args()
	get_tree().auto_accept_quit = false
	get_viewport().disable_3d = true
	var file := "res://content/production/map.json"
	if not FileAccess.file_exists(file): file = "res://content/demo/map.json"
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(file))
	if parsed is Dictionary: metadata = parsed
	preferences.load_settings()
	if preferences.bootstrap_renderer(get_tree()): return
	preferences.apply(get_viewport(),mobile)
	_settings_save_timer = Timer.new()
	_settings_save_timer.one_shot = true
	_settings_save_timer.wait_time = 0.2
	add_child(_settings_save_timer)
	_settings_save_timer.timeout.connect(preferences.flush)
	preferences.persist_requested.connect(func(): _settings_save_timer.start())
	_apply_ui_scale()
	get_window().size_changed.connect(_apply_ui_scale)
	var canvas := CanvasLayer.new()
	add_child(canvas)
	hud = Hud.new()
	canvas.add_child(hud)
	hud.configure_inputs(float(preferences.values.touchScale),bool(preferences.values.aimToggle))
	hud.hide()
	hud.menu_requested.connect(_pause_preview)
	hud.action_requested.connect(_input_action)
	hud.spectate_requested.connect(_cycle_spectate)
	hud.held_changed.connect(func(action,held):
		if player: player.touch_buttons[action] = held
	)
	shell = Shell.new()
	canvas.add_child(shell)
	shell.settings = preferences.values
	shell.preferences = preferences
	shell.reduced_motion = bool(preferences.values.reducedMotion)
	shell.action_requested.connect(_menu_action)
	menu_audio = preload("res://src/menu_audio.gd").new()
	add_child(menu_audio)
	_build_loading(canvas)
	if not preferences.boot_message.is_empty(): shell.set_status(preferences.boot_message)
	if DisplayServer.get_name() != "headless" and FileAccess.file_exists(Preferences.RENDER_PROBE): _confirm_render_boot.call_deferred()
	session = Session.new()
	session.process_physics_priority = 10
	add_child(session)
	var api := OS.get_environment("QS_NATIVE_API")
	var realtime := OS.get_environment("QS_NATIVE_REALTIME")
	# Only the approved native-preview export with the formal map defaults online.
	var official_preview: bool = Compatibility.VERIFIED_PREDICTION and OS.has_feature("native-preview") and metadata.get("profile","demo") == "production"
	if api.is_empty(): api = "https://game.tianhw.top/api" if official_preview else "http://127.0.0.1:2568"
	if realtime.is_empty(): realtime = "https://game.tianhw.top/realtime" if official_preview else "http://127.0.0.1:2567"
	session.configure(api,realtime,metadata.get("mapIdentity",{}))
	session.status_changed.connect(_network_status)
	session.snapshot_received.connect(_network_snapshot)
	session.input_sampled.connect(_predict_input)
	session.game_event.connect(_game_event)
	session.account_changed.connect(func(value):
		shell.account = value
		if shell.page == "account": shell.show_page("account")
	)
	session.session_ended.connect(func():
		if network_preview: _return_home()
	)
	session.restore_login()
	updater = preload("res://src/network/native_updates.gd").new()
	add_child(updater)
	updater.status_changed.connect(func(message): shell.set_status(message))
	updater.update_available.connect(func(entry):
		_confirmation_action = "update"
		_confirmation.title = "下载新版本？"
		_confirmation.dialog_text = "Preview %s · %.1f MB\n下载完成后由你确认安装。" % [entry.get("version",""),float(entry.get("bytes",0))/1000000.0]
		_confirmation.ok_button_text = "下载"
		_confirmation.popup_centered(Vector2i(440,200))
	)
	var args := OS.get_cmdline_user_args()
	if "--preview" in args: _start_preview()
	if "--smoke" in args: _smoke()
	if "--capture-ui" in args: _capture_ui()
	if "--capture" in args: _capture()
	if "--qa-crossplay" in args and FileAccess.file_exists("res://tests/native_crossplay_driver.gd"):
		var driver = load("res://tests/native_crossplay_driver.gd").new()
		add_child(driver)
		driver.run(self)
	if "--audit-export" in args:
		print(JSON.stringify({"profile":metadata.get("profile","demo"),"formalMap":FileAccess.file_exists("res://content/production/map.json"),"demoMap":FileAccess.file_exists("res://content/demo/map.json"),"sdkInstalled":ClassDB.class_exists("_ColyseusClient"),"physicsInstalled":ClassDB.class_exists("QsRapierWorld"),"productionNetworkAllowed":Compatibility.allows_endpoint("https://game.tianhw.top/realtime"),"menuCreatesWorld":false}))
		get_tree().quit()

func _build_loading(canvas: CanvasLayer) -> void:
	loading_cover = ColorRect.new()
	loading_cover.color = Color("111a1e")
	loading_cover.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	canvas.add_child(loading_cover)
	loading_label = Label.new()
	loading_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	loading_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	loading_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	loading_label.theme = preload("res://themes/tactical.tres")
	loading_cover.add_child(loading_label)
	loading_cover.hide()
	_confirmation = ConfirmationDialog.new()
	_confirmation.theme = shell.theme
	_confirmation.title = "离开当前对局？"
	_confirmation.dialog_text = "本局仍会继续。离开后将释放席位。"
	_confirmation.ok_button_text = "确认离开"
	_confirmation.cancel_button_text = "继续留在这里"
	_confirmation.confirmed.connect(func():
		if _confirmation_action == "quit": get_tree().quit()
		elif _confirmation_action == "update": updater.download()
		elif _confirmation_action == "restart-renderer": _restart_renderer()
		else: _return_home()
	)
	canvas.add_child(_confirmation)
	_build_display_confirmation(canvas)

func _build_display_confirmation(canvas: CanvasLayer) -> void:
	_display_confirmation = ConfirmationDialog.new()
	_display_confirmation.title = "保留这些显示设置？"
	_display_confirmation.ok_button_text = "保留"
	_display_confirmation.cancel_button_text = "恢复"
	_display_confirmation.theme = preload("res://themes/tactical.tres")
	canvas.add_child(_display_confirmation)
	_display_timer = Timer.new()
	_display_timer.wait_time = 1.0
	add_child(_display_timer)
	_display_timer.timeout.connect(func():
		_display_seconds -= 1
		_display_confirmation.dialog_text = "%d 秒后恢复原来的显示设置。" % _display_seconds
		if _display_seconds <= 0: _finish_display(false)
	)
	_display_confirmation.confirmed.connect(func(): _finish_display(true))
	_display_confirmation.canceled.connect(func(): _finish_display(false))

func _finish_display(keep: bool) -> void:
	_display_timer.stop()
	_display_confirmation.hide()
	if keep: preferences.confirm_display()
	else: preferences.revert_display()
	_apply_ui_scale()
	if shell and shell.page == "settings": shell.show_page("settings")

func _confirm_render_boot() -> void:
	await get_tree().process_frame
	await get_tree().process_frame
	preferences.confirm_renderer()

func _restart_renderer() -> void:
	_return_home()
	await get_tree().process_frame
	if not preferences.restart_renderer(get_tree()): shell.set_status("重启未完成，请重试。")

func _ensure_world(competitive: bool) -> void:
	if world_owner: return
	diagnostics.record("world-create")
	world_owner = Node3D.new()
	add_child(world_owner)
	world_look = preload("res://src/world_environment.gd").new()
	world_look.configure(preferences.render_profile.profile())
	world_owner.add_child(world_look)
	world_look.weather_changed.connect(func():
		if campus: world_look.refresh_resident(campus.resident)
	)
	sun = world_look.sun
	world_look.set_cover_query(func(at: Vector3):
		return prediction != null and prediction.world != null and float(prediction.world.call("ray_distance",at+Vector3(0,0.2,0),Vector3.UP,40.0)) < 39.9
	)
	world_look.apply_weather(session.snapshot.get("weather",{"preset":_solo_weather,"seed":0,"startedAtTick":0}) if competitive else {"preset":_solo_weather,"seed":0,"startedAtTick":0},int(session.snapshot.get("tick",0)) if competitive else -1)
	campus = Campus.new()
	campus.diagnostics = diagnostics
	campus.chunk_attached.connect(func(root,row):
		if world_look: world_look.prepare_chunk(root,row)
	)
	campus.formal_collision = competitive
	world_owner.add_child(campus)
	player = Controller.new()
	player.authoritative_motion = competitive
	player.sensitivity = 0.0024*float(preferences.values.sensitivity)
	player.invert_y = bool(preferences.values.invertY)
	player.mouse_aim_toggle = bool(preferences.values.mouseAimToggle)
	player.keybindings = preferences.values.bindings
	world_owner.add_child(player)
	player.position = campus.spawn_position()+Vector3(0,0.1,0)
	player.yaw = float(metadata.get("spawnYaw",0))
	player.rotation.y = player.yaw
	player.paused.connect(_pause_preview)
	player.controls_sampled.connect(_native_controls)
	player.action_requested.connect(_input_action)
	player.eye.make_current()
	scene_camera = player.eye

func _start_preview() -> void:
	if _booting: return
	var use_rust: bool = metadata.get("profile","demo") == "production" and ClassDB.class_exists("QsRapierWorld")
	_ensure_world(use_rust)
	get_viewport().disable_3d = false
	if use_rust and not prediction:
		prediction = Prediction.new()
		var own := {"position":player.position,"velocity":Vector3.ZERO,"health":100,"stamina":100,"grounded":false,"crouched":false,"sprinting":false,"sliding":false,"generation":0,"movementState":{}}
		var collision := "res://content/production/"+str(metadata.get("collisionUrl","collision.bin")).get_file()
		if not prediction.initialize(FileAccess.get_file_as_bytes(collision),"local-roam",own,"none",float(metadata.get("lowestOpenElevation",-4))):
			_fail_boot("校园移动资料未能打开，请更新客户端。")
			return
	preview = true
	network_preview = false
	_paused = false
	shell.data["inSession"] = true
	shell.hide()
	hud.show()
	hud.update_snapshot({"self":{},"variant":"tdm"},true)
	player.activate(true)
	campus.prepare_at(player.position,true)
	menu_audio.set_mode("roam")
	menu_audio.set_weather(_solo_weather)

func _boot_online(own: Dictionary) -> void:
	if _booting or network_preview: return
	_booting = true
	_session_epoch += 1
	var epoch := _session_epoch
	_ensure_world(true)
	campus.combat_scope = true
	get_viewport().disable_3d = false
	network_preview = true
	_paused = false
	var entering: bool = session.snapshot.get("phase","lobby") != "lobby"
	shell.data["inSession"] = entering
	if entering:
		shell.hide()
		loading_cover.show()
	loading_label.text = "正在准备对局…"
	player.position = Prediction.vector(own.get("position",[0,0,0]))
	player.yaw = float(own.get("yaw",0))
	player.pitch = float(own.get("pitch",0))
	player.rotation.y = player.yaw
	player.eye.rotation.x = player.pitch
	prediction = Prediction.new()
	var collision_path: String = metadata.get("collisionUrl","/map/collision.bin")
	collision_path = "res://content/production/"+collision_path.get_file()
	if not prediction.initialize(FileAccess.get_file_as_bytes(collision_path),session.player_id,own,str(own.get("team","none")),float(metadata.get("lowestOpenElevation",-4))):
		_fail_boot("校园移动资料未能打开，请更新客户端。")
		return
	presentation = Presentation.new()
	world_owner.add_child(presentation)
	presentation.feedback_received.connect(hud.show_notice)
	presentation.preparation_progress.connect(func(done,total): loading_label.text = "正在准备装备  %d / %d" % [done,total])
	var prepared := await presentation.prepare(player.eye,session.player_id)
	if epoch != _session_epoch: return
	if not prepared:
		_fail_boot("装备未能打开，请重新进入。")
		return
	campus.prepare_at(player.position,true)
	while not campus.complete:
		if epoch != _session_epoch: return
		loading_label.text = "正在准备校园  %d / %d" % [campus.resident.size(),campus.wanted.size()]
		await get_tree().process_frame
	_booting = false
	_loading_ready = true
	loading_cover.hide()
	hud.show()
	if session.snapshot.get("phase","lobby") != "lobby":
		preview = true
		shell.hide()
		hud.show()
		player.activate(true)
	else:
		get_viewport().disable_3d = true
		hud.hide()
		shell.show_page("room")
		shell.set_status("资源已就绪，可以准备。")
	player.authoritative_motion = true
	session.set_loading(false)

func _fail_boot(message: String) -> void:
	_booting = false
	_return_home()
	shell.set_status(message)

func _pause_preview() -> void:
	if not preview: return
	_paused = true
	if menu_audio: menu_audio.set_mode("pause")
	get_viewport().disable_3d = true
	player.activate(false)
	_controls.clear()
	hud.clear_touch()
	session.clear_controls()
	hud.hide()
	loading_cover.hide()
	shell.data["inSession"] = true
	shell.data["position"] = player.position
	shell.data["yaw"] = player.yaw
	shell.show()
	shell.show_page("pause")

func _resume() -> void:
	if not preview or not player: return
	_paused = false
	get_viewport().disable_3d = false
	shell.hide()
	hud.show()
	player.activate(true)
	if menu_audio: menu_audio.set_mode("combat" if network_preview else "roam")

func _return_home() -> void:
	diagnostics.record("world-release")
	_session_epoch += 1
	_booting = false
	preview = false
	network_preview = false
	_loading_ready = false
	get_viewport().disable_3d = true
	_paused = false
	_controls.clear()
	_offline_actions.clear()
	session.leave_room()
	if player: player.activate(false)
	if prediction: prediction.dispose()
	prediction = null
	if presentation: presentation.release_all()
	presentation = null
	if campus:
		if not campus.pending.is_empty():
			campus.reparent(self)
			campus.retire()
		else: campus.release_all()
	if world_owner: world_owner.queue_free()
	world_owner = null
	world_look = null
	sun = null
	campus = null
	player = null
	hud.clear_touch()
	hud.hide()
	loading_cover.hide()
	shell.room = {}
	shell.data["inSession"] = false
	shell.show()
	shell.show_page("lobby")
	if menu_audio: menu_audio.set_mode("home")

func _menu_action(name: String, payload: Dictionary) -> void:
	match name:
		"roam":
			_solo_weather = str(payload.get("weather","clear"))
			_start_preview()
		"ui-sound": menu_audio.play_click()
		"resume": _resume()
		"create":
			if await session.create_room(payload): shell.show_page("room")
		"join":
			if await session.join_room(str(payload.get("code",""))): shell.show_page("room")
		"join-id":
			if await session.join_room_id(str(payload.get("roomId","")),{"mode":"pvp","variant":shell.variant}): shell.show_page("room")
		"list-rooms": shell.show_rooms(await session.list_rooms())
		"ready": session.set_loadout(shell.weapon,shell.avatar); session.set_ready(payload.get("ready",true))
		"start": session.start_match()
		"loadout": session.set_loadout(str(payload.weapon),str(payload.avatar))
		"login": await session.login(str(payload.username),str(payload.password))
		"logout": session.logout(); shell.show_page("account")
		"check-updates": updater.check()
		"setting":
			preferences.change(str(payload.key),payload.value)
			preferences.apply(get_viewport(),mobile)
			shell.settings = preferences.values
			if player:
				player.sensitivity = 0.0024*float(preferences.values.sensitivity)
				player.keybindings = preferences.values.bindings
				player.invert_y = bool(preferences.values.invertY)
				player.mouse_aim_toggle = bool(preferences.values.mouseAimToggle)
			if world_look: world_look.apply_profile(preferences.render_profile.profile())
			hud.configure_inputs(float(preferences.values.touchScale),bool(preferences.values.aimToggle))
			_apply_ui_scale()
		"preview-display":
			if preferences.begin_display(payload):
				_display_seconds = 15
				_display_confirmation.dialog_text = "15 秒后恢复原来的显示设置。"
				_display_confirmation.popup_centered(Vector2i(470,200))
				_display_timer.start()
		"restart-renderer":
			_confirmation_action = "restart-renderer"
			_confirmation.title = "重启客户端？"
			_confirmation.dialog_text = "重启后应用新的渲染模式。当前对局将会离开。" if preview or not session.snapshot.is_empty() else "重启后应用新的渲染模式。"
			_confirmation.ok_button_text = "重启"
			_confirmation.popup_centered(Vector2i(470,200))
		"confirm-home", "confirm-leave":
			if preview or not session.snapshot.is_empty():
				_confirmation_action = "home"
				_confirmation.title = "离开当前对局？"
				_confirmation.ok_button_text = "离开"
				_confirmation.dialog_text = "离开后将释放联机席位。" if network_preview else "结束当前探索并返回主菜单？"
				_confirmation.popup_centered(Vector2i(440,190))
			else: _return_home()
		"return-room": _return_home()
		"web":
			var path: String = payload.get("path","/")
			if path in ["/account/","/?help=1","/?feedback=1","/credits/","/copyright/"]: OS.shell_open("https://game.tianhw.top"+path)

func _input_action(action: String) -> void:
	if network_preview and action == "jump" and session.snapshot.get("self",{}).get("life","alive") != "alive":
		_cycle_spectate()
		return
	if action == "map":
		_pause_preview()
		shell.show_page("map")
	elif network_preview: session.pulse_action(action)
	elif action in ["jump","slide"]: _offline_actions.append(action)

func _native_controls(controls: Dictionary) -> void:
	_controls = {"moveX":controls.move.x,"moveY":-controls.move.y,"yaw":controls.yaw,"pitch":controls.pitch,"fire":controls.fire,"aim":controls.aim,"sprint":controls.sprint,"crouch":controls.crouch}
	if network_preview:
		var yaw: float = controls.yaw+(presentation.recoil.yaw if presentation else 0.0)
		var pitch: float = controls.pitch-(presentation.recoil.pitch if presentation else 0.0)
		session.submit_controls(Vector2(controls.move.x,-controls.move.y),yaw,pitch,controls.fire,controls.aim,controls.sprint,controls.crouch)
	elif prediction:
		var command := _controls.duplicate(true)
		command["actions"] = _offline_actions.duplicate()
		_offline_actions.clear()
		prediction.advance_offline(command)

func _predict_input(command: Dictionary) -> void:
	if prediction and _loading_ready and not _paused and session.snapshot.get("self",{}).get("life","alive") == "alive":
		prediction.predict(command)
		if prediction.pending.size() >= 85 or prediction.replay_overflow: session.request_rebase("prediction-overflow")

func _network_status(status: String, message: String) -> void:
	shell.set_status(message)
	if status == "reconnecting" and player:
		player.activate(false)
		_loading_ready = false
		loading_cover.show()
		loading_label.text = "正在恢复原房间连接…"

func _network_snapshot(snapshot: Dictionary) -> void:
	shell.update_room(snapshot)
	if world_look:
		world_look.apply_weather(snapshot.get("weather",{}),int(snapshot.get("tick",0)))
	if menu_audio:
		menu_audio.set_weather(str(snapshot.get("weather",{}).get("preset","clear")))
		if snapshot.get("phase") == "lobby": menu_audio.set_mode("room")
		elif snapshot.get("phase") == "playing" and not _paused: menu_audio.set_mode("combat")
	var own: Dictionary = snapshot.get("self",{})
	if snapshot.get("phase") in ["lobby","preparing","playing","paused"] and not own.is_empty():
		if not network_preview and not _booting: _boot_online(own)
		if prediction:
			prediction.remember_entities(int(snapshot.get("tick",0)),snapshot.get("players",[]),snapshot.get("roster",[]))
			var previous_generation := prediction.generation
			prediction.reconcile(own,int(snapshot.get("tick",0)),not _paused and not own.get("loading",false))
			if previous_generation != int(own.get("generation",0)):
				player.position = Prediction.vector(own.position)
				player.yaw = float(own.get("yaw",player.yaw))
				player.pitch = float(own.get("pitch",player.pitch))
				player.rotation.y = player.yaw
				player.eye.rotation.x = player.pitch
				if presentation: presentation.recoil.reset()
		if presentation and presentation.prepared: presentation.apply_snapshot(snapshot)
		if _loading_ready and not _paused and player and not player.enabled and snapshot.get("phase") != "lobby":
			preview = true
			get_viewport().disable_3d = false
			shell.data["inSession"] = true
			shell.hide()
			hud.show()
			player.activate(true)
		if not _loading_ready and not _booting and campus and campus.complete and presentation and presentation.prepared:
			_loading_ready = true
			session.set_loading(false)
			if not _paused and snapshot.get("phase") != "lobby": player.activate(true)
	elif snapshot.get("phase") == "ended":
		if menu_audio: menu_audio.set_mode("pause")
		if player: player.activate(false)
		preview = false
		_paused = true
		get_viewport().disable_3d = true
		hud.clear_touch()
		session.clear_controls()
		hud.hide()
		loading_cover.hide()
		shell.show()
		if shell.page != "result": shell.show_page("result")

func _game_event(event: Dictionary) -> void:
	if presentation: presentation.apply_event(event)
	if event.get("type") == "hit" and event.get("actorId") == session.player_id:
		hud.hit_feedback()
		if presentation and presentation.audio: presentation.audio.hit_marker()

func _cycle_spectate() -> void:
	if not network_preview or session.snapshot.get("variant","tdm") != "tdm": return
	var own: Dictionary = session.snapshot.get("self",{})
	if own.get("life","alive") == "alive": return
	var candidates: Array[String] = []
	for member in session.snapshot.get("roster",[]):
		if member.get("id") != session.player_id and member.get("team") == own.get("team") and member.get("life") == "alive" and member.get("connected",false) and not member.get("loading",true): candidates.append(str(member.id))
	if candidates.is_empty(): return
	var current := str(session.snapshot.get("spectatingId",""))
	session.request_spectate(candidates[(candidates.find(current)+1)%candidates.size()])

func _spectate_pose() -> Dictionary:
	if session.snapshot.get("variant","tdm") == "ffa": return {}
	var id: Variant = session.snapshot.get("spectatingId")
	if not id is String: return {}
	for row in session.snapshot.get("players",[]):
		if row.get("id") == id and row.get("life") == "alive": return row
	return {}

func _process(delta: float) -> void:
	diagnostics.frame(delta,_booting or (campus != null and not campus.complete),campus.resident.size() if campus else 0,campus.pending.size() if campus else 0)
	if not preview or not campus or not player: return
	if not _paused:
		var alive: bool = not network_preview or session.snapshot.get("self",{}).get("life","alive") == "alive"
		player.observation_allowed = alive
		var spectating: Dictionary = _spectate_pose() if not alive else {}
		if not spectating.is_empty():
			player.position = Prediction.vector(spectating.position)
			player.yaw = float(spectating.get("yaw",player.yaw))
			player.pitch = float(spectating.get("pitch",player.pitch))
			player.rotation.y = player.yaw
			player.eye.rotation.x = player.pitch
		elif prediction and not prediction.motion.is_empty(): player.position = prediction.render_position(delta)
		if prediction: player.eye.position.y = 1.04 if prediction.motion.get("crouched",false) else 1.62
		campus.prepare_at(player.position)
		campus.update_camera_visibility(player.eye)
		if world_look: world_look.follow_view(player.eye.global_position)
		player.motion_allowed = campus.complete and not _booting and alive
		if not campus.complete:
			player.velocity = Vector3.ZERO
			loading_cover.show()
			loading_label.text = "正在准备附近校园…"
		elif not _booting: loading_cover.hide()
		if network_preview:
			session.set_loading(not campus.complete or _booting)
			if presentation:
				presentation.network_rtt_ms = session.rtt_ms
				presentation.update_view(delta,_controls)
				session.set_render_tick(presentation.render_tick())
				player.rotation.y = player.yaw+presentation.recoil.yaw
				player.eye.rotation.x = player.pitch-presentation.recoil.pitch
		else:
			if player.position.y < float(metadata.get("lowestOpenElevation",-4))-2:
				player.position = campus.spawn_position()+Vector3(0,0.2,0)
				player.velocity = Vector3.ZERO
	_hud_left += delta
	if _hud_left >= 0.1:
		_hud_left = 0
		if network_preview: hud.update_snapshot(session.snapshot)
	var eligible: bool = not _paused and not _booting and campus.complete and not loading_cover.visible and get_window().has_focus()
	if preferences.render_profile.observe_frame(Performance.get_monitor(Performance.TIME_PROCESS)*1000.0,eligible,delta*1000.0):
		preferences.apply_render(get_viewport())
		if world_look: world_look.apply_profile(preferences.render_profile.profile())

func _apply_ui_scale() -> void:
	var factor := (clampf(float(DisplayServer.screen_get_dpi())/160,1.0,1.8) if mobile else 1.0)*float(preferences.values.get("uiScale",1.0))
	get_window().content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	get_window().content_scale_size = Vector2i(Vector2(get_window().size)/factor)

func _notification(what: int) -> void:
	if what in [NOTIFICATION_APPLICATION_PAUSED,NOTIFICATION_WM_WINDOW_FOCUS_OUT]:
		preferences.set_background_audio(true)
		if player and not _paused: _pause_preview()
	if what in [NOTIFICATION_APPLICATION_RESUMED,NOTIFICATION_WM_WINDOW_FOCUS_IN]: preferences.set_background_audio(false)
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		if preview:
			_pause_preview()
			_confirmation_action = "quit"
			_confirmation.popup_centered(Vector2i(440,190))
		else: get_tree().quit()
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		if preview and not _paused: _pause_preview()
		elif shell and shell.page != "lobby": shell.show_page("pause" if preview else "lobby")
		else: get_tree().quit()

func _exit_tree() -> void:
	if preferences: preferences.flush()

func _smoke() -> void:
	_start_preview()
	var deadline := Time.get_ticks_msec()+45000
	while not campus.complete and Time.get_ticks_msec() < deadline: await get_tree().process_frame
	print(JSON.stringify({"native":"Godot","profile":campus.profile,"chunks":metadata.get("chunks",[]).size(),"resident":campus.resident.size(),"collisionTiles":campus.collision_resident.size(),"renderer":RenderingServer.get_current_rendering_method(),"platform":OS.get_name(),"status":"ready" if campus.complete else "failed"}))
	get_tree().quit(0 if campus.complete else 1)

func _capture_ui() -> void:
	var directory := OS.get_environment("QS_NATIVE_CAPTURE_DIR")
	if directory.is_empty(): directory = "user://captures"
	DirAccess.make_dir_recursive_absolute(directory)
	for page in ["lobby","loadout","pause"]:
		shell.show_page(page)
		for i in range(5): await get_tree().process_frame
		await get_tree().create_timer(0.2).timeout
		await RenderingServer.frame_post_draw
		get_viewport().get_texture().get_image().save_png(directory.path_join("native-"+page+"-"+str(ProjectSettings.get_setting("application/config/version"))+".png"))
	print(JSON.stringify({"status":"captured","screens":["lobby","loadout","pause"],"worldCreated":world_owner != null,"viewport":[get_window().size.x,get_window().size.y]}))
	get_tree().quit()

func _capture() -> void:
	_start_preview()
	var deadline := Time.get_ticks_msec()+45000
	while not campus.complete and Time.get_ticks_msec() < deadline: await get_tree().process_frame
	var directory := OS.get_environment("QS_NATIVE_CAPTURE_DIR")
	if directory.is_empty(): directory = "user://captures"
	DirAccess.make_dir_recursive_absolute(directory)
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(directory.path_join("native-campus-"+str(ProjectSettings.get_setting("application/config/version"))+".png"))
	print(JSON.stringify({"status":"captured","profile":campus.profile,"resident":campus.resident.size(),"drawCalls":Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),"texturesBytes":Performance.get_monitor(Performance.RENDER_TEXTURE_MEM_USED),"fps":Engine.get_frames_per_second()}))
	get_tree().quit()
