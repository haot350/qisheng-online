extends Node3D

const Campus = preload("res://src/map/campus_streamer.gd")
const Controller = preload("res://src/map/local_preview_controller.gd")
var campus: QsCampusStreamer
var player: QsLocalPreviewController
var menu: Control
var body: VBoxContainer
var status_label: Label
var heading: Label
var account_label: Label
var overlay: Control
var session: Node
var scene_camera: Camera3D
var mobile := false
var preview := false
var page_name := "start"
var reduced_motion := false
var quality := "自动"
var remote_nodes: Dictionary = {}
var loading_cover: ColorRect
var loading_label: Label
var network_preview := false
var quality_index := 0

func _ready() -> void:
	mobile = OS.get_name() == "Android" or "--mobile-ui" in OS.get_cmdline_user_args()
	get_tree().auto_accept_quit = false
	_apply_ui_scale()
	get_window().size_changed.connect(_apply_ui_scale)
	_build_environment()
	campus = Campus.new()
	add_child(campus)
	player = Controller.new()
	add_child(player)
	player.position = campus.spawn_position() + Vector3(0, 0.1, 0)
	player.yaw = float(campus.manifest.get("spawnYaw", 0))
	player.rotation.y = player.yaw
	player.paused.connect(_pause_preview)
	player.controls_sampled.connect(_native_controls)
	player.action_requested.connect(func(action):
		if network_preview and session: session.pulse_action(action)
	)
	if "--audit-export" not in OS.get_cmdline_user_args():
		campus.prepare_at(player.position, true)
	_build_ui()
	var script = load("res://src/network/native_session.gd")
	if script:
		session = script.new()
		add_child(session)
		var api := OS.get_environment("QS_NATIVE_API")
		var realtime := OS.get_environment("QS_NATIVE_REALTIME")
		session.configure(api if not api.is_empty() else "http://127.0.0.1:2568", realtime if not realtime.is_empty() else "http://127.0.0.1:2567", campus.manifest.get("mapIdentity", {}))
		session.status_changed.connect(_network_status)
		session.snapshot_received.connect(_network_snapshot)
	_show_page("start")
	var args = OS.get_cmdline_user_args()
	if "--preview" in args:
		_start_preview()
	if "--smoke" in args:
		_smoke()
	if "--capture" in args:
		_capture()
	if "--audit-export" in args:
		print(JSON.stringify({"profile":campus.profile,"formalMap":FileAccess.file_exists("res://content/production/map.json"),"demoMap":FileAccess.file_exists("res://content/demo/map.json"),"sdkInstalled":ClassDB.class_exists("_ColyseusClient"),"productionNetworkAllowed":false}))
		get_tree().quit()

func _build_environment() -> void:
	var environment := WorldEnvironment.new()
	var value := Environment.new()
	value.background_mode = Environment.BG_COLOR
	value.background_color = Color("a8bec9")
	value.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	value.ambient_light_color = Color("dbe9ef")
	value.ambient_light_energy = 0.28
	value.tonemap_mode = Environment.TONE_MAPPER_FILMIC
	environment.environment = value
	add_child(environment)
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-48, -35, 0)
	light.light_color = Color("ffefd6")
	light.light_energy = 0.8
	light.shadow_enabled = true
	add_child(light)
	scene_camera = Camera3D.new()
	scene_camera.position = Vector3(1, 5, -3)
	scene_camera.rotation_degrees = Vector3(-12, 175, 0)
	scene_camera.far = 270
	add_child(scene_camera)
	scene_camera.look_at(Vector3(0, 2, -45))
	scene_camera.make_current()

