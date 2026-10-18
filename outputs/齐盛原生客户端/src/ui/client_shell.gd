class_name QsClientShell
extends Control

signal action_requested(name: String, payload: Dictionary)

const TACTICAL = preload("res://themes/tactical.tres")
const SettingsPanel = preload("res://src/ui/settings_panel.gd")
const WeatherProfiles = preload("res://src/generated/weather_profiles.gd")
const LOBBY = preload("res://scenes/lobby.tscn")
const LOADOUT = preload("res://scenes/loadout.tscn")
const PAUSE = preload("res://scenes/pause.tscn")
const Bindings = preload("res://src/input_bindings.gd")
const WEAPONS := ["mp5", "m4a1", "ak47", "r870", "awm", "m249"]
const WEAPON_NAMES := {"glock":"Glock 17", "mp5":"MP5", "m4a1":"M4A1", "ak47":"AK-47", "r870":"Remington 870", "awm":"AWM", "m249":"M249"}
const ROLES := {"mp5":"近距离 · 冲锋枪", "m4a1":"均衡 · 突击步枪", "ak47":"高威力 · 突击步枪", "r870":"近距离 · 霰弹枪", "awm":"远距离 · 狙击步枪", "m249":"持续压制 · 轻机枪"}
var preferences: QsClientSettings
var settings_tab := "display"
var weather := "clear"
var _backdrop: TextureRect
var _display_font: SystemFont
var mobile := false
var page := "lobby"
var data: Dictionary = {}
var room: Dictionary = {}
var account: Dictionary = {}
var settings: Dictionary = {}
var weapon := "m4a1"
var avatar := "campus-a"
var variant := "tdm"
var selected_mode := "pvp"
var status_text := ""
var reduced_motion := false
var weapon_definitions: Dictionary = {}
var content: VBoxContainer
var heading: Label
var logo: TextureRect
var account_button: Button
var footer: HBoxContainer
var feedback: Label
var scroll: ScrollContainer
var background: ColorRect
var _top: HBoxContainer
var _root: VBoxContainer
var _last_room_signature := ""
var _rebuild_queued := false
var _binding_action := ""
var _binding_notice: AcceptDialog

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	theme = TACTICAL
	mobile = OS.get_name() == "Android" or "--mobile-ui" in OS.get_cmdline_user_args()
	var weapon_path := "res://content/combat/weapons.json" if FileAccess.file_exists("res://content/combat/weapons.json") else "res://content/demo/weapons.json"
	var definitions: Variant = JSON.parse_string(FileAccess.get_file_as_string(weapon_path)) if FileAccess.file_exists(weapon_path) else {}
	if definitions is Dictionary:
		weapon_definitions = definitions
	_build_frame()
	show_page("lobby")

