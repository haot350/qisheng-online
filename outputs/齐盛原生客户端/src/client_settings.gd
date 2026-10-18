class_name QsClientSettings
extends RefCounted

signal persist_requested

const PATH := "user://settings.json"
const RENDER_PROBE := "user://renderer-pending.json"
const RenderProfile = preload("res://src/render_profile.gd")
const DEFAULTS := {"revision":2,"quality":0,"fps":0,"fullscreen":0,"windowMode":0,"screen":0,"width":1440,"height":900,"vsync":true,"sensitivity":1.0,"volume":0.8,"musicVolume":0.55,"sfxVolume":0.85,"ambientVolume":0.5,"uiVolume":0.65,"muteBackground":true,"reducedMotion":false,"aimToggle":true,"mouseAimToggle":false,"invertY":false,"touchScale":1.0,"uiScale":1.0,"renderScale":1.0,"shadowQuality":-1,"antialiasing":-1,"textureBias":0,"environmentQuality":0,"renderer":0,"bindings":{}}
const DISPLAY_KEYS := ["screen","windowMode","width","height"]
var values: Dictionary = DEFAULTS.duplicate(true)
var render_profile := RenderProfile.new()
var boot_message := ""
var _display_signature := ""
var _display_backup: Dictionary = {}
var _save_dirty := false

func load_settings() -> void:
	if FileAccess.file_exists(PATH):
		var parsed: Variant = JSON.parse_string(FileAccess.get_file_as_string(PATH))
		if parsed is Dictionary:
			for key in DEFAULTS:
				if not parsed.has(key): continue
				if typeof(DEFAULTS[key]) in [TYPE_INT,TYPE_FLOAT] and typeof(parsed[key]) in [TYPE_INT,TYPE_FLOAT]:
					if is_finite(float(parsed[key])): values[key] = parsed[key]
				elif typeof(parsed[key]) == typeof(DEFAULTS[key]): values[key] = parsed[key]
			if not parsed.has("windowMode"): values.windowMode = 2 if int(values.fullscreen) == 1 else 0
	_normalize()
	if "--safe-renderer" in OS.get_cmdline_user_args():
		values.renderer = 0
		_save()
		DirAccess.remove_absolute(RENDER_PROBE)
	elif "--forward-renderer" in OS.get_cmdline_user_args(): values.renderer = 1

func _normalize() -> void:
	values.revision = 2
	for spec in [["quality",0,4],["fps",0,6],["windowMode",0,2],["screen",0,maxi(0,DisplayServer.get_screen_count()-1)],["width",640,7680],["height",360,4320],["shadowQuality",-1,3],["antialiasing",-1,4],["textureBias",0,2],["environmentQuality",0,2],["renderer",0,1]]:
		values[spec[0]] = clampi(int(values[spec[0]]),spec[1],spec[2])
	for spec in [["sensitivity",0.2,3.0],["touchScale",0.7,1.5],["uiScale",0.8,1.5],["renderScale",0.5,1.5]]:
		values[spec[0]] = clampf(float(values[spec[0]]),spec[1],spec[2])
	for key in ["volume","musicVolume","sfxVolume","ambientVolume","uiVolume"]: values[key] = clampf(float(values[key]),0.0,1.0)
	values.fullscreen = 1 if int(values.windowMode) == 2 else 0

func change(key: String, value: Variant) -> void:
	if not DEFAULTS.has(key) or key in DISPLAY_KEYS: return
	if typeof(DEFAULTS[key]) in [TYPE_INT,TYPE_FLOAT]:
		if typeof(value) not in [TYPE_INT,TYPE_FLOAT] or not is_finite(float(value)): return
	elif typeof(value) != typeof(DEFAULTS[key]): return
	values[key] = value
	_normalize()
	_save_dirty = true
	if persist_requested.get_connections().is_empty(): _save()
	else: persist_requested.emit()

func _save() -> void:
	var file := FileAccess.open(PATH,FileAccess.WRITE)
	if file:
		file.store_string(JSON.stringify(values))
		_save_dirty = false

func flush() -> void:
	if _save_dirty: _save()

