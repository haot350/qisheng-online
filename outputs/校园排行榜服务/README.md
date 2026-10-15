# 齐盛Online API 与管理后台

API为正式游戏同源/api/v1，后台 https://game.tianhw.top/admin。原api.game.zbqsgz.org已退役。当前源码、正式发行和香港目标见 [开发交接](../../docs/HANDOFF.md)。此项目不渲染校园或运行联机物理。

Node24，npm ci、npm run build；构建同时产生API和独立React后台。node scripts/dev-server.mjs用于本机隔离开发，无默认生产密码。生产只监听127.0.0.1:8788，使用现有Caddy。统一发布由校园服务器部署负责，不重跑旧初始化或使用旧美国部署命令。

当前正式后端为Preview 0.8.3，香港发行20261015T155805Z-0.8.3，schema6及既有规则保持。账号、旧身份升级、私人申诉、档案、竞技统计和来源成就继续保留；管理员账号独立于玩家账号，player-accounts等权限仍需明确授权。见 [后台专题](../../docs/admin.md)。

本轮增加“小齐助手”：默认关闭，拥有者配置接口、模型和密钥，测试生成及独立审核后再启用。assistant权限仅owner默认拥有；密钥及模型修改、连接测试限owner，其他获授权管理员只能管理开关、额度和聚合用量。真实提供方尚未验证，不把合成上游测试当作实际模型可用证据。维护见 [助手说明](../../docs/assistant.md)。

data/ranking.sqlite、config和backups独立于发行。小齐私密配置默认位于数据库目录下private/assistant-private.json，使用现有systemd可写data路径，目录0700、文件0600；不要放入静态站点或发行。密码、会话、恢复码和私人截图不进静态包或日志。成绩使用共享唯一规则重算；权威联机结算只接受本机服务令牌；后台不能直接改分或手动发奖。原文与截图私密，公开议题只发布审核摘要。

备份沿用SQLite在线备份，小齐配置存在时附带0600私密配套文件，随数据库保留14份。应用回滚保留数据；schema6不能直接运行旧schema5 API，跨schema兼容回滚须验证。数据库恢复是独立操作，不自动覆盖小齐配置或恢复旧密钥。

[架构](../../docs/architecture.md) · [开发与短验收](../../docs/development.md) · [发行运维](../../docs/operations.md)。历史验收与失败报告保留。
