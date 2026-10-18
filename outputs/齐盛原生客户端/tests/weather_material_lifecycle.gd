extends SceneTree

func _initialize() -> void: call_deferred("run")

func run() -> void:
	var look := preload("res://src/world_environment.gd").new()
	root.add_child(look)
	var chunk := Node3D.new()
	root.add_child(chunk)
	var solid := MeshInstance3D.new()
	solid.mesh = BoxMesh.new()
	var original := StandardMaterial3D.new()
	original.roughness = 0.9
	solid.mesh.material = original
	chunk.add_child(solid)
	var leaf := MeshInstance3D.new()
	leaf.mesh = BoxMesh.new()
	var alpha := StandardMaterial3D.new()
	alpha.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	leaf.mesh.material = alpha
	chunk.add_child(leaf)
	look.weather_changed.connect(func(): look.refresh_resident({"chunk":{"root":chunk,"row":{"kind":"exterior"}}}))
	for cycle in range(3):
		look.apply_weather({"preset":"light-rain","seed":1,"startedAtTick":0})
		await process_frame
		await process_frame
		if RenderingServer.get_current_rendering_method() == "forward_plus":
			assert(solid.get_surface_override_material(0) != null)
			assert(solid.get_surface_override_material(0).roughness < original.roughness)
		assert(leaf.get_surface_override_material(0) == null)
		look.apply_weather({"preset":"clear","seed":1,"startedAtTick":0})
		await process_frame
		await process_frame
		assert(solid.get_surface_override_material(0) == null)
		assert(is_equal_approx(original.roughness,0.9))
	look.apply_weather({"preset":"light-rain","seed":1,"startedAtTick":0})
	look.prepare_chunk(chunk,{"kind":"interior"})
	assert(solid.get_surface_override_material(0) == null)
	print(JSON.stringify({"passed":true,"checks":["resident-clear-rain-clear","original-material-unchanged","transparent-leaves-unchanged","interior-dry"],"renderer":RenderingServer.get_current_rendering_method()}))
	quit()