func _build_ui() -> void:
	var layer := CanvasLayer.new()
	add_child(layer)
	menu = Control.new()
	menu.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.add_child(menu)
	var theme := Theme.new()
	var font := SystemFont.new()
	font.font_names = PackedStringArray(["Noto Sans CJK SC", "Microsoft YaHei", "sans-serif"])
	theme.default_font = font
	theme.default_font_size = 18
	var normal := StyleBoxFlat.new()
	normal.bg_color = Color("202e36")
	normal.border_color = Color("4b5a60")
	normal.set_border_width_all(1)
	normal.set_corner_radius_all(6)
	normal.content_margin_left = 18
	normal.content_margin_right = 18
	normal.content_margin_top = 12
	normal.content_margin_bottom = 12
	var hover = normal.duplicate()
	hover.bg_color = Color("35434a")
	hover.border_color = Color("c7b18e")
	var pressed = normal.duplicate()
	pressed.bg_color = Color("965442")
	theme.set_stylebox("normal", "Button", normal)
	theme.set_stylebox("hover", "Button", hover)
	theme.set_stylebox("pressed", "Button", pressed)
	theme.set_color("font_color", "Button", Color("efece2"))
	theme.set_color("font_color", "Label", Color("efece2"))
	menu.theme = theme
	var shade := ColorRect.new()
	shade.color = Color(0.045, 0.065, 0.075, 0.92)
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	menu.add_child(shade)
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_"+side, 14 if mobile else 40)
	menu.add_child(margin)
	var layout := VBoxContainer.new()
	layout.add_theme_constant_override("separation", 18)
	margin.add_child(layout)
	var top := HBoxContainer.new()
	layout.add_child(top)
	var title := Label.new()
	title.text = "齐盛Online"
	title.add_theme_font_size_override("font_size", 32 if mobile else 40)
	title.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(title)
	account_label = Label.new()
	account_label.text = "OpenQS · 原生技术预览"
	account_label.add_theme_font_size_override("font_size", 14)
	top.add_child(account_label)
	account_label.visible = not mobile or get_viewport().get_visible_rect().size.x >= 700
	var navigation := GridContainer.new()
	navigation.columns = 3 if mobile and get_viewport().get_visible_rect().size.x < 600 else 5
	navigation.add_theme_constant_override("separation", 8)
	layout.add_child(navigation)
	for row in [["start","开始"],["network","联机"],["account","账号"],["settings","设置"],["about","关于"]]:
		var button := Button.new()
		button.text = row[1]
		button.custom_minimum_size = Vector2(70, 52)
		button.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		var id: String = row[0]
		button.pressed.connect(func(): _show_page(id))
		navigation.add_child(button)
	var scroll := ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	layout.add_child(scroll)
	body = VBoxContainer.new()
	body.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	body.add_theme_constant_override("separation", 18)
	scroll.add_child(body)
	status_label = Label.new()
	status_label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	status_label.add_theme_font_size_override("font_size", 14)
	status_label.modulate = Color("b3c2c6")
	layout.add_child(status_label)
	var copyright := Label.new()
	copyright.text = "© 2026 OpenQS · 齐盛Online"
	copyright.add_theme_font_size_override("font_size", 12)
	copyright.modulate = Color("829499")
	layout.add_child(copyright)
	overlay = Control.new()
	overlay.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	overlay.mouse_filter = Control.MOUSE_FILTER_IGNORE
	layer.add_child(overlay)
	var pause := Button.new()
	pause.text = "菜单"
	pause.position = Vector2(18, 18)
	pause.custom_minimum_size = Vector2(76, 48)
	pause.pressed.connect(_pause_preview)
	overlay.add_child(pause)
	var guide := Label.new()
	guide.text = "左侧移动 · 右侧观察" if mobile else "WASD 移动 · 鼠标观察 · 空格跳跃 · Esc 菜单"
	guide.position = Vector2(108, 29)
	guide.add_theme_font_size_override("font_size", 14)
	overlay.add_child(guide)
	overlay.hide()
	loading_cover = ColorRect.new()
	loading_cover.color = Color("10171c")
	loading_cover.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	layer.add_child(loading_cover)
	loading_label = Label.new()
	loading_label.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	loading_label.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	loading_label.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	loading_label.text = "正在准备校园…"
	loading_cover.add_child(loading_label)
	loading_cover.hide()

