extends SceneTree

const Session = preload("res://src/network/native_session.gd")
var session: Node
var received := 0
var moved := false
var fired := false
var saw_peer := false
var before := Vector3.ZERO
var started := 0

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	var endpoint := ""
	for argument in OS.get_cmdline_user_args():
		if argument.begins_with("--endpoint="):
			endpoint = argument.trim_prefix("--endpoint=")
	if endpoint.is_empty():
		push_error("An isolated fixture endpoint is required")
		quit(1)
		return
	session = Session.new()
	root.add_child(session)
	var identity := {"sourceVersion":"native-test","collisionHash":"fixture-collision","navigationHash":"fixture-navigation","manifestHash":"fixture-manifest","visionHash":"fixture-vision"}
	session.configure(endpoint, endpoint, identity)
	session.snapshot_received.connect(_snapshot)
	if not await session.login("native_smoke", "temporary-test-only"):
		push_error("isolated account login failed")
		quit(1)
		return
	if not await session.create_room({"mode":"pvp","variant":"tdm","private":true,"maxPlayers":2}):
		push_error("isolated native admission failed")
		quit(1)
		return
	started = Time.get_ticks_msec()
	while Time.get_ticks_msec() - started < 15000:
		await process_frame
		if moved and fired and saw_peer and received >= 8:
			session.leave_room()
			print(JSON.stringify({"test":"native-live-wire","passed":true,"snapshots":received,"serverMoved":moved,"serverFire":fired,"sawWebSdkPeer":saw_peer,"physicsParity":false,"method":"Official Godot 0.18.7 and JavaScript SDK clients in a loopback protocol fixture; not formal physics"}))
			await create_timer(0.1).timeout
			quit()
			return
	push_error("native protocol fixture timed out: movement/fire/peer incomplete")
	print(JSON.stringify({"snapshots":received,"moved":moved,"fired":fired,"peer":saw_peer,"status":session.status}))
	session.leave_room()
	quit(1)

func _snapshot(state: Dictionary) -> void:
	received += 1
	session.set_loading(false)
	var own: Dictionary = state.self
	var point: Array = own.position
	var position := Vector3(float(point[0]),float(point[1]),float(point[2]))
	if received == 1:
		before = position
	moved = moved or position.distance_to(before) > 0.1
	fired = fired or bool(own.get("testShotAccepted", false))
	for row in state.players:
		if row.id == "web-sdk-peer":
			saw_peer = true
	session.submit_controls(Vector2(0,1), 0, 0, true, false, false, false)
