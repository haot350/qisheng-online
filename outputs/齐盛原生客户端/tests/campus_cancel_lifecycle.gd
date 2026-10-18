extends SceneTree

func _initialize() -> void: call_deferred("run")

func run() -> void:
	var first := preload("res://src/map/campus_streamer.gd").new()
	first.formal_collision = true
	root.add_child(first)
	first.prepare_at(first.spawn_position(),true)
	assert(first.pending.size() <= 2)
	first.retire()
	var second := preload("res://src/map/campus_streamer.gd").new()
	second.formal_collision = true
	root.add_child(second)
	second.prepare_at(second.spawn_position(),true)
	var deadline := Time.get_ticks_msec()+15000
	while not second.complete and Time.get_ticks_msec() < deadline: await process_frame
	assert(second.complete)
	assert(second.failed.is_empty())
	assert(not is_instance_valid(first))
	assert(second.pending.size() == 0)
	second.release_all()
	second.queue_free()
	await process_frame
	print(JSON.stringify({"passed":true,"checks":["retired-loader-results-drained","old-owner-freed","same-resource-reentry-ready","no-late-instantiation"]}))
	quit()
