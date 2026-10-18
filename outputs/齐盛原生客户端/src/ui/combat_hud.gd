class_name QsCombatHud
extends Control

signal menu_requested
signal action_requested(action: String)
signal held_changed(action: String, held: bool)
signal spectate_requested

const TACTICAL = preload("res://themes/tactical.tres")
var mobile := false
var own: Dictionary = {}
var snapshot: Dictionary = {}
var roaming := false
var health: Label
var ammo: Label
var reserve: Label
var weapon: Label
var score: Label
var state: Label
var interaction: Label
var action_label: Label
var action_progress: ProgressBar
var stamina: ProgressBar
var gadget: Label
var hurt_left := 0.0
var hit_left := 0.0
var _update_left := 0.0
var _last_health := 100.0
var _touches: Dictionary = {}
var spectate_button: Button
var armor: Label
var notice: Label
var _notice_left := 0.0
var _interact_button: Button
var weapon_definitions: Dictionary = {}
const INTERACTION_ACTIONS := {"revive":"救援", "take":"取走物资", "activate":"启动设备", "hold":"开始守点", "carry":"领取物资", "deliver":"送达物资", "extract":"开始撤离", "ammo":"补充弹药", "replace":"替换主枪", "supply":"领取补给", "helmet":"装备头盔", "grenade":"拾取手榴弹", "cards":"拾取扑克牌"}

func _ready() -> void:
	set_anchors_and_offsets_preset(Control.PRESET_FULL_RECT)
	mouse_filter = Control.MOUSE_FILTER_IGNORE
	theme = TACTICAL
	var definitions_path := "res://content/combat/weapons.json" if FileAccess.file_exists("res://content/combat/weapons.json") else "res://content/demo/weapons.json"
	var definitions: Variant = JSON.parse_string(FileAccess.get_file_as_string(definitions_path)) if FileAccess.file_exists(definitions_path) else {}
	if definitions is Dictionary: weapon_definitions = definitions
	mobile = OS.get_name() == "Android" or "--mobile-ui" in OS.get_cmdline_user_args()
	var top := HBoxContainer.new()
	top.set_anchors_and_offsets_preset(Control.PRESET_TOP_WIDE)
	top.offset_left = 22
	top.offset_top = 18
	top.offset_right = -22
	add_child(top)
	var menu_button := Button.new()
	menu_button.text = "☰"
	menu_button.tooltip_text = "菜单"
	menu_button.custom_minimum_size = Vector2(48,48)
	menu_button.pressed.connect(func(): menu_requested.emit())
	top.add_child(menu_button)
	score = _label("",26)
	score.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	score.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	top.add_child(score)
	var map := Button.new()
	map.text = "地图"
	map.custom_minimum_size = Vector2(72,48)
	map.pressed.connect(func(): action_requested.emit("map"))
	top.add_child(map)
	var bottom := HBoxContainer.new()
	bottom.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_WIDE)
	bottom.offset_left = 26 if not mobile else 220
	bottom.offset_right = -26 if not mobile else -230
	bottom.offset_top = -156
	bottom.offset_bottom = -22
	add_child(bottom)
	var vital := VBoxContainer.new()
	vital.add_theme_constant_override("separation",4)
	bottom.add_child(vital)
	health = _label("100",38)
	vital.add_child(health)
	armor = _label("",14)
	vital.add_child(armor)
	stamina = _thin_meter()
	stamina.custom_minimum_size = Vector2(140,5)
	stamina.show_percentage = false
	vital.add_child(stamina)
	var filler := Control.new()
	filler.size_flags_horizontal = Control.SIZE_EXPAND_FILL
	bottom.add_child(filler)
	var magazine := VBoxContainer.new()
	magazine.add_theme_constant_override("separation",4)
	bottom.add_child(magazine)
	weapon = _label("M4A1",17)
	magazine.add_child(weapon)
	var numbers := HBoxContainer.new()
	magazine.add_child(numbers)
	ammo = _label("30",38)
	numbers.add_child(ammo)
	reserve = _label("/ 90",19)
	numbers.add_child(reserve)
	action_label = _label("",14)
	magazine.add_child(action_label)
	action_progress = _thin_meter()
	action_progress.show_percentage = false
	action_progress.custom_minimum_size.y = 5
	magazine.add_child(action_progress)
	state = _label("",22)
	state.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	state.position = Vector2(-200,88)
	state.size = Vector2(400,60)
	state.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(state)
	notice = _label("",18)
	notice.set_anchors_and_offsets_preset(Control.PRESET_CENTER_TOP)
	notice.position = Vector2(-260,152)
	notice.size = Vector2(520,48)
	notice.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(notice)
	interaction = _label("",18)
	interaction.set_anchors_and_offsets_preset(Control.PRESET_CENTER)
	interaction.position = Vector2(-260,70)
	interaction.size = Vector2(520,72)
	interaction.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(interaction)
	gadget = _label("烟雾 × 2  [G]",16)
	gadget.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	gadget.position = Vector2(-180,-46)
	gadget.size = Vector2(360,40)
	gadget.horizontal_alignment = HORIZONTAL_ALIGNMENT_CENTER
	add_child(gadget)
	spectate_button = Button.new()
	spectate_button.text = "切换队友  [空格]"
	spectate_button.set_anchors_and_offsets_preset(Control.PRESET_CENTER_BOTTOM)
	spectate_button.position = Vector2(-130,-190)
	spectate_button.size = Vector2(260,52)
	spectate_button.pressed.connect(func(): spectate_requested.emit())
	add_child(spectate_button)
	spectate_button.hide()
	if mobile: _build_touch()

