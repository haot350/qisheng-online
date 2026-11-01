# 齐盛Online Android 接续

## 0.2.1已公开

2026-11-01发布0.2.1／versionCode 3，内置网页0.11.1并沿用既有应用身份和升级签名。B方向页面重新校准：菜单与实际游玩分开，桌面和移动布局分别组织，账号、选装、房间、设置、摄影与相册保留真实功能。

本轮Release构建、2846项资源URL哈希、Manifest、同证书签名和16KiB对齐检查通过。没有新增真机安装、输入法、多指、旋转、后台、文件导出或覆盖更新验证，deviceVerified保持false；本次发布授权不等于取得这些运行结果，也不沿用旧版豁免作为新版实测。

源码职责、构建步骤与后续设备检查顺序见下文。私有资源和签名独立保存；公开源码不包含APK、正式校园及人物素材。本轮不据WebView封装或浏览器短查声称性能优势。

## 0.2.0历史记录

# 安卓0.2.0已公开

2026-11-01与网页0.11.0同批发布，静态发行20261101T072503Z-0.11.0。最终SHA b1b6de77a4dda2afa923397d46adf0aff13839f1118c0c80db0f23c7c325bcda；签名与资源核验通过，当前运行子项按用户明确授权不重复。实际公开收据见dist/publication.json，候选接收记录继续保留，不改写为本轮真机通过。

# 齐盛Online Android 接续

当前0.2.0（versionCode2）最终公开预览包，`com.liuframe.qishengonline`，与网页0.11.0同批发布中。最终清单由网页负责人激活，本记录不代替公网发布结果。

2026-11-01最终包补齐Noto完整OFL后重新签名，未改变功能或版本。嵌入房间操作栏修补后的网页0.11.0及B界面；APK362,301,274字节，SHA256`b1b6de77a4dda2afa923397d46adf0aff13839f1118c0c80db0f23c7c325bcda`。Release编译及5项Kotlin用例、2739项资源URL哈希、Manifest、原证书连续性及16KiB对齐通过。旧f4包保留在dist/intermediate-before-ofl，仅用于差异传输或历史核对，不作为最终发行。

用户明确授权沿用上版本测试结论、本版不重复四项运行子检查并公开。因此本轮`deviceVerified=false`，安装升级、菜单生命周期、账号导出、跨端实玩四项为waived，不伪造通过或机型。授权文件绑定实际最终APK、源码、Bundle和证书哈希；包安全检查不可豁免。task/android-tools/ACCEPTED-ENTRY.json已本地接收，生成时uploaded=false、activated=false。

统一`release-config.json`、显式`system.presentation`与开局有界等待横屏已接入。签名缺失不生成替代；源码摘要覆盖宿主、网页src、vendor和锁，并绑定Bundle与地图。两站安卓卡等待真实清单，旧Godot策略与UE入口保持。task/android-tools发布策略7项合成用例通过，包括精确授权绑定与许可证不可豁免的拒绝分支。

2026-10-31已完成首个签名内部包，嵌入网页0.10.2、地图`20e8e9c5…32aa6`及`campus-mp-0.9.4`。安装包357,142,500字节；完整SHA256、公开签名证书指纹和时间在`dist/internal-release.json`。4项Release宿主用例及5项共享适配用例通过；2685项资源URL逐项校验通过。APK的AndroidX编译产物另有两项基线性能profile，已单独列出哈希。

## 源码职责

- Kotlin宿主：精确URL路由、输入生命周期、系统返回、安全区与方向、音频焦点、Keystore会话、文件导出、菜单内更新确认。
- 网页候选：完整玩法、摄影、驾驶、NPC、联网及UI；专用`android-entry.ts`先完成原生初始化，再加载相同页面入口。
- 打包脚本：以接受的网页dist为只读资源来源，生成少量入口overlay、版权目录和资源清单。APK中的gzip采用`.qsgz`实体，原URL与哈希不变。

`private/`保存独立签名，应用更新沿用该签名；旧Godot源码、包和签名仍退役留档。SDK／JDK是只读工具来源，不接管旧产品。

## 构建与验证

先读README。工具版本在`toolchain-lock.json`；实际依赖锁在`app/gradle.lockfile`。Windows宿主和Gradle缓存使用`work/android-online-build/`的ASCII派生目录，避免关闭AGP路径检查；模型不复制到该源码目录。

历史0.1.0包、SHA256和公开签名证书指纹见`dist/internal-release.json`；新0.2.0构建完成后输出`dist/release-candidate.json`，不包含私钥或密码。离线APK资源检查、Manifest与签名证据保存在`work/`，本轮进展见`work/studio/web/v0.11.0/android-tools/IMPLEMENTATION.md`。

编译、离线校验与用户授权分别记录。本轮没有启动设备或重新运行四项运行检查；按用户本次明确授权接收，不据此声称取得新的帧率、触控或跨端实测。普通后续版本的真机接收路径保持原要求，不因本次授权整体放宽。

更新提示只验证服务端清单的产品、版本、地址和声明哈希，经确认交系统浏览器下载；本版不在应用内下载或校验实际APK字节。完整APK安装仍由安卓系统检查签名，后续升级必须保留本工程签名。签名材料不随交付源码或APK提供。

内部包保留当前网页全部内容与资源，不代表各功能已经通过安卓运行验收。WebView仍负责JavaScript、WASM和WebGL，首包没有相对Chrome帧率提升的实测结论。正式Logo PNG由私有素材流程填入；公开匿名源码可将Manifest图标映射至已有`ic_qisheng`向量，不上传正式Logo。

## 后续检查顺序

1. 启动、离线资源与首屏；验证缺失资源不会从公网拼入新图。
2. 登录／退出／重启后的会话，账号页返回和私密材料隔离。
3. 各模式进入、照片与故事存档导入导出、系统返回、输入法、安全区、方向和音频。
4. 网页与安卓同房移动、射击、重连及地图身份。
5. 同机同路线对照Chrome与APK，分别测入场、P95、最长帧、内存及发热；再决定原生热点优化。