func capabilities() -> Dictionary:
	var screens: Array[Dictionary] = []
	for index in range(DisplayServer.get_screen_count()):
		var size := DisplayServer.screen_get_size(index)
		screens.append({"id":index,"label":"显示器 %d" % [index+1],"width":size.x,"height":size.y,"refreshRate":DisplayServer.screen_get_refresh_rate(index)})
	var screen := clampi(int(values.screen),0,maxi(0,screens.size()-1))
	var available := DisplayServer.screen_get_usable_rect(screen).size
	var resolutions: Array[Dictionary] = []
	for size in [Vector2i(960,540),Vector2i(1280,720),Vector2i(1440,900),Vector2i(1600,900),Vector2i(1920,1080),Vector2i(1920,1200),Vector2i(2560,1440),Vector2i(2560,1600),Vector2i(3840,2160)]:
		if size.x <= available.x and size.y <= available.y:
			resolutions.append({"width":size.x,"height":size.y,"label":"%d × %d" % [size.x,size.y]})
	var actual := RenderingServer.get_current_rendering_method()
	return {"screens":screens,"windowResolutions":resolutions,"rendererActual":actual,"forwardAvailable":OS.get_name() == "Windows","advancedEffects":actual == "forward_plus","fullscreenUsesDesktop":true,"displayPending":not _display_backup.is_empty(),"fpsChoices":[60,30,120,0,144,165,240]}

func begin_display(changes: Dictionary) -> bool:
	if OS.get_name() == "Android" or DisplayServer.get_name() == "headless": return false
	if not _display_backup.is_empty(): revert_display()
	var previous := {}
	for key in DISPLAY_KEYS: previous[key] = values[key]
	_display_backup = {"values":previous,"position":DisplayServer.window_get_position(),"size":DisplayServer.window_get_size(),"screen":DisplayServer.window_get_current_screen(),"mode":DisplayServer.window_get_mode()}
	for key in DISPLAY_KEYS:
		if changes.get(key) is int or changes.get(key) is float: values[key] = changes[key]
	_normalize()
	_apply_display(true)
	return true

func confirm_display() -> void:
	if _display_backup.is_empty(): return
	_display_backup.clear()
	_save()

func revert_display() -> void:
	if _display_backup.is_empty(): return
	var old := _display_backup
	_display_backup = {}
	for key in DISPLAY_KEYS: values[key] = old["values"][key]
	_normalize()
	DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
	DisplayServer.window_set_current_screen(clampi(int(old.screen),0,maxi(0,DisplayServer.get_screen_count()-1)))
	DisplayServer.window_set_size(old.size)
	DisplayServer.window_set_position(old.position)
	DisplayServer.window_set_mode(int(old.mode))
	_display_signature = _display_key()

func _display_key() -> String:
	return "%s:%s:%s:%s" % [values.screen,values.windowMode,values.width,values.height]

func _apply_display(force := false) -> void:
	if OS.get_name() == "Android" or DisplayServer.get_name() == "headless": return
	var signature := _display_key()
	if not force and signature == _display_signature: return
	_display_signature = signature
	var screen := clampi(int(values.screen),0,maxi(0,DisplayServer.get_screen_count()-1))
	var usable := DisplayServer.screen_get_usable_rect(screen)
	var size := Vector2i(clampi(int(values.width),640,maxi(640,usable.size.x)),clampi(int(values.height),360,maxi(360,usable.size.y)))
	DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED)
	DisplayServer.window_set_current_screen(screen)
	DisplayServer.window_set_size(size)
	DisplayServer.window_set_position(usable.position+(usable.size-size)/2)
	DisplayServer.window_set_mode([DisplayServer.WINDOW_MODE_WINDOWED,DisplayServer.WINDOW_MODE_FULLSCREEN,DisplayServer.WINDOW_MODE_EXCLUSIVE_FULLSCREEN][int(values.windowMode)])

func apply(viewport: Viewport, mobile: bool) -> void:
	Engine.max_fps = [60,30,120,0,144,165,240][int(values.fps)]
	render_profile.configure(int(values.quality),mobile,Engine.max_fps,values)
	apply_render(viewport)
	_apply_audio()
	if not mobile:
		_apply_display()
		DisplayServer.window_set_vsync_mode(DisplayServer.VSYNC_ENABLED if bool(values.vsync) else DisplayServer.VSYNC_DISABLED)

