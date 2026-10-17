# 原生联机兼容状态

已编码：原生Godot HTTP账号登录、一次性票据与有界队列、Colyseus原生二进制消息、接收者完整／增量解码、动作序号、60 Hz采样／30 Hz发送、加载门禁、自动重连及取消释放。

账号Bearer仅进入HTTPS请求头，内存中保存；不写入连接URL、磁盘或日志。入场使用现有一次性服务器预留凭证。地图按现有五字段身份比较，不修改正式地图或服务器裁判。客户端只发送输入意图，不发送命中或伤害。

## 锁定依赖

- 官方Colyseus Godot SDK `godot-v0.18.7`（beta），提交 `dfb020586aff4c91c70518be33e3207af1bb18e4`。
- 官方归档SHA-256：`e7a0ecab03084c98033de55dfd03abb8336e02d0284af32025e53e6946f9510d`，96,889,245字节；使用 `scripts/install-colyseus.ps1` 安装，归档和原生二进制不纳入公开源码。
- 来源：[官方Godot文档](https://docs.colyseus.io/getting-started/godot)、[固定版本](https://github.com/colyseus/native-sdk/releases/tag/godot-v0.18.7)。SDK采用MIT，保留其许可。

## 碰撞和预测门禁

当前网页／服务器使用 `@dimforge/rapier3d-compat 0.19.3`。官方 `rapier.js/v0.19.3/Cargo.lock` 核对实际Rust Rapier为 **0.30.1**（crate校验和 `5bd27b8eb36d0833fa0f2aea40164fabfad0fc34b9932286ae9e84f3452f5364`），JavaScript包装与Rust版本不能混用。Godot Rapier插件当前 `v0.36.0` 依赖Rust Rapier `0.36.0`；未证明它与现有包装的控制器、支撑及安全路线查询一致，因此没有直接替换。依据：[网页包装固定锁文件](https://github.com/dimforge/rapier.js/blob/v0.19.3/Cargo.lock)、[Godot Rapier固定依赖](https://github.com/appsinacup/godot-rapier-physics/blob/v0.36.0/Cargo.toml)。

原生地图预览的CharacterBody只用于本机探索。原生联机会话仅允许环回测试服务，不接受正式房间或参榜；正式地图、协议和物理不得通过改标签绕过兼容校验。服务器权威快照可以驱动原生呈现，但不把它宣称为已经具有低延迟预测的正式客户端。

下一步需要基于Rust Rapier0.30.1固定依赖，实现同一胶囊控制器设置与移动状态机适配；用平地、台阶、门口、低顶、滑铲与动态接触的逐步位置／速度样本对照，再解除正式接入门禁。发布公开原生联机前还需真正完成正式逻辑互通、重连及真机验证。

## 验证入口

```text
Godot_v4.7.2-stable_win64_console.exe --headless --path <本项目> --script res://tests/native_network_smoke.gd
```

该检查已在Godot4.7.2 Windows headless通过19项真实GDScript／官方扩展检查，覆盖隐藏实体删除、乱序恢复、接口地址与版本门禁。`node scripts/test-network-live.mjs` 另以官方JavaScript0.18.5和Godot0.18.7 SDK连接同一个隔离Colyseus二进制房间，验证账号HTTP、预留席位、双方实体、移动输入及服务器开火结果（八次快照并收到移动与开火输入）。这是协议测试房间，不是正式Rapier世界。结果位于本机 `work/network-live-report.json`。

隔离运行发现官方0.18.7原生C返回封装额外保留一个room引用；适配器对固定版本归还这一个引用，并在离场时断开持有room的闭包，复测没有ObjectDB泄漏警告。不得对未知SDK版本沿用该补偿。

这些结果不替代正式物理、长局、Android真机或公网网络验证，不将“已编码”写成“已发布”。
