class_name QsLocalPreviewController
extends CharacterBody3D

## Input and observation adapter. Competitive movement uses only the Rust world;
## the Godot collision fallback remains limited to the anonymous local demo.
signal paused
signal controls_sampled(controls: Dictionary)
signal action_requested(action: String)
var eye: Camera3D
var enabled := false
var motion_allowed := false
var yaw := 0.0
var pitch := 0.0
var touch_move := Vector2.ZERO
var look_touch := -1
var move_touch := -1
var move_origin := Vector2.ZERO
var sensitivity := 0.0024
var jump_requested := false
var authoritative_motion := false
var observation_allowed := true
var touch_buttons := {"fire":false,"aim":false,"sprint":false,"crouch":false}
var aim_toggle := true
var mouse_aim_toggle := false
var invert_y := false
var _mouse_aim := false
var external_controls: Dictionary = {}
var keybindings: Dictionary = {}
const DEFAULT_KEYS = preload("res://src/input_bindings.gd").DEFAULT_KEYS

func _ready() -> void:
	var collider := CollisionShape3D.new()
	var capsule := CapsuleShape3D.new()
	capsule.radius = 0.32
	capsule.height = 1.75
	collider.shape = capsule
	collider.position.y = 0.88
	collider.disabled = authoritative_motion
	add_child(collider)
	eye = Camera3D.new()
	eye.position.y = 1.62
	eye.fov = 82
	eye.far = 270
	add_child(eye)

func activate(value: bool) -> void:
	enabled = value
	touch_move = Vector2.ZERO
	move_touch = -1
	look_touch = -1
	jump_requested = false
	_mouse_aim = false
	velocity = Vector3.ZERO
	for key in touch_buttons: touch_buttons[key] = false
	if not DisplayServer.is_touchscreen_available():
		Input.mouse_mode = Input.MOUSE_MODE_CAPTURED if value else Input.MOUSE_MODE_VISIBLE

func _input(event: InputEvent) -> void:
	# GUI loading/menu layers may consume a touch release before unhandled_input.
	# A release only clears that finger's previous ownership, never another input.
	if event is InputEventScreenTouch and (not event.pressed or event.canceled):
		_release_touch(event.index)

func _release_touch(index: int) -> void:
	if index == move_touch:
		move_touch = -1
		touch_move = Vector2.ZERO
	if index == look_touch:
		look_touch = -1

func _unhandled_input(event: InputEvent) -> void:
	if not enabled:
		return
	if event is InputEventKey and event.pressed and event.keycode == KEY_ESCAPE:
		activate(false)
		paused.emit()
		get_viewport().set_input_as_handled()
	if event is InputEventKey and event.pressed and not event.echo:
		var action := ""
		for key in ["jump","reload","interact","gadget","cycle","switch","slide","map"]:
			if int(event.physical_keycode) == int(keybindings.get(key,DEFAULT_KEYS[key])):
				action = {"gadget":"use-gadget","cycle":"cycle-gadget"}.get(key,key)
				break
		if not action.is_empty():
			action_requested.emit(action)
	if event is InputEventMouseMotion and Input.mouse_mode == Input.MOUSE_MODE_CAPTURED:
		look(event.relative)
	if event is InputEventMouseButton and event.button_index == MOUSE_BUTTON_RIGHT and event.pressed and mouse_aim_toggle:
		_mouse_aim = not _mouse_aim
	if event is InputEventScreenTouch:
		if not event.pressed or event.canceled:
			_release_touch(event.index)
		elif event.position.x < get_viewport().get_visible_rect().size.x * 0.4 and move_touch == -1:
			move_touch = event.index
			move_origin = event.position
		elif look_touch == -1:
			look_touch = event.index
	if event is InputEventScreenDrag:
		if event.index == move_touch:
			touch_move = ((event.position-move_origin)/80).limit_length()
		elif event.index == look_touch:
			look(event.relative)

func look(relative: Vector2) -> void:
	if not observation_allowed: return
	yaw -= relative.x*sensitivity
	pitch = clampf(pitch-relative.y*sensitivity*(-1.0 if invert_y else 1.0), -1.35, 1.35)
	rotation.y = yaw
	eye.rotation.x = pitch

func _physics_process(delta: float) -> void:
	if not enabled:
		return
	if not motion_allowed:
		velocity = Vector3.ZERO
		return
	var direction := touch_move
	if not external_controls.is_empty():
		yaw = float(external_controls.get("yaw",yaw))
		pitch = float(external_controls.get("pitch",pitch))
		rotation.y = yaw
		eye.rotation.x = pitch
		controls_sampled.emit({"move":Vector2(float(external_controls.get("moveX",0)),-float(external_controls.get("moveY",0))),"yaw":yaw,"pitch":pitch,"fire":external_controls.get("fire",false),"aim":external_controls.get("aim",false),"sprint":external_controls.get("sprint",false),"crouch":external_controls.get("crouch",false)})
		return
	if not DisplayServer.is_touchscreen_available():
		direction = Vector2(float(_pressed("right"))-float(_pressed("left")),float(_pressed("back"))-float(_pressed("forward")))
	controls_sampled.emit({"move":direction.limit_length(),"yaw":yaw,"pitch":pitch,"fire":Input.is_mouse_button_pressed(MOUSE_BUTTON_LEFT) or touch_buttons.fire,"aim":(_mouse_aim if mouse_aim_toggle else Input.is_mouse_button_pressed(MOUSE_BUTTON_RIGHT)) or touch_buttons.aim,"sprint":_pressed("sprint") or touch_buttons.sprint,"crouch":_pressed("crouch") or touch_buttons.crouch})
	# Godot preview collision is not treated as equivalent Rapier prediction.
	if authoritative_motion:
		velocity = Vector3.ZERO
		return
	var horizontal := (transform.basis*Vector3(direction.x,0,direction.y)).limit_length()
	var speed := 4.3
	velocity.x = horizontal.x*speed
	velocity.z = horizontal.z*speed
	if not is_on_floor():
		velocity.y -= 18*delta
	elif jump_requested or _pressed("jump"):
		velocity.y = 6.0
	else:
		velocity.y = -0.1
	jump_requested = false
	move_and_slide()

func _pressed(action: String) -> bool:
	return Input.is_physical_key_pressed(int(keybindings.get(action,DEFAULT_KEYS[action])))
