extends SceneTree

const Decoder = preload("res://src/network/wire_decoder.gd")
const Compatibility = preload("res://src/physics/compatibility_gate.gd")
const Session = preload("res://src/network/native_session.gd")
var checks := 0

func _initialize() -> void:
	call_deferred("_run")

func _check(value: bool, message: String) -> void:
	checks += 1
	if not value:
		push_error("FAIL: " + message)
		quit(1)
		assert(value, message)

func _run() -> void:
	var decoder = Decoder.new()
	var full := {"wireVersion":1,"kind":"full","seq":1,"roomId":"room-a","viewerId":"self-a","room":{"roomId":"room-a","protocolVersion":"campus-mp-0.9.0","phase":"playing","tick":3},"self":{"id":"self-a","health":100,"position":[0,0,0]},"roster":[{"id":"self-a"},{"id":"enemy-visible"},{"id":"enemy-hidden"}],"players":[{"id":"enemy-visible","position":[3,0,0]}],"npcs":[],"spectatingId":null,"events":[],"eventSerial":0}
	var accepted: Dictionary = decoder.accept(full)
	_check(accepted.players.size() == 2, "roster does not disclose hidden coordinates")
	_check(accepted.players[0].id == "self-a", "own private state is reconstructed")
	full.self.health = 1
	_check(accepted.self.health == 100, "input baseline does not share mutable private records")
	var delta := {"wireVersion":1,"kind":"delta","seq":2,"baseSeq":1,"roomId":"room-a","viewerId":"self-a","self":{"set":{"health":75},"unset":["temporary"]},"players":{"upsert":[],"remove":["enemy-visible"]},"npcs":{"upsert":[],"remove":[]},"spectatingId":null,"events":[],"eventSerial":0}
	accepted = decoder.accept(delta)
	_check(accepted.self.health == 75, "recipient private patch applied")
	_check(accepted.players.size() == 1, "hidden entity is removed immediately")
	_check(decoder.accept(delta).is_empty() and decoder.last_error.is_empty(), "duplicate delta has no side effects")
	delta.seq = 4
	delta.baseSeq = 3
	_check(decoder.accept(delta).is_empty() and decoder.last_error == "sequence", "missing baseline requests resynchronization")
	_check(decoder.sequence == 2, "rejected patch leaves sequence intact")
	full.seq = 5
	full.self.health = 50
	_check(not decoder.accept(full).is_empty(), "fresh full baseline recovers skipped delta")
	full.seq = 6
	full.room.protocolVersion = "old-protocol"
	_check(decoder.accept(full).is_empty() and decoder.sequence == 0, "old protocol is never applied")
	_check(Compatibility.allows_endpoint("http://127.0.0.1:2576"), "isolated authority is allowed")
	_check(not Compatibility.allows_endpoint("https://game.tianhw.top/realtime"), "unverified physics cannot enter production")
	_check(not Compatibility.allows_endpoint("http://127.0.0.1.evil.test:2576"), "loopback prefix cannot be spoofed")
	_check(not Compatibility.VERIFIED_PREDICTION, "Godot physics is not declared equivalent")
	_check(ClassDB.class_exists("_ColyseusClient"), "pinned native binary extension loaded")
	var native_client: Object = ClassDB.instantiate("_ColyseusClient")
	_check(native_client.has_method("consume_seat_reservation") and native_client.has_method("poll"), "SDK exposes reservation and polled message transport")
	var session = Session.new()
	root.add_child(session)
	_check(session.configure("http://127.0.0.1:8796", "http://127.0.0.1:2576", {}), "local REST and native transport configure")
	_check(session.api_base.ends_with("/v1"), "API base version normalized")
	_check(not session.configure("https://user:password@example.test", "http://127.0.0.1:2576", {}), "credentials cannot enter endpoint URLs")
	session.logout()
	session.queue_free()
	var report := {"test":"native-network-smoke","checks":checks,"passed":true,"sdk":"godot-v0.18.7","protocol":"campus-mp-0.9.0","physicsParity":false}
	DirAccess.make_dir_recursive_absolute("res://work")
	var output := FileAccess.open("res://work/network-smoke-report.json", FileAccess.WRITE)
	if output:
		output.store_string(JSON.stringify(report, "\t"))
		output.close()
	print(JSON.stringify(report))
	quit()
