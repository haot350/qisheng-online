class_name QsClientShell
extends Control

signal action_requested(name: String, payload: Dictionary)

const TACTICAL = preload("res://themes/tactical.tres")
const CAMPUS = preload("res://themes/campus.tres")
const LOBBY = preload("res://scenes/lobby.tscn")
const LOADOUT = preload("res://scenes/loadout.tscn")
const PAUSE = preload("res://scenes/pause.tscn")
const Bindings = preload("res://src/input_bindings.gd")
const WEAPONS := ["mp5", "m4a1", "ak47", "r870", "awm", "m249"]
const WEAPON_NAMES := {"glock":"Glock 17", "mp5":"MP5", "m4a1":"M4A1", "ak47":"AK-47", "r870":"Remington 870", "awm":"AWM", "m249":"M249"}
const ROLES := {"mp5":"近距离 · 冲锋枪", "m4a1":"均衡 · 突击步枪", "ak47":"高威力 · 突击步枪", "r870":"近距离 · 霰弹枪", "awm":"远距离 · 狙击步枪", "m249":"持续压制 · 轻机枪"}
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
var _root: VBoxContainer
var _last_room_signature := ""
var _rebuild_queued := false
var _binding_action := ""
var _binding_button: Button
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
	var shade := ColorRect.new()
	background = shade
	shade.color = Color("111a1e")
	shade.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	add_child(shade)
	var line := ColorRect.new()
	line.color = Color("85432f")
	line.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	line.offset_bottom = 4
	add_child(line)
	var margin := MarginContainer.new()
	margin.set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	for side in ["left", "right", "top", "bottom"]:
		margin.add_theme_constant_override("margin_"+side, 18 if mobile else 40)
	add_child(margin)
	_root = VBoxContainer.new()
	_root.add_theme_constant_override("separation", 22 if not mobile else 12)
	margin.add_child(_root)
	var top := HBoxContainer.new()
	_root.add_child(top)
	heading = label("齐盛Online", 28 if mobile else 38)
	heading.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	top.add_child(heading)
	if ResourceLoader.exists("res://content/combat/logo-light.webp"):
		logo = TextureRect.new()
		logo.texture = load("res://content/combat/logo-light.webp")
		logo.expand_mode = TextureRect.EXPAND_IGNORE_SIZE
		logo.stretch_mode = TextureRect.STRETCH_KEEP_ASPECT
		logo.custom_minimum_size = Vector2(260 if mobile else 330,56 if mobile else 64)
		logo.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		top.add_child(logo)
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
	feedback.modulate = Color("c9b894")
	_root.add_child(feedback)
	footer = HBoxContainer.new()
	_root.add_child(footer)

