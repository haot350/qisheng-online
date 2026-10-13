# 本地开源演示

要求 Node.js 24、npm，以及账号服务 SQLite 原生扩展的编译工具。Windows 需要 Python 与 Visual Studio 的“使用 C++ 的桌面开发”；Linux 需要 Python 与 C/C++ 编译工具。只构建游戏／校园演示静态页时不需要 SQLite 编译工具。六个中文目录保持在仓库 `outputs` 下相邻。首次从干净 clone 启动，在仓库根目录运行：

```sh
node scripts/dev-demo.mjs --install
```

后续已安装依赖时运行 `node scripts/dev-demo.mjs`。在两个浏览器窗口打开 `http://127.0.0.1:5180/`，分别点击“进入本机场地”。WASD／方向键移动，Shift 加速，鼠标瞄准，按住鼠标／空格开火，R 换弹。`/account/` 使用实际共享 `AccountPage` 和账号 API，可注册与登录测试账号。API 数据库仅存于内存，重启会清空；请勿输入正式账号的密码。

启动器构建共享包和账号 API，启动 Vite（5180）、隔离账号 API（8792）和独立演示实时服务（2577）。三个服务都只监听 `127.0.0.1`。Ctrl+C 停止全部演示子进程。端口已有服务时启动失败，不会结束其他已有服务。

公开演示使用 OpenQS 原创的匿名 SVG 角色及 `demo/arena.json` 小场地，来源标识 `openqs-demo-v1`、协议 `openqs-demo-ws-v1`，服务器公开场地实际 SHA-256。演示服务复用 `@qisheng/shared/rules` 的 `RULES`、`WEAPONS` 和 `Magazine`，提供两客户端移动、碰撞、射击、弹药与换弹；独立 Canvas 界面为开发 sandbox。其模拟和网络时序并不覆盖正式权威同步。API 只开放本地账号相关路径，拒绝比赛、排行榜、内部结算和正式联机准入。

演示不覆盖正式校园、复杂地图碰撞／导航、故事、摄影、驾驶、竞技结算、成就或复杂联机同步；这些玩法的程序源码仍公开，正式资产不在仓库中。不要把 demo 检查结果当成正式资源或生产发布证据。

默认 `npm run build` 和 `npm run dev` 为 demo。游戏构建写出 `dist/openqs-profile.json`；校园站构建写出 `dist/client/openqs-profile.json`。生产构建须明确执行 `npm run build:production`，且需要独立获得的完整正式资产。生产打包拒绝 demo profile。已有工作区的正式资产和来源编号不被 demo 改写；干净 clone 仅在缺少静态 URL 映射时生成空映射供全源码类型检查，不伪造正式地图哈希。

正式人物命中轮廓和 PNG 部位校准保留在未跟踪的 `校园逃生游戏/private-data/`。公开源码使用独立抽象占位校准；它们不参与 demo 场地模拟。实时服务正式编译设置 `OPENQS_PROFILE=production` 才读取原私有轮廓，默认编译空轮廓；缺少生产校准会直接失败。

校园站的默认构建是无需正式素材的入口页。在 `outputs/校园交互网站/site` 安装依赖后运行 `npm run build` 或 `npm run dev`。它链接上述游戏与账号演示，正式网站源码保留在原有 `app`、`components` 等目录。

定向演示检查：先启动演示，再在仓库根目录运行 `node scripts/check-demo.mjs`。检查使用临时合成账号，不打印会话、密码或恢复码，并核对真实 demo 身份、两个客户端移动／射击及 API 的正式竞技准入拒绝。