func _build_frame() -> void:
	_backdrop = TextureRect.new()
	_backdrop.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	_backdrop.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	_backdrop.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_COVERED
	_backdrop.mouse_filter = Control.MOUSE_FILTER_IGNORE
	if ResourceLoader.exists("res://content/branding/lobby-campus-v020.webp"):
		_backdrop.texture = load("res://content/branding/lobby-campus-v020.webp")
	add_child(_backdrop)
	background = ColorRect.new()
	background.color = Color(0.025,0.035,0.035,0.65)
	background.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	background.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(background)
	var gradient := Gradient.new()
	gradient.set_color(0,Color(0.018,0.028,0.028,0.92))
	gradient.set_color(1,Color(0.02,0.03,0.03,0.12))
	var texture := GradientTexture2D.new()
	texture.gradient = gradient
	var veil := TextureRect.new()
	veil.texture = texture
	veil.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	veil.mouse_filter = Control.MOUSE_FILTER_IGNORE
	add_child(veil)
	_display_font = SystemFont.new()
	_display_font.font_names = PackedStringArray(["Microsoft YaHei","Noto Sans CJK SC","sans-serif"])
	_display_font.font_weight = 750
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "right"]: margin.add_theme_constant_override("margin_"+side,20 if mobile else 48)
	for side in ["top", "bottom"]: margin.add_theme_constant_override("margin_"+side,16 if mobile else 30)
	add_child(margin)
	_root = VBoxContainer.new()
	_root.add_theme_constant_override("separation", 18 if not mobile else 12)
	margin.add_child(_root)
	var top := HBoxContainer.new()
	_top = top
	top.custom_minimum_size.y = 56
	_root.add_child(top)
	if ResourceLoader.exists("res://content/combat/logo-light.webp"):
		logo = TextureRect.new()
		logo.texture = load("res://content/combat/logo-light.webp")
		logo.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		logo.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
		logo.custom_minimum_size = Vector2(170 if mobile else 210,48)
		logo.mouse_filter = Control.MOUSE_FILTER_IGNORE
		top.add_child(logo)
	heading = label("齐盛Online", 26 if mobile else 30)
	heading.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(heading)
	account_button = button("账号", func(): show_page("account"))
	top.add_child(account_button)
	scroll = ScrollContainer.new()
	scroll.size_flags_vertical = Control.SIZE_EXPAND_FILL
	scroll.horizontal_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED
	_root.add_child(scroll)
	content = VBoxContainer.new()
	content.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	content.size_flags_vertical = Control.SIZE_EXPAND_FILL
	content.add_theme_constant_override("separation", 20)
	scroll.add_child(content)
	feedback = label("", 14)
	feedback.modulate = Color("ddc28e")
	_root.add_child(feedback)
	footer = HBoxContainer.new()
	footer.add_theme_constant_override("separation",12)
	_root.add_child(footer)

func show_page(next: String) -> void:
	page = next
	for container in [content, footer]:
		for child in container.get_children():
			container.remove_child(child)
			child.queue_free()
	scroll.scroll_vertical = 0
	theme = TACTICAL
	_backdrop.visible = not bool(data.get("inSession",false))
	background.color = Color(0.025,0.035,0.035,0.48 if page == "lobby" else 0.86)
	heading.visible = page != "pause"
	feedback.visible = not status_text.is_empty()
	if logo:
		logo.visible = page != "pause"
		if page == "lobby": heading.text = ""
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED if page == "pause" and get_viewport_rect().size.y > 600 else ScrollContainer.SCROLL_MODE_AUTO
	content.custom_minimum_size.y = maxf(0,get_viewport_rect().size.y-240) if page == "pause" and get_viewport_rect().size.y > 600 else 0
	heading.text = {"lobby":"齐盛Online", "loadout":"更换装备", "room":"房间准备", "pause":"个人菜单" if not room.is_empty() else "已暂停", "settings":"设置", "account":"账号与档案", "map":"校园地图", "help":"游玩帮助", "about":"关于", "result":"本局结束"}.get(page, "齐盛Online")
	if page == "lobby" and logo: heading.text = ""
	account_button.text = str(account.get("nickname", account.get("username", "账号")))
	account_button.visible = page in ["lobby", "loadout", "room"]
	match page:
		"lobby": _lobby()
		"loadout": _loadout()
		"room": _room()
		"pause": _pause()
		"settings": _settings()
		"account": _account()
		"map": _map()
		"help": _help()
		"result": _result()
		_: _about()
	_top.visible = page != "pause"
	footer.visible = footer.get_child_count() > 0
	_feedback_status()
	if not reduced_motion:
		content.modulate.a = 0.0
		create_tween().tween_property(content, "modulate:a", 1.0, 0.16)
	call_deferred("_focus_first")

func _focus_first() -> void:
	if not is_visible_in_tree(): return
	var buttons := find_children("*", "Button", true, false)
	for item in buttons:
		if item.is_visible_in_tree() and not item.disabled and bool(item.get_meta("primary",false)):
			item.grab_focus()
			return
	for item in buttons:
		if item.is_visible_in_tree() and not item.disabled:
			item.grab_focus()
			return

