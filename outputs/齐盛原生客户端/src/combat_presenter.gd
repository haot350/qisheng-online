class_name QsCombatPresenter
extends Node3D

signal preparation_progress(done: int,total: int)
signal feedback_received(text: String)
const WEAPONS := ["glock","mp5","m4a1","ak47","r870","awm","m249"]
const AVATARS := ["campus-a","campus-b","tactical-a","tactical-b"]
var prepared := false
var scenes: Dictionary = {}
var definitions: Dictionary = {}
var avatars: Dictionary = {}
var drops: Dictionary = {}
var clouds: Dictionary = {}
var projectiles: Dictionary = {}
var loot: Dictionary = {}
var model_pool: Dictionary = {}
var drop_pool: Dictionary = {}
var effects: Array[Dictionary] = []
var camera: Camera3D
var view_root: Node3D
var view_guns: Dictionary = {}
var local_id := ""
var latest_tick := 0
var latest_arrival := 0
var own: Dictionary = {}
var _clock := 0.0
var _ads := 0.0
var _recoil := 0.0
var _flash_left := 0.0
var _weapon := ""
var _shot_predicted: Dictionary = {}
var _last_predict_ms := 0
var _fire_was := false
var audio: Node3D
var _last_stage := "ready"
var network_rtt_ms := 0.0
var interpolation_ms := 100.0
var _snapshot_jitter := 0.0
var _snapshot_samples := 0
var recoil = preload("res://src/native_recoil.gd").new()
var _preparation_epoch := 0
var _released := false
var _last_snapshot: Dictionary = {}
var _smoke_material: StandardMaterial3D
var _prop_meshes: Dictionary = {}
var _prop_materials: Dictionary = {}
var _smoke_meshes: Dictionary = {}
var _effect_meshes: Dictionary = {}
var _effect_materials: Dictionary = {}
var _effect_pool: Dictionary = {}
var presentation_counts := {"shot":0,"sound":0,"explosion":0,"death":0,"pickup":0}
const EFFECT_LIMITS := {"flash":24,"tracer":64,"explosion":8}

func prepare(eye: Camera3D, id: String) -> bool:
	_preparation_epoch += 1
	var epoch := _preparation_epoch
	_released = false
	camera = eye
	local_id = id
	audio = preload("res://src/combat_audio.gd").new()
	add_child(audio)
	var resources: Array[String] = []
	for avatar in AVATARS: resources.append(avatar)
	for weapon in WEAPONS:
		resources.append(weapon+"-near")
		resources.append(weapon+"-far")
	var count := 0
	for key in resources:
		if not _preparation_valid(epoch): return false
		var path := "res://content/combat/"+key+".glb"
		if not ResourceLoader.exists(path): return false
		if ResourceLoader.load_threaded_request(path,"PackedScene",false) != OK: return false
		while ResourceLoader.load_threaded_get_status(path) == ResourceLoader.THREAD_LOAD_IN_PROGRESS:
			await get_tree().process_frame
			if not _preparation_valid(epoch): return false
		var resource := ResourceLoader.load_threaded_get(path)
		if not resource is PackedScene: return false
		scenes[key] = resource
		count += 1
		preparation_progress.emit(count,resources.size())
	var value: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://content/combat/weapons.json"))
	if value is Dictionary: definitions = value
	view_root = Node3D.new()
	camera.add_child(view_root)
	for weapon in WEAPONS:
		var gun: Node3D = scenes[weapon+"-near"].instantiate()
		view_root.add_child(gun)
		gun.visible = false
		view_guns[weapon] = {"root":gun,"parts":_gun_parts(gun),"weapon":weapon}
	for style in AVATARS:
		var model: Node3D = scenes[style].instantiate()
		add_child(model)
		_prepare_fade_materials(model)
		model.global_position = camera.global_position-camera.global_basis.z*3.0-Vector3(0,1.2,0)
		await RenderingServer.frame_post_draw
		if not _preparation_valid(epoch): return false
		_set_fade(model,0.6)
		await RenderingServer.frame_post_draw
		if not _preparation_valid(epoch): return false
		_set_fade(model,1.0)
		model.hide()
		model.position = Vector3.ZERO
		model_pool[style] = [model]
	# Draw required materials at a harmless staged view before loading-ready.
	# The instances are reused by their actual owner rather than discarded.
	for weapon in WEAPONS:
		view_guns[weapon].root.visible = true
		view_root.position = Vector3(0,-0.1,-0.42)
		await RenderingServer.frame_post_draw
		if not _preparation_valid(epoch): return false
		view_guns[weapon].root.visible = false
		var far: Node3D = scenes[weapon+"-far"].instantiate()
		add_child(far)
		far.global_position = camera.global_position-camera.global_basis.z*2.0
		far.set_meta("qs_weapon",weapon)
		await RenderingServer.frame_post_draw
		if not _preparation_valid(epoch): return false
		far.hide()
		far.position = Vector3.ZERO
		drop_pool[weapon] = [far]
	_smoke_material = StandardMaterial3D.new()
	_smoke_material.albedo_color = Color(0.63,0.66,0.64,0.93)
	_smoke_material.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
	_smoke_material.cull_mode = BaseMaterial3D.CULL_DISABLED
	_smoke_material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
	_prepare_props()
	for kind in _prop_meshes:
		var prop := MeshInstance3D.new()
		prop.mesh = _prop_meshes[kind]
		prop.material_override = _smoke_material if kind == "smoke" else _prop_materials.get(kind)
		add_child(prop)
		prop.global_position = camera.global_position-camera.global_basis.z*2.0
		await RenderingServer.frame_post_draw
		prop.queue_free()
		if not _preparation_valid(epoch): return false
	_prepare_effects()
	for kind in _effect_meshes:
		var effect := _take_effect(kind)
		if effect:
			effect.global_position = camera.global_position-camera.global_basis.z*2.0
			await RenderingServer.frame_post_draw
			if not _preparation_valid(epoch): return false
			_return_effect(effect,kind)
	prepared = true
	return true

