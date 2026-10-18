extends SceneTree
const Bindings=preload("res://src/input_bindings.gd")
func _initialize() -> void:
 var rebound=Bindings.rebound({},"interact",KEY_W)
 assert(rebound.interact == KEY_W and rebound.forward == KEY_E)
 var seen: Dictionary = {}
 for key in rebound.values():
  assert(not seen.has(key))
  seen[key] = true
 var changed=Bindings.rebound(rebound,"jump",KEY_E)
 assert(changed.jump == KEY_E and changed.forward == KEY_SPACE)
 assert(Bindings.rebound(changed,"jump",KEY_ESCAPE) == changed)
 assert(Bindings.caption(changed,"interact") == OS.get_keycode_string(KEY_W))
 print(JSON.stringify({"checks":5,"passed":true,"coverage":"default-key swap, no duplicate effective controls, custom-key swap, reserved Escape, matching caption"}))
 quit()
