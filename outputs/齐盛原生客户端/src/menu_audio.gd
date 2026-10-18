class_name QsMenuAudio
extends Node

var music: AudioStreamPlayer
var ambient: AudioStreamPlayer
var click: AudioStreamPlayer
var _mode := "home"
var _weather := "clear"

func _ready() -> void:
	music = AudioStreamPlayer.new()
	music.bus = "Music"
	music.volume_db = -9
	add_child(music)
	var manifest: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://content/audio/manifest.json")) if FileAccess.file_exists("res://content/audio/manifest.json") else {}
	if DisplayServer.get_name() != "headless" and manifest is Dictionary and manifest.get("music") is Dictionary:
		var file := str(manifest.music.get("file",""))
		if file.begins_with("wildflowers-") and file.ends_with(".mp3") and not file.contains("/"):
			music.stream = load("res://content/audio/"+file)
			if music.stream is AudioStreamMP3: music.stream.loop = true
	ambient = AudioStreamPlayer.new()
	ambient.bus = "Ambient"
	ambient.stream = _noise()
	ambient.volume_db = -26
	add_child(ambient)
	click = AudioStreamPlayer.new()
	click.bus = "UI"
	click.volume_db = -14
	click.stream = _click()
	add_child(click)
	set_mode("home")

func set_mode(mode: String) -> void:
	_mode = mode
	if not music: return
	if mode in ["home","room"]:
		if music.stream and not music.playing: music.play()
		music.stream_paused = false
	else: music.stream_paused = true
	_update_ambient()

func set_weather(preset: String) -> void:
	_weather = preset
	_update_ambient()

func _update_ambient() -> void:
	if not ambient: return
	if _mode not in ["roam","combat"]:
		ambient.stop()
		return
	ambient.volume_db = -19 if _weather == "light-rain" else -31
	if not ambient.playing: ambient.play()

func play_click() -> void:
	if click: click.play()

func _exit_tree() -> void:
	for player in [music,ambient,click]:
		if player:
			player.stop()
			player.stream = null

func _noise() -> AudioStreamWAV:
	var data := PackedByteArray()
	var count := 22050
	data.resize(count*2)
	var random := RandomNumberGenerator.new()
	random.seed = 77513
	var low := 0.0
	for index in range(count):
		low = lerpf(low,random.randf_range(-1,1),0.16)
		var window := minf(1.0,minf(float(index)/300.0,float(count-index)/300.0))
		data.encode_s16(index*2,int(clampf(low*0.9*window,-1,1)*24000))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = 22050
	stream.data = data
	stream.loop_mode = AudioStreamWAV.LOOP_FORWARD
	stream.loop_end = count
	return stream

func _click() -> AudioStreamWAV:
	var data := PackedByteArray()
	var count := 1100
	data.resize(count*2)
	for index in range(count):
		var envelope := exp(-float(index)/180.0)
		data.encode_s16(index*2,int(sin(float(index)*TAU*1100.0/22050.0)*envelope*10000))
	var stream := AudioStreamWAV.new()
	stream.format = AudioStreamWAV.FORMAT_16_BITS
	stream.mix_rate = 22050
	stream.data = data
	return stream