func _preparation_valid(epoch: int) -> bool:
	return not _released and epoch == _preparation_epoch and is_inside_tree() and is_instance_valid(camera)

func _gun_parts(root: Node3D) -> Dictionary:
	var parts: Dictionary = {}
	for id in ["magazine","slide","pump","bolt","cover","belt","bolt-handle"]:
		var node := root.find_child(id,true,false)
		if node is Node3D:
			if not node.has_meta("qs_gun_transform"): node.set_meta("qs_gun_transform",node.transform)
			node.transform = node.get_meta("qs_gun_transform")
			parts[id] = {"node":node,"transform":node.transform}
	return parts

func apply_snapshot(snapshot: Dictionary) -> void:
	if not prepared: return
	_last_snapshot = snapshot
	own = snapshot.get("self",{})
	latest_tick = int(snapshot.get("tick",0))
	if latest_arrival > 0:
		_snapshot_jitter = lerpf(_snapshot_jitter,absf(float(Time.get_ticks_msec()-latest_arrival)-50.0),0.1)
	_snapshot_samples += 1
	interpolation_ms = lerpf(interpolation_ms,clampf((75.0 if _snapshot_samples > 60 else 100.0)+_snapshot_jitter*3,75,150),0.03)
	latest_arrival = Time.get_ticks_msec()
	var visible_ids: Dictionary = {}
	for row in snapshot.get("players",[]):
		var id := str(row.get("id",""))
		if id.is_empty() or id == local_id: continue
		visible_ids[id] = true
		var member: Dictionary = {}
		for roster_row in snapshot.get("roster",[]):
			if roster_row.get("id") == id: member = roster_row; break
		var style := str(member.get("avatar","campus-a"))
		if not avatars.has(id) or avatars[id].style != style:
			_remove_avatar(id)
			var rig: Node3D = Node3D.new()
			add_child(rig)
			var model: Node3D = _acquire_model(style)
			model.reparent(rig,false)
			model.show()
			_tint_team(model,str(member.get("team","none")))
			var body := model.find_children("*","Skeleton3D",true,false)
			var skeleton: Skeleton3D = body[0] if not body.is_empty() else null
			avatars[id] = {"root":rig,"model":model,"skeleton":skeleton,"style":style,"samples":[],"generation":-1,"weapon":"","gun":null,"gait":0.0,"last":Vector3.ZERO,"deathAge":0.0,"life":"alive","team":member.get("team","none"),"hiddenAt":0.0,"deathAt":-1.0,"gun_parts":{},"shotAt":-10.0}
		var entry: Dictionary = avatars[id]
		if str(entry.team) != str(member.get("team","none")):
			entry.team = str(member.get("team","none"))
			_tint_team(entry.model,entry.team)
		var was_alive: bool = entry.life == "alive"
		var new_generation: bool = entry.generation != int(row.get("generation",0))
		if entry.generation != int(row.get("generation",0)):
			entry.samples.clear()
			entry.generation = int(row.get("generation",0))
		var sample: Dictionary = row.duplicate(true)
		sample["tick"] = latest_tick
		entry.samples.append(sample)
		if entry.samples.size() > 12: entry.samples.pop_front()
		entry.root.visible = true
		entry.hiddenAt = 0.0
		entry.life = str(row.get("life","alive"))
		if entry.life == "alive":
			entry.deathAt = -1.0
			if not was_alive or new_generation: _set_fade(entry.model,1.0)
		if str(row.get("weapon","m4a1")) != entry.weapon:
			if entry.gun: _release_far(entry.gun)
			entry.weapon = str(row.get("weapon","m4a1"))
			entry.gun = _acquire_far(entry.weapon)
			entry.gun.reparent(entry.root,false)
			entry.gun_parts = {"root":entry.gun,"parts":_gun_parts(entry.gun),"weapon":entry.weapon}
			entry.gun.position = Vector3(0.075,1.30,-0.145)
		var viewed_from: bool = own.get("life","alive") != "alive" and snapshot.get("variant","tdm") == "tdm" and snapshot.get("spectatingId") == id
		entry.model.visible = not viewed_from
		if entry.gun: entry.gun.visible = not viewed_from
	for id in avatars.keys():
		if not visible_ids.has(id):
			# Hidden entities immediately lose their samples and precise position.
			# Do not interpolate a stale location or retain a wall-tracking history.
			var entry: Dictionary = avatars[id]
			entry.samples.clear()
			if float(entry.deathAt) >= 0 and _clock-float(entry.deathAt) < 2.0: continue
			entry.root.visible = false
			entry.root.position = Vector3.ZERO
			entry.last = Vector3.ZERO
			if float(entry.hiddenAt) <= 0: entry.hiddenAt = _clock
			if entry.life != "alive": entry.deathAge += 0.05
			if entry.deathAge > 2.5: _remove_avatar(id)
	_sync_drops(snapshot.get("drops",[]))
	_sync_clouds(snapshot.get("smokes",[]))
	_sync_projectiles(snapshot.get("projectiles",[]))
	_sync_loot(snapshot.get("gadgets",[]),float(snapshot.get("elapsed",0)))

