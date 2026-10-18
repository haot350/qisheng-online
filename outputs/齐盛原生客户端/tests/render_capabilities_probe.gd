extends SceneTree

func _initialize() -> void:
	var rows := {}
	for target in ["Viewport","Environment","BaseMaterial3D","ProceduralSkyMaterial","DisplayServer"]:
		var names: Array[String] = []
		for item in ClassDB.class_get_property_list(target):
			if "mipmap" in item.name or "ssao" in item.name or "ssil" in item.name or "ssr" in item.name or "glow" in item.name or "clearcoat" in item.name or "texture_filter" in item.name: names.append(item.name)
		rows[target] = names
	var methods: Array[String] = []
	for item in ClassDB.class_get_method_list("DisplayServer"):
		if "screen" in item.name or "resolution" in item.name: methods.append(item.name)
	rows["displayMethods"] = methods
	print(JSON.stringify(rows))
	quit()
