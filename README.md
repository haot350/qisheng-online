# 齐盛Online

**当前公开预览：网页与共享模块Preview 0.13.1，安卓0.4.1／versionCode 6内置同批网页内容。API与实时服务保持0.13.0，数据库schema8、地图及campus-mp-0.9.4保持。**

LIUFRAME INTERACTIVE 制作的校园游戏项目，原制作署名为 OpenQS。网页版保留“齐盛Online”，UE独立作品采用《齐盛：2027》。此仓库包含客户端、校园网站、账号与管理 API、权威联机服务、共享规则及本地演示，代码采用 MIT；历史作者和第三方许可保留，正式美术与校园素材不随源码授权。

0.13.1改为选好配置后一次准备进入，统一多人大厅入口，减少房间准备界面与任务派生的重复更新。公开源码使用匿名演示资源；校园及正式人物美术独立管理。

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
| outputs/齐盛安卓客户端 | Kotlin与AndroidX WebKit宿主、原生生命周期、资源路由与构建源码 |
| outputs/齐盛原生客户端 | 已退役Godot客户端源码与历史匿名演示 |

安卓0.4.1已公开，内置同批0.13.1内容，复用网页业务与账号协议，采用适合手机的独立布局。源码包含APK资源去重、热状态与内存通知接线；实际设备表现与公开下载由发行记录确认。详见[安卓模块](outputs/齐盛安卓客户端/README.md)。

Godot模块现转入退役归档，停止新增研发与支持，既有在线兼容保持。本机独立UE制作工程位于 `outputs/齐盛虚幻客户端`，正式素材与UE过程资料继续排除公开仓库。工作室协作准备见本机 `docs/studio/README.md`；该内部目录目前不随公开源码导出，公开环境仍从本页与HANDOFF接续。

默认 `npm run build` 生成匿名演示。游戏与校园的正式构建使用 `npm run build:production`，实时服务使用 `OPENQS_PROFILE=production npm run build`；均需要独立获得的正式素材和私有人物校准。正式发行拒绝演示文件。演示独立地图身份，不可进入正式房间或提交正式成绩。

若只构建游戏静态演示，先在 `outputs/校园共享模块` 运行 `npm ci`，再在 `outputs/校园逃生游戏` 运行 `npm ci` 和 `npm run build`。共享源码的 React 类型依赖也需要安装。

## 资源与协作

上传内容由 `scripts/public-source.mjs` 白名单控制。校园模型、真人及衍生贴图、正式虚构人物美术、正式封面和图标、生产配置、数据库、玩家截图、日志和历史发行留在本机。不要强制添加未经审查的文件。详见 [开源边界](docs/OPEN_SOURCE.md)、[第三方许可](docs/THIRD_PARTY.md)。

0.13.0的数据库schema8加入博客、评论和测试资格，保留schema7的头像与登录会话数据。回退保留新库及人物资源访问控制；账号规则见[账号开发说明](docs/accounts.md)。

此前六套UI对照属于设计过程资料；本轮只接入选定的B方向，其他概念未进入产品。正式海报、Logo和主题美术继续排除公开仓库。

历史建模记录、原 README 与私密运维证据保留在本机 'work/private-project-state' 及原交付目录，不属于公开仓库。