func update_view(delta: float, controls: Dictionary, near_wall := 0.0) -> void:
	if not prepared or own.is_empty(): return
	_recoil = maxf(0.0,_recoil-delta*8.0)
	var id: String = own.get("weapon","m4a1")
	var definition: Dictionary = definitions.get(id,{})
	var action: Dictionary = own.get("weaponAction",{})
	var is_reload: bool = action.get("phase") == "reload"
	var target := 1.0 if controls.get("aim",false) and not own.get("sprinting",false) and not is_reload and near_wall < 0.1 else 0.0
	_ads = lerpf(_ads,target,1.0-exp(-delta*3.0/float(definition.get("adsTime",0.23))))
	var base_fov := 82.0
	var zoom: float = definition.get("scope",1.0/0.82)
	var aimed_fov := rad_to_deg(2*atan(tan(deg_to_rad(base_fov)*0.5)/zoom))
	camera.fov = lerpf(base_fov,aimed_fov,_ads)
	view_root.visible = own.get("life","alive") == "alive" and not (id == "awm" and _ads > 0.95)
	for key in view_guns: view_guns[key].root.visible = key == id
	_weapon = id
	var stage: String = action.get("stage","ready")
	var stage_key := id+":"+stage+":"+str(action.get("shellIndex",0))
	if stage_key != _last_stage and stage != "ready": audio.action()
	_last_stage = stage_key
	var moving := Vector2(float(controls.get("moveX",0)),float(controls.get("moveY",0))).length()
	var bob := minf(moving,1.0)*0.007*(1.0-_ads*0.85)
	var progress: float = action.get("progress",0.0) if is_reload else 0.0
	var angle := sin(minf(1.0,progress/0.82)*PI)*0.9 if progress > 0 else 0.0
	var running := 1.0 if own.get("sprinting",false) else 0.0
	view_root.position = Vector3(0.16*(1.0-_ads)+sin(_clock*8)*bob,-0.10*(1-_ads)-float(definition.get("sightHeight",0.13))*_ads+cos(_clock*16)*bob-running*0.08-angle*0.06,-0.42-_ads*0.04+_recoil*0.02)
	view_root.rotation = Vector3(_recoil*0.055-running*0.23+angle*0.32,running*-0.29,-angle*0.32)
	_animate_gun(view_guns[id],action,_recoil,int(own.get("ammo",0)) == 0)
	var fire: bool = controls.get("fire",false)
	var now := Time.get_ticks_msec()
	var automatic: bool = definition.get("automatic",true)
	if fire and (automatic or not _fire_was) and int(own.get("ammo",0)) > 0 and action.get("ready",true) and own.get("life","alive") == "alive" and now-_last_predict_ms >= int(float(definition.get("interval",0.1))*1000):
		_last_predict_ms = now
		_recoil = 1.0
		recoil.kick(id,definition)
		_flash(local_id)
		audio.shot(id,Vector3.ZERO,true)
	_fire_was = fire
	recoil.update(delta,float(definition.get("recover",10)))

