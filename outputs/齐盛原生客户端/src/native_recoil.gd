class_name QsNativeRecoil
extends RefCounted

const PATTERNS := {"glock":[0,-0.2,0.15],"mp5":[-0.2,-0.3,-0.15,0.1,0.35,0.5,0.4,0.1,-0.3,-0.5],"m4a1":[0,-0.25,-0.4,-0.2,0.15,0.5,0.65,0.4,0,-0.35,-0.45],"ak47":[0.1,0.35,0.55,0.3,-0.15,-0.65,-0.8,-0.45,0.25,0.65],"r870":[0,0.2,-0.1],"awm":[0,0.1,-0.1],"m249":[-0.1,-0.25,-0.4,-0.2,0.1,0.35,0.6,0.55,0.25,-0.1,-0.35]}
var pitch := 0.0
var yaw := 0.0
var sequence := 0
var since_shot := 1.0
var previous_weapon := ""
var _random := RandomNumberGenerator.new()

func kick(weapon: String,definition: Dictionary) -> void:
	if previous_weapon != weapon or since_shot > 0.28: sequence = 0
	previous_weapon = weapon
	since_shot = 0.0
	var shot := sequence
	sequence += 1
	var pattern: Array = PATTERNS.get(weapon,PATTERNS.m4a1)
	var side: float = float(pattern[shot%pattern.size()])*float(definition.get("recoilSide",0.006))+(_random.randf()-0.5)*float(definition.get("recoilSide",0.006))*0.16
	pitch = minf(0.18,pitch+float(definition.get("recoil",0.017))*(1+minf(shot,10)*0.035))
	yaw = clampf(yaw+side,-0.075,0.075)

func update(delta: float,recover: float) -> void:
	since_shot += maxf(delta,0)
	pitch *= exp(-recover*maxf(delta,0))
	yaw *= exp(-recover*maxf(delta,0))

func reset() -> void:
	pitch = 0
	yaw = 0
	sequence = 0
	since_shot = 1.0
	previous_weapon = ""
