extends SceneTree

func _initialize() -> void:
	var extension = load("res://src/physics/qs_rapier.gdextension")
	if extension == null or not ClassDB.class_exists("QsRapierWorld"):
		fail("native extension unavailable")
		return
	var world = ClassDB.instantiate("QsRapierWorld")
	var bytes = FileAccess.get_file_as_bytes("res://work/movement-fixtures/synthetic.bin")
	if not world.load_collision_bytes(bytes, -4.0):
		fail("raw collision rejected")
		return
	world.add_actor("me", Vector3(0, 0, 5), "blue", true)
	var trace = JSON.parse_string(FileAccess.get_file_as_string("res://work/movement-fixtures/jump-crouch-slide.json"))
	var maximum := 0.0
	for sample in trace.trace:
		var actual: Dictionary = world.step_actor("me", sample.input, false, false)
		world.step_world(1.0 / 60.0)
		var p: Array = sample.state.position
		maximum = maxf(maximum, actual.position.distance_to(Vector3(p[0], p[1], p[2])))
	if maximum > 0.005:
		fail("Godot bridge movement parity failed: %f" % maximum)
		return
	var checkpoint: Dictionary = world.capture_actor("me")
	world.restore_actor("me", checkpoint)
	var poses: Array[Dictionary] = [{"id": "remote", "position": Vector3(0, 0, 0), "team": "red", "human": true}]
	world.restore_actors(poses)
	if world.capture_actor("remote").is_empty():
		fail("authorized remote collider missing")
		return
	world.step_world(1.0 / 60.0)
	world.restore_actors([] as Array[Dictionary])
	if not world.capture_actor("remote").is_empty():
		fail("hidden remote collider retained")
		return
	world.load_collision_bytes(bytes, -4.0)
	world.add_actor("remote", Vector3.ZERO, "blue", true)
	world.restore_actors([] as Array[Dictionary])
	if world.capture_actor("remote").is_empty():
		fail("world reuse removed the new local actor")
		return
	if OS.get_name() == "Windows":
		var token := "synthetic-test-token-not-a-real-session"
		var protected: PackedByteArray = world.protect_token(token)
		if protected.is_empty() or world.unprotect_token(protected) != token or protected.get_string_from_utf8() == token:
			fail("DPAPI round trip failed")
			return
	var report := {"passed": true, "bridge": world.runtime_identity(), "steps": trace.trace.size(), "maxPositionError": maximum, "dpapi": OS.get_name() == "Windows"}
	var file := FileAccess.open("res://work/rust-bridge-report.json", FileAccess.WRITE)
	if file: file.store_string(JSON.stringify(report, "  "))
	print(JSON.stringify(report))
	quit(0)

func fail(message: String) -> void:
	push_error(message)
	quit(1)