func render_tick() -> float:
	var server_now := float(latest_tick)+(float(Time.get_ticks_msec()-latest_arrival)+network_rtt_ms*0.5)*0.06
	return minf(float(latest_tick)+6.0,server_now-interpolation_ms*0.06)

func _animate_gun(entry: Dictionary, action: Dictionary, kick: float, empty: bool) -> void:
	for key in entry.parts:
		var part: Dictionary = entry.parts[key]
		part.node.transform = part.transform
	var parts: Dictionary = entry.parts
	var stage := str(action.get("stage","ready"))
	var progress := clampf(float(action.get("stageProgress",action.get("progress",0))),0.0,1.0)
	var cycle := clampf(float(action.get("progress",0)),0.0,1.0) if action.get("phase") == "cycle" else 0.0
	var reload: bool = action.get("phase") == "reload"
	var weapon := str(entry.get("weapon",""))
	if parts.has("magazine") and reload and weapon != "m249":
		var pull := progress if stage == "mag-out" else 1-progress if stage == "mag-in" else 0.0
		parts.magazine.node.position.y -= pull*0.19
		parts.magazine.node.position.x -= pull*0.03
		parts.magazine.node.rotation.z -= pull*0.2
	if parts.has("slide"): parts.slide.node.position.z += (0.028 if empty else 0.0)+kick*0.026
	if parts.has("bolt"): parts.bolt.node.position.z += sin(progress*PI)*0.055 if reload and stage == "chamber" else kick*0.025
	if parts.has("pump"):
		parts.pump.node.position.z += sin(progress*PI)*0.09 if reload and stage == "pump" else sin(clampf((cycle-0.12)/0.72,0.0,1.0)*PI)*0.09 if cycle > 0 else sin((1-kick)*PI)*0.08 if kick > 0 else 0.0
	if weapon == "awm" and action.get("phase") == "cycle":
		var stroke := sin(clampf((cycle-0.15)/0.70,0.0,1.0)*PI)
		if parts.has("bolt"): parts.bolt.node.position.z += stroke*0.10
		if parts.has("bolt-handle"):
			parts["bolt-handle"].node.position.z += stroke*0.10
			parts["bolt-handle"].node.rotation.z -= sin(minf(1.0,cycle/0.30)*PI)*0.65
	if parts.has("cover") and reload:
		parts.cover.node.rotation.x -= (progress if stage == "open-cover" else 1-progress if stage == "close-cover" else 1.0 if stage == "belt-in" else 0.0)*1.05
	if parts.has("belt") and reload and stage == "belt-in": parts.belt.node.position.y += (1-progress)*0.12

func apply_event(event: Dictionary) -> void:
	if not prepared: return
	if event.get("type") == "sound":
		var data: Dictionary = event.get("data",{})
		var at: Variant = coarse_sound_position(data,camera.global_position)
		if at == null: return
		presentation_counts.sound += 1
		if data.get("kind") == "explosion": audio.explosion_at(at)
		elif data.get("kind") == "shot": audio.shot(str(data.get("weapon","m4a1")),at,false,bool(data.get("occluded",false)))
	elif event.get("type") == "shot":
		presentation_counts.shot += 1
		var actor := str(event.get("actorId",""))
		if actor != local_id:
			_flash(actor)
			if avatars.has(actor): avatars[actor].shotAt = _clock
		var data: Dictionary = event.get("data",{})
		var start := QsNativePrediction.vector(event.get("position",[]))
		if actor != local_id: audio.shot(str(data.get("weapon","m4a1")),start,false)
		for point in data.get("ends",[]):
			_tracer(start,QsNativePrediction.vector(point))
	elif event.get("type") == "pickup" and event.get("actorId") == local_id:
		var data: Dictionary = event.get("data",{})
		var text := pickup_feedback(data)
		if not text.is_empty():
			presentation_counts.pickup += 1
			feedback_received.emit(text)
	elif event.get("type") in ["death","down"]:
		presentation_counts.death += 1
		var id := str(event.get("targetId",""))
		if avatars.has(id) and avatars[id].root.visible:
			var data: Dictionary = event.get("data",{})
			if int(data.get("generation",avatars[id].generation)) == int(avatars[id].generation):
				avatars[id].deathAt = _clock
				avatars[id].life = "respawning"
				avatars[id].samples.clear()
	elif event.get("type") == "explosion":
		if not event.get("position") is Array or event.position.size() != 3: return
		presentation_counts.explosion += 1
		var at := QsNativePrediction.vector(event.position)
		audio.explosion_at(at)
		var mesh := _take_effect("explosion")
		if mesh:
			mesh.position = at
			effects.append({"root":mesh,"kind":"explosion","left":0.25})

