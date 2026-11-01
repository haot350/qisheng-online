# @qisheng/shared

游戏、主站、API与实时服务的规范共享来源。纯规则、弹药、NPC战斗、排行、协议、运营、账号和竞技成就入口不导入React、Three、DOM或WebGL；社区、地图缓存和玩家内容为命名浏览器入口。成就目录定义竞技条件，授予与撤回来源由API处理。

构建 node scripts/build.mjs；同步四消费者 node scripts/sync-consumers.mjs。消费者使用vendor tarball及锁文件完整性，不依赖开发目录链接。具体版本／tarball以manifest及 [开发交接](../../docs/HANDOFF.md) 为准，历史migration-backup保留原哈希。

Windows同步曾再次遗漏Linux所需optional锁记录。同步成功仍需检查完整锁图、四方vendor一致性和后端干净Linux npm ci --omit=dev；不要用一次安装成功推断可跨平台发行。候选同步与验证规则见 [开发专题](../../docs/development.md)。

[架构](../../docs/architecture.md) · [交接与状态](../../docs/HANDOFF.md)。
