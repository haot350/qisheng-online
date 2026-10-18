extends SceneTree
const Session = preload("res://src/network/native_session.gd")
var session: Node
var snapshots := 0
var started := 0
var finished := false
var accepted_before := 0
func _initialize() -> void:
 call_deferred("_run")
func _run() -> void:
 started = Time.get_ticks_msec()
 var source := OS.get_environment("QS_NATIVE_SEAT_QA")
 if source.is_empty() or not FileAccess.file_exists(source): await _finish(false,"configuration"); return
 var decoder := JSON.new()
 if decoder.parse(FileAccess.get_file_as_string(source)) != OK or not decoder.data is Dictionary: await _finish(false,"configuration"); return
 var config: Dictionary = decoder.data
 if config.get("api") != "https://game.tianhw.top/api/v1" or config.get("realtime") != "https://game.tianhw.top/realtime": await _finish(false,"endpoint"); return
 var map_data: Variant = JSON.parse_string(FileAccess.get_file_as_string("res://content/production/map.json"))
 if not map_data is Dictionary or not map_data.get("mapIdentity") is Dictionary: await _finish(false,"map"); return
 session = Session.new()
 root.add_child(session)
 session.snapshot_received.connect(func(_snapshot: Dictionary): snapshots += 1)
 if not session.configure(config.api,config.realtime,map_data.mapIdentity): await _finish(false,"endpoint"); return
 if not await session.login(str(config.get("username","")),str(config.get("password",""))): await _finish(false,"login"); return
 if not await session.create_room({"mode":"pvp","variant":str(config.get("variant","tdm")),"private":true,"maxPlayers":2,"ranked":false,"title":"OpenQS连接检查"}): await _finish(false,"admission"); return
 var deadline := Time.get_ticks_msec()+15000
 while Time.get_ticks_msec()<deadline and snapshots<3:
  await process_frame
 await _finish(snapshots>=3 and session.status=="lobby" and session.wire_diagnostics.rejected==0,"lobby")
func _finish(passed: bool,stage: String) -> void:
 if finished: return
 finished = true
 var rejected := 0
 if session:
  rejected = int(session.wire_diagnostics.rejected)
  session.logout()
  await create_timer(1.0).timeout
 var report := {"test":"native-production-seat","passed":passed,"stage":stage,"snapshots":snapshots,"rejected":rejected,"elapsedMs":Time.get_ticks_msec()-started,"realSdk":true,"tlsVerification":true,"privateRoom":true,"gameStarted":false,"scoreSubmitted":false}
 print("QS_NATIVE_TLS_RESULT "+JSON.stringify(report))
 quit(0 if passed else 1)