func _lobby() -> void:
	var primary_action: Button
	var browse_action: Button
	var layout := LOBBY.instantiate()
	content.add_child(layout)
	var left: VBoxContainer = layout.get_node("PlaySelection")
	var right: VBoxContainer = layout.get_node("CurrentLoadout")
	left.add_theme_constant_override("separation",12)
	if mobile and get_viewport_rect().size.x < 700:
		layout.remove_child(left)
		layout.remove_child(right)
		content.remove_child(layout)
		layout.queue_free()
		content.add_child(left)
		content.add_child(right)
	left.add_child(label("选择玩法",42 if not mobile else 32))
	for row in [["tdm", "团队对战", "两队交战 · 10分钟复活赛"], ["ffa", "个人混战", "各自为战 · 10分钟复活赛"], ["roam", "校园漫游", "从庭院出发，自由探索"]]:
		var id: String = row[0]
		var chosen := (selected_mode == "roam" and id == "roam") or (selected_mode == "pvp" and variant == id)
		var item := button(row[1], func():
			selected_mode = "roam" if id == "roam" else "pvp"
			if id != "roam": variant = id
			show_page("lobby")
		)
		item.text = ""
		item.custom_minimum_size.y = 78 if not mobile else 76
		if chosen: item.theme_type_variation = "SelectedButton"
		var inset := MarginContainer.new()
		inset.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
		inset.mouse_filter = Control.MOUSE_FILTER_IGNORE
		for edge in ["left","right"]: inset.add_theme_constant_override("margin_"+edge,22)
		for edge in ["top","bottom"]: inset.add_theme_constant_override("margin_"+edge,12)
		item.add_child(inset)
		var words := VBoxContainer.new()
		words.mouse_filter = Control.MOUSE_FILTER_IGNORE
		words.add_theme_constant_override("separation",5)
		inset.add_child(words)
		var title := label(row[1],22)
		title.mouse_filter = Control.MOUSE_FILTER_IGNORE
		words.add_child(title)
		var hint := label(row[2],14)
		hint.mouse_filter = Control.MOUSE_FILTER_IGNORE
		hint.add_theme_color_override("font_color",Color("aeb8ad"))
		words.add_child(hint)
		left.add_child(item)
	var weather_row := HBoxContainer.new()
	left.add_child(weather_row)
	var weather_label := label("天气",16)
	weather_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	weather_row.add_child(weather_label)
	var weather_choice := OptionButton.new()
	weather_choice.custom_minimum_size = Vector2(180,48)
	for value in ["晴天","阴天","小雨"]: weather_choice.add_item(value)
	weather_choice.select(maxi(0,["clear","overcast","light-rain"].find(weather)))
	weather_choice.item_selected.connect(func(index): weather = ["clear","overcast","light-rain"][index])
	weather_row.add_child(weather_choice)
	if selected_mode == "pvp":
		var play := button("登录后创建房间" if account.is_empty() else "创建房间", func():
			if account.is_empty(): show_page("account")
			else: action_requested.emit("create",{"mode":"pvp","variant":variant,"maxPlayers":8,"private":false,"ranked":false,"weapon":weapon,"avatar":avatar,"weather":weather})
		,true)
		play.custom_minimum_size = Vector2(220 if not mobile else 160,58)
		primary_action = play
		var join := HBoxContainer.new()
		left.add_child(join)
		var code := LineEdit.new()
		code.placeholder_text = "输入房间码"
		code.max_length = 8
		code.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		code.custom_minimum_size.y = 48
		join.add_child(code)
		join.add_child(button("加入",func(): action_requested.emit("join",{"code":code.text.strip_edges()})))
		browse_action = button("公开房间",func(): action_requested.emit("list-rooms",{}))
	else:
		primary_action = button("进入校园",func(): action_requested.emit("roam",{"weather":weather}),true)
	var space := Control.new()
	space.size_flags_vertical = Control.SIZE_EXPAND_FILL
	right.add_child(space)
	var card := panel()
	right.add_child(card)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation",12)
	card.add_child(stack)
	stack.add_child(label("行动装备" if selected_mode == "pvp" else "齐盛校园",16))
	if selected_mode == "pvp":
		stack.add_child(label(WEAPON_NAMES.get(weapon,weapon),36))
		var picture := _weapon_picture(weapon,130 if not mobile else 80)
		if picture: stack.add_child(picture)
		stack.add_child(label(ROLES.get(weapon,""),16))
		stack.add_child(label("Glock 17 · "+_avatar_name(avatar),14))
		stack.add_child(button("更换装备",func(): show_page("loadout")))
	else:
		stack.add_child(label("南楼 · 庭院 · 操场",30))
		stack.add_child(label("走过熟悉的道路，寻找新的风景。",17))
	if browse_action: footer.add_child(browse_action)
	for row in [["settings","设置"],["help","帮助"],["about","关于"]]:
		var target: String = row[0]
		footer.add_child(button(row[1],func(): show_page(target)))
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	footer.add_child(spacer)
	var version := label("Preview "+str(ProjectSettings.get_setting("application/config/version","0.2.0"))+" · 预览版",13)
	version.autowrap_mode = TextServer.AUTOWRAP_OFF
	version.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	version.visible = not mobile
	footer.add_child(version)
	footer.add_child(primary_action)

