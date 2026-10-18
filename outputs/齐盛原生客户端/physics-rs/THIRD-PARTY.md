# Physics extension dependencies

The OpenQS bridge and movement port are MIT licensed. No Godot or Rapier source is modified.

| Dependency | Locked version | License and source |
| --- | --- | --- |
| godot-rust / gdext | 0.5.5, API 4.7 | MPL-2.0; [source tag](https://github.com/godot-rust/gdext/tree/v0.5.5), full text in `licenses/godot-rust-MPL-2.0.txt` |
| Rapier3D | 0.30.1 | Apache-2.0; [source tag](https://github.com/dimforge/rapier/tree/v0.30.1), full text in `licenses/Rapier-Apache-2.0.txt` |
| Parry3D / nalgebra | 0.25.3 / 0.34.1 | Apache-2.0 / BSD-3-Clause; matching crate versions recovered from the installed JavaScript WASM package |
| Serde / serde_json | Exact resolution in Cargo.lock | MIT OR Apache-2.0; https://serde.rs/ |
| windows-sys | 0.61.2 | MIT OR Apache-2.0; https://github.com/microsoft/windows-rs |

`Cargo.lock` retains checksums for transitive dependencies. The native build uses the ordinary scalar/f32 Rapier feature set, matching `@dimforge/rapier3d-compat` 0.19.3; it does not substitute the deterministic/SIMD distribution. The local build toolchains are not copied to installation packages or the public source repository.

MPL-covered library source remains available at the fixed upstream release above. Modified application files do not replace or remove those notices.
