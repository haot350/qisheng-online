extends SceneTree
func _initialize() -> void:
 var extension = load("res://src/physics/qs_rapier.gdextension")
 if extension == null or not ClassDB.class_exists("QsRapierWorld"): fail("bridge"); return
 var world = ClassDB.instantiate("QsRapierWorld")
 if not world.load_collision_bytes(FileAccess.get_file_as_bytes("res://work/movement-fixtures/synthetic.bin"),-4.0): fail("collision"); return
 world.add_actor("me",Vector3(11,0,-179),"blue",true)
 var state = {"position":[-76.99998,0.075,-85],"velocity":[0,1.25,-2],"stamina":17,"grounded":false,"movementState":{"vertical":-3,"recoveryWait":2,"slideLeft":0.25,"cooldown":4,"direction":[1,0],"lastSafe":[-77,0.075,-85]}}
 var restored = world.restore_actor("me",state)
 if restored.position.distance_to(Vector3(-76.99998,0.075,-85)) > 0.00001 or restored.velocity != Vector3(0,1.25,-2) or restored.stamina != 17: fail("mixed integer/floating checkpoint"); return
 var movement = restored.movementState
 if movement.vertical != -3 or movement.recoveryWait != 2 or movement.cooldown != 4 or movement.direction != [1.0,0.0] or movement.lastSafe.distance_to(Vector3(-77,0.075,-85)) > 0.00001: fail("mixed movement state"); return
 var invalid = world.restore_actor("me",{"position":[NAN,"wrong",-85],"stamina":INF})
 if not invalid.position.is_finite() or invalid.position.distance_to(restored.position) > 0.00001 or invalid.stamina != 17: fail("invalid number fallback"); return
 world.restore_actors([{ "id":"other","position":[-100,0,-50],"team":"red","human":true }] as Array[Dictionary])
 if world.capture_actor("other").position != Vector3(-100,0,-50): fail("integer remote pose"); return
 var checkpoint = world.capture_actor("me")
 var ints = world.step_actor("me",{"moveX":0,"moveY":1,"yaw":0,"aim":false,"sprint":false,"crouch":false},false,false)
 world.restore_actor("me",checkpoint)
 var floats = world.step_actor("me",{"moveX":0.0,"moveY":1.0,"yaw":0.0,"aim":false,"sprint":false,"crouch":false},false,false)
 if ints.position.distance_to(floats.position) > 0.00001 or ints.actualSpeed != floats.actualSpeed: fail("integer control input"); return
 var report = {"passed":true,"checks":["integer-float mixed checkpoint","integer timers/stamina/slide direction","nonfinite or wrong type keeps finite state","integer remote pose","integer and floating controls equivalent"],"method":"actual Godot Variant dictionary through rebuilt Rust DLL"}
 var file = FileAccess.open("res://work/checkpoint-number-types.json",FileAccess.WRITE)
 if file: file.store_string(JSON.stringify(report,"  "))
 print(JSON.stringify(report));quit(0)
func fail(message: String) -> void:
 push_error(message);quit(1)
