# 齐盛Online · 安卓应用

新安卓产品使用Kotlin与AndroidX WebKit宿主，复用网页版完整游戏源码、WASM物理、地图和联网协议。它与已退役Godot工程分别维护。当前0.2.0公开预览版正与网页0.11.0同批发布，沿用既有升级签名；0.1.0内部历史保留。

- 应用：`com.liuframe.qishengonline`，产品：`qisheng-online-android`。
- 应用版本0.2.0／versionCode2；Android10+、64位ARM。本包游戏内容版本0.11.0。
- 校园、人物、声音与其他当前资源随APK提供；账号、榜单、小齐、运营配置和联机仍需网络。
- 同一账号可登录网页或安卓，应用会话单独保存在Keystore保护的存储中。网页本机相册、存档和设置不会自动扫描或搬运。

## 构建

1. `node scripts/prepare-tools.mjs`校验官方Gradle8.9，并只读复用既有SDK35／JDK17。
2. `node scripts/prepare-bundle.mjs --web-dist <本轮已通过的游戏dist>`构建Android入口overlay、精确资源清单和原生许可目录。它不修改网页dist，不重新导出模型。
3. `node scripts/build-apk.mjs`编译并生成签名候选APK。版本、渠道及内部标志由`release-config.json`统一提供；签名只读本工程`private/`，缺少既有升级签名即停止，不重新生成。
4. `python scripts/verify-apk.py <APK> --report work/apk-audit.json`复核安装包中每项资源的字节与SHA256。

其他开发环境可以用`prepare-tools.mjs --jdk <JDK17目录> --sdk <Android SDK目录>`，或设置`JAVA_HOME`／`ANDROID_HOME`。需要已安装Platform35和Build-Tools35.0.1；公开源码不含SDK、校园美术或签名。完整正式应用由私有素材构建，不将网页演示包误作正式APK。

Windows构建使用自动派生的ASCII工作目录`work/android-online-build/host`；权威源码仍在本目录。地图资源直接引用已接受dist，不维护第二套模型源文件。原始几何／WASM可由APK压缩，音频和预压缩资源保持直接访问。`.gz`使用APK内部`.qsgz`别名，URL、gzip字节及权威哈希保持原样。

## 运行边界

应用按正式域名提供本地资源，只向原有API和WSS发送动态请求。完整随包资源不再复制到浏览器192MiB地图缓存；缺失或损坏的随包资源明确失败，不从线上拼入另一批地图。版本更新采用完整签名APK，经玩家确认下载和安装。

系统返回复用游戏导航；后台清空操作并暂停本人，回到前台后由玩家继续。屏幕方向、会话归属和保持唤醒分别传递，房间准备可竖屏，开局后的世界与暂停仍横屏；更新提示在持有对局席位时延后。原生文件导出只向玩家选择的位置写入；本机相册仍由游戏存储管理。版权页沿现有阅读组件展示实际原生运行依赖与许可。

WebView仍承担JS与WebGL运行，APK安装本身不等于帧率提高。后续性能优化应按相同设备、路线与画质比较加载、帧时间、内存和发热。网页部署和运营设置由网页发行流程独立处理。

`public-preview`为本包渠道，公开可用状态由最终更新清单激活，版本标签不自动开放下载。资源与许可逐项校验后，以不可变归档和原子清单发行。更新经确认交系统浏览器下载完整APK；本版不在应用内校验下载文件字节，安装签名由安卓系统检查。
