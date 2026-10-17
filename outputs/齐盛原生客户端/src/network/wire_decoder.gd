class_name QsWireDecoder
extends RefCounted

## Decodes the existing explicit recipient protocol. Roster rows never create positions.
const WIRE_VERSION := 1
const PROTOCOL := "campus-mp-0.9.0"
var sequence := 0
var viewer_id := ""
var room_id := ""
var last_error := ""
var _state: Dictionary = {}

func reset() -> void:
	sequence = 0
	viewer_id = ""
	room_id = ""
	last_error = ""
	_state.clear()

func accept(message: Dictionary) -> Dictionary:
	last_error = ""
	if int(message.get("wireVersion", -1)) != WIRE_VERSION or not _integer(message.get("seq")) or int(message.seq) < 1:
		return _reject("wire")
	if int(message.seq) <= sequence:
		return {}
	if message.get("kind") == "full":
		if not _valid_full(message):
			return _reject("baseline")
		_state = {"room": message.room.duplicate(true), "roster": message.roster.duplicate(true), "self": message.self.duplicate(true), "players": message.players.duplicate(true), "npcs": message.npcs.duplicate(true), "spectatingId": message.get("spectatingId"), "events": message.get("events", []).duplicate(true), "eventSerial": message.get("eventSerial", 0)}
		viewer_id = message.viewerId
		room_id = message.roomId
	elif message.get("kind") == "delta":
		if _state.is_empty() or int(message.get("baseSeq", -1)) != sequence or message.get("roomId") != room_id or message.get("viewerId") != viewer_id:
			return _reject("sequence")
		if not _valid_delta(message.get("players")) or not _valid_delta(message.get("npcs")):
			return _reject("entities")
		_state.room = _patch(_state.room, message.get("room", {}))
		_state.self = _patch(_state.self, message.get("self", {}))
		if message.get("roster") != null:
			if not message.roster is Array:
				return _reject("roster")
			_state.roster = message.roster.duplicate(true)
		_state.players = _merge_entities(_state.players, message.players)
		_state.npcs = _merge_entities(_state.npcs, message.npcs)
		_state.spectatingId = message.get("spectatingId")
		_state.events = message.get("events", []).duplicate(true)
		_state.eventSerial = message.get("eventSerial", 0)
	else:
		return _reject("kind")
	if _state.room.get("protocolVersion") != PROTOCOL:
		reset()
		return _reject("protocol")
	sequence = int(message.seq)
	var result: Dictionary = _state.room.duplicate(true)
	result["self"] = _state.self.duplicate(true)
	result["players"] = [_state.self.duplicate(true)] + _state.players.duplicate(true)
	result["npcs"] = _state.npcs.duplicate(true)
	result["roster"] = _state.roster.duplicate(true)
	result["viewerId"] = viewer_id
	result["spectatingId"] = _state.spectatingId
	result["events"] = _state.events.duplicate(true)
	result["eventSerial"] = _state.eventSerial
	return result

func _valid_full(value: Dictionary) -> bool:
	return value.get("room") is Dictionary and value.get("self") is Dictionary and value.get("roster") is Array and value.get("players") is Array and value.get("npcs") is Array and value.self.get("id") == value.get("viewerId") and value.room.get("roomId") == value.get("roomId")

func _valid_delta(value: Variant) -> bool:
	if not value is Dictionary or not value.get("upsert") is Array or not value.get("remove") is Array:
		return false
	for entity in value.upsert:
		if not entity is Dictionary or not entity.get("id") is String:
			return false
	return true

func _patch(previous: Dictionary, patch: Variant) -> Dictionary:
	var result := previous.duplicate(true)
	if not patch is Dictionary:
		return result
	for key in patch.get("set", {}):
		result[key] = patch.set[key].duplicate(true) if patch.set[key] is Dictionary or patch.set[key] is Array else patch.set[key]
	for key in patch.get("unset", []):
		result.erase(key)
	return result

func _merge_entities(previous: Array, delta: Dictionary) -> Array:
	var entities: Dictionary = {}
	for entity in previous:
		entities[entity.id] = entity
	for id in delta.remove:
		entities.erase(id)
	for entity in delta.upsert:
		entities[entity.id] = entity.duplicate(true)
	return entities.values()

func _integer(value: Variant) -> bool:
	return (value is int or value is float) and is_finite(float(value)) and float(value) == floor(float(value)) and abs(float(value)) < 9007199254740992.0

func _reject(reason: String) -> Dictionary:
	last_error = reason
	return {}
