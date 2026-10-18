extends SceneTree
var checks: Array = []
func _initialize() -> void:
 call_deferred("run")
func check(name: String, passed: bool) -> void:
 checks.append({"name":name,"passed":passed})
 if not passed: push_error(name)
func run() -> void:
 var settings_path="user://settings.json"
 var had_settings=FileAccess.file_exists(settings_path)
 var settings_bytes=FileAccess.get_file_as_bytes(settings_path) if had_settings else PackedByteArray()
 var game=load("res://main.tscn").instantiate()
 root.add_child(game)
 await process_frame
 await process_frame
 var previous: Dictionary=game.preferences.values.duplicate(true)
 game._menu_action("setting",{"key":"quality","value":2})
 check("high applies 2x MSAA",game.get_viewport().msaa_3d == Viewport.MSAA_2X)
 game._menu_action("setting",{"key":"quality","value":3})
 check("ultra applies 4x MSAA",game.get_viewport().msaa_3d == Viewport.MSAA_4X)
 game._menu_action("setting",{"key":"vsync","value":false})
 check("VSync off applies and stores",not game.preferences.values.vsync and DisplayServer.window_get_vsync_mode() == DisplayServer.VSYNC_DISABLED)
 game._menu_action("setting",{"key":"vsync","value":true})
 check("VSync on applies and stores",game.preferences.values.vsync and DisplayServer.window_get_vsync_mode() == DisplayServer.VSYNC_ENABLED)
 var shell=game.shell
 shell.account={"id":"self","nickname":"测试玩家"}
 shell.room={"variant":"tdm","hostId":"self","phase":"lobby","self":{"id":"self","loading":false,"ready":true},"roster":[{"id":"self","nickname":"测试玩家","team":"blue","connected":true,"loading":false,"ready":true},{"id":"other","nickname":"队友","team":"red","connected":true,"loading":false,"ready":false}]}
 shell.show_page("room")
 await process_frame
 var start=button_named(shell,"开始本局")
 check("host waits for ready teammate",start != null and start.disabled)
 shell.room.roster[1].ready=true
 shell.show_page("room")
 await process_frame
 await process_frame
 start=button_named(shell,"开始本局")
 check("host ready action enabled and focused",start != null and not start.disabled and start.has_focus())
 shell.data.inSession=true
 shell.show_page("settings")
 await process_frame
 var escape=InputEventKey.new();escape.keycode=KEY_ESCAPE;escape.physical_keycode=KEY_ESCAPE;escape.pressed=true
 Input.parse_input_event(escape)
 await process_frame
 check("Escape settings returns to pause",shell.page == "pause")
 var emitted: Array=[]
 shell.action_requested.connect(func(name,_payload): emitted.append(name))
 Input.parse_input_event(escape)
 await process_frame
 check("Escape pause explicitly resumes",emitted.has("resume"))
 shell.room.variant="ffa"
 shell.room.result={"won":false,"players":[{"id":"self","nickname":"测试玩家","rank":2,"won":false,"kills":3,"deaths":4,"assists":1}],"teamScores":{"blue":0,"red":0}}
 shell.show_page("result")
 await process_frame
 var texts: Array=[]
 for item in shell.find_children("*","Label",true,false): texts.append(item.text)
 check("FFA shows real rank",texts.has("第 2 名"))
 check("FFA omits team score",not texts.any(func(text):return text.begins_with("蓝队")))
 var output=OS.get_environment("QS_NATIVE_CAPTURE_DIR")
 if not output.is_empty():
  DirAccess.make_dir_recursive_absolute(output)
  for page in ["lobby","loadout","pause","settings"]:
   shell.show_page(page)
   for i in range(4):await process_frame
   await RenderingServer.frame_post_draw
   root.get_texture().get_image().save_png(output.path_join("native-"+page+"-final.png"))
 check("menus do not create campus world",game.world_owner == null)
 game.preferences.values=previous
 game.preferences.apply(game.get_viewport(),false)
 if had_settings:
  var file=FileAccess.open(settings_path,FileAccess.WRITE)
  file.store_buffer(settings_bytes)
 else:DirAccess.remove_absolute(ProjectSettings.globalize_path(settings_path))
 var passed=checks.all(func(item):return item.passed)
 var result={"passed":passed,"checks":checks,"scope":"actual Godot UI/settings with controlled roster, no world or synthetic match evidence","viewport":[root.size.x,root.size.y]}
 var report_path=OS.get_environment("QS_NATIVE_INTERFACE_REPORT")
 if not report_path.is_empty():
  var report=FileAccess.open(report_path,FileAccess.WRITE)
  report.store_string(JSON.stringify(result))
 print(JSON.stringify(result))
 game.queue_free()
 await process_frame
 quit(0 if passed else 1)
func button_named(shell: Node,text: String) -> Button:
 for item in shell.find_children("*","Button",true,false):
  if item.text == text:return item
 return null
