class_name QsWorldEnvironment
extends Node3D

signal weather_changed

const Presets = preload("res://src/generated/weather_profiles.gd")
const PRESETS := Presets.PRESETS
var sun: DirectionalLight3D
var environment: Environment
var sky_material: ProceduralSkyMaterial
var preset := "clear"
var seed_value := 0
var started_at_tick := 0
var _profile: Dictionary = {}
var _rain: MultiMeshInstance3D
var _points: Array[Vector3] = []
var _view := Vector3.ZERO
var _cover_query: Callable
var _sheltered := false
var _shelter_at := Vector3.INF
var _shelter_next_ms := 0
var _server_tick := 0
var _tick_received_ms := 0
var _wet_materials: Dictionary = {}
var _weather_initialized := false
var _refresh_queue: Array[Dictionary] = []

func configure(profile: Dictionary) -> void:
	_profile = profile.duplicate()

func _ready() -> void:
	var owner := WorldEnvironment.new()
	environment = Environment.new()
	environment.background_mode = Environment.BG_SKY
	environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	environment.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	sky_material = ProceduralSkyMaterial.new()
	sky_material.sky_curve = 0.2
	var sky := Sky.new()
	sky.sky_material = sky_material
	environment.sky = sky
	owner.environment = environment
	add_child(owner)
	sun = DirectionalLight3D.new()
	sun.rotation_degrees = Vector3(-48,-35,0)
	sun.directional_shadow_mode = DirectionalLight3D.SHADOW_PARALLEL_4_SPLITS
	add_child(sun)
	_build_rain()
	apply_profile(_profile)
	apply_weather({"preset":preset,"seed":seed_value,"startedAtTick":started_at_tick})

func apply_profile(profile: Dictionary) -> void:
	_profile = profile.duplicate()
	if not environment: return
	sun.shadow_enabled = bool(profile.get("shadows",false))
	environment.ssao_enabled = bool(profile.get("ssao",false))
	environment.ssao_radius = 1.4
	environment.ssao_intensity = 1.1
	environment.ssil_enabled = bool(profile.get("ssil",false))
	environment.ssr_enabled = bool(profile.get("ssr",false))
	environment.glow_enabled = bool(profile.get("glow",false))
	environment.glow_intensity = 0.22
	environment.glow_bloom = 0.02
	if _rain: _rain.multimesh.visible_instance_count = clampi(int(profile.get("rainCount",80)),0,_points.size())

func apply_weather(state: Dictionary, tick := -1) -> void:
	if tick >= 0:
		_server_tick = tick
		_tick_received_ms = Time.get_ticks_msec()
	var next := str(state.get("preset","clear"))
	if not PRESETS.has(next): next = "clear"
	var next_seed := int(state.get("seed",0))&0xffffffff
	var next_start := maxi(0,int(state.get("startedAtTick",0)))
	var changed := next != preset or next_seed != seed_value or next_start != started_at_tick
	preset = next
	seed_value = next_seed
	started_at_tick = next_start
	if not environment: return
	if _weather_initialized and not changed: return
	_weather_initialized = true
	var settings: Dictionary = PRESETS[preset]
	var sky_color := _rgb(int(settings.sky))
	sky_material.sky_top_color = sky_color.darkened(0.30)
	sky_material.sky_horizon_color = sky_color
	sky_material.ground_horizon_color = sky_color
	sky_material.ground_bottom_color = sky_color.darkened(0.55)
	environment.ambient_light_color = sky_color.lightened(0.22)
	# Godot and Three do not share absolute light units. Preserve the canonical
	# weather ratios while calibrating the native clear-day baseline once.
	environment.ambient_light_energy = 0.65*float(settings.ambientIntensity)/2.6
	sun.light_color = _rgb(int(settings.sun))
	sun.light_energy = 0.95*float(settings.sunIntensity)/2.7
	_rain.visible = preset == "light-rain" and not _sheltered
	if changed:
		_shelter_next_ms = 0
		var random := RandomNumberGenerator.new()
		random.seed = seed_value
		_points.clear()
		for index in range(_rain.multimesh.instance_count): _points.append(Vector3(random.randf_range(-13,13),random.randf(),random.randf_range(-13,13)))
	weather_changed.emit()

func refresh_resident(resident: Dictionary) -> void:
	_refresh_queue.clear()
	for entry in resident.values(): _refresh_queue.append({"root":weakref(entry.root),"row":entry.row})

func follow_view(at: Vector3) -> void:
	_view = at

func set_cover_query(query: Callable) -> void:
	_cover_query = query

