extends Node
const Prediction = preload("res://src/physics/native_prediction.gd")

var game: Node
var config: Dictionary = {}
var last_action := -1
var last_report := 0
var _last_reconciliation := -1
var corrections: Array[float] = []
var frames: Array[float] = []
var preparation_frames: Array[float] = []
var reset_corrections: Array[Dictionary] = []
var _last_frame_usec := 0
var events: Dictionary = {}
var cached_controls: Dictionary = {}
var _read_left := 0.0
var _report_cost_ms := 0.0
var _frame_hist: Dictionary = {}
var _process_hist: Dictionary = {}
var _physics_hist: Dictionary = {}
var _longest_frame := 0.0
var _vsync_requested := -1
var _vsync_bench: Dictionary = {}
var _route_index := 0
var _route_done := false
var _authorized_spectates: Dictionary = {}
var _requested_spectates: Dictionary = {}

func run(application: Node) -> void:
	game = application
	var file := OS.get_environment("QS_NATIVE_QA_CONFIG")
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(file))
	if not parsed is Dictionary or not str(parsed.get("api","")).begins_with("http://127.0.0.1:") or not str(parsed.get("realtime","")).begins_with("http://127.0.0.1:"):
		get_tree().quit(1)
		return
	config = parsed
	game.session.configure(config.api,config.realtime,game.metadata.mapIdentity)
	game.session.game_event.connect(func(event): events[str(event.get("type",""))] = int(events.get(str(event.get("type","")),0))+1)
	if not await game.session.login(config.username,config.password):
		push_error("Native isolated login failed")
		get_tree().quit(1)
		return
	if not await game.session.join_room(config.roomCode):
		push_error("Native isolated admission failed")
		get_tree().quit(1)
		return
	game.session.set_loadout("m4a1","tactical-a")
	game.shell.show_page("room")

func _process(delta: float) -> void:
	if not game or config.is_empty(): return
	var now_usec := Time.get_ticks_usec()
	var frame_ms := float(now_usec-_last_frame_usec)/1000.0 if _last_frame_usec > 0 else 0.0
	_last_frame_usec = now_usec
	if game._loading_ready and game.session.snapshot.get("phase") == "lobby" and not game.session.snapshot.get("self",{}).get("ready",false): game.session.set_ready(true)
	if game._loading_ready and game.session.snapshot.get("phase") == "playing" and not game._paused:
		if frame_ms > 0:
			frames.append(frame_ms)
			_observe(_frame_hist,frame_ms)
			_longest_frame = maxf(_longest_frame,frame_ms)
		_observe(_process_hist,Performance.get_monitor(Performance.TIME_PROCESS)*1000.0)
		_observe(_physics_hist,Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS)*1000.0)
		if _vsync_requested >= 0:
			var bench_key := str(_vsync_requested)
			if not _vsync_bench.has(bench_key): _vsync_bench[bench_key] = {"frames":{},"process":{},"physics":{},"count":0}
			var bench: Dictionary = _vsync_bench[bench_key]
			_observe(bench.frames,frame_ms)
			_observe(bench.process,Performance.get_monitor(Performance.TIME_PROCESS)*1000.0)
			_observe(bench.physics,Performance.get_monitor(Performance.TIME_PHYSICS_PROCESS)*1000.0)
			bench.count += 1
	else: preparation_frames.append(frame_ms)
	if frames.size() > 40000: frames.pop_front()
	_read_left -= delta
	if _read_left <= 0:
		_read_left = 1.0/30.0
		var content := FileAccess.get_file_as_string(config.controls)
		var parsed_controls: Variant = JSON.parse_string(content) if not content.is_empty() else null
		if parsed_controls is Dictionary: cached_controls = parsed_controls
	var controls: Variant = cached_controls
	if controls is Dictionary:
		if controls.has("vsync") and int(controls.vsync) != _vsync_requested:
			_vsync_requested = int(controls.vsync)
			DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_ENABLED if _vsync_requested == 1 else DisplayServer.VSYNC_DISABLED)
		if game.preview and not game._paused and controls.get("pause",false): game._pause_preview()
		if game.preview and game._paused and not controls.get("pause",false): game._resume()
		if game.player:
			game.player.external_controls = controls.get("input",{"moveX":0,"moveY":0})
			var route: Array = controls.get("route",[])
			if not route.is_empty() and game.prediction and not game.session.snapshot.get("self",{}).get("loading",true):
				var at: Vector3 = Prediction.vector(game.prediction.motion.get("position",game.player.position))
				while _route_index < route.size():
					var target: Vector3 = Prediction.vector(route[_route_index])
					if Vector2(target.x-at.x,target.z-at.z).length() < 0.16 and absf(target.y-at.y) < 0.3: _route_index += 1
					else: break
				_route_done = _route_index >= route.size()
				var to := Vector3.ZERO if _route_done else Prediction.vector(route[_route_index])-at
				game.player.external_controls = {"moveX":0,"moveY":minf(1.0,Vector2(to.x,to.z).length()*3.0),"yaw":atan2(-to.x,-to.z) if not _route_done else game.player.yaw,"pitch":0,"fire":false,"aim":false,"sprint":false,"crouch":false}
			var serial := int(controls.get("serial",0))
			if serial != last_action:
				last_action = serial
				for action in controls.get("actions",[]): game.session.pulse_action(str(action))
				if controls.get("spectateTarget") is String and game.session.snapshot.get("self",{}).get("life","alive") != "alive":
					var target_id := str(controls.spectateTarget)
					_requested_spectates[target_id] = true
					game.session.request_spectate(target_id)
		if controls.get("quit",false):
			_write_report()
			get_tree().quit()
			return
	if game.prediction and game.prediction.reconciliation_serial != _last_reconciliation:
		_last_reconciliation = game.prediction.reconciliation_serial
		if game.prediction.last_correction_reason == "replay" and game.session.snapshot.get("phase") == "playing" and game.session.snapshot.get("self",{}).get("life") == "alive": corrections.append(game.prediction.last_correction)
		elif game.prediction.last_correction > 0.25: reset_corrections.append({"tick":game.session.snapshot.get("tick",0),"reason":game.prediction.last_correction_reason,"distance":game.prediction.last_correction})
	if Time.get_ticks_msec()-last_report > 1000:
		last_report = Time.get_ticks_msec()
		_write_report()

