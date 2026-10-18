class_name QsPhysicsCompatibility
extends RefCounted

## Godot's collision engine is not assumed equivalent to the web Rapier controller.
const REQUIRED_JS_VERSION := "0.19.3"
const REQUIRED_RUST_VERSION := "0.30.1"
const REQUIRED_PROTOCOL := "campus-mp-0.9.4"
const VERIFIED_PREDICTION := true

static func allows_endpoint(endpoint: String) -> bool:
	# Demo/internal exports remain loopback-only. The editor permits explicit
	# maintainer checks; only the approved preview export chooses production by default.
	if endpoint.begins_with("http://127.0.0.1:") or endpoint.begins_with("http://localhost:") or endpoint.begins_with("ws://127.0.0.1:") or endpoint.begins_with("ws://localhost:"): return true
	return VERIFIED_PREDICTION and (OS.has_feature("native-preview") or OS.has_feature("editor")) and endpoint == "https://game.tianhw.top/realtime"

static func report() -> Dictionary:
	return {"javascriptRapier": REQUIRED_JS_VERSION, "rustRapier": REQUIRED_RUST_VERSION, "predictionVerified": VERIFIED_PREDICTION, "networkMode": "approved-preview-server-authoritative" if OS.has_feature("native-preview") else "explicit-maintainer-or-loopback" if OS.has_feature("editor") else "isolated-server-authoritative", "ranked": false, "requires": ["matching Rust Rapier revision", "capsule controller settings", "support and safe-route queries", "60 Hz shared movement trace parity", "dynamic actor collision history"]}