static func pickup_feedback(data: Dictionary) -> String:
	var gadget := str(data.get("gadget",""))
	if gadget in ["helmet","grenade","cards"]:
		return {"helmet":"已装备头盔", "grenade":"已拾取手榴弹", "cards":"已拾取扑克牌"}[gadget]
	if not str(data.get("supply","")).is_empty(): return "已领取补给"
	var weapon := str(data.get("weapon",""))
	if not WEAPONS.has(weapon): return ""
	var label := str(QsClientShell.WEAPON_NAMES.get(weapon,"武器"))
	return "已补充 "+label+" 弹药" if data.get("action") == "ammo" else "已装备 "+label if data.get("action") == "replace" else ""

static func coarse_sound_position(data: Dictionary, listener: Vector3) -> Variant:
	# A sound bearing is already quantized by the server; the band is not a position.
	if not data.get("bearing") is float and not data.get("bearing") is int: return null
	var bearing := float(data.bearing)
	if not is_finite(bearing) or str(data.get("kind","")) not in ["shot","explosion"]: return null
	var distances := {"near":12.0,"mid":28.0,"far":50.0}
	var band := str(data.get("distanceBand",""))
	if not distances.has(band): return null
	return listener+Vector3(-sin(bearing),0,-cos(bearing))*float(distances[band])

func _prepare_props() -> void:
	var grenade := SphereMesh.new()
	grenade.radius = 0.065
	grenade.height = 0.13
	grenade.radial_segments = 12
	grenade.rings = 6
	var helmet := SphereMesh.new()
	helmet.radius = 0.15
	helmet.height = 0.30
	helmet.is_hemisphere = true
	helmet.radial_segments = 16
	helmet.rings = 8
	var cards := BoxMesh.new()
	cards.size = Vector3(0.10,0.035,0.15)
	var smoke := SphereMesh.new()
	smoke.radius = 5.0
	smoke.height = 10.0
	smoke.radial_segments = 16
	smoke.rings = 8
	_smoke_meshes[5.0] = smoke
	_prop_meshes = {"grenade":grenade,"helmet":helmet,"cards":cards,"smoke":smoke}
	for kind in ["grenade","helmet","cards"]:
		var material := StandardMaterial3D.new()
		material.albedo_color = {"grenade":Color("59634d"),"helmet":Color("849479"),"cards":Color("d4cbb6")}[kind]
		_prop_materials[kind] = material

func _prepare_effects() -> void:
	var flash := CylinderMesh.new()
	flash.top_radius = 0.0
	flash.bottom_radius = 0.035
	flash.height = 0.12
	flash.radial_segments = 6
	var tracer := BoxMesh.new()
	tracer.size = Vector3(0.009,0.009,1.0)
	var explosion := SphereMesh.new()
	explosion.radius = 0.5
	explosion.height = 1.0
	explosion.radial_segments = 16
	explosion.rings = 8
	_effect_meshes = {"flash":flash,"tracer":tracer,"explosion":explosion}
	for kind in _effect_meshes:
		var material := StandardMaterial3D.new()
		material.shading_mode = BaseMaterial3D.SHADING_MODE_UNSHADED
		material.albedo_color = {"flash":Color("ffd498"),"tracer":Color("dfcc99"),"explosion":Color("edaa63")}[kind]
		_effect_materials[kind] = material
		_effect_pool[kind] = []
		for index in range(8 if kind == "flash" else 16 if kind == "tracer" else 2):
			var mesh := _new_effect(kind)
			mesh.hide()
			_effect_pool[kind].append(mesh)

func _new_effect(kind: String) -> MeshInstance3D:
	var mesh := MeshInstance3D.new()
	mesh.mesh = _effect_meshes[kind]
	mesh.material_override = _effect_materials[kind]
	mesh.cast_shadow = GeometryInstance3D.SHADOW_CASTING_SETTING_OFF
	add_child(mesh)
	return mesh

