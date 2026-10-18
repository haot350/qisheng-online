# 齐盛Online

OpenQS 制作的校园游戏。此仓库包含客户端、校园网站、账号与管理 API、权威联机服务、共享规则及本地演示，代码采用 MIT；正式美术与校园素材不随源码授权。

## 本地开始

需要 Node 24。首次运行 `node scripts/dev-demo.mjs --install` 安装并启动本地演示；在两个浏览器窗口打开 http://127.0.0.1:5180。账号使用临时内存数据。校园演示在独立 `site` 目录运行 `npm ci`、`npm run dev`，地址为 http://127.0.0.1:5173。

详细安装见 [演示说明](docs/DEMO.md)，协同开发先读 [接续文档](docs/HANDOFF.md)、[架构](docs/architecture.md) 和 [贡献指南](CONTRIBUTING.md)。

| 项目 | 职责 |
|---|---|
| outputs/校园逃生游戏 | 游戏客户端、菜单与输入 |
| outputs/校园交互网站/site | 校园网站 |
| outputs/校园排行榜服务 | 账号、成绩、反馈与独立管理员页面 |
| outputs/校园联机服务 | 权威联机服务与房间 |
| outputs/校园共享模块 | 纯规则、协议、账号接口和社区界面 |
| outputs/校园服务器部署 | 发行政策与通用部署说明 |
| outputs/齐盛原生客户端 | Godot独立客户端、匿名演示及平台导出脚本 |

默认 `npm run build` 生成匿名演示。游戏与校园的正式构建使用 `npm run build:production`，实时服务使用 `OPENQS_PROFILE=production npm run build`；均需要独立获得的正式素材和私有人物校准。正式发行拒绝演示文件。演示独立地图身份，不可进入正式房间或提交正式成绩。

## 资源与协作

上传内容由 `scripts/public-source.mjs` 白名单控制。校园模型、真人及衍生贴图、正式封面和图标、生产配置、数据库、玩家截图、日志和历史发行留在本机。不要强制添加未经审查的文件。详见 [开源边界](docs/OPEN_SOURCE.md)、[第三方许可](docs/THIRD_PARTY.md)。

当前正式发行 **Preview 0.9.4**，两站与香港后端已发布。0.9.3整理游戏确认、小齐入房与实时后台，0.9.4新增晴/阴/小雨并保持地图与竞技规则。Windows原生 **Preview0.2.0实验性测试版** 已公开，提供校园探索、团竞/混战、独立战术大厅与分组设置；安卓0.2仍为内部包。原生短跨端与继承证据、已知问题及未验证设备见 [HANDOFF](docs/HANDOFF.md)。游戏 https://game.tianhw.top，校园网站 https://zbqsgz.tianhw.top，公开协作仓库 https://github.com/haot350/qisheng-online。

历史建模记录、原 README 与私密运维证据保留在本机 'work/private-project-state' 及原交付目录，不属于公开仓库。
