# 齐盛Online 实时服务

Node24权威联机服务，独立于静态游戏和API。正式游戏同源/realtime/w1、w2、w3对应三个工作进程；/realtime默认w1。当前版本、香港目标与实际发布证据见 [开发交接](../../docs/HANDOFF.md)，旧API域和美国初始化命令不用于当前发布。

本地 npm ci、npm run build、npm run typecheck；npm start读取环境。规则／协议来自vendor共享包，地图、清单、协议和三个工作进程需一起校验。生产/srv/codex/realtime程序、data、config、incoming分离；统一发布由校园服务器部署负责，已初始化服务器不重跑初始化。

合作／PvP分数由服务端结算，浏览器不能自行提交。玩法关闭停止新开局，现有比赛、有效席位重连和成绩提交保留；维护与运营开关独立。切换等自然排空，不强制结束，失败恢复原状态。

后台健康与回执见 [后台专题](../../docs/admin.md)。健康、模拟更新时间、完整周期和玩家网络延迟含义不同；容量只以版本实测范围为准，协议机器人不能代替真机／移动网络。

[架构](../../docs/architecture.md) · [开发](../../docs/development.md) · [发行](../../docs/operations.md)。历史docs、地图与失败样本保留。