func _loadout() -> void:
	var layout := LOADOUT.instantiate()
	content.add_child(layout)
	var cards: GridContainer = layout.get_node("WeaponCards")
	cards.columns = 2 if mobile else 3
	for id in WEAPONS:
		var card := button(("● " if weapon == id else "")+WEAPON_NAMES[id]+"\n"+ROLES[id], func(): weapon = id; show_page("loadout"))
		card.alignment = HORIZONTAL_ALIGNMENT_LEFT
		if weapon == id: card.add_theme_stylebox_override("normal",TACTICAL.get_stylebox("pressed","Button"))
		card.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		card.custom_minimum_size.y = 104 if not mobile else 82
		var picture := _weapon_picture(id,82 if not mobile else 56)
		if picture:
			card.text = ""
			card.custom_minimum_size.y = 156 if not mobile else 130
			var inset := MarginContainer.new()
			inset.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
			for edge in ["left","right","top","bottom"]: inset.add_theme_constant_override("margin_"+edge,14)
			inset.mouse_filter = Control.MOUSE_FILTER_IGNORE
			card.add_child(inset)
			var stack := VBoxContainer.new()
			stack.mouse_filter = Control.MOUSE_FILTER_IGNORE
			inset.add_child(stack)
			stack.add_child(picture)
			var caption := label(("● " if weapon == id else "")+WEAPON_NAMES[id],19)
			caption.mouse_filter = Control.MOUSE_FILTER_IGNORE
			stack.add_child(caption)
		cards.add_child(card)
	var detail: VBoxContainer = layout.get_node("WeaponDetail/Detail")
	detail.add_child(label(WEAPON_NAMES[weapon], 28))
	var values: Dictionary = weapon_definitions.get(weapon, {})
	var stats := HBoxContainer.new()
	detail.add_child(stats)
	for item in [["伤害", _number(values.get("pvpDamage", values.get("damage", null)))+(" × 8" if weapon == "r870" else "")], ["射速", str(roundi(60.0/float(values.get("interval", 0.1))))+" 发/分"], ["弹量", _number(values.get("capacity", null))+" 发"], ["装填", _number(values.get("reload", null))+" 秒"]]:
		var group := VBoxContainer.new()
		group.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		stats.add_child(group)
		group.add_child(label(item[0], 14))
		group.add_child(label(item[1], 22))
	detail.add_child(label("副武器 · Glock 17。实际伤害随命中部位与头盔变化。", 14))
	var characters := HBoxContainer.new()
	content.add_child(characters)
	var role_label := label("角色",18)
	role_label.autowrap_mode = TextServer.AUTOWRAP_OFF
	role_label.custom_minimum_size.x = 76
	characters.add_child(role_label)
	var choices := OptionButton.new()
	choices.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	choices.custom_minimum_size.y = 48
	for value in ["campus-a", "campus-b", "tactical-a", "tactical-b"]:
		choices.add_item(_avatar_name(value))
	choices.select(["campus-a", "campus-b", "tactical-a", "tactical-b"].find(avatar))
	choices.item_selected.connect(func(index): avatar = ["campus-a", "campus-b", "tactical-a", "tactical-b"][index])
	characters.add_child(choices)
	footer.add_child(button("确认装备", func():
		action_requested.emit("loadout", {"weapon":weapon,"avatar":avatar})
		show_page("room" if not room.is_empty() else "lobby")
	, true))
	footer.add_child(button("返回", func(): show_page("room" if not room.is_empty() else "lobby")))