func _build_touch() -> void:
	for spec in [
		["fire","射击",Vector2(-108,-220),true],
		["aim","瞄准",Vector2(-194,-310),false],
		["reload","装填",Vector2(-104,-115),false],
		["interact","拾取",Vector2(-300,-210),false],
		["jump","跳跃",Vector2(-200,-115),false],
		["crouch","蹲伏",Vector2(-300,-115),true],
		["sprint","冲刺",Vector2(32,-310),true],
		["use-gadget","道具",Vector2(-108,-400),false],
		["switch","切枪",Vector2(-300,-310),false],
		["cycle-gadget","切选",Vector2(-200,-400),false]]:
		var id: String = spec[0]
		var button := Button.new()
		button.text = spec[1]
		if id == "interact": _interact_button = button
		button.set_anchors_and_offsets_preset(Control.PRESET_BOTTOM_LEFT if id == "sprint" else Control.PRESET_BOTTOM_RIGHT)
		button.position = spec[2]
		button.size = Vector2(76,64)
		button.focus_mode = Control.FOCUS_NONE
		button.mouse_filter = Control.MOUSE_FILTER_STOP
		if spec[3]:
			button.button_down.connect(func(): held_changed.emit(id,true))
			button.button_up.connect(func(): held_changed.emit(id,false))
		elif id == "aim":
			button.toggle_mode = true
			button.toggled.connect(func(value): held_changed.emit(id,value))
		else:
			button.pressed.connect(func(): action_requested.emit(id))
		add_child(button)

func clear_touch() -> void:
	for id in ["fire","aim","sprint","crouch"]: held_changed.emit(id,false)
	for child in get_children():
		if child is Button and child.toggle_mode: child.set_pressed_no_signal(false)
	_touches.clear()

func update_snapshot(value: Dictionary, is_roam := false) -> void:
	snapshot = value
	own = value.get("self",{})
	roaming = is_roam
	if float(own.get("health",100)) < _last_health: hurt_left = 0.35
	_last_health = float(own.get("health",100))
	_update_labels()

func _update_labels() -> void:
	health.visible = not roaming
	stamina.visible = not roaming
	armor.visible = not roaming and float(own.get("helmetDurability",0)) > 0
	armor.text = "头盔  %02d" % int(ceilf(float(own.get("helmetDurability",0))))
	ammo.visible = not roaming
	reserve.visible = not roaming
	weapon.visible = not roaming
	action_label.visible = not roaming
	gadget.visible = not roaming
	health.text = "%03d" % int(own.get("health",100))
	health.modulate = Color("f1a58d") if int(own.get("health",100)) <= 30 else Color("f4f0df")
	stamina.value = float(own.get("stamina",100))
	var rounds := int(own.get("ammo",0))
	ammo.text = "%02d" % rounds
	var definition: Dictionary = weapon_definitions.get(str(own.get("weapon","m4a1")),{})
	var capacity := int(definition.get("capacity",0))
	ammo.modulate = Color("efab7b") if rounds == 0 or capacity > 0 and rounds <= int(ceilf(capacity*0.2)) else Color("f4f0df")
	reserve.text = "/ %d" % int(own.get("reserve",0))
	weapon.text = QsClientShell.WEAPON_NAMES.get(own.get("weapon","m4a1"),"M4A1")
	var action: Dictionary = own.get("weaponAction",{})
	var phase: String = action.get("phase","ready")
	action_label.text = {"reload":"装填中", "cycle":"泵动中" if own.get("weapon") == "r870" else "拉栓中"}.get(phase,"无备弹" if rounds == 0 and int(own.get("reserve",0)) == 0 else "[R] 装填" if rounds == 0 else "")
	action_progress.visible = not roaming and phase in ["reload","cycle"]
	action_progress.value = float(action.get("progress",0))*100
	var remaining := int(snapshot.get("remaining",600))
	var team: Dictionary = snapshot.get("teamScores",{})
	score.text = "%02d  |  %02d:%02d  |  %02d" % [team.get("blue",0),remaining/60,remaining%60,team.get("red",0)] if snapshot.get("variant","tdm") == "tdm" else "%02d:%02d  ·  %d 击倒" % [remaining/60,remaining%60,own.get("kills",0)]
	if roaming: score.text = "校园漫游"
	var life: String = own.get("life","alive")
	spectate_button.visible = life != "alive" and snapshot.get("variant","tdm") == "tdm" and snapshot.get("spectatingId") != null
	state.text = "正在复活  %.1f" % float(own.get("respawnLeft",0)) if life in ["eliminated","respawning"] else "出生保护  %.0f" % float(own.get("protectionLeft",0)) if float(own.get("protectionLeft",0)) > 0 else ""
	var nearby: Dictionary = own.get("interaction",{}) if own.get("interaction") is Dictionary else {}
	interaction.text = interaction_text(nearby,snapshot,mobile) if life == "alive" else ""
	if _interact_button:
		_interact_button.disabled = life != "alive" or nearby.is_empty() or not bool(nearby.get("available",false))
		_interact_button.text = str(INTERACTION_ACTIONS.get(str(nearby.get("action","")),"互动"))
	var selected: String = own.get("selectedGadget","smoke")
	var count := int(own.get("grenades",0)) if selected == "grenade" else int(own.get("cards",0)) if selected == "cards" else int(own.get("smokes",0))
	gadget.text = "%s × %d  %s" % [{"smoke":"烟雾", "grenade":"手榴弹", "cards":"扑克牌"}.get(selected,"烟雾"),count,"" if mobile else "[G] 使用  [B] 切选"]
	queue_redraw()