func show_page(next: String) -> void:
	page = next
	for container in [content, footer]:
		for child in container.get_children():
			container.remove_child(child)
			child.queue_free()
	scroll.scroll_vertical = 0
	theme = CAMPUS if page in ["account", "help", "about"] else TACTICAL
	background.color = Color("f0eee5") if page in ["account","help","about"] else Color("111a1e")
	heading.visible = page != "pause"
	if logo:
		logo.visible = page == "lobby"
		if logo.visible: heading.hide()
	scroll.vertical_scroll_mode = ScrollContainer.SCROLL_MODE_DISABLED if page == "pause" and get_viewport_rect().size.y > 600 else ScrollContainer.SCROLL_MODE_AUTO
	content.custom_minimum_size.y = maxf(0,get_viewport_rect().size.y-240) if page == "pause" and get_viewport_rect().size.y > 600 else 0
	heading.text = {"lobby":"齐盛Online", "loadout":"更换装备", "room":"房间准备", "pause":"个人菜单" if not room.is_empty() else "已暂停", "settings":"设置", "account":"账号与档案", "map":"校园地图", "help":"游玩帮助", "about":"齐盛Online", "result":"本局结束"}.get(page, "齐盛Online")
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
	var layout := LOBBY.instantiate()
	content.add_child(layout)
	var left: VBoxContainer = layout.get_node("PlaySelection")
	var right: VBoxContainer = layout.get_node("CurrentLoadout")
	if mobile and get_viewport_rect().size.x < 700:
		layout.queue_free()
		content.remove_child(layout)
		left = VBoxContainer.new()
		right = VBoxContainer.new()
		content.add_child(left)
		content.add_child(right)
	left.add_child(label("选择玩法", 23))
	for row in [["tdm", "团队对战", "两队交战 · 10分钟复活赛"], ["ffa", "个人混战", "各自为战 · 10分钟复活赛"], ["roam", "校园漫游", "步行探索校园"]]:
		var id: String = row[0]
		var chosen := (selected_mode == "roam" and id == "roam") or (selected_mode == "pvp" and variant == id)
		var item := button(("●  " if chosen else "    ")+row[1]+"\n"+row[2], func():
			selected_mode = "roam" if id == "roam" else "pvp"
			if id != "roam": variant = id
			show_page("lobby")
		)
		item.alignment = HORIZONTAL_ALIGNMENT_LEFT
		item.custom_minimum_size.y = 96 if not mobile else 78
		item.button_pressed = chosen
		left.add_child(item)
	right.add_child(label("当前装备" if selected_mode == "pvp" else "校园资料", 23))
	if selected_mode == "pvp":
		var card := panel()
		right.add_child(card)
		var stack := VBoxContainer.new()
		stack.add_theme_constant_override("separation",8)
		card.add_child(stack)
		stack.add_child(label(WEAPON_NAMES.get(weapon, weapon), 34 if not mobile else 28))
		var picture := _weapon_picture(weapon,100 if not mobile else 70)
		if picture: stack.add_child(picture)
		stack.add_child(label(ROLES.get(weapon, ""), 16))
		stack.add_child(label("副武器  Glock 17\n角色  "+_avatar_name(avatar), 17))
		stack.add_child(button("更换装备", func(): show_page("loadout")))
		right.add_child(button("创建房间", func(): action_requested.emit("create", {"mode":"pvp", "variant":variant,"maxPlayers":8,"private":false,"ranked":false,"weapon":weapon,"avatar":avatar}), true))
		var join := HBoxContainer.new()
		right.add_child(join)
		var code := LineEdit.new()
		code.placeholder_text = "房间码"
		code.max_length = 8
		code.size_flags_horizontal = Control.SIZE_EXPAND_FILL
		code.custom_minimum_size.y = 52
		join.add_child(code)
		join.add_child(button("加入", func(): action_requested.emit("join", {"code":code.text.strip_edges()})))
		right.add_child(button("浏览公开房间", func(): action_requested.emit("list-rooms", {})))
	else:
		right.add_child(label("南楼 · 庭院 · 操场", 36))
		right.add_child(label("完整开放区域已随客户端提供。", 17))
		right.add_child(button("进入校园", func(): action_requested.emit("roam", {}), true))
	for row in [["settings", "设置"], ["help", "帮助"], ["about", "关于"]]:
		var target: String = row[0]
		footer.add_child(button(row[1], func(): show_page(target)))
	var spacer := Control.new()
	spacer.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	footer.add_child(spacer)
	var version := label("Preview 0.1.0 · 预览版",13)
	version.autowrap_mode = TextServer.AUTOWRAP_OFF
	version.custom_minimum_size.x = 190
	version.vertical_alignment = VERTICAL_ALIGNMENT_CENTER
	footer.add_child(version)

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
	detail.add_child(label("副武器固定为 Glock 17。伤害为当前对战基础值，命中部位和护具参与判定。", 14))
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
	var ready_button := button("取消准备" if is_ready else "准备", func(): action_requested.emit("ready", {"ready":not is_ready}), not (host and can_start))
	ready_button.disabled = self_state.get("loading",true)
	footer.add_child(ready_button)
	if host:
		var start_button := button("开始本局", func(): action_requested.emit("start", {}),can_start)
		start_button.disabled = not can_start
		footer.add_child(start_button)
	footer.add_child(button("离开房间", func(): action_requested.emit("confirm-leave", {})))

func _pause() -> void:
	var layout := PAUSE.instantiate()
	content.add_child(layout)
	var actions: VBoxContainer = layout.get_node("Panel/Actions")
	actions.add_child(label("个人菜单" if not room.is_empty() else "已暂停", 28))
	actions.add_child(button("继续游玩", func(): action_requested.emit("resume", {}), true))
	for row in [["settings", "设置"], ["map", "地图"], ["help", "帮助"]]:
		var target: String = row[0]
		actions.add_child(button(row[1], func(): show_page(target)))
	if not room.is_empty():
		actions.add_child(button("返回联机大厅", func(): action_requested.emit("confirm-leave", {})))
	actions.add_child(button("返回主菜单", func(): action_requested.emit("confirm-home", {})))

