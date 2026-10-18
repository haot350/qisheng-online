extends SceneTree

func _initialize() -> void:
	var manifest: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://content/production/map.json"))
	var materials := {}
	var counts := {}
	for row in manifest.chunks:
		var scene: PackedScene = load(row.path)
		var root := scene.instantiate()
		for node in root.find_children("*","MeshInstance3D",true,false):
			for index in range(node.mesh.get_surface_count()):
				var material: Material = node.get_active_material(index)
				if material is StandardMaterial3D and not materials.has(material.get_instance_id()):
					materials[material.get_instance_id()] = true
					var mode := str(material.shading_mode)
					counts[mode] = int(counts.get(mode,0))+1
		root.free()
	print(JSON.stringify({"materialShadingModes":counts,"uniqueMaterials":materials.size()}))
	quit()