func apply_render(viewport: Viewport) -> void:
	var profile: Dictionary = render_profile.profile()
	viewport.scaling_3d_scale = float(profile.scale)
	viewport.msaa_3d = int(profile.msaa)
	viewport.screen_space_aa = Viewport.SCREEN_SPACE_AA_FXAA if profile.get("fxaa",false) else Viewport.SCREEN_SPACE_AA_DISABLED
	viewport.texture_mipmap_bias = float(profile.get("textureBias",0.0))
	if DisplayServer.get_name() != "headless": RenderingServer.directional_shadow_atlas_set_size(int(profile.get("shadowAtlas",2048)),true)

func _apply_audio() -> void:
	for bus in ["Music","SFX","Ambient","UI"]:
		if AudioServer.get_bus_index(bus) < 0:
			AudioServer.add_bus()
			AudioServer.set_bus_name(AudioServer.bus_count-1,bus)
			AudioServer.set_bus_send(AudioServer.bus_count-1,"Master")
	for pair in [["Master","volume"],["Music","musicVolume"],["SFX","sfxVolume"],["Ambient","ambientVolume"],["UI","uiVolume"]]:
		AudioServer.set_bus_volume_db(AudioServer.get_bus_index(pair[0]),linear_to_db(maxf(0.0001,float(values[pair[1]]))))
	set_background_audio(not DisplayServer.get_name() == "headless" and not Engine.get_main_loop().root.has_focus())

func set_background_audio(background: bool) -> void:
	AudioServer.set_bus_mute(0,bool(values.muteBackground) and background)

func bootstrap_renderer(tree: SceneTree) -> bool:
	if OS.get_name() != "Windows" or DisplayServer.get_name() == "headless": return false
	var probe := "--qs-render-probe" in OS.get_cmdline_user_args()
	# An explicit one-shot CLI renderer is useful for the compatibility launcher
	# and isolated QA. It must not silently launch another renderer or a second
	# process instead of running the requested test.
	if "--rendering-method" in OS.get_cmdline_args() and not probe:
		values.renderer = 1 if RenderingServer.get_current_rendering_method() == "forward_plus" else 0
		return false
	if FileAccess.file_exists(RENDER_PROBE) and not probe:
		values.renderer = 0
		_save()
		DirAccess.remove_absolute(RENDER_PROBE)
		boot_message = "已恢复兼容画面设置。"
	var wanted := "forward_plus" if int(values.renderer) == 1 else "gl_compatibility"
	if RenderingServer.get_current_rendering_method() == wanted: return false
	if probe:
		values.renderer = 0
		_save()
		DirAccess.remove_absolute(RENDER_PROBE)
		boot_message = "当前设备未启用增强渲染，已保留兼容模式。"
		return false
	return restart_renderer(tree)

func restart_renderer(tree: SceneTree) -> bool:
	if OS.get_name() != "Windows": return false
	flush()
	var file := FileAccess.open(RENDER_PROBE,FileAccess.WRITE)
	if not file: return false
	file.store_string(JSON.stringify({"requested":int(values.renderer)}))
	file.close()
	var args := PackedStringArray()
	if OS.has_feature("editor"): args.append_array(PackedStringArray(["--path",ProjectSettings.globalize_path("res://")]))
	args.append_array(PackedStringArray(["--rendering-method","forward_plus" if int(values.renderer) == 1 else "gl_compatibility"]))
	if int(values.renderer) == 1: args.append_array(PackedStringArray(["--rendering-driver","vulkan"]))
	args.append_array(PackedStringArray(["--","--qs-render-probe"]))
	var process := OS.create_process(OS.get_executable_path(),args)
	if process <= 0:
		DirAccess.remove_absolute(RENDER_PROBE)
		boot_message = "重启未完成，请重试。"
		return false
	tree.quit()
	return true

func confirm_renderer() -> void:
	DirAccess.remove_absolute(RENDER_PROBE)