func _take_effect(kind: String) -> MeshInstance3D:
	var active := 0
	for effect in effects:
		if effect.kind == kind: active += 1
	if active >= int(EFFECT_LIMITS[kind]): return null
	var pool: Array = _effect_pool.get(kind,[])
	var mesh: MeshInstance3D = pool.pop_back() if not pool.is_empty() else _new_effect(kind)
	mesh.transform = Transform3D.IDENTITY
	mesh.show()
	return mesh

func _return_effect(mesh: MeshInstance3D, kind: String) -> void:
	if not is_instance_valid(mesh): return
	if mesh.get_parent() != self: mesh.reparent(self,false)
	mesh.hide()
	mesh.transform = Transform3D.IDENTITY
	var pool: Array = _effect_pool.get(kind,[])
	pool.append(mesh)
	_effect_pool[kind] = pool

func _flash(id: String) -> void:
	var parent: Node3D
	if id == local_id:
		if _weapon.is_empty(): return
		parent = view_guns[_weapon].root.find_child("muzzle",true,false)
	else:
		if not avatars.has(id) or not avatars[id].root.visible: return
		parent = avatars[id].gun.find_child("muzzle",true,false) if avatars[id].gun else null
	if not parent: return
	var flash := _take_effect("flash")
	if not flash: return
	flash.reparent(parent,false)
	flash.rotation.x = PI*0.5
	effects.append({"root":flash,"kind":"flash","left":0.045})

func _tracer(from: Vector3, to: Vector3) -> void:
	var span := to-from
	if span.length() < 0.02: return
	var mesh := _take_effect("tracer")
	if not mesh: return
	mesh.position = (from+to)*0.5
	mesh.scale.z = span.length()
	mesh.look_at(to)
	effects.append({"root":mesh,"kind":"tracer","left":0.055})

func _acquire_far(weapon: String) -> Node3D:
	var pool: Array = drop_pool.get(weapon,[])
	var root: Node3D = pool.pop_back() if not pool.is_empty() else scenes[weapon+"-far"].instantiate()
	if not root.get_parent(): add_child(root)
	root.set_meta("qs_weapon",weapon)
	root.transform = Transform3D.IDENTITY
	root.show()
	return root

func _release_far(root: Node3D) -> void:
	if not is_instance_valid(root): return
	var weapon := str(root.get_meta("qs_weapon","m4a1"))
	_gun_parts(root)
	var pool: Array = drop_pool.get(weapon,[])
	if pool.size() < 2:
		if root.get_parent() != self: root.reparent(self,false)
		root.hide()
		root.transform = Transform3D.IDENTITY
		pool.append(root)
		drop_pool[weapon] = pool
	else: root.queue_free()

func _sync_drops(rows: Array) -> void:
	var ids: Dictionary = {}
	for row in rows:
		var id := str(row.id)
		ids[id] = true
		var weapon: String = row.get("weapon","m4a1")
		if not drops.has(id):
			var root := _acquire_far(weapon)
			root.rotation = Vector3(0.0,0.6,PI*0.5)
			drops[id] = root
		drops[id].position = QsNativePrediction.vector(row.position)+Vector3(0,0.10,0)
	for id in drops.keys():
		if not ids.has(id):
			_release_far(drops[id])
			drops.erase(id)

func _sync_clouds(rows: Array) -> void:
	var ids: Dictionary = {}
	for row in rows:
		var id := str(row.id)
		ids[id] = true
		if not clouds.has(id):
			var mesh := MeshInstance3D.new()
			var radius := float(row.get("radius",5))
			if not _smoke_meshes.has(radius):
				var sphere := SphereMesh.new()
				sphere.radius = radius
				sphere.height = radius*2
				sphere.radial_segments = 16
				sphere.rings = 8
				_smoke_meshes[radius] = sphere
			mesh.mesh = _smoke_meshes[radius]
			mesh.material_override = _smoke_material
			add_child(mesh)
			clouds[id] = mesh
		clouds[id].position = QsNativePrediction.vector(row.position)
	for id in clouds.keys():
		if not ids.has(id): clouds[id].queue_free(); clouds.erase(id)

func _sync_projectiles(rows: Array) -> void:
	var ids: Dictionary = {}
	for row in rows:
		var id := str(row.id)
		ids[id] = true
		if not projectiles.has(id):
			var mesh := MeshInstance3D.new()
			mesh.mesh = _prop_meshes["grenade"]
			mesh.material_override = _prop_materials["grenade"]
			add_child(mesh)
			projectiles[id] = mesh
		projectiles[id].position = QsNativePrediction.vector(row.position)
	for id in projectiles.keys():
		if not ids.has(id): projectiles[id].queue_free(); projectiles.erase(id)

