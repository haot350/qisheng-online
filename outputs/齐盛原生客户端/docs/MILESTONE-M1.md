# M1 内部样板状态

记录日期：2026-10-17。此文只记录原生样板，网页0.9.0的发布状态见根HANDOFF；二者不互相替代验收。

## 已实现与已验证

- 官方Godot4.7.2 standard Windows x64，`4.7.2.stable.official.ed1daf0bf`。编辑器归档86,013,866字节，官方SHA512：`83decd58fdf67b9d657958a1ae6bf1929c20785315a81effe245874cdc57acb709bf868e00778a96984338c1b29dafdb453c6847747694621c6ecf5da2259993`。
- 官方同版导出模板归档SHA512：`ca4d71c4d7b81dfc15d1a98baa07534aa95b03fdda78a0075b06672e1648d2e5f40980c9adc28d23e1b92e732ee7bf3461997aa804af74ec2fcd7a93ccb84079`，完整校验后只取本轮需要的平台模板。
- 独立原生页面、窗口／全屏、画质、返回菜单、鼠标观察、触屏归属及取消；未嵌入网页。
- 现有校园209块全部生成原生副本并通过源哈希和包围范围检查。原始校园模型数据84,109,876字节；解码副本与图片共享，压缩体积不能直接与原文件比较。
- 实际Windows原生GUI已呈现校园建筑、窗户、树木及地面。启动附近129块、17个碰撞分区在headless烟测达到就绪；不是只打开了菜单。
- NVIDIA RTX4070 Laptop GPU／OpenGL3.3真实窗口截图，1440×900，短暖样本98FPS、2288 draw calls、纹理监控39,464,176字节。这是启动后短样本，**不是稳定性能或Android表现结论**。此前同视点52FPS样本保留为观察；缓存和光照同时变化，不能将其解释为网格合并性能翻倍。
- 原生Colyseus0.18.7官方扩展与JavaScript0.18.5 SDK在本机隔离房间通过HTTP入场、二进制全量／增量、移动和开火互通；19项GDScript检查通过。报告见本机`work/network-live-report.json`，不包含正式账号凭据。
- 另5项真实触点生命周期／菜单适配检查通过，含GUI遮挡后的单指释放。原碰撞真实支撑检查与90个原生物理步前进短测通过，移动6.235米；它验证地图可走，不代表Rapier等价。
- 网页／服务器Rapier0.19.3实际Rust核心0.30.1已核对；正式接入仍被门禁阻止，详见[网络兼容](network-compatibility.md)。

## 导出状态

Windows内部EXE/PCK已导出并实际独立运行，通过原生组件、正式地图存在、209分块／129附近块／17碰撞分区就绪检查。免安装目录ZIP：`dist/qisheng-native-m1-windows-internal.zip`（174,374,262字节），SHA256 `45f84293809b0cae172802450eef7002c44b9cc5b8194236048302884802b1cf`。真实GUI截图位于本机`docs/exported-screenshots/`，当前检查记录`docs/windows-internal-export.json`。

匿名Windows演示也已独立运行，通过正式地图不存在与演示就绪检查，见`docs/windows-demo-export.json`。演示ZIP：`dist/qisheng-native-m1-windows-demo.zip`（39,504,402字节），SHA256 `8fe831fad328328233c0d7b001a6ec4a57b63aec5d1127f6e50c6f3c25d1c3cf`。

首次正式包headless检查发现Godot dummy渲染器的并发共享贴图加载竞争，已只对headless采用串行准备；实际Windows/Android保留两请求。首次失败证据保留于`docs/windows-internal-export-before-headless-fix.json`，没有将其覆盖成成功。

Android内部APK已实际导出：`dist/qisheng-online-native-m1-arm64-internal.apk`（207,558,328字节），SHA256 `e4578a4909171a51e27b3c8d29ae9fec6fb139cadb71df92f252d86ef43fd247`。apksigner v3／RSA3072签名、16KiB zipalign、aapt精确API29／target35、仅arm64与网络权限检查通过。包内1076条目、209校园分块索引及8份许可；没有private／work／scripts／tests／keystore条目。SDK原生库ELF LOAD对齐65536。

最低／目标SDK由精确AXML uses-sdk typed整数更新，仅min24→29、target36→35两个字节变化，然后清除旧签名、重新对齐并重新签名；报告保留变更位置和只允许这两处变更的断言。

该APK使用仅本地保留的内部签名，没有安卓真机安装、帧率、多指、后台或移动网络验收；不作为公开原生预览发布。

## 未完成与下一步

1. 固定Rust Rapier0.30.1实现同一角色控制器、运动状态、碰撞／安全路线查询及预测重放，使用正式逻辑轨迹逐步对照。当前Godot预览运动不等价，环回网络画面只服从服务器位置。
2. 通过正式玩法两客户端互通、加载公平、重连、真实枪械表现、任务和道具；现有协议房间不替代此项。
3. 原生骨骼／贴图角色、武器、音频、故事、驾驶、存档和成就尚未全部移植。
4. Android真机安装、性能、多指、键盘／系统返回、字体、安全区与恢复未验证。内部debug签名不是正式更新身份。
5. 首版尚无系统安全存储和自动更新；账号密码与Bearer只在内存，不以不安全明文持久化补功能。

## 资源与发行边界

正式校园和任何签名、凭据、截图、工具链、构建输出不上传GitHub。公开匿名演示只带原创几何，`Windows Demo`导出排除整个`content/production/`。包内地图校验身份不改变，不能靠改名连接正式房间。

本样板尚未公开发布，不更改正式网页部署、数据库或运营设置。
