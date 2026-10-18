extends SceneTree
func _initialize() -> void:
 call_deferred("_run")
func _run() -> void:
 var url := OS.get_environment("QS_NATIVE_HTTPS_CHECK_URL")
 if not url.begins_with("https://") or url.contains("@") or url.contains("#"): push_error("Set a public HTTPS check URL without credentials."); quit(2); return
 var request := HTTPRequest.new()
 request.timeout = 15
 request.max_redirects = 0
 request.body_size_limit = 65536
 root.add_child(request)
 if request.request(url,PackedStringArray(["Accept: application/json"])) != OK: push_error("HTTPS request could not start"); quit(1); return
 var response: Array = await request.request_completed
 var passed: bool = response[0] == HTTPRequest.RESULT_SUCCESS and int(response[1]) == 200
 var decoded := JSON.new()
 passed = passed and decoded.parse(response[3].get_string_from_utf8()) == OK and decoded.data is Dictionary
 var report := {"passed":passed,"result":response[0],"httpStatus":response[1],"tlsVerification":true,"redirects":false,"credentialsSent":false}
 var output := FileAccess.open("res://work/native-https-report.json",FileAccess.WRITE)
 if output: output.store_string(JSON.stringify(report,"  "))
 print(JSON.stringify(report));request.queue_free();quit(0 if passed else 1)
