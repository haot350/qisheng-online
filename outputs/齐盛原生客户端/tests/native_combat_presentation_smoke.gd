extends SceneTree

var checks: Array[Dictionary] = []
func check(name: String, passed: bool) -> void:
	checks.append({"name":name,"passed":passed})
	if not passed: push_error(name)

func _initialize() -> void:
	call_deferred("run")

func run() -> void:
	root.size = Vector2i(1440,900)
	var scene := Node3D.new()
	root.add_child(scene)
	var camera := Camera3D.new()
	scene.add_child(camera)
	camera.position = Vector3(0,1.6,5)
	camera.current = true
	var light := DirectionalLight3D.new()
	light.rotation_degrees = Vector3(-55,-30,0)
	scene.add_child(light)
	var world := WorldEnvironment.new()
	world.environment = Environment.new()
	world.environment.background_mode = Environment.BG_COLOR
	world.environment.background_color = Color("323c40")
	world.environment.ambient_light_source = Environment.AMBIENT_SOURCE_COLOR
	world.environment.ambient_light_color = Color.WHITE
	world.environment.ambient_light_energy = 0.6
	scene.add_child(world)
	var hud := QsCombatHud.new()
	root.add_child(hud)
	await process_frame
	check("weapon action uses formal protocol",QsCombatHud.interaction_text({"kind":"weapon","action":"replace","weapon":"r870","available":true},{},false)=="Remington 870\n[E] 替换主枪")
	check("full ammo has no executable prompt",QsCombatHud.interaction_text({"kind":"weapon","action":"ammo","weapon":"mp5","available":false,"reason":"full"},{},false)=="MP5\n弹药已满")
	check("gadget actual action",QsCombatHud.interaction_text({"kind":"gadget","action":"helmet","available":true},{},true)=="头盔\n点击装备头盔")
	check("unknown interaction is silent",QsCombatHud.interaction_text({"kind":"weapon","action":"unknown","available":true},{})=="")
	check("no unfiltered label",not QsCombatHud.interaction_text({"kind":"weapon","action":"replace","weapon":"mp5","available":true,"label":"internal"},{}).contains("internal"))
	check("pickup result uses actual action",QsCombatPresenter.pickup_feedback({"weapon":"awm","action":"replace"})=="已装备 AWM")
	check("pickup result does not fake unknown action",QsCombatPresenter.pickup_feedback({"weapon":"awm","action":"other"})=="")
	var listener := Vector3(40,2,30)
	var coarse: Variant = QsCombatPresenter.coarse_sound_position({"kind":"shot","bearing":0.0,"distanceBand":"mid","position":[99,99,99]},listener)
	check("sound uses band not supplied coordinates",coarse==listener+Vector3(0,0,-28))
	check("sound rejects missing band",QsCombatPresenter.coarse_sound_position({"kind":"shot","bearing":0.0},listener)==null)
	check("sound rejects missing bearing",QsCombatPresenter.coarse_sound_position({"kind":"shot","distanceBand":"near"},listener)==null)
	var presenter := QsCombatPresenter.new()
	scene.add_child(presenter)
	var prepared: bool = await presenter.prepare(camera,"self")
	check("all seven weapon and avatar resources prepared",prepared and presenter.view_guns.size()==7 and presenter.scenes.size()==18)
	if prepared:
		presenter.apply_snapshot({"tick":10,"self":{"id":"self","weapon":"r870","life":"alive","health":29,"helmetDurability":32,"ammo":1,"reserve":18,"stamina":63,"smokes":2,"grenades":1,"weaponAction":{"phase":"cycle","stage":"pump","progress":0.3,"ready":false},"interaction":{"kind":"weapon","id":"drop-qa","action":"replace","weapon":"awm","available":true}},"players":[],"roster":[],"drops":[{"id":"drop-qa","weapon":"awm","position":[0,0,0]}],"gadgets":[{"id":"helmet","kind":"helmet","position":[1,0,0]},{"id":"grenade","kind":"grenade","position":[-1,0,0]}],"elapsed":1})
		hud.update_snapshot(presenter._last_snapshot)
		presenter.update_view(0.016,{"aim":false,"moveX":0,"moveY":0})
		check("helmet HUD is actual durability",hud.armor.visible and hud.armor.text=="头盔  32")
		check("empty prompt fixed in rendered HUD",hud.interaction.text.contains("替换主枪"))
		for spec in [["awm","bolt-handle","cycle","bolt"],["r870","pump","cycle","pump"],["m249","belt","reload","belt-in"]]:
			var entry: Dictionary = presenter.view_guns[spec[0]]
			var part: Dictionary = entry.parts.get(spec[1],{})
			check("weapon authored part "+str(spec[0]),not part.is_empty())
			if not part.is_empty():
				presenter._animate_gun(entry,{"phase":spec[2],"stage":spec[3],"progress":0.5,"stageProgress":0.5},0.0,false)
				check("weapon mechanical animation "+str(spec[0]),part.node.transform!=part.transform)
				presenter._animate_gun(entry,{"phase":"ready","stage":"ready"},0.0,false)
				check("weapon returns to authored transform "+str(spec[0]),part.node.transform==part.transform)
		var pooled := Node3D.new()
		pooled.set_meta("qs_weapon","m4a1")
		var magazine_part := Node3D.new()
		magazine_part.name = "magazine"
		pooled.add_child(magazine_part)
		presenter.add_child(pooled)
		var canonical := presenter._gun_parts(pooled)
		magazine_part.position.y -= 0.19
		presenter._release_far(pooled)
		var reused := presenter._acquire_far("m4a1")
		check("pooled gun instance is reused",reused==pooled)
		check("pooled weapon restores authored parts",magazine_part.transform==canonical.magazine.transform)
		presenter._release_far(reused)
		var mats := presenter._effect_materials.duplicate()
		for cycle in range(6):
			for pellet in range(80): presenter._tracer(Vector3.ZERO,Vector3(0.1*pellet,1,-8))
			check("effect cap "+str(cycle),presenter.effects.size()<=64)
			presenter._process(0.2)
		check("same GPU materials retained",presenter._effect_materials==mats)
		check("bounded tracer pool",presenter._effect_pool.tracer.size()<=64)
		presenter.apply_event({"type":"sound","data":{"kind":"shot","weapon":"ak47","bearing":0.0,"distanceBand":"near","occluded":true}})
		presenter.apply_event({"type":"sound","data":{"kind":"explosion","bearing":1.57,"distanceBand":"far"}})
		check("coarse events consumed",presenter.presentation_counts.sound==2)
		check("coarse events create no enemy entity",presenter.avatars.is_empty() and presenter.effects.is_empty())
		for weapon in presenter.WEAPONS:
			presenter._sync_drops([{"id":"reuse","weapon":weapon,"position":[0,0,0]}])
			presenter._sync_drops([])
		check("seven dropped guns pooled",presenter.drop_pool.size()==7)
		await process_frame
		await RenderingServer.frame_post_draw
		var image := root.get_texture().get_image()
		DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://work/presentation-qa"))
		image.save_png("res://work/presentation-qa/combat-desktop.png")
		presenter.release_all()
		await process_frame
		check("release clears owned resources",presenter.effects.is_empty() and presenter.avatars.is_empty() and presenter.drop_pool.is_empty() and presenter.view_guns.is_empty() and presenter._effect_pool.is_empty())
	var report := {"checks":checks,"passed":checks.all(func(row):return row.passed),"scope":"real Godot GPU resource preparation and presentation; not multiplayer acceptance"}
	DirAccess.make_dir_recursive_absolute(ProjectSettings.globalize_path("res://work/presentation-qa"))
	var file := FileAccess.open("res://work/presentation-qa/report.json",FileAccess.WRITE)
	file.store_string(JSON.stringify(report,"  "))
	print(JSON.stringify(report))
	scene.queue_free()
	hud.queue_free()
	await process_frame
	quit(0 if report.passed else 1)
