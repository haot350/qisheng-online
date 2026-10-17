extends SceneTree

const Controller = preload("res://src/map/local_preview_controller.gd")
const Main = preload("res://src/main.gd")
var checks := 0

class SessionProbe extends Node:
	var move := Vector2.ZERO
	func submit_controls(value: Vector2, _yaw: float, _pitch: float, _fire: bool, _aim: bool, _sprint: bool, _crouch: bool) -> void:
		move = value

func _initialize() -> void:
	call_deferred("_run")

func _run() -> void:
	var controller = Controller.new()
	root.add_child(controller)
	controller.activate(true)
	var move_press := InputEventScreenTouch.new()
	move_press.index = 1
	move_press.position = Vector2(20, 100)
	move_press.pressed = true
	controller._unhandled_input(move_press)
	var look_press := InputEventScreenTouch.new()
	look_press.index = 2
	look_press.position = Vector2(root.get_visible_rect().size.x-10, 100)
	look_press.pressed = true
	controller._unhandled_input(look_press)
	var drag := InputEventScreenDrag.new()
	drag.index = 1
	drag.position = Vector2(65, 100)
	controller._unhandled_input(drag)
	_check(controller.touch_move.x > 0.0 and controller.move_touch == 1 and controller.look_touch == 2,"two independent owned fingers")
	var release := InputEventScreenTouch.new()
	release.index = 1
	release.pressed = false
	controller._input(release)
	_check(controller.touch_move == Vector2.ZERO and controller.move_touch == -1 and controller.look_touch == 2,"GUI-consumed release clears only movement")
	var cancel := InputEventScreenTouch.new()
	cancel.index = 2
	cancel.canceled = true
	controller._input(cancel)
	_check(controller.look_touch == -1,"canceled look ownership is released")
	controller.jump_requested = true
	controller.activate(false)
	_check(not controller.enabled and not controller.jump_requested and controller.move_touch == -1 and controller.look_touch == -1,"pause clears all local intent")
	var main = Main.new()
	var probe := SessionProbe.new()
	main.session = probe
	main.network_preview = true
	main._native_controls({"move":Vector2(0,-1),"yaw":0.0,"pitch":0.0,"fire":false,"aim":false,"sprint":false,"crouch":false})
	_check(probe.move == Vector2(0,1),"native W maps to protocol positive forward")
	main.free()
	probe.free()
	controller.queue_free()
	await process_frame
	print(JSON.stringify({"test":"native-input-lifecycle","checks":checks,"passed":true,"method":"actual controller events and actual main wire adapter"}))
	quit()

func _check(value: bool, name: String) -> void:
	assert(value, name)
	checks += 1