func _room() -> void:
	if room.is_empty():
		show_page("lobby")
		return
	var title := HBoxContainer.new()
	content.add_child(title)
	var mode_name := "团队对战" if room.get("variant", "tdm") == "tdm" else "个人混战"
	var info := label(mode_name+"  ·  "+str(room.get("inviteCode", "")), 28)
	info.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	title.add_child(info)
	title.add_child(button("复制房间码", func(): DisplayServer.clipboard_set(str(room.get("inviteCode", "")))))
	var current_weather: String = str(room.get("weather",{}).get("preset","clear"))
	content.add_child(label(str(WeatherProfiles.PRESETS.get(current_weather,{}).get("label","晴天"))+" · 本局天气",15))
	var list := panel()
	content.add_child(list)
	var rows := VBoxContainer.new()
	list.add_child(rows)
	for member in room.get("roster", []):
		var row := HBoxContainer.new()
		rows.add_child(row)
		var name_label := label(str(member.get("nickname", "玩家")), 20)
		name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		row.add_child(name_label)
		var team_label := label({"red":"红队", "blue":"蓝队", "none":""}.get(member.get("team", "none"), ""),16)
		team_label.autowrap_mode = TextServer.AUTOWRAP_OFF
		team_label.custom_minimum_size.x = 52 if mobile else 80
		row.add_child(team_label)
		var ready_label := label("正在连接" if not member.get("connected",true) else "正在载入" if member.get("loading",false) else "已准备" if member.get("ready",false) else "未准备",16)
		ready_label.autowrap_mode = TextServer.AUTOWRAP_OFF
		ready_label.custom_minimum_size.x = 64 if mobile else 100
		row.add_child(ready_label)
	var summary := HBoxContainer.new()
	content.add_child(summary)
	var equipped := label("当前装备  "+WEAPON_NAMES[weapon]+" · "+_avatar_name(avatar), 18)
	equipped.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	summary.add_child(equipped)
	summary.add_child(button("更换装备", func(): show_page("loadout")))
	var self_state: Dictionary = room.get("self", {})
	var is_ready: bool = self_state.get("ready", false)
	var host: bool = str(room.get("hostId", "")) == str(account.get("id", ""))
	var participants: Array = room.get("roster",[]).filter(func(member): return member.get("connected",false))
	var can_start := participants.size() >= 2
	for member in participants:
		if not member.get("ready",false) or member.get("loading",true): can_start = false
	if room.get("variant","tdm") == "tdm":
		var blue := participants.filter(func(member): return member.get("team") == "blue").size()
		var red := participants.size()-blue
		if blue == 0 or red == 0 or absi(blue-red) > 1: can_start = false
	var ready_button := button("资源准备中" if self_state.get("loading",true) else "取消准备" if is_ready else "准备", func(): action_requested.emit("ready", {"ready":not is_ready}), not is_ready and not (host and can_start))
	ready_button.disabled = self_state.get("loading",true)
	footer.add_child(ready_button)
	if host:
		var start_button := button("开始本局" if can_start else "等待队员准备" if participants.size() >= 2 else "等待玩家加入", func(): action_requested.emit("start", {}),can_start)
		start_button.disabled = not can_start
		footer.add_child(start_button)
	footer.add_child(button("离开房间", func(): action_requested.emit("confirm-leave", {})))

