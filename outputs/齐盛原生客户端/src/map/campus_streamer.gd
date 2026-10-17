class_name QsCampusStreamer
extends Node3D

signal progress_changed(loaded: int, required: int)
signal region_ready
signal region_failed(message: String)

var manifest: Dictionary = {}
var profile := "demo"
var resident: Dictionary = {}
var pending: Dictionary = {}
var wanted: Dictionary = {}
var use_clock := 0.0
var max_resident := 40
var prepare_radius := 105.0
var last_check := -1.0
var latest_view := Vector3.ZERO
var complete := false
var collision_wanted: Dictionary = {}
var collision_resident: Dictionary = {}
var failed: Dictionary = {}

func _ready() -> void:
	var file := "res://content/production/map.json"
	if not FileAccess.file_exists(file):
		file = "res://content/demo/map.json"
	var parsed = JSON.parse_string(FileAccess.get_file_as_string(file))
	if not parsed is Dictionary:
		region_failed.emit("校园资料暂未能打开。")
		return
	manifest = parsed
	profile = str(manifest.get("profile", "demo"))
	if profile == "demo":
		_create_demo()
		complete = true
		region_ready.emit()

func spawn_position() -> Vector3:
	var values: Array = manifest.get("spawn", [0, 0, -5])
	return Vector3(float(values[0]), float(values[1]), float(values[2]))

func prepare_at(position: Vector3, force := false) -> void:
	latest_view = position
	if profile == "demo":
		return
	if not force and use_clock - last_check < 0.25:
		return
	last_check = use_clock
	wanted.clear()
	collision_wanted.clear()
	var candidates: Array = []
	for row in manifest.get("chunks", []):
		var center = _vector(row.get("center", [0, 0, 0]))
		var radius: float = float(row.get("radius", 20))
		var distance = Vector2(center.x-position.x, center.z-position.z).length()
		if distance <= prepare_radius + radius:
			candidates.append({"row":row, "distance":distance})
	candidates.sort_custom(func(a, b): return a.distance < b.distance)
	for candidate in candidates:
		var row: Dictionary = candidate.row
		var id := str(row.path)
		wanted[id] = row
		if resident.has(id):
			resident[id].used = use_clock
	for tile in manifest.get("collisionTiles", []):
		var bounds: Dictionary = tile.bounds
		var center = (_vector(bounds.min)+_vector(bounds.max))*0.5
		var radius = Vector2(float(bounds.max[0])-float(bounds.min[0]),float(bounds.max[2])-float(bounds.min[2])).length()*0.5
		if Vector2(center.x-position.x,center.z-position.z).length() <= 52+radius:
			collision_wanted[str(tile.path)] = tile
	var all_ready := true
	for id in wanted:
		if not resident.has(id):
			all_ready = false
	for id in collision_wanted:
		if not collision_resident.has(id):
			all_ready = false
	complete = all_ready
	_pump()

func _process(delta: float) -> void:
	use_clock += minf(delta, 0.2)
	for id in pending.keys():
		var progress: Array = []
		var status = ResourceLoader.load_threaded_get_status(id, progress)
		if status == ResourceLoader.THREAD_LOAD_LOADED:
			var packed = ResourceLoader.load_threaded_get(id)
			pending.erase(id)
			if not wanted.has(id):
				continue
			if not packed is PackedScene:
				region_failed.emit("一块校园场景未能打开，请重新进入。")
				continue
			var root: Node3D = packed.instantiate()
			add_child(root)
			resident[id] = {"root":root,"used":use_clock}
		elif status == ResourceLoader.THREAD_LOAD_FAILED or status == ResourceLoader.THREAD_LOAD_INVALID_RESOURCE:
			pending.erase(id)
			failed[id] = true
			region_failed.emit("校园场景读取失败。")
	_pump()
	for id in collision_wanted:
		if not collision_resident.has(id) and not failed.has(id):
			_create_collision(id)
			break
	var loaded := 0
	for id in wanted:
		if resident.has(id):
			loaded += 1
	var collision_ready := true
	for id in collision_wanted:
		if not collision_resident.has(id):
			collision_ready = false
	progress_changed.emit(loaded, wanted.size())
	if not complete and loaded == wanted.size() and collision_ready and not wanted.is_empty():
		complete = true
		region_ready.emit()
	_evict()

func _pump() -> void:
	for id in wanted:
		# The Godot dummy renderer is not the runtime target. Its threaded mesh
		# storage can race when imported meshes share images; keep CLI checks
		# serial while actual Windows/Android rendering retains two IO requests.
		if DisplayServer.get_name() == "headless":
			if resident.has(id) or failed.has(id):
				continue
			var packed = ResourceLoader.load(id, "PackedScene")
			if packed is PackedScene:
				var root: Node3D = packed.instantiate()
				add_child(root)
				resident[id] = {"root":root,"used":use_clock}
			else:
				failed[id] = true
				region_failed.emit("校园文件未能打开。")
			break
		if pending.size() >= 2:
			break
		if resident.has(id) or pending.has(id) or failed.has(id):
			continue
		var error = ResourceLoader.load_threaded_request(id, "PackedScene", false)
		if error == OK:
			pending[id] = true
		else:
			failed[id] = true
			region_failed.emit("校园文件缺失，请重新安装完整地图。")

func _create_collision(id: String) -> void:
	var bytes := FileAccess.get_file_as_bytes(id)
	if bytes.is_empty() or bytes.size()%36 != 0:
		failed[id] = true
		region_failed.emit("校园碰撞资料不完整，不能继续移动。")
		return
	var values := bytes.to_float32_array()
	var faces := PackedVector3Array()
	faces.resize(values.size()/3)
	for i in range(faces.size()):
		faces[i] = Vector3(values[i*3],values[i*3+1],values[i*3+2])
	var shape := ConcavePolygonShape3D.new()
	shape.backface_collision = true
	shape.set_faces(faces)
	var collider := CollisionShape3D.new()
	collider.shape = shape
	var body := StaticBody3D.new()
	body.add_child(collider)
	add_child(body)
	collision_resident[id] = body

func _evict() -> void:
	var unused: Array = []
	for id in resident:
		if wanted.has(id):
			continue
		unused.append(id)
	unused.sort_custom(func(a, b): return resident[a].used < resident[b].used)
	for id in unused:
		if resident.size() <= max_resident and use_clock-float(resident[id].used) < 15:
			break
		resident[id].root.queue_free()
		resident.erase(id)

func _vector(value: Array) -> Vector3:
	return Vector3(float(value[0]), float(value[1]), float(value[2]))

func _create_demo() -> void:
	var floor_mesh := MeshInstance3D.new()
	var plane := PlaneMesh.new()
	plane.size = Vector2(70, 70)
	floor_mesh.mesh = plane
	var material := StandardMaterial3D.new()
	material.albedo_color = Color("899b89")
	material.roughness = 0.95
	floor_mesh.material_override = material
	add_child(floor_mesh)
	for at in [Vector3(-8,2,-12),Vector3(8,2,-12),Vector3(0,1,-22)]:
		var block := MeshInstance3D.new()
		var box := BoxMesh.new()
		box.size = Vector3(7, 4 if at.y == 2 else 2, 6)
		block.mesh = box
		block.position = at
		var wall := StandardMaterial3D.new()
		wall.albedo_color = Color("d7d3c4")
		block.material_override = wall
		add_child(block)
		block.create_trimesh_collision()
	floor_mesh.create_trimesh_collision()
