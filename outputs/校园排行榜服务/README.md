# 齐盛Online API 与管理后台

API为正式游戏同源/api/v1，后台 https://game.tianhw.top/admin。原api.game.zbqsgz.org已退役。当前源码、正式发行和香港目标见 [开发交接](../../docs/HANDOFF.md)。此项目不渲染校园或运行联机物理。

Node24，npm ci、npm run build；构建同时产生API和独立React后台。node scripts/dev-server.mjs用于本机隔离开发，无默认生产密码。生产只监听127.0.0.1:8788，使用现有Caddy。统一发布由校园服务器部署负责，不重跑旧初始化或使用旧美国部署命令。

本轮0.8.0新增玩家账号、身份升级、私密找回申诉、档案、竞技统计与来源成就；后台补玩家账号、申诉、服务状态、房间回执及统计筛选。player-accounts为新增权限，owner默认可用，其他管理员明确授权；管理员账号独立于游戏账号。见 [后台专题](../../docs/admin.md)。

data/ranking.sqlite、config和backups独立于发行。密码、会话、恢复码和私人截图不进静态包或日志。成绩使用共享唯一规则重算；权威联机结算只接受本机服务令牌；后台不能直接改分或手动发奖。原文与截图私密，公开议题只发布审核摘要。

备份沿用SQLite在线备份。应用回滚保留数据；0.8.0 schema6不能直接运行旧schema5 API，跨schema兼容回滚须验证；数据库恢复是独立操作。

[架构](../../docs/architecture.md) · [开发与短验收](../../docs/development.md) · [发行运维](../../docs/operations.md)。历史验收与失败报告保留。
