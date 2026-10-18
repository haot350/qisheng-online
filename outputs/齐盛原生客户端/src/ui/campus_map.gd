class_name QsCampusMap
extends Control

var player_position := Vector3.ZERO
var player_yaw := 0.0
var manifest: Dictionary = {}
var _bounds := Rect2(-240, -260, 370, 300)

func _ready() -> void:
	var path := "res://content/production/map.json"
	if not FileAccess.file_exists(path): path = "res://content/demo/map.json"
	var value: Variant = JSON.parse_string(FileAccess.get_file_as_string(path))
	if value is Dictionary: manifest = value
	var bounds: Dictionary = manifest.get("bounds", {})
	if bounds.get("min") is Array and bounds.get("max") is Array:
		_bounds = Rect2(float(bounds.min[0]), float(bounds.min[2]), float(bounds.max[0])-float(bounds.min[0]), float(bounds.max[2])-float(bounds.min[2]))
	queue_redraw()

func _point(position: Vector3) -> Vector2:
	var scale_value := minf((size.x-40)/_bounds.size.x, (size.y-40)/_bounds.size.y)
	var offset := (size-_bounds.size*scale_value)*0.5
	return (Vector2(position.x,position.z)-_bounds.position)*scale_value+offset

func _draw() -> void:
	draw_style_box(_background(), Rect2(Vector2.ZERO,size))
	for chunk in manifest.get("chunks", []):
		if str(chunk.get("kind", "")) == "exterior": continue
		var bounds: Dictionary = chunk.get("bounds", {})
		if not bounds.get("min") is Array or not bounds.get("max") is Array: continue
		var a: Array = bounds.min
		var b: Array = bounds.max
		var from := _point(Vector3(float(a[0]), 0, float(a[2])))
		var to := _point(Vector3(float(b[0]), 0, float(b[2])))
		draw_rect(Rect2(from, to-from), Color(0.44, 0.50, 0.48, 0.28))
	for route in manifest.get("stairRoutes", []):
		var points: Array = route.get("points", [])
		if points.is_empty(): continue
		var p: Array = points[0]
		draw_circle(_point(Vector3(float(p[0]),float(p[1]),float(p[2]))), 4, Color("ccac6d"))
	var at := _point(player_position)
	var forward := Vector2(-sin(player_yaw), -cos(player_yaw))
	var side := Vector2(forward.y, -forward.x)
	draw_colored_polygon(PackedVector2Array([at+forward*12, at-forward*7+side*7, at-forward*7-side*7]), Color("f0be80"))
	draw_string(ThemeDB.fallback_font, Vector2(size.x-36,30), "N", HORIZONTAL_ALIGNMENT_CENTER, -1, 18, Color("d4d5c9"))

func _background() -> StyleBoxFlat:
	var box := StyleBoxFlat.new()
	box.bg_color = Color("172126")
	box.border_color = Color("4e5957")
	box.set_border_width_all(1)
	return box
