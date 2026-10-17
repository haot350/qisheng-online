"""Set supported SDK levels in a prebuilt Godot APK before zipalign/signing.

Only the two integer values of uses-sdk are modified. All archive entries and
resource payloads are retained; obsolete JAR signatures are removed for resigning.
"""
from __future__ import annotations

import argparse
import hashlib
import json
from pathlib import Path
import re
import struct
import zipfile


def string_pool(data: bytearray, start: int) -> list[str]:
    header_size = struct.unpack_from("<H", data, start + 2)[0]
    count, _, flags, strings_start = struct.unpack_from("<IIII", data, start + 8)
    result = []
    for index in range(count):
        offset = struct.unpack_from("<I", data, start + header_size + index * 4)[0]
        pos = start + strings_start + offset
        if flags & 0x100:
            # UTF-8 pool stores both UTF-16 code-unit length and byte length.
            def read_length(at: int) -> tuple[int, int]:
                first = data[at]
                return (((first & 0x7F) << 8) | data[at + 1], at + 2) if first & 0x80 else (first, at + 1)
            _, pos = read_length(pos)
            length, pos = read_length(pos)
            result.append(bytes(data[pos:pos + length]).decode("utf-8"))
        else:
            length = struct.unpack_from("<H", data, pos)[0]
            pos += 2
            if length & 0x8000:
                length = ((length & 0x7FFF) << 16) | struct.unpack_from("<H", data, pos)[0]
                pos += 2
            result.append(bytes(data[pos:pos + length * 2]).decode("utf-16-le"))
    return result


def set_sdk_levels(raw: bytes, minimum: int, target: int, changes: list | None = None) -> bytes:
    data = bytearray(raw)
    if len(data) < 8 or struct.unpack_from("<H", data)[0] != 3:
        raise ValueError("Expected Android binary XML")
    offset = struct.unpack_from("<H", data, 2)[0]
    strings: list[str] = []
    patched: set[str] = set()
    allowed_offsets: set[int] = set()
    while offset + 8 <= len(data):
        kind, header_size, size = struct.unpack_from("<HHI", data, offset)
        if size < header_size or size < 8 or offset + size > len(data):
            raise ValueError("Invalid binary XML chunk")
        if kind == 1:
            strings = string_pool(data, offset)
        elif kind == 0x102:
            extension = offset + header_size
            name = struct.unpack_from("<I", data, extension + 4)[0]
            if name < len(strings) and strings[name] == "uses-sdk":
                attr_start, attr_size, attr_count = struct.unpack_from("<HHH", data, extension + 8)
                if attr_size < 20:
                    raise ValueError("Invalid uses-sdk attribute size")
                for index in range(attr_count):
                    attr = extension + attr_start + index * attr_size
                    if attr + 20 > offset + size:
                        raise ValueError("Truncated uses-sdk attribute")
                    name_index = struct.unpack_from("<I", data, attr + 4)[0]
                    key = strings[name_index] if name_index < len(strings) else ""
                    if key in ("minSdkVersion", "targetSdkVersion"):
                        if key in patched:
                            raise ValueError("Duplicate uses-sdk attribute")
                        before = struct.unpack_from("<I", data, attr + 16)[0]
                        after = minimum if key == "minSdkVersion" else target
                        if changes is not None:
                            changes.append({"attribute": key, "before": before, "after": after, "valueOffset": attr + 16})
                        allowed_offsets.update(range(attr + 8, attr + 12))
                        allowed_offsets.add(attr + 15)
                        allowed_offsets.update(range(attr + 16, attr + 20))
                        struct.pack_into("<I", data, attr + 8, 0xFFFFFFFF)
                        data[attr + 15] = 0x10  # TYPE_INT_DEC
                        struct.pack_into("<I", data, attr + 16, minimum if key == "minSdkVersion" else target)
                        patched.add(key)
        offset += size
    if patched != {"minSdkVersion", "targetSdkVersion"}:
        raise ValueError("Expected exactly one minimum and target SDK attribute")
    if any(a != b and offset not in allowed_offsets for offset, (a, b) in enumerate(zip(raw, data))):
        raise ValueError("Unexpected manifest changes outside the two SDK attributes")
    return bytes(data)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("input", type=Path)
    parser.add_argument("output", type=Path)
    parser.add_argument("--min-sdk", type=int, default=29)
    parser.add_argument("--target-sdk", type=int, default=35)
    parser.add_argument("--report", type=Path)
    args = parser.parse_args()
    if args.input.resolve() == args.output.resolve():
        parser.error("Write to a separate unsigned archive")
    if args.min_sdk < 29 or args.target_sdk < args.min_sdk:
        parser.error("Invalid supported platform range")
    signature = re.compile(r"^META-INF/(?:MANIFEST\.MF|[^/]+\.(?:SF|RSA|DSA|EC))$", re.I)
    changes: list = []
    report = {"minimumSdk": args.min_sdk, "targetSdk": args.target_sdk, "changes": changes, "payloadEntriesPreserved": 0, "discardedOldSignatures": []}
    with zipfile.ZipFile(args.input) as source, zipfile.ZipFile(args.output, "w", allowZip64=True) as target:
        for info in source.infolist():
            if signature.fullmatch(info.filename):
                report["discardedOldSignatures"].append(info.filename)
                continue
            data = source.read(info.filename)
            if info.filename == "AndroidManifest.xml":
                original = data
                data = set_sdk_levels(data, args.min_sdk, args.target_sdk, changes)
                report.update({"manifestSha256Before": hashlib.sha256(original).hexdigest(), "manifestSha256After": hashlib.sha256(data).hexdigest(), "changedByteCount": sum(a != b for a, b in zip(original, data))})
            else:
                report["payloadEntriesPreserved"] += 1
            target.writestr(info, data)
    if args.report:
        args.report.write_text(json.dumps(report, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"Android SDK manifest prepared: API {args.min_sdk}+ / target {args.target_sdk}; unsigned archive requires alignment and signing.")


if __name__ == "__main__":
    main()