func _sync_loot(rows: Array, elapsed: float) -> void:
	var ids: Dictionary = {}
	for row in rows:
		if float(row.get("availableAt",0)) > elapsed: continue
		var id := str(row.id)
		ids[id] = true
		if not loot.has(id):
			var mesh := MeshInstance3D.new()
			var kind := str(row.get("kind","grenade"))
			if not _prop_meshes.has(kind) or not _prop_materials.has(kind): continue
			mesh.mesh = _prop_meshes[kind]
			mesh.material_override = _prop_materials[kind]
			add_child(mesh)
			loot[id] = mesh
		loot[id].position = QsNativePrediction.vector(row.position)+Vector3(0,0.15,0)
	for id in loot.keys():
		if not ids.has(id): loot[id].queue_free(); loot.erase(id)

func _process(delta: float) -> void:
	_clock += delta
	for index in range(effects.size()-1,-1,-1):
		var effect: Dictionary = effects[index]
		effect.left -= delta
		if effect.left <= 0:
			_return_effect(effect.root,effect.kind)
			effects.remove_at(index)
	if not prepared: return
	var render_at := render_tick()
	for entry in avatars.values():
		if float(entry.deathAt) >= 0:
			var age: float = _clock-float(entry.deathAt)
			entry.model.rotation.x = minf(PI*0.5,age*3.0)
			entry.model.position.y = maxf(0.20,1.0-age*2.0)*0.25
			_set_fade(entry.model,clampf((2.0-age)/0.6,0,1))
			if entry.gun:
				entry.gun.position.y = maxf(0.2,1.3-age*2.0)
				entry.gun.rotation.z = minf(PI*0.5,age*3.0)
			if age >= 2.0: entry.root.hide(); entry.root.position = Vector3.ZERO
			continue
		if not entry.root.visible or entry.samples.is_empty(): continue
		var from: Dictionary = entry.samples[0]
		var to: Dictionary = entry.samples.back()
		for sample in entry.samples:
			if int(sample.tick) <= render_at: from = sample
			if int(sample.tick) >= render_at: to = sample; break
		var span := float(int(to.tick)-int(from.tick))
		var fraction := clampf((render_at-float(from.tick))/span,0,1) if span > 0 else 1.0
		var position := QsNativePrediction.vector(from.position).lerp(QsNativePrediction.vector(to.position),fraction)
		if from == to and render_at > float(to.tick): position += QsNativePrediction.vector(to.get("velocity",[]))*minf((render_at-float(to.tick))/60,0.10)
		entry.root.position = position
		entry.root.rotation.y = lerp_angle(float(from.get("yaw",0)),float(to.get("yaw",0)),fraction)
		var crouch := 0.35 if to.get("crouched",false) else 0.0
		entry.model.position.y = -crouch
		if entry.gun:
			entry.gun.position.y = 1.30-crouch
			entry.gun.rotation.x = float(to.get("pitch",0))
			entry.gun.rotation.z = 0
			_animate_gun(entry.gun_parts,to.get("weaponAction",{}),maxf(0.0,1.0-(_clock-float(entry.shotAt))*12.0),bool(to.get("weaponAction",{}).get("empty",false)))
		if str(to.get("life","alive")) != "alive":
			entry.deathAge += delta
			entry.model.rotation.x = minf(PI*0.5,entry.deathAge*3)
			entry.model.position.y = 0.2
		else:
			entry.deathAge = 0.0
			entry.model.rotation.x = 0.0
			_animate_avatar(entry,to,delta)
	for id in avatars.keys():
		if not avatars[id].root.visible and float(avatars[id].hiddenAt) > 0 and _clock-float(avatars[id].hiddenAt) > 5.0: _remove_avatar(id)

func _animate_avatar(entry: Dictionary, state: Dictionary, delta: float) -> void:
	var skeleton: Skeleton3D = entry.skeleton
	if not skeleton: return
	var speed := QsNativePrediction.vector(state.get("velocity",[])).length()
	entry.gait += delta*minf(speed,6.0)*7.0
	for side in ["l","r"]:
		var phase: float = float(entry.gait)+(0 if side == "l" else PI)
		var leg := skeleton.find_bone("thigh_"+side)
		if leg >= 0: skeleton.set_bone_pose_rotation(leg,Quaternion(Vector3.RIGHT,sin(phase)*minf(speed*0.10,0.50)))
		var calf := skeleton.find_bone("calf_"+side)
		if calf >= 0: skeleton.set_bone_pose_rotation(calf,Quaternion(Vector3.RIGHT,maxf(0.0,-sin(phase))*minf(speed*0.12,0.55)))
		var upper := skeleton.find_bone("upperarm_"+side)
		if upper >= 0: skeleton.set_bone_pose_rotation(upper,Quaternion.from_euler(Vector3(-0.6,0.0,0.95 if side == "l" else -0.95)))
		var lower := skeleton.find_bone("lowerarm_"+side)
		if lower >= 0: skeleton.set_bone_pose_rotation(lower,Quaternion(Vector3.RIGHT,-1.1))

