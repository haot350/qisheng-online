extends SceneTree

const Campus = preload("res://src/map/campus_streamer.gd")
const Controller = preload("res://src/map/local_preview_controller.gd")

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	var world := Node3D.new()
	root.add_child(world)
	var campus = Campus.new()
	world.add_child(campus)
	var player = Controller.new()
	world.add_child(player)
	player.position = campus.spawn_position()+Vector3(0,0.1,0)
	player.yaw = float(campus.manifest.get("spawnYaw",0))
	player.rotation.y = player.yaw
	campus.prepare_at(player.position,true)
	var deadline := Time.get_ticks_msec()+30000
	while not campus.complete and Time.get_ticks_msec()<deadline:
		await process_frame
	assert(campus.complete,"Required original campus and collision tiles must be present")
	for i in range(4): await physics_frame
	var from: Vector3 = player.position+Vector3(0,3,0)
	var to: Vector3 = player.position-Vector3(0,4,0)
	var ground := world.get_world_3d().direct_space_state.intersect_ray(PhysicsRayQueryParameters3D.create(from,to,1,[player.get_rid()]))
	assert(not ground.is_empty(),"Spawn must have real original ground support")
	player.activate(true)
	player.motion_allowed = true
	var start: Vector3 = player.position
	var key := InputEventKey.new()
	key.physical_keycode = KEY_W
	key.pressed = true
	Input.parse_input_event(key)
	for i in range(90):
		campus.prepare_at(player.position)
		player.motion_allowed = campus.complete
		await physics_frame
	key.pressed = false
	Input.parse_input_event(key)
	player.activate(false)
	var moved := Vector2(player.position.x-start.x,player.position.z-start.z).length()
	assert(moved>1.0,"Actual native controller must move through the loaded spawn area")
	assert(player.position.y>-2.0,"Actual native controller must remain supported")
	print(JSON.stringify({"test":"native-map-walk","passed":true,"profile":campus.profile,"groundSupport":true,"distance":moved,"physicsParity":false,"method":"original triangle collision and native preview controller, 90 real physics steps"}))
	world.queue_free()
	await process_frame
	quit()
