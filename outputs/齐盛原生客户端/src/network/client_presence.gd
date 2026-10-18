class_name QsClientPresence
extends Node

## Process-memory presence only. No device fingerprint, browsing history or
## persisted session identifier. The API's expiry remains the source of truth.
var _base := ""
var _bearer := ""
var _session_id := ""
var _enabled := true
var _active := true
var _next_ms := 0
var _in_flight := false
var _generation := 0
var _request: HTTPRequest

func _ready() -> void:
	_active = get_window().has_focus()

func configure(base: String, bearer := "") -> void:
	if base != _base:
		_generation += 1
		if _request:
			_request.cancel_request()
			_request.request_completed.emit(HTTPRequest.RESULT_REQUEST_FAILED,0,PackedStringArray(),PackedByteArray())
			_request.queue_free()
		_request = null
		_in_flight = false
		_session_id = ""
		_enabled = true
	_base = base.trim_suffix("/")
	_bearer = bearer
	_next_ms = 0

func _process(_delta: float) -> void:
	if _enabled and not _in_flight and not _base.is_empty() and Time.get_ticks_msec() >= _next_ms:
		_send()

func set_active(active: bool) -> void:
	if _active == active: return
	_active = active
	_next_ms = 0
	if _enabled and not _in_flight and not _base.is_empty(): _send()

func _notification(what: int) -> void:
	if what in [NOTIFICATION_APPLICATION_FOCUS_OUT,NOTIFICATION_APPLICATION_PAUSED]: set_active(false)
	if what in [NOTIFICATION_APPLICATION_FOCUS_IN,NOTIFICATION_APPLICATION_RESUMED]: set_active(true)
	if what == NOTIFICATION_WM_CLOSE_REQUEST: set_active(false)

func _send() -> void:
	# Once background state was sent, no periodic background polling follows.
	if not _active and _next_ms > 0: return
	var generation := _generation
	var was_active := _active
	var was_bearer := _bearer
	var request := HTTPRequest.new()
	request.timeout = 5.0
	request.body_size_limit = 4096
	request.max_redirects = 0
	_request = request
	add_child(request)
	_in_flight = true
	_next_ms = Time.get_ticks_msec()+30000
	var body := {"client":"native","active":was_active}
	if not _session_id.is_empty(): body["sessionId"] = _session_id
	var headers := PackedStringArray(["Content-Type: application/json","Accept: application/json"])
	if not was_bearer.is_empty(): headers.append("Authorization: Bearer "+was_bearer)
	var error := request.request(_base+"/presence",headers,HTTPClient.METHOD_POST,JSON.stringify(body))
	if error != OK:
		request.queue_free()
		_request = null
		_in_flight = false
		return
	var response: Array = await request.request_completed
	if generation != _generation: return
	request.queue_free()
	_request = null
	_in_flight = false
	if int(response[1]) == 404:
		_enabled = false
		return
	if response[0] != HTTPRequest.RESULT_SUCCESS or int(response[1]) < 200 or int(response[1]) >= 300 or response[3].is_empty():
		return
	var parsed: Variant = JSON.parse_string(response[3].get_string_from_utf8())
	if response[0] == HTTPRequest.RESULT_SUCCESS and int(response[1]) in range(200,300) and parsed is Dictionary:
		var id: Variant = parsed.get("sessionId","")
		if id is String and id.length() <= 256: _session_id = id
		_next_ms = Time.get_ticks_msec()+clampi(int(parsed.get("heartbeatSeconds",30)),15,60)*1000
	if _active != was_active or _bearer != was_bearer:
		_next_ms = 0

func _exit_tree() -> void:
	_generation += 1
	if _request:
		_request.cancel_request()
		_request.request_completed.emit(HTTPRequest.RESULT_REQUEST_FAILED,0,PackedStringArray(),PackedByteArray())
		_request = null
	_bearer = ""
	_session_id = ""