func _show_page(id: String) -> void:
	page_name = id
	for child in body.get_children():
		child.queue_free()
		body.remove_child(child)
	heading = _label({"start":"新的旅程，从这里出发。","network":"与同伴一起行动","account":"你的校园档案","settings":"按你的方式游玩","about":"原生技术预览"}.get(id,"齐盛Online"), 28)
	body.add_child(heading)
	if id == "start":
		body.add_child(_label("当前提供原生地图预览。联机兼容仍在验证，正式竞技继续使用网页版。"))
		body.add_child(_button("继续地图预览" if preview else "进入校园", _start_preview, true))
		body.add_child(_label("完整校园已内置，无需重复下载。" if campus.profile == "production" else "公开演示使用原创场景。完整校园素材单独提供。", 16))
	elif id == "network":
		body.add_child(_label("原生联机目前仅连接本机隔离环境。物理一致性确认后再开放正式对局。"))
		var code := LineEdit.new()
		code.placeholder_text = "输入房间码"
		code.custom_minimum_size.y = 52
		body.add_child(code)
		body.add_child(_button("加入房间", func():
			if session: session.join_room(code.text.strip_edges())
		))
		body.add_child(_button("创建团队对战房间", func():
			if session: session.create_room({"mode":"pvp","variant":"tdm","maxPlayers":2,"private":true})
		))
		body.add_child(_button("我已准备", func():
			if session: session.set_ready(true)
		))
		body.add_child(_button("开始本机测试对局", func():
			if session: session.start_match()
		))
	elif id == "account":
		body.add_child(_label("使用同一个账号登录。本技术预览不会保存密码或长期登录状态。"))
		var username := LineEdit.new()
		username.placeholder_text = "用户名"
		username.custom_minimum_size.y = 52
		body.add_child(username)
		var password := LineEdit.new()
		password.placeholder_text = "密码"
		password.secret = true
		password.custom_minimum_size.y = 52
		body.add_child(password)
		body.add_child(_button("登录", func():
			if session: session.login(username.text, password.text)
			password.clear()
		, true))
		body.add_child(_button("退出账号", func():
			if session: session.logout()
		))
	elif id == "settings":
		body.add_child(_label("画质", 20))
		var options := OptionButton.new()
		for option in ["自动", "流畅", "高清", "超清"]:
			options.add_item(option)
		options.select(quality_index)
		options.custom_minimum_size.y = 52
		options.item_selected.connect(func(index): _set_quality(index))
		body.add_child(options)
		var motion := CheckButton.new()
		motion.text = "减少界面动态效果"
		motion.button_pressed = reduced_motion
		motion.custom_minimum_size.y = 52
		motion.toggled.connect(func(value): reduced_motion = value)
		body.add_child(motion)
		if not mobile:
			body.add_child(_button("切换全屏", func(): DisplayServer.window_set_mode(DisplayServer.WINDOW_MODE_WINDOWED if DisplayServer.window_get_mode() == DisplayServer.WINDOW_MODE_FULLSCREEN else DisplayServer.WINDOW_MODE_FULLSCREEN)))
	else:
		body.add_child(_label("OpenQS 制作\n\n本预览以独立原生引擎呈现校园，包含平台菜单、分块资源和离线地图预览。竞技物理、预测、正式联机及其余玩法尚未完成兼容验收。\n\n正式校园、人物及音乐不随公开源码分发。第三方软件遵循各自许可。"))
	if preview:
		body.add_child(_button("返回校园", _start_preview, true))
	if not reduced_motion:
		body.modulate.a = 0
		create_tween().tween_property(body, "modulate:a", 1.0, 0.18)

func _label(text: String, size := 18) -> Label:
	var label := Label.new()
	label.text = text
	label.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	label.add_theme_font_size_override("font_size", size)
	return label

func _button(text: String, callback: Callable, primary := false) -> Button:
	var button := Button.new()
	button.text = text
	button.custom_minimum_size.y = 56
	button.pressed.connect(callback)
	if primary:
		button.modulate = Color("f0cc9e")
	return button

func _start_preview() -> void:
	preview = true
	player.authoritative_motion = network_preview
	menu.hide()
	overlay.show()
	player.eye.make_current()
	player.activate(true)
	campus.prepare_at(player.position, true)

func _pause_preview() -> void:
	player.activate(false)
	if session: session.clear_controls()
	menu.show()
	overlay.hide()
	loading_cover.hide()
	_show_page("start")

func _set_quality(index: int) -> void:
	quality_index = index
	quality = ["自动", "流畅", "高清", "超清"][index]
	get_viewport().scaling_3d_scale = [0.85 if mobile else 1.0, 0.65, 1.0, 1.25][index]
	get_viewport().msaa_3d = Viewport.MSAA_DISABLED if index == 1 else Viewport.MSAA_2X
	status_label.text = "画质已切换为"+quality

func _apply_ui_scale() -> void:
	var scale_factor := clampf(float(DisplayServer.screen_get_dpi())/150.0, 1.0, 2.0) if mobile else 1.0
	get_window().content_scale_mode = Window.CONTENT_SCALE_MODE_CANVAS_ITEMS
	get_window().content_scale_size = Vector2i(Vector2(get_window().size)/scale_factor)

func _process(_delta: float) -> void:
	if not campus or not player:
		return
	if preview and player.enabled:
		campus.prepare_at(player.position)
		player.motion_allowed = campus.complete
		if not campus.complete:
			player.velocity = Vector3.ZERO
		if player.position.y < -10:
			player.position = campus.spawn_position()+Vector3(0,0.2,0)
			player.velocity = Vector3.ZERO
		loading_cover.visible = not campus.complete
		loading_label.text = "正在准备附近校园…\n%d / %d" % [campus.resident.size(), campus.wanted.size()]
		if network_preview and session:
			session.set_loading(not campus.complete)
	if status_label and session == null:
		status_label.text = "地图已就绪" if campus.complete else "正在准备附近校园…"