func _write_report() -> void:
	var report_started := Time.get_ticks_usec()
	var own: Dictionary = game.session.snapshot.get("self",{})
	var observed: Variant = game.session.snapshot.get("spectatingId")
	if observed is String and not observed.is_empty(): _authorized_spectates[observed] = true
	var sorted_corrections := corrections.duplicate()
	sorted_corrections.sort()
	var report := {"method":"Actual Windows Godot client with Rust Rapier and full-campus rendering against isolated formal GameRoom","status":game.session.status,"roomId":game.session.snapshot.get("roomId",""),"phase":game.session.snapshot.get("phase",""),"playerId":game.session.player_id,"loading":not game._loading_ready or own.get("loading",true),"paused":game._paused,"booting":game._booting,"own":own,"position":_array(game.player.position) if game.player else [],"yaw":game.player.yaw if game.player else 0,"pitch":game.player.pitch if game.player else 0,"resident":game.campus.resident.size() if game.campus else 0,"requiredChunks":game.campus.wanted.size() if game.campus else 0,"pendingChunks":game.campus.pending.size() if game.campus else 0,"failedChunks":game.campus.failed.size() if game.campus else 0,"campusComplete":game.campus.complete if game.campus else false,"collisionPartitions":game.campus.collision_resident.size() if game.campus else 0,"frames":frames.size(),"frameP95Ms":_hist_percentile(_frame_hist),"longestFrameMs":_longest_frame,"corrections":corrections.size(),"correctionP95":sorted_corrections[int(sorted_corrections.size()*0.95)] if not sorted_corrections.is_empty() else 0,"correctionMax":sorted_corrections.back() if not sorted_corrections.is_empty() else 0,"events":events,"wire":game.session.wire_diagnostics,"resetCorrections":reset_corrections,"memoryBytes":OS.get_static_memory_usage(),"textureBytes":Performance.get_monitor(Performance.RENDER_TEXTURE_MEM_USED),"drawCalls":Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),"elapsed":game.session.snapshot.get("elapsed",0),"result":game.session.snapshot.get("result"),"snapshotTick":game.session.snapshot.get("tick",0)}
	var target := FileAccess.open(config.report,FileAccess.WRITE)
	report["correctionHistory"] = game.prediction.correction_history if game.prediction else []
	report["presentation"] = game.presentation.presentation_counts if game.presentation else {}
	report["qaReportPreviousMs"] = _report_cost_ms
	report["processP95Ms"] = _hist_percentile(_process_hist)
	report["physicsP95Ms"] = _hist_percentile(_physics_hist)
	report["frameMeasurement"] = "wall clock includes Engine.max_fps sleep; TIME_PROCESS and TIME_PHYSICS_PROCESS reported separately; QA reads controls at 30Hz and writes once per second"
	var bench_results: Dictionary = {}
	for key in _vsync_bench:
		var bench: Dictionary = _vsync_bench[key]
		bench_results[key] = {"frames":bench.count,"wallP95Ms":_hist_percentile(bench.frames),"processP95Ms":_hist_percentile(bench.process),"physicsP95Ms":_hist_percentile(bench.physics)}
	report["vsyncBench"] = bench_results
	report["vsyncActual"] = DisplayServer.window_get_vsync_mode()
	report["routeIndex"] = _route_index
	report["routeFinished"] = _route_done
	report["spectatingId"] = observed
	report["authorizedSpectates"] = _authorized_spectates.keys()
	report["requestedSpectates"] = _requested_spectates.keys()
	if target: target.store_string(JSON.stringify(report))
	_report_cost_ms = float(Time.get_ticks_usec()-report_started)/1000.0
	if config.get("capture","") != "" and game._loading_ready and game.session.snapshot.get("phase") == "playing" and not game._paused:
		var capture_path: String = config.capture
		if not FileAccess.file_exists(capture_path):
			await RenderingServer.frame_post_draw
			get_viewport().get_texture().get_image().save_png(capture_path)

func _array(position: Vector3) -> Array:
	return [position.x,position.y,position.z]

func _observe(histogram: Dictionary, value: float) -> void:
	var bin := clampi(int(round(value*100.0)),0,100000)
	histogram[bin] = int(histogram.get(bin,0))+1

func _hist_percentile(histogram: Dictionary) -> float:
	if histogram.is_empty(): return 0.0
	var bins := histogram.keys()
	bins.sort()
	var total := 0
	for bin in bins: total += int(histogram[bin])
	var remaining := int(ceil(total*0.95))
	for bin in bins:
		remaining -= int(histogram[bin])
		if remaining <= 0: return float(bin)/100.0
	return 0.0