static func interaction_text(nearby: Dictionary, room: Dictionary, touch := false) -> String:
	if nearby.is_empty(): return ""
	var kind := str(nearby.get("kind",""))
	var action := str(nearby.get("action",""))
	if not INTERACTION_ACTIONS.has(action): return ""
	var label := ""
	if kind == "weapon": label = str(QsClientShell.WEAPON_NAMES.get(str(nearby.get("weapon","")),"武器"))
	elif kind == "gadget": label = str({"helmet":"头盔", "grenade":"手榴弹", "cards":"扑克牌"}.get(action,"道具"))
	elif kind == "supply": label = "补给箱"
	elif kind == "revive":
		label = "倒下的同伴"
		for member in room.get("roster",[]):
			if member.get("id") == nearby.get("id"): label = str(member.get("nickname",label)); break
	elif kind == "task":
		label = "校门撤离" if action == "extract" else "任务物资"
		for task in room.get("tasks",[]):
			if task.get("id") == nearby.get("taskId"): label = str(task.get("label",label)); break
	if not bool(nearby.get("available",false)):
		return label+"\n"+("补给已满" if kind == "supply" else "已携带上限" if kind == "gadget" else "弹药已满")
	var input_label := "点击" if touch else "[E] "
	if action == "revive": input_label = "按住" if touch else "按住 [E] "
	return label+"\n"+input_label+str(INTERACTION_ACTIONS[action])

func show_notice(text: String) -> void:
	if not notice: return
	notice.text = text
	_notice_left = 2.5

func hit_feedback() -> void:
	hit_left = 0.14

func _process(delta: float) -> void:
	if not visible: return
	_notice_left = maxf(0.0,_notice_left-delta)
	if _notice_left <= 0 and notice and not notice.text.is_empty(): notice.text = ""
	var redraw := hurt_left > 0 or hit_left > 0
	hurt_left = maxf(0.0,hurt_left-delta)
	hit_left = maxf(0.0,hit_left-delta)
	if redraw: queue_redraw()

func _draw() -> void:
	if not is_inside_tree(): return
	var center := size*0.5
	if not roaming and own.get("life","alive") == "alive":
		if own.get("weapon") == "awm" and own.get("aim",false):
			draw_arc(center,minf(size.x,size.y)*0.38,0,TAU,96,Color(0,0,0,0.95),8,true)
			draw_line(center+Vector2(-90,0),center+Vector2(90,0),Color.BLACK,1,true)
			draw_line(center+Vector2(0,-90),center+Vector2(0,90),Color.BLACK,1,true)
		draw_circle(center,3,Color(0,0,0,0.85))
		draw_circle(center,1.5,Color("f7f4de"))
		if not own.get("aim",false):
			for axis in [Vector2.LEFT,Vector2.RIGHT,Vector2.UP,Vector2.DOWN]:
				draw_line(center+axis*8,center+axis*15,Color("f7f4de"),2,true)
	if hit_left > 0:
		for axis in [Vector2(-1,-1),Vector2(-1,1),Vector2(1,-1),Vector2(1,1)]: draw_line(center+axis*7,center+axis*12,Color("f4e4b0"),2,true)
	if hurt_left > 0:
		draw_rect(Rect2(Vector2.ZERO,size),Color(0.75,0.18,0.08,hurt_left*0.12),false,6)

func _thin_meter() -> ProgressBar:
	var meter := ProgressBar.new()
	var background := StyleBoxFlat.new()
	background.bg_color = Color(0.07,0.09,0.09,0.78)
	var fill := StyleBoxFlat.new()
	fill.bg_color = Color("bc684b")
	meter.add_theme_stylebox_override("background",background)
	meter.add_theme_stylebox_override("fill",fill)
	meter.custom_minimum_size.y = 5
	return meter

func _label(text: String, font_size: int) -> Label:
	var label := Label.new()
	label.text = text
	label.add_theme_font_size_override("font_size",font_size)
	label.add_theme_constant_override("outline_size",4)
	label.add_theme_color_override("font_outline_color",Color(0,0,0,0.8))
	label.mouse_filter = Control.MOUSE_FILTER_IGNORE
	return label
