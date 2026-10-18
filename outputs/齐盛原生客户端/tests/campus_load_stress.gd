extends SceneTree

## The real imported campus resource graph, not synthetic mesh copies. This
## isolates IO width while leaving the renderer/materials/SDK unchanged.
func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var scene := Node3D.new()
	root.add_child(scene)
	var camera := Camera3D.new()
	camera.position = Vector3(40,4,80)
	camera.rotation_degrees = Vector3(-5,165,0)
	scene.add_child(camera)
	camera.make_current()
	var sun := DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-45,-35,0)
	scene.add_child(sun)
	var trace := preload("res://src/runtime_diagnostics.gd").new()
	var rows: Array[Dictionary] = []
	for cycle in range(2):
		var campus := preload("res://src/map/campus_streamer.gd").new()
		campus.formal_collision = true
		campus.prepare_radius = 100000.0
		campus.diagnostics = trace
		scene.add_child(campus)
		var started := Time.get_ticks_msec()
		campus.prepare_at(Vector3.ZERO,true)
		var longest := 0.0
		var last := Time.get_ticks_usec()
		while not campus.complete and Time.get_ticks_msec()-started < 40000:
			await process_frame
			var now := Time.get_ticks_usec()
			longest = maxf(longest,float(now-last)/1000.0)
			last = now
		assert(campus.complete)
		assert(campus.failed.is_empty())
		assert(campus.resident.size() == campus.manifest.chunks.size())
		await RenderingServer.frame_post_draw
		rows.append({"cycle":cycle,"resident":campus.resident.size(),"pending":campus.pending.size(),"ioWidth":campus.max_pending_loads,"durationMs":Time.get_ticks_msec()-started,"longestFrameMs":longest})
		campus.release_all()
		campus.queue_free()
		await process_frame
		await process_frame
	print(JSON.stringify({"passed":true,"method":"actual GPU, imported full campus, same scene graph; controlled IO width","results":rows}))
	quit()
