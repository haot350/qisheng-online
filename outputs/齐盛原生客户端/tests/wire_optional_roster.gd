extends SceneTree
const Decoder=preload("res://src/network/wire_decoder.gd")
func _initialize() -> void:
 var decoder=Decoder.new()
 var full={"wireVersion":1,"kind":"full","seq":1,"roomId":"room","viewerId":"self","room":{"roomId":"room","protocolVersion":"campus-mp-0.9.0","tick":1},"self":{"id":"self"},"roster":[{"id":"self","nickname":"匿名"}],"players":[],"npcs":[],"events":[],"eventSerial":0}
 assert(not decoder.accept(full).is_empty())
 var delta={"wireVersion":1,"kind":"delta","seq":2,"baseSeq":1,"roomId":"room","viewerId":"self","room":{"set":{"tick":2}},"self":{},"players":{"upsert":[],"remove":[]},"npcs":{"upsert":[],"remove":[]},"roster":PackedByteArray([0]),"events":[{"serial":1,"type":"shot"}],"eventSerial":1}
 var result=decoder.accept(delta)
 assert(not result.is_empty() and decoder.sequence == 2 and result.roster.size() == 1 and result.events.size() == 1)
 delta.seq=3;delta.baseSeq=2;delta.roster=PackedByteArray([1])
 assert(decoder.accept(delta).is_empty() and decoder.last_error == "roster" and decoder.sequence == 2)
 delta.roster=[{"id":"self","nickname":"已修改"}]
 assert(decoder.accept(delta).roster[0].nickname == "已修改")
 print(JSON.stringify({"checks":4,"passed":true,"coverage":"baseline, native undefined roster sentinel, invalid binary rejection, real roster update"}))
 quit()
