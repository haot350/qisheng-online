class_name QsSettingsPanel
extends VBoxContainer

signal setting_requested(key: String, value: Variant)
signal display_requested(changes: Dictionary)
signal restart_requested
signal binding_requested(action: String)
signal tab_changed(id: String)

const BINDINGS = preload("res://src/input_bindings.gd")
const TABS := [["display","显示"],["quality","画质"],["sound","声音"],["controls","操作"],["accessibility","辅助"]]
var values: Dictionary = {}
var capabilities: Dictionary = {}
var mobile := false
var active_tab := "display"
var _draft: Dictionary = {}
var _rows: VBoxContainer
var _apply: Button
var _resolution_control: OptionButton
var profile_reader: Callable
var _effective_render: Label

func _ready() -> void:
	add_theme_constant_override("separation", 22)
	for key in ["screen","windowMode","width","height"]:
		_draft[key] = values.get(key, {"screen":0,"windowMode":0,"width":1440,"height":900}[key])
	var tabs := GridContainer.new()
	tabs.columns = 3 if mobile and get_viewport_rect().size.x < 600 else 5
	tabs.add_theme_constant_override("h_separation", 8)
	tabs.add_theme_constant_override("v_separation", 8)
	add_child(tabs)
	for entry in TABS:
		var tab := Button.new()
		tab.text = entry[1]
		tab.custom_minimum_size.y = 48
		tab.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		if entry[0] == active_tab: tab.theme_type_variation = "PrimaryButton"
		var id: String = entry[0]
		tab.pressed.connect(func(): tab_changed.emit(id))
		tabs.add_child(tab)
	var card := PanelContainer.new()
	add_child(card)
	_rows = VBoxContainer.new()
	_rows.add_theme_constant_override("separation", 0)
	card.add_child(_rows)
	match active_tab:
		"display": _display()
		"quality": _quality()
		"sound": _sound()
		"controls": _controls()
		_: _accessibility()

func _display() -> void:
	_section("画面与窗口")
	if not mobile:
		var screens: Array = capabilities.get("screens", [])
		var names: Array = []
		for screen in screens: names.append(str(screen.get("label","显示器")))
		if not names.is_empty():
			_choice("显示器", names, clampi(int(_draft.screen),0,names.size()-1), func(index): _draft.screen = int(screens[index].id); _mark_display())
		var actual_hz := DisplayServer.screen_get_refresh_rate(clampi(int(_draft.screen),0,maxi(0,DisplayServer.get_screen_count()-1)))
		_readonly("系统刷新率", "%d Hz" % roundi(actual_hz) if actual_hz > 0 else "由系统管理")
		_choice("显示模式", ["窗口","无边框全屏","独占全屏"], int(_draft.windowMode), func(index):
			_draft.windowMode = index
			if is_instance_valid(_resolution_control): _resolution_control.disabled = index != 0
			_mark_display()
		)
		var resolutions: Array = capabilities.get("windowResolutions", [])
		var labels: Array = []
		var selected := 0
		for index in range(resolutions.size()):
			var resolution: Dictionary = resolutions[index]
			labels.append(str(resolution.label))
			if int(resolution.width) == int(_draft.width) and int(resolution.height) == int(_draft.height): selected = index
		if not labels.is_empty():
			var resolution_control := _choice("窗口分辨率", labels, selected, func(index):
				_draft.width = int(resolutions[index].width)
				_draft.height = int(resolutions[index].height)
				_mark_display()
			)
			resolution_control.disabled = int(_draft.windowMode) != 0
			_resolution_control = resolution_control
		if int(_draft.windowMode) != 0: _note("全屏使用显示器的桌面分辨率。")
		_apply = Button.new()
		_apply.text = "应用显示设置"
		_apply.theme_type_variation = "PrimaryButton"
		_apply.custom_minimum_size.y = 52
		_apply.disabled = true
		_apply.pressed.connect(func(): display_requested.emit(_draft.duplicate()); _apply.disabled = true)
		_rows.add_child(_apply)
		_note("应用后请确认画面；未确认会自动恢复。")
	_choice("帧率上限", ["60 FPS","30 FPS","120 FPS","不限","144 FPS","165 FPS","240 FPS"], int(values.get("fps",0)), func(index): _setting("fps",index))
	_toggle("垂直同步", "vsync", true)
	if not mobile:
		_section("渲染模式")
		_choice("渲染器", ["兼容","增强"], int(values.get("renderer",0)), func(index): _setting("renderer",index))
		_readonly("当前运行", "增强渲染" if capabilities.get("rendererActual", "") == "forward_plus" else "兼容渲染")
		var restart := Button.new()
		restart.text = "重启以应用渲染器"
		restart.custom_minimum_size.y = 48
		restart.pressed.connect(func(): restart_requested.emit())
		_rows.add_child(restart)

func _quality() -> void:
	_section("画质")
	_choice("画质预设", ["自动","流畅","高清","超清","兼容"], int(values.get("quality",0)), func(index): _setting("quality",index))
	_slider("3D清晰度倍率", "renderScale", 0.5, 1.5, 0.05, true)
	if profile_reader.is_valid():
		_effective_render = _readonly("当前3D分辨率",str(roundi(float(profile_reader.call())*100))+"%")
	_choice("阴影", ["随预设","关闭","低","标准","高"], int(values.get("shadowQuality",-1))+1, func(index): _setting("shadowQuality",index-1))
	_choice("抗锯齿", ["随预设","关闭","FXAA","MSAA 2×","MSAA 4×","MSAA 8×"], int(values.get("antialiasing",-1))+1, func(index): _setting("antialiasing",index-1))
	_choice("纹理细节", ["清晰","均衡","柔和"], int(values.get("textureBias",0)), func(index): _setting("textureBias",index))
	if capabilities.get("advancedEffects",false):
		_choice("环境效果", ["自动","标准","增强"], int(values.get("environmentQuality",0)), func(index): _setting("environmentQuality",index))
	else:
		_readonly("环境效果", "兼容模式")
	_note("清晰度倍率基于当前画质预设调整，界面与文字保持清晰。")

