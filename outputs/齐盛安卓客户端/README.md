# 齐盛Online · 安卓应用

新安卓产品使用Kotlin与AndroidX WebKit宿主，复用网页版完整游戏源码、WASM物理、地图和联网协议。它与已退役Godot工程分别维护。首版为内部测试，暂不提供公开下载，也没有真机性能通过结论。

- 应用：`com.liuframe.qishengonline`，产品：`qisheng-online-android`。
- 应用版本0.1.0／versionCode1；Android10+、64位ARM。游戏内容版本以内部交付记录为准。
- 校园、人物、声音与其他当前资源随APK提供；账号、榜单、小齐、运营配置和联机仍需网络。
- 同一账号可登录网页或安卓，应用会话单独保存在Keystore保护的存储中。网页本机相册、存档和设置不会自动扫描或搬运。

## 构建

1. `node scripts/prepare-tools.mjs`校验官方Gradle8.9，并只读复用既有SDK35／JDK17。
2. `node scripts/prepare-bundle.mjs --web-dist <本轮已通过的游戏dist>`构建Android入口overlay、精确资源清单和原生许可目录。它不修改网页dist，不重新导出模型。
3. `node scripts/build-internal.mjs`编译并生成签名内部APK。签名只读本工程`private/`，该目录不进入发行包或公开仓库。
4. `python scripts/verify-apk.py <APK> --report work/apk-audit.json`复核安装包中每项资源的字节与SHA256。

其他开发环境可以用`prepare-tools.mjs --jdk <JDK17目录> --sdk <Android SDK目录>`，或设置`JAVA_HOME`／`ANDROID_HOME`。需要已安装Platform35和Build-Tools35.0.1；公开源码不含SDK、校园美术或签名。完整正式应用由私有素材构建，不将网页演示包误作正式APK。

Windows构建使用自动派生的ASCII工作目录`work/android-online-build/host`；权威源码仍在本目录。地图资源直接引用已接受dist，不维护第二套模型源文件。原始几何／WASM可由APK压缩，音频和预压缩资源保持直接访问。`.gz`使用APK内部`.qsgz`别名，URL、gzip字节及权威哈希保持原样。

## 运行边界

应用按正式域名提供本地资源，只向原有API和WSS发送动态请求。完整随包资源不再复制到浏览器192MiB地图缓存；缺失或损坏的随包资源明确失败，不从线上拼入另一批地图。版本更新采用完整签名APK，经玩家确认下载和安装。

系统返回复用游戏导航；后台清空操作并暂停本人，回到前台后由玩家继续。原生文件导出只向玩家选择的位置写入；本机相册仍由游戏存储管理。版权页沿现有阅读组件展示实际原生运行依赖与许可。

WebView仍承担JS与WebGL运行，APK安装本身不等于帧率提高。首次内部包须在后续真机检查启动、触屏、中文、键盘、文件选择、音频焦点、后台、断网和跨端联机；实测后再决定公开。网页部署和运营设置由网页发行流程独立处理。

## 公开源码构建边界

当前辅助打包脚本以Windows为宿主；没有宣称已通过Linux APK安装或运行测试。其他环境可用JDK17、Android SDK35和Gradle8.9直接执行`:app:testReleaseUnitTest :app:assembleRelease`编译宿主，完整可玩应用还需要独立授权的网页正式资源。未制作匿名安卓资源包，浏览器匿名演示沿根README运行。

公开Manifest使用本模块原创占位向量图标；正式Logo、校园、人物、音乐和签名不随源码授权。内部APK的构建、离线资源检查与真机可用性分别记录，尚未开放公开下载。