func _settings() -> void:
	var controls := panel()
	content.add_child(controls)
	var stack := VBoxContainer.new()
	controls.add_child(stack)
	stack.add_child(label("画面", 24))
	_option(stack, "画质", ["自动", "流畅", "高清", "超清", "兼容"], int(settings.get("quality", 0)), func(index): action_requested.emit("setting", {"key":"quality","value":index}))
	_option(stack, "帧率", ["60 FPS", "30 FPS", "120 FPS", "不限"], int(settings.get("fps", 0)), func(index): action_requested.emit("setting", {"key":"fps","value":index}))
	if not mobile:
		_option(stack, "显示", ["窗口", "全屏"], int(settings.get("fullscreen", 0)), func(index): action_requested.emit("setting", {"key":"fullscreen","value":index}))
		var vsync := CheckButton.new()
		vsync.text = "垂直同步"
		vsync.custom_minimum_size.y = 48
		vsync.button_pressed = bool(settings.get("vsync",true))
		vsync.toggled.connect(func(value): action_requested.emit("setting", {"key":"vsync","value":value}))
		stack.add_child(vsync)
	stack.add_child(label("操作与声音", 24))
	_slider(stack, "观察灵敏度", float(settings.get("sensitivity", 1.0)), 0.2, 3.0, func(value): action_requested.emit("setting", {"key":"sensitivity","value":value}))
	_slider(stack, "主音量", float(settings.get("volume", 0.8)), 0.0, 1.0, func(value): action_requested.emit("setting", {"key":"volume","value":value}))
	var motion := CheckButton.new()
	motion.text = "减少界面动态效果"
	motion.button_pressed = reduced_motion
	motion.toggled.connect(func(value): reduced_motion = value; action_requested.emit("setting", {"key":"reducedMotion","value":value}))
	stack.add_child(motion)
	if not mobile:
		var keys := GridContainer.new()
		keys.columns = 2
		stack.add_child(keys)
		var bindings: Dictionary = settings.get("bindings",{})
		for item in [["forward","前进",KEY_W],["back","后退",KEY_S],["left","向左",KEY_A],["right","向右",KEY_D],["sprint","冲刺",KEY_SHIFT],["crouch","蹲伏",KEY_CTRL],["jump","跳跃",KEY_SPACE],["reload","装填",KEY_R],["interact","互动",KEY_E],["switch","切枪",KEY_Q],["gadget","使用道具",KEY_G],["cycle","切换道具",KEY_B],["slide","滑铲",KEY_C],["map","地图",KEY_M]]:
			keys.add_child(label(item[1],16))
			var action: String = item[0]
			var key_button := button(OS.get_keycode_string(int(bindings.get(action,item[2]))),func(): _request_binding(action))
			key_button.set_meta("binding",action)
			keys.add_child(key_button)
	stack.add_child(label("鼠标左键射击 · 右键开镜 · Esc 菜单", 15))
	footer.add_child(button("返回菜单", _return_menu, true))

func _account() -> void:
	if account.is_empty():
		content.add_child(label("登录账号", 28))
		var username := LineEdit.new()
		username.placeholder_text = "用户名"
		username.custom_minimum_size.y = 52
		content.add_child(username)
		var password := LineEdit.new()
		password.placeholder_text = "密码"
		password.secret = true
		password.custom_minimum_size.y = 52
		content.add_child(password)
		content.add_child(button("登录", func(): action_requested.emit("login", {"username":username.text,"password":password.text}); password.clear(), true))
		content.add_child(button("注册或找回账号 ↗", func(): action_requested.emit("web", {"path":"/account/"})))
	else:
		content.add_child(label(str(account.get("nickname", account.get("username", "玩家"))), 36))
		content.add_child(label("玩家编号  "+str(account.get("shortId", "—")), 16))
		content.add_child(button("查看完整档案 ↗", func(): action_requested.emit("web", {"path":"/account/"})))
		content.add_child(button("退出账号", func(): action_requested.emit("logout", {})))
	content.add_child(label("客户端与网页分别登录。", 14))
	footer.add_child(button("返回菜单", _return_menu, true))

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
	content.add_child(label("齐盛Online", 42))
	content.add_child(label("Preview 0.1.0 · 原生预览版", 18))
	content.add_child(label("重访校园，与朋友并肩行动。", 22))
	content.add_child(button("检查更新", func(): action_requested.emit("check-updates",{})))
	content.add_child(button("制作名单 ↗", func(): action_requested.emit("web", {"path":"/credits/"})))
	content.add_child(button("版权与许可 ↗", func(): action_requested.emit("web", {"path":"/copyright/"})))
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
	if feedback: feedback.text = status_text

func _return_menu() -> void:
	show_page("pause" if data.get("inSession", false) else "room" if not room.is_empty() else "lobby")

func _avatar_name(value: String) -> String:
	return {"campus-a":"校园运动装 A", "campus-b":"校园运动装 B", "tactical-a":"现代战术装 A", "tactical-b":"现代战术装 B"}.get(value, "校园运动装 A")

func _option(parent: Control, title: String, choices: Array, selected: int, changed: Callable) -> void:
	var row := HBoxContainer.new()
	parent.add_child(row)
	var name_label := label(title)
	name_label.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	row.add_child(name_label)
	var option := OptionButton.new()
	option.custom_minimum_size = Vector2(180, 48)
	for value in choices: option.add_item(value)
	option.select(selected)
	option.item_selected.connect(changed)
	row.add_child(option)

func _slider(parent: Control, title: String, value: float, lower: float, upper: float, changed: Callable) -> void:
	var row := HBoxContainer.new()
	parent.add_child(row)
	var name_label := label(title)
	name_label.custom_minimum_size.x = 140
	row.add_child(name_label)
	var slider := HSlider.new()
	slider.min_value = lower
	slider.max_value = upper
	slider.step = 0.01
	slider.value = value
	slider.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	slider.custom_minimum_size.y = 48
	slider.value_changed.connect(changed)
	row.add_child(slider)

func label(text: String, size := 18) -> Label:
	var result := Label.new()
	result.text = text
	result.autowrap_mode = TextServer.AUTOWRAP_WORD_SMART
	result.add_theme_font_size_override("font_size", size)
	return result

func button(text: String, callback: Callable, primary := false) -> Button:
	var result := Button.new()
	result.text = text
	result.custom_minimum_size.y = 52
	result.set_meta("primary",primary)
	result.pressed.connect(callback)
	if primary:
		result.add_theme_stylebox_override("normal", TACTICAL.get_stylebox("pressed", "Button"))
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
