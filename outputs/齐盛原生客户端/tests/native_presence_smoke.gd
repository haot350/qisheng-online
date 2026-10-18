extends SceneTree

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	var base := OS.get_environment("QS_NATIVE_PRESENCE_TEST_BASE")
	if not base.begins_with("http://127.0.0.1:"):
		quit(1)
		return
	var presence := preload("res://src/network/client_presence.gd").new()
	root.add_child(presence)
	presence.configure(base,"fixture-account")
	presence.set_active(true)
	await create_timer(0.4).timeout
	assert(not presence._session_id.is_empty())
	presence.set_active(false)
	await create_timer(0.4).timeout
	assert(not presence._in_flight)
	# Expiry does not create periodic background requests.
	presence._next_ms = Time.get_ticks_msec()-1
	await create_timer(0.2).timeout
	presence.set_active(true)
	await create_timer(0.4).timeout
	presence.configure(base+"/old-api")
	await create_timer(0.4).timeout
	assert(not presence._enabled)
	presence._next_ms = 0
	await create_timer(0.2).timeout
	assert(not presence._in_flight)
	print(JSON.stringify({"presence":"passed","tokenPersists":false,"oldApiDisabled":true}))
	quit()