func _pause() -> void:
	var layout := PAUSE.instantiate()
	content.add_child(layout)
	var actions: VBoxContainer = layout.get_node("Panel/Actions")
	actions.add_child(label("个人菜单" if not room.is_empty() else "已暂停",32))
	var continue_button := button("继续游玩",func(): action_requested.emit("resume",{}),true)
	continue_button.custom_minimum_size.y = 62
	actions.add_child(continue_button)
	var shortcuts := HBoxContainer.new()
	actions.add_child(shortcuts)
	for row in [["settings","设置"],["map","地图"],["help","帮助"]]:
		var target: String = row[0]
		var shortcut := button(row[1],func(): show_page(target))
		shortcut.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		shortcuts.add_child(shortcut)
	var divider := HSeparator.new()
	actions.add_child(divider)
	if not room.is_empty():
		actions.add_child(button("离开房间并返回大厅",func(): action_requested.emit("confirm-leave",{})))
	else:
		actions.add_child(button("结束探索并返回大厅",func(): action_requested.emit("confirm-home",{})))

func _settings() -> void:
	var view := SettingsPanel.new()
	view.values = settings
	view.capabilities = preferences.capabilities() if preferences else {}
	if preferences:
		view.profile_reader = func(): return float(preferences.render_profile.profile().get("scale",1.0))
	view.mobile = mobile
	view.active_tab = settings_tab
	view.setting_requested.connect(func(key,value):
		if key == "reducedMotion": reduced_motion = bool(value)
		action_requested.emit("setting",{"key":key,"value":value})
	)
	view.display_requested.connect(func(changes): action_requested.emit("preview-display",changes))
	view.restart_requested.connect(func(): action_requested.emit("restart-renderer",{}))
	view.binding_requested.connect(_request_binding)
	view.tab_changed.connect(func(id): settings_tab = id; show_page("settings"))
	var inset := MarginContainer.new()
	var padding := maxi(0,int((get_viewport_rect().size.x-96-1080)/2)) if not mobile else 0
	inset.add_theme_constant_override("margin_left",padding)
	inset.add_theme_constant_override("margin_right",padding)
	content.add_child(inset)
	inset.add_child(view)
	footer.add_child(button("返回菜单",_return_menu))

func _account() -> void:
	var center := CenterContainer.new()
	center.size_flags_vertical = Control.SIZE_EXPAND_FILL
	content.add_child(center)
	var card := panel()
	card.custom_minimum_size.x = minf(560,get_viewport_rect().size.x-80)
	center.add_child(card)
	var stack := VBoxContainer.new()
	stack.add_theme_constant_override("separation",18)
	card.add_child(stack)
	if account.is_empty():
		stack.add_child(label("欢迎回来",32))
		var username := LineEdit.new()
		username.placeholder_text = "用户名"
		username.custom_minimum_size.y = 52
		stack.add_child(username)
		var password := LineEdit.new()
		password.placeholder_text = "密码"
		password.secret = true
		password.custom_minimum_size.y = 52
		stack.add_child(password)
		var login := func(): action_requested.emit("login",{"username":username.text,"password":password.text}); password.clear()
		stack.add_child(button("登录",login,true))
		password.text_submitted.connect(func(_text): login.call())
		stack.add_child(button("注册或找回账号 ↗",func(): action_requested.emit("web",{"path":"/account/"})))
	else:
		stack.add_child(label(str(account.get("nickname",account.get("username","玩家"))),36))
		stack.add_child(label("玩家编号  "+str(account.get("shortId","—")),16))
		stack.add_child(button("查看完整档案 ↗",func(): action_requested.emit("web",{"path":"/account/"}),true))
		stack.add_child(button("退出账号",func(): action_requested.emit("logout",{})))
	stack.add_child(label("客户端与网页分别登录。",14))
	footer.add_child(button("返回菜单",_return_menu))

