# 齐盛Online Android 接续

最后维护：2026-11-01。当前源码为0.2.0公开预览版（versionCode2），应用ID `com.liuframe.qishengonline`，产品ID `qisheng-online-android`。嵌入网页0.11.0，已与网页同批发布；下载以最终更新清单为准。历史0.1.0内部包保留原记录，旧Godot模块继续退役。

## 源码职责

- Kotlin与AndroidX WebKit宿主：同域精确资源路由、系统返回、安全区与方向、音频焦点、Keystore会话、用户选址文件导出和更新确认。
- 网页游戏：完整玩法、摄影、驾驶、NPC、联网及实际B界面；`android-entry.ts`完成宿主初始化后加载同一页面入口。
- 打包脚本：只读接收正式网页dist，生成专用入口、原生许可及完整资源清单。APK内gzip采用`.qsgz`实体，原URL和权威哈希不变。

## 当前行为

`release-config.json`统一应用版本、渠道和内部标志，Host／Bundle／TypeScript握手一致。`system.presentation`一次传递对局归属、实际游玩和方向：准备及房间可竖屏，进入世界后包含暂停与局中功能页保持横屏；对局期间延后更新。开局前有界等待实际横屏，取消和迟到响应沿现有操作归属处理。

完整校园、人物和声音随APK提供；账号、运营配置、小齐与联机使用现有API/WSS。缺失随包资源明确失败，不从线上拼入新版地图。独立账号／版权／制作名单页面复用返回路径；后台清输入并暂停本人，前台不自动继续。会话使用Keystore保护，密码不落盘。

API和实时服务继续0.10.2，协议保持`campus-mp-0.9.4`，地图与包清单逐项校验。0.2.0沿用升级签名，不重新生成产品身份。完整字体OFL、Android依赖和网页依赖许可一并打包。

## 构建与继续开发

先读README。官方工具和依赖由`toolchain-lock.json`及`app/gradle.lockfile`锁定；先prepare-bundle，再build-apk和verify-apk。运行资源、正式Logo和签名不在公开仓库，匿名公开图标由Manifest指向已有向量资源。

WebView负责JavaScript、WASM与WebGL。性能结论需按实际设备和同一路线比较，不从安装APK推断帧率收益。系统更新提示验证清单身份与地址，经玩家确认交浏览器下载完整APK；本版不在应用内校验实际下载字节。
