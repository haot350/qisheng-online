# 原生客户端维护边界

- 先读根`docs/HANDOFF.md`、本目录README和`docs/MILESTONE-M1.md`。本样板与网页发行独立，不能把环回协议测试称为正式联机或物理通过。
- Godot4.7.2 standard、Colyseus Godot0.18.7固定；JavaScript Rapier0.19.3实际核心是Rust0.30.1。换成Godot默认物理或当前Rapier插件不构成等价。
- `src/map/local_preview_controller.gd`只供本机预览；联网控制不能依赖它的碰撞结果提交位置。`compatibility_gate.gd`未通过前只准本机隔离服务，不可改标签接入正式房间／排名。
- 正式资源只能由`export-campus.mjs --production`生成独立副本，验证源哈希；原模型、碰撞、导航和网页地图保持不变。演示身份与正式身份分离。
- SDK二进制、正式素材、录屏、签名、密码、凭据、测试会话、工具链和输出目录不得进入GitHub。公开源码用原创演示场景，保留第三方许可。
- 变更后短测对应GDScript／实际导出，不重复网页长局。Android无真实设备就明确记录未验证，不能把窗口模拟当真机。
- 在本目录状态文档记录已编码／已验证／未完成；根HANDOFF由协调者统一更新。不得自行改网页正式版本或服务器部署。
