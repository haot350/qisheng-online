class_name QsCombatAudio
extends Node3D

const PROFILES := {"glock":[0.092,5100,118,0.15],"mp5":[0.068,4200,145,0.13],"m4a1":[0.085,6500,104,0.19],"ak47":[0.105,5700,84,0.23],"r870":[0.145,3600,66,0.29],"awm":[0.165,6100,51,0.42],"m249":[0.095,5900,92,0.24]}
var shots: Dictionary = {}
var muffled_shots: Dictionary = {}
var explosion: AudioStreamWAV
var mechanical: AudioStreamWAV
var hit: AudioStreamWAV
var voices: Array[AudioStreamPlayer3D] = []
var local_voices: Array[AudioStreamPlayer] = []
var _cursor := 0
var _local_cursor := 0

func _ready() -> void:
	for id in PROFILES:
		var profile: Array = PROFILES[id]
		shots[id] = _synthesize(float(profile[0]),float(profile[1]),float(profile[2]),float(profile[3]))
		muffled_shots[id] = _synthesize(float(profile[0]),850.0,float(profile[2]),float(profile[3]))
	explosion = _synthesize(0.26,1200,40,0.6)
	mechanical = _synthesize(0.045,2600,210,0.05)
	hit = _synthesize(0.025,1300,790,0.035)
	for index in range(16):
		var voice := AudioStreamPlayer3D.new()
		voice.max_distance = 180
		voice.unit_size = 8.0
		voice.volume_db = -9
		add_child(voice)
		voices.append(voice)
	for index in range(6):
		var voice := AudioStreamPlayer.new()
		voice.volume_db = -9
		add_child(voice)
		local_voices.append(voice)

func shot(weapon: String, at: Vector3, local := false, occluded := false) -> void:
	var bank: Dictionary = muffled_shots if occluded else shots
	var stream: AudioStreamWAV = bank.get(weapon,bank.get("m4a1"))
	if local:
		var voice := local_voices[_local_cursor%local_voices.size()]
		_local_cursor += 1
		voice.stream = stream
		voice.play()
	else:
		var voice := voices[_cursor%voices.size()]
		_cursor += 1
		voice.global_position = at
		voice.stream = stream
		voice.play()

func explosion_at(at: Vector3) -> void:
	if voices.is_empty(): return
	var voice := voices[_cursor%voices.size()]
	_cursor += 1
	voice.global_position = at
	voice.stream = explosion
	voice.play()

func action() -> void:
	if local_voices.is_empty(): return
	var voice := local_voices[_local_cursor%local_voices.size()]
	_local_cursor += 1
	voice.stream = mechanical
	voice.play()

func hit_marker() -> void:
	if local_voices.is_empty(): return
	var voice := local_voices[_local_cursor%local_voices.size()]
	_local_cursor += 1
	voice.stream = hit
	voice.play()

func stop_all() -> void:
	for voice in voices: voice.stop()
	for voice in local_voices: voice.stop()

func _synthesize(duration: float, cutoff: float, punch: float, tail: float) -> AudioStreamWAV:
	const RATE := 22050
	var length := int((maxf(duration,tail)+0.04)*RATE)
	var data := PackedByteArray()
	data.resize(length*2)
	var noise := 92851
	var filtered := 0.0
	var filter_alpha := 1.0-exp(-TAU*cutoff/RATE)
	for index in range(length):
		var time := float(index)/RATE
		noise = (noise*1664525+1013904223)&0xffffffff
		var white := (float(noise)/4294967296.0*2.0-1.0)
		filtered += filter_alpha*(white-filtered)
		var impact := filtered*exp(-time/maxf(duration*0.25,0.005))*0.65
		var triangle := (absf(fmod(time*punch,1.0)*2.0-1.0)*2.0-1.0)*exp(-time/0.05)*0.25
		var rumble := filtered*exp(-time/maxf(tail*0.25,0.01))*0.10
		data.encode_s16(index*2,int(clampf(impact+triangle+rumble,-1.0,1.0)*28000))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = RATE
	stream.stereo = false
	stream.data = data
	return stream