func _remove_avatar(id: String) -> void:
	if not avatars.has(id): return
	var entry: Dictionary = avatars[id]
	if entry.gun: _release_far(entry.gun)
	var pool: Array = model_pool.get(entry.style,[])
	if pool.size() < 2:
		entry.model.reparent(self,false)
		entry.model.position = Vector3.ZERO
		entry.model.rotation = Vector3.ZERO
		entry.model.hide()
		_set_fade(entry.model,1.0)
		if entry.skeleton: entry.skeleton.reset_bone_poses()
		pool.append(entry.model)
		model_pool[entry.style] = pool
	avatars[id].root.queue_free()
	avatars.erase(id)

func _acquire_model(style: String) -> Node3D:
	var pool: Array = model_pool.get(style,[])
	if not pool.is_empty(): return pool.pop_back()
	var model: Node3D = scenes.get(style,scenes["campus-a"]).instantiate()
	add_child(model)
	_prepare_fade_materials(model)
	return model

func _prepare_fade_materials(root: Node) -> void:
	if root is MeshInstance3D and root.mesh:
		var pairs: Array = []
		for index in range(root.mesh.get_surface_count()):
			var material: Material = root.get_active_material(index)
			if material is StandardMaterial3D:
				var fade: StandardMaterial3D = material.duplicate()
				fade.transparency = BaseMaterial3D.TRANSPARENCY_ALPHA
				pairs.append({"index":index,"alive":material,"fade":fade})
		root.set_meta("qs_fade",pairs)
	for child in root.get_children(): _prepare_fade_materials(child)

func _set_fade(root: Node,alpha: float) -> void:
	if root is MeshInstance3D and root.has_meta("qs_fade"):
		for pair in root.get_meta("qs_fade"):
			if alpha >= 0.999: root.set_surface_override_material(pair.index,pair.alive)
			else:
				pair.fade.albedo_color.a = alpha
				root.set_surface_override_material(pair.index,pair.fade)
	for child in root.get_children(): _set_fade(child,alpha)

func _tint_team(root: Node,team: String) -> void:
	if root.get_meta("qs_team","") == team: return
	root.set_meta("qs_team",team)
	if root is MeshInstance3D and root.mesh:
		for index in range(root.mesh.get_surface_count()):
			var material: Material = root.get_active_material(index)
			if material is StandardMaterial3D and material.resource_name.begins_with("TeamAccent"):
				var copy: StandardMaterial3D = material.duplicate()
				copy.albedo_color = Color("9b493c") if team == "red" else Color("3e6774") if team == "blue" else Color("74835e")
				root.set_surface_override_material(index,copy)
				if root.has_meta("qs_fade"):
					for pair in root.get_meta("qs_fade"):
						if int(pair.index) == index:
							pair.alive = copy
							pair.fade.albedo_color = copy.albedo_color
	for child in root.get_children(): _tint_team(child,team)

func release_all() -> void:
	_preparation_epoch += 1
	_released = true
	prepared = false
	if audio: audio.stop_all()
	for id in avatars.keys(): _remove_avatar(id)
	for collection in [drops,clouds,projectiles,loot]:
		for node in collection.values(): node.queue_free()
		collection.clear()
	for effect in effects:
		if is_instance_valid(effect.root): effect.root.queue_free()
	effects.clear()
	for pool in _effect_pool.values():
		for effect in pool:
			if is_instance_valid(effect): effect.queue_free()
	_effect_pool.clear()
	_effect_meshes.clear()
	_effect_materials.clear()
	_prop_meshes.clear()
	_prop_materials.clear()
	_smoke_meshes.clear()
	if view_root: view_root.queue_free()
	view_guns.clear()
	for pool in model_pool.values():
		for model in pool: model.queue_free()
	model_pool.clear()
	for pool in drop_pool.values():
		for model in pool: model.queue_free()
	drop_pool.clear()
	scenes.clear()
	own.clear()
