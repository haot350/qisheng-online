# 安卓内部预览构建

目标为Android 10（API29）及以上、arm64-v8a。当前只有内部测试签名，不是商店／公开发行密钥。密钥与密码只写入本项目 `private/`，该目录排除Godot资源、GitHub与交付包；重新安装和升级内部包需保留同一密钥。

锁定Godot 4.7.2官方预编译Android模板、Temurin JDK17、Google SDK Build-Tools35.0.1、Platform35及Platform-Tools。使用预编译APK模板，不进行Gradle或原生C++重编译，因此本步骤不下载NDK/CMake。模板导出不支持在Godot预设中覆盖SDK值，故导出后由 `set-android-sdk.py` 只调整二进制Manifest的最低／目标SDK两个整数，再进行16KiB页面对齐及最终签名；没有复用旧签名。

安装信息与归档哈希写在私有工作文件 `work/android-toolchain.json`，最小结构为 `javaSdk` 和 `androidSdk` 的本机绝对目录。构建脚本只调整当前进程环境，不修改全局PATH、注册表或系统Java安装。工具源码与许可证来自官方发行，安装文件不上传仓库。

1. 执行 `pwsh -File scripts/prepare-android-tools.ps1`，下载并校验固定官方归档，解压至本机工作目录；完整源地址和校验值留在脚本及 `work/` 记录。
2. 将官方 `android_debug.apk`／`android_release.apk` 放到 `work/templates/`。
3. 合并 `export_presets.android.fragment.cfg` 到项目导出预设，保持Windows预设。
4. 执行 `pwsh -File scripts/export-android.ps1`。
5. 脚本生成内部测试密钥、导出、用apksigner验证签名，并用aapt读取Android最低版本、权限与ABI。

设备本机测试服务可通过 `adb reverse tcp:2568 tcp:2568` 和 `adb reverse tcp:2567 tcp:2567` 转发；账号与联机测试仍受本机兼容门禁约束。没有Android真机验收前只交内部包，不宣称已验证触摸、发热、帧率、驱动兼容或移动网络。

依据：[Godot Android导出说明](https://docs.godotengine.org/en/4.7/tutorials/export/exporting_for_android.html)、[Google SDK工具](https://developer.android.com/tools)、[Temurin JDK](https://adoptium.net/temurin/releases/?version=17)。
