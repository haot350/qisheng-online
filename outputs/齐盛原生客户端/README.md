# 齐盛Online 原生客户端

这是独立于网页0.9.0发行的 **Godot原生技术样板M1**，不是WebView包装。当前保持内部阶段，不能替代正式游戏，也不能接入正式房间或提交成绩。

## 当前状态

| 部分 | 实际状态 |
| --- | --- |
| 原生菜单与校园预览 | 已编码，Godot4.7.2 Windows x64真实窗口验证 |
| 完整校园内置 | 209个现有分块及原碰撞／导航／遮视身份已导出；运行时按附近区域驻留 |
| 账号与Colyseus消息 | 已编码；官方原生扩展与JavaScript SDK在隔离环回房间互通通过 |
| 预测与竞技物理 | 未通过一致性；正式网络入口被代码门禁阻止 |
| Windows内部包 | 参见[里程碑状态](docs/MILESTONE-M1.md)的实际导出结果 |
| Android内部APK | 参见[安卓构建](docs/android-build.md)；尚无安卓真机结果 |
| 故事、驾驶、完整枪战表现 | 尚未移植 |

先阅读本页，再阅读[网络与物理兼容](docs/network-compatibility.md)、[里程碑状态](docs/MILESTONE-M1.md)。网页与服务端仍是现有玩法和规则的权威来源。

## 工具与启动

- Godot **4.7.2 standard**，提交标识`ed1daf0bf`，Windows x64。`GODOT_BIN`可指定控制台程序；默认查找工作区`work/Godot-4.7.2/`。
- Node24用于资源导出和隔离协议检查，不是原生游戏运行时。
- Colyseus Godot SDK **0.18.7 beta**。运行`scripts/install-colyseus.ps1`准备固定版本及许可，原生二进制不随公开源码提交。
- 没有正式素材时自动使用原创匿名演示地图；其身份不能加入正式房间。

在本目录运行：

```text
node scripts/run-godot.mjs --editor
node scripts/run-godot.mjs
node scripts/run-godot.mjs --headless -- --smoke
node scripts/run-godot.mjs --headless --script res://tests/native_network_smoke.gd
node scripts/test-network-live.mjs
```

`run-godot.mjs`将编辑器缓存／设置置于项目`work/`，不改用户现有Godot配置。账号会话只留内存，密码不落盘。隔离网络默认为`http://127.0.0.1:2568`和`http://127.0.0.1:2567`；可通过`QS_NATIVE_API`、`QS_NATIVE_REALTIME`指定另一个本机测试地址。没有启动对应API和房间服务时，网络页会给出失败提示，地图预览仍可使用。

## 正式校园导出

正式校园不属于公开源码内容。持有原素材的维护者可从游戏项目已验收的`public/map/manifest.json`与哈希索引导出：

```text
node scripts/export-campus.mjs --list
node scripts/export-campus.mjs --production
```

导出脚本使用游戏项目已锁定的glTF工具和Meshopt解码器。Godot不支持原文件的部分压缩／量化扩展，因而生成独立原生副本：解码、反量化、兼容的静态网格合并、按哈希共享图片；逐块检查变换前后世界包围范围误差不超过2毫米。原Blender、原GLB、原碰撞、原导航和网页发行不改变。碰撞三角形仅在原生副本中按64米网格分区。

完整地图随内部包提供，209块不会一次全部实例化。最多两个后台资源请求；当前视域附近必需块先就绪，其他块受数量和时间约束释放。碰撞三角形只用于本机预览，**不能视为已证明与Rapier控制器等价**。

## 打包与公开边界

准备经过官方校验的Windows／Android导出模板后：

```text
node scripts/export-windows.mjs
node scripts/export-windows.mjs --demo
powershell -NoProfile -File scripts/export-android.ps1
```

Windows为免安装内部目录包，EXE、PCK及原生扩展必须放在一起。Android仅arm64、Android10+内部签名；正式签名和真机验证未完成前不公开发布APK。

公开仓库可包含本目录的自有源码、原创演示地图、脱敏脚本与许可说明。不得包含`content/production/`、`work/`、`dist/`、人物和校园素材、截图、原生SDK二进制、密码、Token、签名密钥或生产配置。不要用上传正式素材的方式解决演示缺失。

## 下一步

先实现并对照 **Rust Rapier0.30.1** 与现有JavaScript0.19.3包装的胶囊控制器、支撑／通路查询、60Hz移动和重放；通过正式逻辑样本后才能解除本机联机门禁。随后补齐原生枪械／任务表现、平台输入与存储、安全登录持久化，再扩大到其他模式。

©2026 OpenQS · 齐盛Online。自有源码MIT；Godot、Colyseus和素材遵循各自许可。详见[许可与素材边界](docs/LICENSES.md)。