func _sound() -> void:
	_section("音量")
	for entry in [["总音量","volume"],["音乐","musicVolume"],["战斗音效","sfxVolume"],["环境声音","ambientVolume"],["界面声音","uiVolume"]]:
		_slider(entry[0], entry[1], 0.0, 1.0, 0.01, true)
	_toggle("切到后台时静音", "muteBackground", true)

func _controls() -> void:
	_section("观察与瞄准")
	_slider("观察灵敏度", "sensitivity", 0.2, 3.0, 0.05)
	_toggle("反转纵向观察", "invertY", false)
	_toggle("点击切换瞄准" if mobile else "右键点击切换开镜", "aimToggle" if mobile else "mouseAimToggle", mobile)
	if mobile:
		_slider("触控按钮大小", "touchScale", 0.7, 1.5, 0.05, true)
		return
	_section("键位")
	for entry in [["forward","前进"],["back","后退"],["left","向左"],["right","向右"],["sprint","冲刺"],["crouch","蹲伏"],["jump","跳跃"],["reload","装填"],["interact","互动"],["switch","切枪"],["gadget","使用道具"],["cycle","切换道具"],["slide","滑铲"],["map","地图"]]:
		var row := _row(entry[1])
		var key := Button.new()
		key.text = BINDINGS.caption(values.get("bindings",{}),entry[0])
		key.custom_minimum_size = Vector2(164,44)
		var action: String = entry[0]
		key.pressed.connect(func(): binding_requested.emit(action))
		row.add_child(key)

func _accessibility() -> void:
	_section("阅读与界面")
	_slider("界面大小", "uiScale", 0.8, 1.5, 0.05, true)
	_toggle("减少界面动态效果", "reducedMotion", false)
	if mobile: _slider("触控按钮大小", "touchScale", 0.7, 1.5, 0.05, true)

func _section(text: String) -> void:
	var title := Label.new()
	title.text = text
	title.add_theme_font_size_override("font_size",22)
	title.custom_minimum_size.y = 54
	_rows.add_child(title)

func _row(title: String) -> HBoxContainer:
	var row := HBoxContainer.new()
	row.custom_minimum_size.y = 66
	row.add_theme_constant_override("separation",16)
	_rows.add_child(row)
	var caption := Label.new()
	caption.text = title
	caption.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	caption.custom_minimum_size.x = 100 if mobile else 200
	caption.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(caption)
	return row

func _choice(title: String, choices: Array, selected: int, changed: Callable) -> OptionButton:
	var row := _row(title)
	var control := OptionButton.new()
	control.custom_minimum_size = Vector2(150 if mobile else 270,48)
	control.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	for value in choices: control.add_item(str(value))
	control.select(clampi(selected,0,maxi(0,choices.size()-1)))
	control.item_selected.connect(changed)
	row.add_child(control)
	return control

func _readonly(title: String, value: String) -> Label:
	var row := _row(title)
	var output := Label.new()
	output.text = value
	output.add_theme_color_override("font_color",Color("b9b9a9"))
	row.add_child(output)
	return output

func _slider(title: String, key: String, minimum: float, maximum: float, step: float, percent := false) -> void:
	var row := _row(title)
	var group := HBoxContainer.new()
	group.custom_minimum_size.x = 172 if mobile else 300
	group.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(group)
	var slider := HSlider.new()
	slider.min_value = minimum
	slider.max_value = maximum
	slider.step = step
	slider.value = float(values.get(key,1.0))
	slider.custom_minimum_size = Vector2(80,48)
	slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	group.add_child(slider)
	var output := Label.new()
	output.custom_minimum_size.x = 58
	output.horizontal_alignment = HORIZONTAL_ALIGNMENT_RIGHT
	output.text = str(roundi(slider.value*100))+"%" if percent else "%.2f" % slider.value
	group.add_child(output)
	slider.value_changed.connect(func(value):
		output.text = str(roundi(value*100))+"%" if percent else "%.2f" % value
		_setting(key,value)
	)

func _toggle(title: String, key: String, fallback: bool) -> void:
	var row := _row(title)
	var toggle := CheckButton.new()
	toggle.custom_minimum_size = Vector2(80,48)
	toggle.size_flags_vertical = Control.SIZE_SHRINK_CENTER
	toggle.button_pressed = bool(values.get(key,fallback))
	toggle.toggled.connect(func(value): _setting(key,value))
	row.add_child(toggle)

func _note(text: String) -> void:
	var note := Label.new()
	note.text = text
	note.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	note.add_theme_font_size_override("font_size",14)
	note.add_theme_color_override("font_color",Color("a5ab9e"))
	_rows.add_child(note)

func _setting(key: String, value: Variant) -> void:
	values[key] = value
	setting_requested.emit(key,value)
	if is_instance_valid(_effective_render) and profile_reader.is_valid():
		_effective_render.text = str(roundi(float(profile_reader.call())*100))+"%"

func _mark_display() -> void:
	if is_instance_valid(_apply): _apply.disabled = false
