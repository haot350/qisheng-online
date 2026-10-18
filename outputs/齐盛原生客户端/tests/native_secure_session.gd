extends SceneTree
const SecureSession = preload("res://src/network/secure_session.gd")
const A := "https://session-a.invalid/api/v1"
const B := "https://session-b.invalid/api/v1"
const TOKEN := "synthetic-native-session-not-a-real-credential"
var checks: Array[String] = []
func _initialize() -> void:
 var extension = load("res://src/physics/qs_rapier.gdextension")
 if extension == null or not ClassDB.class_exists("QsRapierWorld"): fail("bridge unavailable"); return
 SecureSession.clear(A); SecureSession.clear(B)
 if not SecureSession.save_token(TOKEN, A): fail("save"); return
 var ciphertext = FileAccess.get_file_as_bytes(SecureSession.storage_path(A))
 if ciphertext.is_empty() or ciphertext.get_string_from_utf8().contains(TOKEN): fail("plaintext"); return
 if SecureSession.load_token(A) != TOKEN: fail("same-source restore"); return
 checks.append("same-source DPAPI restore")
 if not SecureSession.load_token(B).is_empty(): fail("cross-source restore"); return
 checks.append("different source has no session")
 var moved = FileAccess.open(SecureSession.storage_path(B),FileAccess.WRITE)
 moved.store_buffer(ciphertext); moved.close()
 if not SecureSession.load_token(B).is_empty() or FileAccess.file_exists(SecureSession.storage_path(B)): fail("forged storage source"); return
 checks.append("copied encrypted session source rejected")
 if not SecureSession.save_token(TOKEN+"-updated", A) or SecureSession.load_token(A) != TOKEN+"-updated": fail("replacement"); return
 checks.append("atomic replacement")
 if SecureSession.save_token("bad\nheader", A) or SecureSession.load_token(A) != TOKEN+"-updated": fail("header bounds"); return
 checks.append("invalid token preserves valid session")
 var broken = FileAccess.open(SecureSession.storage_path(A),FileAccess.WRITE)
 broken.store_buffer(PackedByteArray([1,2,3,4])); broken.close()
 if not SecureSession.load_token(A).is_empty() or FileAccess.file_exists(SecureSession.storage_path(A)): fail("corruption"); return
 checks.append("corrupt entry removed")
 SecureSession.clear(A); SecureSession.clear(B)
 var report = {"passed":true,"platform":OS.get_name(),"checks":checks,"method":"actual Windows DPAPI, synthetic credentials, no network"}
 var output = FileAccess.open("res://work/secure-session-report.json",FileAccess.WRITE)
 if output: output.store_string(JSON.stringify(report,"  "))
 print(JSON.stringify(report)); quit(0)
func fail(message: String) -> void:
 SecureSession.clear(A); SecureSession.clear(B)
 push_error("secure-session: "+message); quit(1)
