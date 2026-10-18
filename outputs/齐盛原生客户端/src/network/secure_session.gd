class_name QsSecureSession
extends RefCounted

static func storage_path(origin: String) -> String:
	return "user://account-"+origin.sha256_text()+".bin"

static func save_token(token: String, origin: String) -> bool:
	if origin.is_empty() or origin.length() > 2048: return false
	if token.is_empty():
		clear(origin)
		return true
	if token.length() > 8192 or token.contains("\r") or token.contains("\n"): return false
	if OS.get_name() != "Windows" or not ClassDB.class_exists("QsRapierWorld"): return false
	var bridge: Object = ClassDB.instantiate("QsRapierWorld")
	if not bridge.has_method("protect_token"): return false
	var protected: PackedByteArray = bridge.call("protect_token", JSON.stringify({"origin":origin,"token":token,"version":1}))
	if protected.is_empty(): return false
	var target := storage_path(origin)
	var temporary := target + ".pending"
	var file := FileAccess.open(temporary, FileAccess.WRITE)
	if not file: return false
	file.store_buffer(protected)
	file.flush()
	var written := file.get_error() == OK
	file.close()
	if not written:
		DirAccess.remove_absolute(temporary)
		return false
	if DirAccess.rename_absolute(temporary, target) != OK:
		DirAccess.remove_absolute(temporary)
		return false
	return true

static func load_token(origin: String) -> String:
	if origin.is_empty() or not FileAccess.file_exists(storage_path(origin)): return ""
	if OS.get_name() != "Windows" or not ClassDB.class_exists("QsRapierWorld"): return ""
	var bridge: Object = ClassDB.instantiate("QsRapierWorld")
	if not bridge.has_method("unprotect_token"): return ""
	var bytes := FileAccess.get_file_as_bytes(storage_path(origin))
	if bytes.is_empty() or bytes.size() > 16384:
		clear(origin)
		return ""
	var plaintext: String = bridge.call("unprotect_token", bytes)
	var decoder := JSON.new()
	if plaintext.is_empty() or decoder.parse(plaintext) != OK:
		clear(origin)
		return ""
	var parsed: Variant = decoder.data
	if not parsed is Dictionary or parsed.get("origin") != origin or parsed.get("version") != 1 or not parsed.get("token") is String:
		clear(origin)
		return ""
	if parsed.token.is_empty() or parsed.token.length() > 8192 or parsed.token.contains("\r") or parsed.token.contains("\n"):
		clear(origin)
		return ""
	return parsed.token

static func clear(origin: String) -> void:
	if not origin.is_empty() and FileAccess.file_exists(storage_path(origin)): DirAccess.remove_absolute(storage_path(origin))
