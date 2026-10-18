# 原生正式运动桥

记录：2026-10-18。此页区分独立运动样本、Godot调用和正式跨端比赛；前两项通过不能代替后一项。

## 已编码

- 独立Rust GDExtension：Godot负责显示与输入，竞技胶囊不再同时交给Godot `move_and_slide`解算。
- 固定Godot4.7.2、gdext0.5.5/API4.7、Rapier3D0.30.1/f32普通标量特性；Parry0.25.3与nalgebra0.34.1直接从实际JavaScript WASM嵌入源码路径核对并锁定。保留Cargo锁及上游许可。
- 原始碰撞二进制按原位置/索引构造单一trimesh，启用`FIX_INTERNAL_EDGES`；不采用预览64米碰撞分区代替正式世界。
- 移植当前共享的60Hz运动、冲刺/体力、蹲起净空、跳跃、滑铲、台阶、支撑、安全路线、路缘抬升、失足安全点与队友穿透。高层计算继续双精度，物理调用转换f32，避免额外累积量化。
- `export-movement-rules.mjs`直接导入canonical TS规则生成Rust常量，并保存5份来源源码SHA256。构建前重新生成；没有手动平衡分叉。
- `QsRapierWorld`提供碰撞导入、角色增删、权威检查点恢复、逐步运动、获准动态姿态、静态射线及支撑查询。隐藏/离开的远端从独立碰撞集合移除；本机角色不被远端替换操作删除。
- Windows令牌使用当前系统用户DPAPI保护；密码不持久化。其他平台没有安全实现时返回空，不降级为明文保存。

## 已验证

1. Windows本地Rust1.94.0 GNU和官方LLVM-MinGW20261006实际构建release DLL；不修改系统PATH或安装系统级编译器。
2. 12组4030步canonical JavaScript真实`SimWorld`/`stepMotion`与Rust逐步对照通过。包含冲刺耗尽/恢复、跳跃/滑铲、蹲起低顶、斜向墙角、敌人碰撞、队友穿透、合成台阶、校园入口/南楼走廊及真实1→2、2→3、3→4层楼梯。
3. 样本最大位置误差`7.11e-15`米；速度、支撑、蹲伏、冲刺、滑铲、体力、耗尽标志、恢复/滑铲计时与垂直速度均通过。每组从中段权威检查点倒回重放也通过，最大重放误差`7.11e-15`米，低于5毫米排查线。三条真实楼梯确实到达下一层，不是原地阻挡样本。
4. 实际Godot4.7.2加载Windows DLL并运行360步，输出误差小于`1e-8`米；合成令牌DPAPI加密/解密通过。此测试不使用正式会话或真实密码。
5. Android arm64同源桥已编译，ELF全部LOAD为16KiB对齐，仅依赖系统libc/libdl/libm；Windows桥仅依赖系统DLL，不要求额外安装VC或MinGW运行库。这是构建检查，不代表安卓真机运行已通过。

本机详细样本与报告在未跟踪的`work/movement-fixtures/`。正式地图字节、轨迹坐标和安装包不上传GitHub。公开源只含规则导出脚本、匿名合成场景生成器、源码哈希和接口代码。

## 构建与检查

在原生项目目录执行：

```text
node scripts/prepare-rust-toolchain.mjs
node scripts/build-rust.mjs build --release --locked
node scripts/export-movement-fixtures.mjs
node scripts/build-rust.mjs run --release --locked --bin trace-parity -- ../work/movement-fixtures
node scripts/run-godot.mjs --headless --script res://scripts/test-rust-bridge.gd
```

持有正式素材时，夹具导出加`--production`，它读取已有原始collision.bin并只在`work/`生成副本。正式素材未提供时不伪造校园验证。

Android桥独立构建：

```text
node scripts/prepare-rust-android.mjs
node scripts/build-rust.mjs build --release --locked --target aarch64-linux-android
```

固定NDKr28c、API29/arm64；归档按官方仓库校验值验证。构建输出及SDK置于`work/`与`bin/`，不进入公开源码。Android设备验证状态由独立客户端报告记录。

每个平台在成功构建并核对安装字节后独立记录`work/physics-build-windows.json`或`work/physics-build-android.json`。发行前`verify-physics-artifact.mjs windows|android`快速核对Rust源码、锁、生成规则、当前canonical TS和WASM以及DLL/SO哈希；旧桥不能仅因文件存在就通过。编译中源码变更会拒绝盖章。`--no-copy`可在客户端运行时检查构建，但只有现有安装字节与成功产物完全相同才写收据。含空格的克隆路径使用编码参数，不通过按空白拆分的`RUSTFLAGS`传递运行库路径。

## 尚需分别放行

静态逐步运动验证已通过。动态历史与服务器时间轴、完整枪战、两种对战各一局、网络校正、加载门禁与原生安装包需由客户端验收记录补齐；未通过前正式入口门禁保持。Android无真机就保持内部包，不把Windows结果写成Android通过。

## 2026-10-18 权威检查点的数值类型

真实Colyseus/MsgPack会分别传递整数和浮点数；Godot Variant 的严格浮点转换不会自动接受INT。桥的坐标、速度、输入、体力、计时及滑铲方向现统一接受有限i64/f64，拒绝非有限数和错误类型；否则可能只恢复部分坐标轴。Windows DLL已重编，实际Godot五项检查通过（混合检查点、运动状态、错误数值、整数远端姿态、整数输入等价）。该修补不改运动参数；原4030步纯规则证据保留。Android旧库需用新源码重编后才可导出；不能复用旧收据。完整跨端门槛仍独立执行。
