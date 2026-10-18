class_name QsRuntimeDiagnostics
extends RefCounted

## Bounded local stage breadcrumbs. Opt-in only; never includes identities,
## network payloads, positions, headers or credentials.
const CAPACITY := 256
var events: Array[Dictionary] = []
var _file: FileAccess
var _clock := Time.get_ticks_usec()
var _last_frame := 0

func _init() -> void:
	var directory := OS.get_environment("QS_NATIVE_DIAGNOSTICS_DIR")
	if directory.is_empty() or not directory.is_absolute_path(): return
	if DirAccess.make_dir_recursive_absolute(directory) != OK: return
	_file = FileAccess.open(directory.path_join("PRIVATE-native-stages.jsonl"),FileAccess.WRITE)
	record("runtime",{"renderer":RenderingServer.get_current_rendering_method(),"platform":OS.get_name()})

func record(stage: String, counts: Dictionary = {}) -> void:
	var entry := {"atMs":float(Time.get_ticks_usec()-_clock)/1000.0,"stage":stage}
	# Keys are deliberately enumerated. A caller cannot accidentally record a
	# snapshot or a room/member payload through this diagnostic helper.
	for key in ["resource","durationMs","resident","pending","required","loading","renderer","platform","limit"]:
		if counts.has(key): entry[key] = counts[key]
	events.append(entry)
	if events.size() > CAPACITY: events.pop_front()
	if _file and _file.get_position() < 2*1024*1024:
		_file.store_line(JSON.stringify(entry))
		_file.flush()

func frame(delta: float, loading: bool, resident: int, pending: int) -> void:
	var now := Time.get_ticks_usec()
	var elapsed := float(now-_last_frame)/1000.0 if _last_frame > 0 else delta*1000.0
	_last_frame = now
	if elapsed >= 100.0:
		record("long-frame",{"durationMs":elapsed,"loading":loading,"resident":resident,"pending":pending})
