# 齐盛Online 原生客户端

这是独立于网页发行的 **Godot原生客户端 Preview 0.1.0 候选版**，不是WebView包装。网页当前正式版为0.9.2。原生已完成团竞、混战各一局真实跨端检查及公网SDK创建房间验证；Windows、匿名演示与安卓内部包已生成；正式Windows首次GPU加载曾崩溃，随后检查通过但根因未明，因此不开放公网下载。旧M1发行和证据保留原编号。

## 当前状态

| 部分 | 实际状态 |
| --- | --- |
| 原生菜单与校园预览 | 已编码，Godot4.7.2 Windows x64真实窗口验证 |
| 完整校园内置 | 209个现有分块及原碰撞／导航／遮视身份已导出；运行时按附近区域驻留 |
| 账号与Colyseus消息 | 实际Windows原生与Chrome完整团竞／混战互通通过；正常公网SDK通过真实TLS创建私房，收到5条快照、0条拒收，测试账号已删除，未开始正式比赛 |
| 预测与竞技物理 | 4030步JS/Rust及真实Godot桥通过；INT/FLOAT检查点、delta解码和回放空姿态类型已修；两完整局及真实楼梯／授权观战短测通过，已批准native-preview生产连接 |
| Windows候选包 | 0.1.0已成包且资源、许可、独立EXE重试检查通过；首次0xC0000005仍未解释，保持内部；当前范围与证据见[接续状态](docs/PREVIEW-0.1.0.md)，旧M1包不是0.1.0 |
| Android内部APK | 参见[安卓构建](docs/android-build.md)；尚无安卓真机结果 |
| 游戏范围 | 校园步行、地图、设置、暂停；TDM／FFA七枪开镜与装填、道具、死亡、拾枪、复活、原席位重连及合格队友观战已验证；故事、摄影、驾驶、单人／合作尚未移植 |

先阅读本页，再阅读[网络与物理兼容](docs/network-compatibility.md)、[里程碑状态](docs/MILESTONE-M1.md)。网页与服务端仍是现有玩法和规则的权威来源。

## 工具与启动

- Godot **4.7.2 standard**，提交标识`ed1daf0bf`，Windows x64。`GODOT_BIN`可指定控制台程序；默认查找工作区`work/Godot-4.7.2/`。
- Node24用于资源导出和隔离协议检查，不是原生游戏运行时。
- Colyseus Godot SDK **0.18.7 beta**。运行`scripts/install-colyseus.ps1`准备固定版本及许可，原生二进制不随公开源码提交。
- 正式运动桥采用Rust **1.94.0**、Rapier **0.30.1**及godot-rust **0.5.5/API4.7**，构建及逐步对照见[运动桥](docs/physics-bridge.md)。工具链只放本项目`work/`。
- 没有正式素材时自动使用原创匿名演示地图；其身份不能加入正式房间。

在本目录运行：

```text
node scripts/run-godot.mjs --editor
node scripts/run-godot.mjs
node scripts/run-godot.mjs --headless -- --smoke
node scripts/run-godot.mjs --headless --script res://tests/native_network_smoke.gd
node scripts/test-network-live.mjs
```

`run-godot.mjs`将编辑器缓存／设置置于项目`work/`，不改用户现有Godot配置。Windows会话按API来源隔离并经DPAPI加密，实际同源/跨源/损坏检查已通过；密码不落盘。其他未支持平台仅留内存，不以明文回退。源码、演示与内部导出默认`http://127.0.0.1:2568`和`http://127.0.0.1:2567`；可通过`QS_NATIVE_API`、`QS_NATIVE_REALTIME`指定另一个本机测试地址。仅获批的`native-preview`导出配合正式地图默认使用官方同源服务；编辑器允许维护者显式验证精确官方地址，演示／内部导出不因此开放生产。没有启动本机API和房间服务时，网络页会给出失败提示，地图预览仍可使用。

## 正式校园导出

正式校园不属于公开源码内容。持有原素材的维护者可从游戏项目已验收的`public/map/manifest.json`与哈希索引导出：

```text
node scripts/export-campus.mjs --list
node scripts/export-campus.mjs --production
```

导出脚本使用游戏项目已锁定的glTF工具和Meshopt解码器。Godot不支持原文件的部分压缩／量化扩展，因而生成独立原生副本：解码、反量化、兼容的静态网格合并、按哈希共享图片；逐块检查变换前后世界包围范围误差不超过2毫米。原Blender、原GLB、原碰撞、原导航和网页发行不改变。碰撞三角形仅在原生副本中按64米网格分区。

完整地图随内部包提供，209块不会一次全部实例化。最多两个后台资源请求；当前视域附近必需块先就绪，其他块受数量和时间约束释放。Godot预览碰撞仅供匿名/本机预览；正式网络预测使用绑定原始碰撞数据的Rust Rapier桥，两套物理世界不会同时驱动同一角色。视觉关键遮挡就绪后才交接控制；实际驻留和自动档仍在定向优化。

## 打包与公开边界

准备经过官方校验的Windows／Android导出模板后：

```text
node scripts/export-windows.mjs
node scripts/export-windows.mjs --demo
powershell -NoProfile -File scripts/export-android.ps1
```

Windows为免安装内部目录包，EXE、PCK及原生扩展必须放在一起。Android仅arm64、Android10+内部签名；正式签名和真机验证未完成前不公开发布APK。

公开仓库可包含本目录的自有源码、原创演示地图、脱敏脚本与许可说明。不得包含`content/production/`、`content/combat/`、`bin/`、`runtime_licenses/`生成目录、`work/`、`dist/`、人物和校园素材、截图、原生SDK二进制、密码、Token、签名密钥或生产配置。不要用上传正式素材的方式解决演示缺失。

## 验证范围与下一步

Rust Rapier0.30.1正式运动桥的12组4030步与JavaScript0.19.3真实运动／碰撞对照通过，含南楼三段楼梯。实际Godot与Chrome完成TDM／FFA各600秒自然服务器计时，正常及100／200毫秒应用层延迟下普通校正P95为0，最大约0.257米；完整局使用受控交火区与明确标记的QA重定位，不等同于全校园自然实玩或真实TCP损伤测试。收尾短测完成真实楼梯输入路径、合格队友观战与敌方拒绝；实际GPU界面11项通过。

Windows候选接下来完成安装包资源、许可、演示隔离与实际EXE启动检查后才能公开。公网SDK检查证明TLS、创建与快照链路可用，不代表生产完整比赛或满员容量。安卓仍无机型、Keystore及真机结果，仅内部。性能测量包含限帧、双客户端与QA开销，不宣称所有设备稳定60帧。详见[同步修补与验证记录](docs/qa-runtime-repair-0.1.0.md)及[运动桥](docs/physics-bridge.md)。

©2026 OpenQS · 齐盛Online。自有源码MIT；Godot、Colyseus和素材遵循各自许可。详见[许可与素材边界](docs/LICENSES.md)。