func _network_status(status: String, message: String) -> void:
	status_label.text = message if not message.is_empty() else status

func _network_snapshot(snapshot: Dictionary) -> void:
	var own: Dictionary = snapshot.get("self", {})
	if not own.is_empty() and snapshot.get("phase") in ["playing", "paused"]:
		var at: Array = own.get("position", [0,0,0])
		player.position = Vector3(float(at[0]),float(at[1]),float(at[2]))
		if not network_preview:
			network_preview = true
			player.yaw = float(own.get("yaw", 0))
			player.pitch = float(own.get("pitch", 0))
			player.rotation.y = player.yaw
			player.eye.rotation.x = player.pitch
			_start_preview()
		campus.prepare_at(player.position)
		session.set_loading(not campus.complete)
	var seen: Dictionary = {}
	for row in snapshot.get("players", []):
		var id := str(row.get("id", ""))
		if session and id == session.player_id:
			continue
		seen[id] = true
		if not remote_nodes.has(id):
			var mesh := MeshInstance3D.new()
			var capsule := CapsuleMesh.new()
			capsule.radius = 0.3
			capsule.height = 1.7
			mesh.mesh = capsule
			var material := StandardMaterial3D.new()
			var team := str(row.get("team", ""))
			for member in snapshot.get("roster", []):
				if member.get("id") == id: team = str(member.get("team", team))
			material.albedo_color = Color("8b4941") if team == "red" else Color("507c91")
			mesh.material_override = material
			add_child(mesh)
			remote_nodes[id] = mesh
		var point: Array = row.get("position", [0,0,0])
		remote_nodes[id].position = Vector3(float(point[0]), float(point[1])+0.85, float(point[2]))
		remote_nodes[id].visible = row.get("life", "alive") == "alive"
	for id in remote_nodes.keys():
		if not seen.has(id):
			remote_nodes[id].queue_free()
			remote_nodes.erase(id)

func _native_controls(controls: Dictionary) -> void:
	if network_preview and session:
		# Godot local -Z motion uses negative Y; wire controls use positive forward.
		session.submit_controls(Vector2(controls.move.x,-controls.move.y),controls.yaw,controls.pitch,controls.fire,controls.aim,controls.sprint,controls.crouch)

func _notification(what: int) -> void:
	if what == NOTIFICATION_APPLICATION_PAUSED or what == NOTIFICATION_WM_WINDOW_FOCUS_OUT:
		if player:
			_pause_preview()
	if what == NOTIFICATION_WM_CLOSE_REQUEST:
		get_tree().quit()
	if what == NOTIFICATION_WM_GO_BACK_REQUEST:
		if preview and player.enabled:
			_pause_preview()
		elif page_name != "start":
			_show_page("start")
		else:
			get_tree().quit()

func _smoke() -> void:
	var deadline := Time.get_ticks_msec()+30000
	while not campus.complete and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	var status := "ready" if campus.complete else "failed"
	print(JSON.stringify({"native":"Godot","profile":campus.profile,"chunks":campus.manifest.get("chunks",[]).size(),"resident":campus.resident.size(),"collisionTiles":campus.collision_resident.size(),"renderer":RenderingServer.get_current_rendering_method(),"platform":OS.get_name(),"status":status}))
	get_tree().quit(0 if campus.complete else 1)

func _capture() -> void:
	var deadline := Time.get_ticks_msec()+45000
	while not campus.complete and Time.get_ticks_msec() < deadline:
		await get_tree().process_frame
	if not campus.complete:
		push_error("Native map capture timed out")
		get_tree().quit(1)
		return
	var directory := OS.get_environment("QS_NATIVE_CAPTURE_DIR")
	if directory.is_empty():
		directory = "user://captures"
	DirAccess.make_dir_recursive_absolute(directory)
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(directory.path_join("native-menu.png"))
	menu.hide()
	overlay.show()
	player.eye.make_current()
	for i in range(5):
		await get_tree().process_frame
	await RenderingServer.frame_post_draw
	get_viewport().get_texture().get_image().save_png(directory.path_join("native-campus.png"))
	print(JSON.stringify({"status":"captured","profile":campus.profile,"resident":campus.resident.size(),"drawCalls":Performance.get_monitor(Performance.RENDER_TOTAL_DRAW_CALLS_IN_FRAME),"texturesBytes":Performance.get_monitor(Performance.RENDER_TEXTURE_MEM_USED),"fps":Engine.get_frames_per_second()}))
	get_tree().quit()
