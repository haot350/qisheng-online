class_name QsNativePrediction
extends RefCounted

var world: Object
var actor_id := ""
var motion: Dictionary = {}
var pending: Array[Dictionary] = []
var authorized_history: Array[Dictionary] = []
var last_replay_steps := 0
var replay_overflow := false
var generation := -1
var epoch := -1
var last_correction := 0.0
var last_correction_reason := "initial"
var reconciliation_serial := 0
var correction_history: Array[Dictionary] = []
var display_offset := Vector3.ZERO
var _held: Dictionary = {}
var _stamina_free_until := 0
var _authorized_ids: Dictionary = {}

func initialize(collision: PackedByteArray, id: String, own: Dictionary, team: String, minimum_elevation := -4.0) -> bool:
	if not ClassDB.class_exists("QsRapierWorld"): return false
	world = ClassDB.instantiate("QsRapierWorld")
	if not world.call("load_collision_bytes",collision,minimum_elevation): return false
	actor_id = id
	world.call("add_actor", id, vector(own.get("position",[0,0,0])),team,true)
	generation = int(own.get("generation",0))
	epoch = int(own.get("inputReceipt",{}).get("epoch",0))
	world.call("restore_actor",actor_id,own)
	motion = own.duplicate(true)
	return true

func remember_entities(tick: int, players: Array, roster: Array) -> void:
	var poses: Array[Dictionary] = []
	_authorized_ids.clear()
	for row in players:
		if row.get("id","") == actor_id or row.get("life","alive") != "alive" or row.get("loading",false): continue
		var pose: Dictionary = row.duplicate(true)
		for member in roster:
			if member.get("id") == row.get("id"): pose["team"] = member.get("team","none")
		poses.append(pose)
		_authorized_ids[str(pose.get("id",""))] = true
	for sample in authorized_history:
		sample.poses = sample.poses.filter(func(pose): return _authorized_ids.has(str(pose.get("id",""))))
	authorized_history.append({"tick":tick,"poses":poses})
	if authorized_history.size() > 24: authorized_history.pop_front()
	if world: world.call("restore_actors",poses)

func predict(input: Dictionary) -> Dictionary:
	if world == null: return motion
	pending.append(input.duplicate(true))
	if pending.size() > 90: pending.pop_front()
	motion = world.call("step_actor",actor_id,input,false,int(input.get("targetTick",input.get("tick",0))) < _stamina_free_until)
	world.call("step_world",1.0/60.0)
	return motion

func advance_offline(input: Dictionary) -> Dictionary:
	if world == null: return motion
	motion = world.call("step_actor",actor_id,input,false,false)
	world.call("step_world",1.0/60.0)
	return motion

