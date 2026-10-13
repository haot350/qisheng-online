# 齐盛 · 数字校园

主站提供校园介绍、制作说明与三维浏览，游戏有独立入口。正式地址 https://zbqsgz.tianhw.top；游戏 https://game.tianhw.top。当前源码、正式发行及香港目标见 [开发交接](../../../docs/HANDOFF.md)。旧Cloudflare上传及旧主站域名只作为历史流程。

本文件位于校园交互网站/site。npm ci安装锁文件；npm run dev开发，npm run build构建，npm start静态预览。父目录启动／停止脚本可打开已有静态构建。模型通过本机HTTP读取，不直接双击index.html；开发服务不对公网开放。

app维护React／Three界面；public/models保存资源，public/campus.manifest.json记录来源，dist/client是静态输出。模型仍使用既有v16编号。左键旋转、右键平移、滚轮缩放；手机单指旋转、双指缩放平移，底部面板选择分区。教学室内按需加载；部分区域未完整建模，尺寸为影像比例估计。

社区、FAQ和发行内容由共享模块命名浏览器入口提供，主站注入自身API配置。scripts/package-release.mjs生成静态交付副本，正式双站发布由校园服务器部署项目负责。

[架构](../../../docs/architecture.md) · [开发](../../../docs/development.md) · [发行](../../../docs/operations.md)。历史验收和模型来源保持原样。