func _map() -> void:
	var map_script := load("res://src/ui/campus_map.gd")
	var map_view: Control = map_script.new()
	map_view.custom_minimum_size.y = 460 if not mobile else 280
	map_view.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	map_view.set("player_position", data.get("position", Vector3.ZERO))
	map_view.set("player_yaw", data.get("yaw", 0.0))
	content.add_child(map_view)
	content.add_child(label("南楼一至四层开放。第五层、地下与未完成区域暂不开放。", 15))
	footer.add_child(button("返回菜单", _return_menu, true))

func _help() -> void:
	content.add_child(label("先选玩法，再准备出发", 28))
	content.add_child(label("团队对战：与队友配合，在十分钟内争取更多击倒。个人混战：各自为战，按个人击倒数排名。生命耗尽后会在安全位置复活。", 18))
	var bindings: Dictionary = settings.get("bindings",{})
	content.add_child(label("更换装备只在准备阶段生效。交战中按 %s 拾取附近枪械或道具，%s 使用当前道具，%s 切换。" % [Bindings.caption(bindings,"interact"),Bindings.caption(bindings,"gadget"),Bindings.caption(bindings,"cycle")], 18))
	content.add_child(label("按 Esc 打开菜单只停止本人操作，联机对局继续。暂时断线可在六十秒内尝试恢复原席位。", 18))
	content.add_child(button("打开完整帮助 ↗", func(): action_requested.emit("web", {"path":"/?help=1"})))
	content.add_child(button("反馈问题 ↗", func(): action_requested.emit("web", {"path":"/?feedback=1"})))
	footer.add_child(button("返回菜单", _return_menu, true))

func _about() -> void:
	content.add_child(label("齐盛Online · 原生客户端",32))
	content.add_child(label("Preview "+str(ProjectSettings.get_setting("application/config/version","0.2.0"))+" · 原生预览版", 18))
	content.add_child(label("制作与开发 · OpenQS",18))
	content.add_child(button("检查更新", func(): action_requested.emit("check-updates",{})))
	content.add_child(button("制作名单 ↗", func(): action_requested.emit("web", {"path":"/credits/"})))
	content.add_child(button("版权与许可 ↗", func(): action_requested.emit("web", {"path":"/copyright/"})))
	content.add_child(label("音乐：Wildflowers — Scott Buckley · CC BY 4.0",14))
	content.add_child(label("© 2026 OpenQS · 齐盛Online", 14))
	footer.add_child(button("返回菜单", _return_menu, true))

func _result() -> void:
	var result: Dictionary = room.get("result", {})
	var self_result: Dictionary = {}
	for row in result.get("players",[]):
		if row.get("id") == account.get("id"): self_result = row
	content.add_child(label("胜利" if self_result.get("won",result.get("won",false)) else "本局结束",44))
	if room.get("variant","tdm") == "ffa":
		var rank := int(self_result.get("rank",0))
		content.add_child(label("第 %d 名" % rank if rank > 0 else "个人混战",28))
	else:
		var scores: Dictionary = result.get("teamScores", {})
		content.add_child(label("蓝队  %d  :  %d  红队" % [scores.get("blue", 0), scores.get("red", 0)], 28))
	for row in result.get("players", []):
		content.add_child(label("%s    %d 击倒  /  %d 阵亡  /  %d 助攻" % [row.get("nickname", "玩家"), row.get("kills", 0), row.get("deaths", 0), row.get("assists", 0)], 18))
	footer.add_child(button("返回联机大厅", func(): action_requested.emit("return-room", {}),true))

func show_rooms(rooms: Array) -> void:
	show_page("lobby")
	content.add_child(label("公开房间", 24))
	if rooms.is_empty():
		content.add_child(label("暂时没有公开房间，可以创建一个。", 17))
	for row in rooms:
		var code := str(row.get("inviteCode", ""))
		content.add_child(button("%s  ·  %d/%d  %s" % [row.get("title", "房间"), row.get("players", 0), row.get("maxPlayers", 8), "进行中" if row.get("phase") == "playing" else "准备中"], func(): action_requested.emit("join-id", {"roomId":row.get("roomId", ""),"code":code})))