func _build_rain() -> void:
	_rain = MultiMeshInstance3D.new()
	_rain.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	var mesh := BoxMesh.new()
	mesh.size = Vector3(0.015,0.65,0.015)
	var material := StandardMaterial3D.new()
	material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	material.albedo_color = Color(0.79,0.87,0.92,0.30)
	material.no_depth_test = false
	mesh.material = material
	var instances := MultiMesh.new()
	instances.transform_format = MultiMesh.TRANSFORM_3D
	instances.mesh = mesh
	instances.instance_count = 128
	_rain.multimesh = instances
	add_child(_rain)
	var random := RandomNumberGenerator.new()
	random.seed = seed_value
	for index in range(instances.instance_count): _points.append(Vector3(random.randf_range(-13,13),random.randf(),random.randf_range(-13,13)))

func _process(_delta: float) -> void:
	# Existing resident meshes follow a weather change too. One chunk per frame
	# keeps material variant work out of snapshot callbacks.
	if not _refresh_queue.is_empty():
		var entry: Dictionary = _refresh_queue.pop_front()
		var root: Node3D = entry.root.get_ref()
		if is_instance_valid(root): prepare_chunk(root,entry.row)
	if preset != "light-rain" or not _rain: return
	var now := Time.get_ticks_msec()
	if _cover_query.is_valid() and (now >= _shelter_next_ms or _shelter_at.distance_squared_to(_view) > 4.0):
		_sheltered = bool(_cover_query.call(_view))
		_shelter_at = _view
		_shelter_next_ms = now+250
	_rain.visible = not _sheltered
	if _sheltered: return
	var seconds := (float(_server_tick-started_at_tick)/60.0+float(now-_tick_received_ms)/1000.0) if _tick_received_ms > 0 else float(now)/1000.0
	_rain.global_position = Vector3(floorf(_view.x/8.0)*8.0,_view.y,floorf(_view.z/8.0)*8.0)
	for index in range(_rain.multimesh.visible_instance_count):
		var point: Vector3 = _points[index]
		var offset := Vector3(point.x+fmod(seconds*0.4,1.0),5.0-fmod(seconds*14.0+point.y*12.0,12.0),point.z)
		_rain.multimesh.set_instance_transform(index,Transform3D(Basis(Vector3.FORWARD,0.10),offset))

func prepare_chunk(root: Node3D, row: Dictionary) -> void:
	# Wet material variants are visual derivatives only: geometry, collision and
	# opacity stay unchanged. Transparent vegetation never becomes a hard wall.
	var wet: bool = preset == "light-rain" and RenderingServer.get_current_rendering_method() == "forward_plus" and row.get("kind","exterior") != "interior" and not row.get("interior",false)
	for node in root.find_children("*","MeshInstance3D",true,false):
		if not node.mesh: continue
		if not wet:
			if node.has_meta("qs_weather_originals"):
				var original: Array = node.get_meta("qs_weather_originals")
				for surface in range(mini(original.size(),node.mesh.get_surface_count())): node.set_surface_override_material(surface,original[surface])
				node.remove_meta("qs_weather_originals")
			continue
		if node.material_override != null: continue
		if not node.has_meta("qs_weather_originals"):
			var originals: Array = []
			for surface in range(node.mesh.get_surface_count()): originals.append(node.get_surface_override_material(surface))
			node.set_meta("qs_weather_originals",originals)
		var originals: Array = node.get_meta("qs_weather_originals")
		for surface in range(node.mesh.get_surface_count()):
			var source: Material = originals[surface] if originals[surface] != null else node.mesh.surface_get_material(surface)
			if not source is StandardMaterial3D or source.transparency != BaseMaterial3D.TRANSPARENCY_DISABLED: continue
			var id := source.get_instance_id()
			var material: StandardMaterial3D
			if _wet_materials.has(id): material = _wet_materials[id].material
			else:
				material = source.duplicate()
				material.roughness = maxf(0.26,float(source.roughness)*(1.0-float(PRESETS[preset].wetness)*0.7))
				material.clearcoat_enabled = true
				material.clearcoat = 0.30
				material.clearcoat_roughness = 0.22
				if _wet_materials.size() >= 512:
					for key in _wet_materials.keys():
						if _wet_materials[key].source.get_ref() == null: _wet_materials.erase(key)
				if _wet_materials.size() < 512: _wet_materials[id] = {"source":weakref(source),"material":material}
			node.set_surface_override_material(surface,material)

func _rgb(value: int) -> Color:
	return Color(float((value>>16)&255)/255.0,float((value>>8)&255)/255.0,float(value&255)/255.0)
