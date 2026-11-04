# 齐盛Online Android 源码接续

当前已公开0.4.0／versionCode5，内置网页0.13.0，应用com.liuframe.qishengonline、产品qisheng-online-android；协议campus-mp-0.9.4。2026-11-04与网页0.13.0同批发布；签名、完整资源及公网下载通过，安卓真机检查后补，deviceVerified=false。

宿主继续Kotlin＋AndroidX WebKit。业务和账号接口与网页共用，安卓页面独立安排；大厅、选装、房间和战斗按横屏游戏组织，账号、博客及小齐等长内容允许旋转。安全区、IME、系统返回、音频焦点及Keystore会话沿用既有实现。

asset-entities.mjs按SHA去重随包实体，AssetRouter保留本地流式读取和Range；PerformanceSignals提供热状态、内存与渲染进程恢复通知。是否提高帧率须同一真机同路线比较，公开源码构建不能替代设备结果。

正式校园与人物素材、签名、SDK及本机工具路径不在仓库。当前公共Android源码不包含完整正式APK资源，须独立准备接受过的资源包；不得将匿名演示包标记为生产地图。更新采用玩家确认的完整APK，保持应用身份与签名连续。

构建入口、资源路由及运行边界见上级README；历史Godot应用已退役，UE产品另行维护。
