"""Check the internal APK boundary without extracting private game resources."""
import argparse
import hashlib
import json
from pathlib import Path
import struct
import zipfile

parser = argparse.ArgumentParser()
parser.add_argument("apk", type=Path)
parser.add_argument("--report", type=Path, required=True)
args = parser.parse_args()
with zipfile.ZipFile(args.apk) as archive:
    names = archive.namelist()
    forbidden = [name for name in names if name.startswith(("assets/private/", "assets/work/", "assets/docs/", "assets/tests/", "assets/scripts/")) or name.lower().endswith((".keystore", ".jks")) or "android-internal-signing" in name]
    if forbidden:
        raise SystemExit("Private or development files entered the APK")
    abis = {name.split("/")[1] for name in names if name.startswith("lib/") and name.endswith(".so")}
    if abis != {"arm64-v8a"}:
        raise SystemExit("Unexpected native architecture")
    sdk_names = [name for name in names if name.startswith("lib/") and "colyseus" in name and name.endswith(".so")]
    if len(sdk_names) != 1:
        raise SystemExit("Expected exactly one native Colyseus library")
    library = archive.read(sdk_names[0])
    if library[:6] != b"\x7fELF\x02\x01":
        raise SystemExit("Expected little-endian ELF64 native library")
    offset, = struct.unpack_from("<Q", library, 32)
    stride, count = struct.unpack_from("<HH", library, 54)
    alignment = []
    for index in range(count):
        pos = offset + index * stride
        if struct.unpack_from("<I", library, pos)[0] == 1:
            alignment.append(struct.unpack_from("<Q", library, pos + 48)[0])
    if not alignment or any(value < 16384 for value in alignment):
        raise SystemExit("Native library is not ready for 16 KiB pages")
    licenses = [name for name in names if name.startswith("assets/third_party_licenses/") and name.endswith(".txt")]
    if len(licenses) < 8 or "assets/LICENSES.txt" not in names:
        raise SystemExit("Native dependency license texts missing")
    manifest_name = "assets/content/production/map.json"
    if manifest_name not in names:
        raise SystemExit("Full campus manifest missing")
    manifest = json.loads(archive.read(manifest_name))
    if not manifest.get("chunks"):
        raise SystemExit("Campus chunk index missing")
    report = {"passed": True, "kind": "internal-native-apk", "entries": len(names), "architectures": sorted(abis), "colyseusLibrarySha256": hashlib.sha256(library).hexdigest(), "elfLoadAlignments": alignment, "privateOrDevelopmentEntries": 0, "licenseTexts": len(licenses), "campusChunks": len(manifest["chunks"]), "mapIdentity": manifest.get("mapIdentity"), "deviceVerified": False}
args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
print(json.dumps({key: value for key, value in report.items() if key != "mapIdentity"}, ensure_ascii=False))