func update_room(value: Dictionary) -> void:
	room = value
	if not is_visible_in_tree() or page != "room": return
	var members: Array = []
	for member in room.get("roster",[]):
		members.append([member.get("id"),member.get("nickname"),member.get("team"),member.get("ready"),member.get("connected"),member.get("loading")])
	var signature := str([room.get("phase"),room.get("hostId"),members,room.get("countdown")])
	if signature != _last_room_signature and not _rebuild_queued:
		_rebuild_queued = true
		call_deferred("_refresh_room")
	_last_room_signature = signature

func _refresh_room() -> void:
	_rebuild_queued = false
	if is_visible_in_tree() and page == "room": show_page("room")

func set_status(message: String) -> void:
	status_text = message
	_feedback_status()

func _feedback_status() -> void:
	if feedback:
		feedback.text = status_text
		feedback.visible = not status_text.is_empty()

func _return_menu() -> void:
	show_page("pause" if data.get("inSession", false) else "room" if not room.is_empty() else "lobby")

func _avatar_name(value: String) -> String:
	return {"campus-a":"校园运动装 A", "campus-b":"校园运动装 B", "tactical-a":"现代战术装 A", "tactical-b":"现代战术装 B"}.get(value, "校园运动装 A")


func label(text: String, size := 18) -> Label:
	var result := Label.new()
	result.text = text
	result.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	result.add_theme_font_size_override("font_size", size)
	if size >= 24 and _display_font: result.add_theme_font_override("font",_display_font)
	return result

func button(text: String, callback: Callable, primary := false) -> Button:
	var result := Button.new()
	result.text = text
	result.custom_minimum_size.y = 52
	result.set_meta("primary",primary)
	result.pressed.connect(func(): action_requested.emit("ui-sound",{}); callback.call())
	if primary:
		result.theme_type_variation = "PrimaryButton"
	return result

func panel() -> PanelContainer:
	return PanelContainer.new()

func _number(value: Variant) -> String:
	if value == null: return "—"
	return str(int(value)) if is_equal_approx(float(value),roundf(float(value))) else str(value)

func _weapon_picture(id: String,height: float) -> TextureRect:
	var path := "res://content/combat/cards/"+id+".webp"
	if not ResourceLoader.exists(path): return null
	var image := TextureRect.new()
	image.texture = load(path)
	image.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
	image.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT_CENTERED
	image.custom_minimum_size.y = height
	image.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	image.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return image

func _request_binding(action: String) -> void:
	_binding_action = action
	_binding_notice = AcceptDialog.new()
	_binding_notice.title = "更改按键"
	_binding_notice.dialog_text = "按下要使用的按键。Esc 取消。"
	add_child(_binding_notice)
	_binding_notice.confirmed.connect(func(): _binding_action = ""; _binding_notice.queue_free())
	_binding_notice.popup_centered(Vector2i(400,180))

func _input(event: InputEvent) -> void:
	if not is_visible_in_tree() or not event is InputEventKey or not event.pressed or event.echo: return
	if _binding_action.is_empty():
		if event.keycode != KEY_ESCAPE or page == "lobby": return
		if page == "pause": action_requested.emit("resume",{})
		elif page == "room": action_requested.emit("confirm-leave",{})
		elif page == "result": action_requested.emit("return-room",{})
		else: _return_menu()
		get_viewport().set_input_as_handled()
		return
	if event.keycode != KEY_ESCAPE:
		var bindings: Dictionary = Bindings.rebound(settings.get("bindings",{}),_binding_action,int(event.physical_keycode))
		settings.bindings = bindings
		action_requested.emit("setting",{"key":"bindings","value":bindings})
	_binding_action = ""
	if is_instance_valid(_binding_notice): _binding_notice.queue_free()
	get_viewport().set_input_as_handled()
	show_page("settings")