func reconcile(own: Dictionary, tick: int, allow_replay := true) -> Dictionary:
	if world == null: return own
	var before := vector(motion.get("position",own.get("position",[0,0,0])))
	var new_generation := int(own.get("generation",0))
	var receipt: Dictionary = own.get("inputReceipt",{})
	var new_epoch := int(receipt.get("epoch",0))
	var reset: bool = new_generation != generation or new_epoch != epoch or own.get("loading",false)
	last_correction_reason = "generation" if new_generation != generation else "epoch" if new_epoch != epoch else "loading" if own.get("loading",false) else "replay"
	if reset: clear()
	generation = new_generation
	epoch = new_epoch
	var previous: Array[Dictionary] = pending.duplicate(true)
	var confirmed: int = maxi(int(receipt.get("appliedSeq",own.get("ack",0))),int(receipt.get("cancelledThrough",0)))
	pending = []
	for command in previous:
		if int(command.get("inputEpoch",epoch)) == epoch and int(command.get("seq",0)) > confirmed:
			pending.append(command)
	var cutoff := int(own.get("appliedInputTick",tick))
	_stamina_free_until = cutoff+roundi(float(own.get("cardsLeft",0))*60)
	world.call("restore_actor",actor_id,own)
	motion = own.duplicate(true)
	last_replay_steps = 0
	replay_overflow = false
	if allow_replay and not reset:
		var overdue: Array[Dictionary] = []
		var future: Array[Dictionary] = []
		var action_queue: Array[Dictionary] = []
		var action_ack := int(own.get("actionAck",0))
		for command in pending:
			if int(command.get("targetTick",cutoff+1)) <= cutoff:
				overdue.append(command)
				for action in command.get("actionIds",[]):
					if int(action.get("id",0)) > action_ack: action_queue.append(action.duplicate(true))
			else: future.append(command)
		for command in previous:
			if int(command.get("seq",0)) <= int(receipt.get("appliedSeq",0)): _held = command
		var latest := cutoff+maxi(1 if not overdue.is_empty() else 0,action_queue.size())
		for command in future: latest = maxi(latest,int(command.get("targetTick",cutoff)))
		replay_overflow = latest-cutoff > 30
		for replay_tick in range(cutoff+1,mini(latest,cutoff+30)+1):
			var exact: Dictionary = {}
			for command in future:
				if int(command.get("targetTick",0)) == replay_tick:
					exact = command
					break
			if not exact.is_empty(): _held = exact
			elif replay_tick == cutoff+1 and not overdue.is_empty(): _held = overdue.back()
			if _held.is_empty(): continue
			var ids: Array = []
			var types: Dictionary = {}
			for action in exact.get("actionIds",[]):
				if int(action.get("id",0)) > action_ack:
					ids.append(action)
					types[str(action.type)] = true
			var remaining: Array[Dictionary] = []
			for action in action_queue:
				if types.has(str(action.type)): remaining.append(action)
				else:
					types[str(action.type)] = true
					ids.append(action)
			action_queue = remaining
			var replay := _held.duplicate(true)
			replay["actionIds"] = ids
			replay["actions"] = types.keys()
			_restore_entities(replay_tick)
			motion = world.call("step_actor",actor_id,replay,false,replay_tick < _stamina_free_until)
			world.call("step_world",1.0/60.0)
			last_replay_steps += 1
	_restore_entities(-1)
	var after := vector(motion.get("position",own.get("position",[0,0,0])))
	last_correction = before.distance_to(after)
	reconciliation_serial += 1
	correction_history.append({"serial":reconciliation_serial,"tick":tick,"generation":generation,"epoch":epoch,"loadingEpoch":own.get("loadingEpoch",0),"loading":own.get("loading",false),"reason":last_correction_reason,"distance":last_correction,"before":[before.x,before.y,before.z],"authority":own.get("position",[]),"after":[after.x,after.y,after.z],"replayed":last_replay_steps,"pending":pending.size(),"cutoff":cutoff})
	if correction_history.size() > 120: correction_history.pop_front()
	if reset or replay_overflow:
		display_offset = Vector3.ZERO
	else:
		var offset := before+display_offset-after
		# Presentation offsets never move the physical capsule. If the visual
		# segment crosses static geometry, immediately use the legal position.
		var distance := offset.length()
		if distance > 0.001 and distance < 4.0:
			var hit: float = world.call("ray_distance",after+Vector3(0,1.2,0),offset.normalized(),distance)
			display_offset = offset if hit >= distance-0.02 else Vector3.ZERO
		else: display_offset = Vector3.ZERO
	return motion

func _restore_entities(tick: int) -> void:
	if not world or authorized_history.is_empty(): return
	if tick >= 0 and tick < int(authorized_history.front().tick):
		var empty_poses: Array[Dictionary] = []
		world.call("restore_actors",empty_poses)
		return
	var chosen: Dictionary = authorized_history.front() if tick >= 0 else authorized_history.back()
	if tick >= 0:
		for sample in authorized_history:
			if int(sample.tick) <= tick: chosen = sample
	world.call("restore_actors",chosen.poses.filter(func(pose): return _authorized_ids.has(str(pose.get("id","")))))

func render_position(delta: float) -> Vector3:
	display_offset *= exp(-maxf(delta,0.0)*16.0)
	return vector(motion.get("position",Vector3.ZERO))+display_offset

func clear() -> void:
	pending.clear()
	_held.clear()
	display_offset = Vector3.ZERO
	last_replay_steps = 0
	replay_overflow = false

func dispose() -> void:
	clear()
	authorized_history.clear()
	_authorized_ids.clear()
	if world and not actor_id.is_empty(): world.call("remove_actor",actor_id)
	world = null

static func vector(value: Variant) -> Vector3:
	if value is Vector3: return value
	if value is Array and value.size() >= 3: return Vector3(float(value[0]),float(value[1]),float(value[2]))
	return Vector3.ZERO
