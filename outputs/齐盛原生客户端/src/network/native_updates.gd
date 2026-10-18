class_name QsNativeUpdates
extends Node

signal status_changed(message: String)
signal update_available(entry: Dictionary)

const VERSION := "0.2.0"
const MANIFEST_URL := "https://game.tianhw.top/api/v1/native/updates"
var candidate: Dictionary = {}
var _request: HTTPRequest
var _operation := 0
var _partial_file := ""

func check() -> void:
	cancel()
	candidate.clear()
	var operation := _operation
	status_changed.emit("正在检查更新…")
	_request = HTTPRequest.new()
	_request.timeout = 15
	_request.max_redirects = 0
	_request.body_size_limit = 64*1024
	add_child(_request)
	if _request.request(MANIFEST_URL,PackedStringArray(["Accept: application/json"])) != OK:
		cancel()
		status_changed.emit("暂时无法检查更新，请稍后重试。")
		return
	var response: Array = await _request.request_completed
	if operation != _operation: return
	_request.queue_free()
	_request = null
	var parsed: Variant = JSON.parse_string(response[3].get_string_from_utf8())
	if response[0] != HTTPRequest.RESULT_SUCCESS or int(response[1]) != 200 or not parsed is Dictionary:
		status_changed.emit("暂时无法检查更新，请稍后重试。")
		return
	var platform := "android" if OS.get_name() == "Android" else "windows"
	var entry: Dictionary = parsed.get(platform,{})
	if not entry.get("available",false) or not _newer(str(entry.get("version","")),VERSION):
		status_changed.emit("当前没有新版本。")
		return
	if not _valid_entry(entry):
		status_changed.emit("更新资料不完整，请稍后重试。")
		return
	candidate = entry.duplicate(true)
	update_available.emit(candidate)

func download() -> void:
	if not _valid_entry(candidate): return
	cancel()
	var operation := _operation
	DirAccess.make_dir_recursive_absolute("user://updates")
	var filename := "qisheng-native-"+str(candidate.version)+(".apk" if OS.get_name() == "Android" else ".zip")
	var partial := "user://updates/"+filename+".partial-"+str(operation)
	_partial_file = partial
	var target := "user://updates/"+filename
	_request = HTTPRequest.new()
	_request.timeout = 300
	_request.max_redirects = 0
	_request.download_file = partial
	_request.body_size_limit = int(candidate.bytes)+1
	add_child(_request)
	status_changed.emit("正在下载安装包…")
	if _request.request("https://game.tianhw.top"+str(candidate.downloadUrl)) != OK:
		cancel()
		status_changed.emit("下载未能开始，请重试。")
		return
	var response: Array = await _request.request_completed
	if operation != _operation: return
	_request.queue_free()
	_request = null
	if response[0] != HTTPRequest.RESULT_SUCCESS or int(response[1]) != 200:
		DirAccess.remove_absolute(partial)
		status_changed.emit("下载未完成，请重试。")
		return
	var file := FileAccess.open(partial,FileAccess.READ)
	if not file or file.get_length() != int(candidate.bytes):
		if file: file.close()
		DirAccess.remove_absolute(partial)
		status_changed.emit("安装包不完整，请重新下载。")
		return
	var hash := HashingContext.new()
	hash.start(HashingContext.HASH_SHA256)
	while file.get_position() < file.get_length():
		hash.update(file.get_buffer(1024*1024))
		await get_tree().process_frame
		if operation != _operation:
			file.close()
			DirAccess.remove_absolute(partial)
			return
	file.close()
	if hash.finish().hex_encode() != str(candidate.sha256):
		DirAccess.remove_absolute(partial)
		status_changed.emit("安装包校验失败，请重新下载。")
		return
	if DirAccess.rename_absolute(partial,target) != OK:
		DirAccess.remove_absolute(partial)
		status_changed.emit("无法保存安装包，请检查可用空间后重试。")
		return
	_partial_file = ""
	status_changed.emit("安装包已保存，退出游戏后即可更新。")
	OS.shell_open(ProjectSettings.globalize_path("user://updates"))

func cancel() -> void:
	_operation += 1
	if _request:
		_request.cancel_request()
		_request.queue_free()
		_request = null
	if not _partial_file.is_empty():
		DirAccess.remove_absolute(_partial_file)
		_partial_file = ""

func _valid_entry(entry: Dictionary) -> bool:
	if not entry.get("available",false): return false
	var hash: String = entry.get("sha256","")
	var regex := RegEx.new()
	regex.compile("^[a-f0-9]{64}$")
	if not regex.search(hash): return false
	var url: String = entry.get("downloadUrl","")
	var extension := "apk" if OS.get_name() == "Android" else "zip"
	regex.compile("^/native/releases/"+hash+"/[a-zA-Z0-9._-]+[.]"+extension+"$")
	if not regex.search(url): return false
	var identity: Variant = entry.get("mapIdentity")
	if not identity is Dictionary or str(identity.get("sourceVersion","")).is_empty(): return false
	regex.compile("^[a-f0-9]{64}$")
	for key in ["manifestHash","collisionHash","navigationHash","visionHash"]:
		if not identity.get(key) is String or not regex.search(identity[key]): return false
	var size: Variant = entry.get("bytes")
	if not (size is int or size is float) or not is_finite(float(size)) or float(size) != floorf(float(size)): return false
	regex.compile("^campus-mp-[0-9]+[.][0-9]+[.][0-9]+$")
	return size > 0 and size <= 2147483648 and regex.search(str(entry.get("protocolVersion",""))) != null

func _newer(candidate_version: String,current_version: String) -> bool:
	var candidate_parts := candidate_version.split(".")
	var current_parts := current_version.split(".")
	if candidate_parts.size() != 3: return false
	for index in range(3):
		if not candidate_parts[index].is_valid_int(): return false
		if int(candidate_parts[index]) != int(current_parts[index]): return int(candidate_parts[index]) > int(current_parts[index])
	return false
