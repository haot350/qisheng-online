extends SceneTree

var game: Node
var frames: Array[float] = []
var measuring := false
var previous := 0
var output := ""

func _initialize() -> void:
	output = OS.get_environment("QS_NATIVE_CAPTURE_DIR")
	call_deferred("run")

func _process(_delta: float) -> bool:
	var now := Time.get_ticks_usec()
	if measuring and previous > 0: frames.append(float(now-previous)/1000.0)
	previous = now
	return false

func run() -> void:
	game = load("res://main.tscn").instantiate()
	game.preferences.change("quality",3 if RenderingServer.get_current_rendering_method() == "forward_plus" else 2)
	game.preferences.change("volume",0.0)
	root.add_child(game)
	await process_frame
	assert(game.world_owner == null)
	assert(game.preferences.capabilities().rendererActual == RenderingServer.get_current_rendering_method())
	var settings_checks: Array[String] = []
	game._menu_action("setting",{"key":"sfxVolume","value":0.35})
	assert(absf(db_to_linear(AudioServer.get_bus_volume_db(AudioServer.get_bus_index("SFX")))-0.35) < 0.001)
	settings_checks.append("independent-real-audio-bus")
	game._menu_action("setting",{"key":"renderScale","value":0.8})
	assert(absf(game.get_viewport().scaling_3d_scale-0.8) < 0.001)
	game._menu_action("setting",{"key":"renderScale","value":1.0})
	settings_checks.append("real-render-scale")
	var old_size := DisplayServer.window_get_size()
	game._menu_action("preview-display",{"windowMode":0,"screen":0,"width":960,"height":540})
	assert(game._display_seconds == 15)
	await create_timer(0.25).timeout
	assert(DisplayServer.window_get_size() == Vector2i(960,540))
	game._finish_display(false)
	await process_frame
	assert(DisplayServer.window_get_size() == old_size)
	settings_checks.append("display-cancel-restores")
	game._menu_action("preview-display",{"windowMode":0,"screen":0,"width":960,"height":540})
	await create_timer(15.3).timeout
	assert(game.preferences._display_backup.is_empty())
	assert(DisplayServer.window_get_size() == old_size)
	settings_checks.append("actual-15-second-display-timeout")
	var weather_results: Array[Dictionary] = []
	for preset in ["clear","overcast","light-rain"]:
		game._menu_action("roam",{"weather":preset})
		var deadline := Time.get_ticks_msec()+30000
		while not game.campus.complete and Time.get_ticks_msec() < deadline: await process_frame
		assert(game.campus.complete)
		assert(game.world_look.preset == preset)
		await create_timer(1.0).timeout
		frames.clear()
		measuring = true
		await create_timer(1.5).timeout
		measuring = false
		frames.sort()
		var row := {"preset":preset,"renderer":RenderingServer.get_current_rendering_method(),"frames":frames.size(),"frameP95Ms":frames[int(frames.size()*0.95)] if not frames.is_empty() else 0.0,"longestFrameMs":frames.back() if not frames.is_empty() else 0.0,"resident":game.campus.resident.size(),"required":game.campus.wanted.size(),"drawCalls":Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),"textureBytes":Performance.get_monitor(Performance.RENDER_TEXTURE_MEM_USED),"privatePositionsLogged":false}
		weather_results.append(row)
		if not output.is_empty():
			DirAccess.make_dir_recursive_absolute(output)
			await RenderingServer.frame_post_draw
			root.get_texture().get_image().save_png(output.path_join("campus-"+str(row.renderer)+"-"+preset+".png"))
		game._return_home()
		await process_frame
		await process_frame
	assert(game.world_owner == null)
	settings_checks.append("world-released-after-three-presets")
	var report := {"passed":true,"method":"actual Windows GPU, real settings and full-campus resource graph; short samples, not whole-game FPS certification","checks":settings_checks,"weather":weather_results,"worldCreatedByMenu":false}
	if not output.is_empty():
		var file := FileAccess.open(output.path_join("settings-weather-report.json"),FileAccess.WRITE)
		file.store_string(JSON.stringify(report,"  "))
	print(JSON.stringify(report))
	quit()
