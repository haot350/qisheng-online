class_name QsInputBindings
extends RefCounted

const DEFAULT_KEYS := {"forward":KEY_W,"back":KEY_S,"left":KEY_A,"right":KEY_D,"sprint":KEY_SHIFT,"crouch":KEY_CTRL,"jump":KEY_SPACE,"reload":KEY_R,"interact":KEY_E,"gadget":KEY_G,"cycle":KEY_B,"switch":KEY_Q,"slide":KEY_C,"map":KEY_M}

static func rebound(overrides: Dictionary, action: String, key: int) -> Dictionary:
	if not DEFAULT_KEYS.has(action) or key <= 0 or key == KEY_ESCAPE: return overrides.duplicate()
	var effective := DEFAULT_KEYS.duplicate()
	for name in DEFAULT_KEYS:
		if overrides.get(name) is int and int(overrides[name]) > 0 and int(overrides[name]) != KEY_ESCAPE: effective[name] = overrides[name]
	var previous := int(effective[action])
	for name in effective:
		if name != action and int(effective[name]) == key: effective[name] = previous
	effective[action] = key
	return effective

static func caption(overrides: Dictionary, action: String) -> String:
	return OS.get_keycode_string(int(overrides.get(action,DEFAULT_KEYS.get(action,KEY_NONE))))
