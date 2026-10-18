class_name QsClientSettings
extends RefCounted

const PATH := "user://settings.json"
const RenderProfile = preload("res://src/render_profile.gd")
const DEFAULTS := {"quality":0,"fps":0,"fullscreen":0,"vsync":true,"sensitivity":1.0,"volume":0.8,"reducedMotion":false,"aimToggle":true,"touchScale":1.0,"bindings":{}}
var values: Dictionary = DEFAULTS.duplicate(true)
var render_profile := RenderProfile.new()

func load_settings() -> void:
	if not FileAccess.file_exists(PATH): return
	var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(PATH))
	if not parsed is Dictionary: return
	for key in DEFAULTS:
		if not parsed.has(key): continue
		if typeof(DEFAULTS[key]) in [TYPE_INT,TYPE_FLOAT] and typeof(parsed[key]) in [TYPE_INT,TYPE_FLOAT]: values[key] = parsed[key]
		elif typeof(parsed[key]) == typeof(DEFAULTS[key]): values[key] = parsed[key]
	values.quality = clampi(int(values.quality),0,4)
	values.fps = clampi(int(values.fps),0,3)
	values.sensitivity = clampf(float(values.sensitivity),0.2,3.0)
	values.volume = clampf(float(values.volume),0.0,1.0)

func change(key: String, value: Variant) -> void:
	if not DEFAULTS.has(key): return
	values[key] = value
	var file := FileAccess.open(PATH, FileAccess.WRITE)
	if file: file.store_string(JSON.stringify(values))

func apply(viewport: Viewport, mobile: bool) -> void:
	Engine.max_fps = [60,30,120,0][int(values.fps)]
	render_profile.configure(int(values.quality),mobile,Engine.max_fps)
	apply_render(viewport)
	AudioServer.set_bus_volume_db(0,linear_to_db(maxf(0.001,float(values.volume))))
	if not mobile:
		DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN if int(values.fullscreen) == 1 else DisplayServer.WINDOW_MODE_WINDOWED)
		DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_ENABLED if bool(values.vsync) else DisplayServer.VSYNC_DISABLED)

func apply_render(viewport: Viewport) -> void:
	var profile: Dictionary = render_profile.profile()
	viewport.scaling_3d_scale = float(profile.scale)
	viewport.msaa_3d = int(profile.msaa)
