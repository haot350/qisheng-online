extends SceneTree
const Updates = preload("res://src/network/native_updates.gd")
func _initialize() -> void:
 var updater = Updates.new()
 var hash = "a".repeat(64)
 var entry = {"available":true,"version":"0.2.0","protocolVersion":"campus-mp-0.9.0","mapIdentity":{"sourceVersion":"synthetic","manifestHash":hash,"collisionHash":hash,"navigationHash":hash,"visionHash":hash},"downloadUrl":"/native/releases/"+hash+"/qisheng-native-0.2.0-windows.zip","bytes":128,"sha256":hash}
 var from_json = JSON.parse_string(JSON.stringify(entry))
 if not updater._valid_entry(from_json): fail("actual JSON contract rejected"); return
 var checks = ["API relative JSON manifest accepted"]
 for change in [{"downloadUrl":"https://other.invalid/package.zip"},{"downloadUrl":"https://game.tianhw.top/native/releases/"+hash+"/app.zip"},{"downloadUrl":"/native/releases/"+hash+"/../app.zip"},{"downloadUrl":"/native/releases/"+hash+"/app.zip?token=x"},{"downloadUrl":"/native/releases/"+hash+"/app.apk"},{"bytes":128.5},{"bytes":0},{"protocolVersion":"other"},{"mapIdentity":{}},{"sha256":"invalid"}]:
  var invalid = from_json.duplicate(true)
  invalid.merge(change,true)
  if updater._valid_entry(invalid): fail("invalid manifest accepted"); return
 checks.append("10 invalid origin/path/size/platform/map/protocol variants refused")
 if not updater._newer("0.2.0","0.1.0") or updater._newer("0.1.0","0.1.0") or updater._newer("0.0.9","0.1.0"): fail("version comparison"); return
 checks.append("version ordering")
 updater.free()
 var report = {"passed":true,"checks":checks,"network":false}
 var file = FileAccess.open("res://work/native-updates-report.json",FileAccess.WRITE)
 if file: file.store_string(JSON.stringify(report,"  "))
 print(JSON.stringify(report)); quit(0)
func fail(message: String) -> void:
 push_error(message); quit(1)
