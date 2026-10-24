# 齐盛Online

游戏源码与本地玩法位于本目录。正式游戏 https://game.tianhw.top，主站 https://zbqsgz.tianhw.top。继续开发先读[项目交接](../../docs/HANDOFF.md)，源码、验证与正式发布分别记录。

当前源码为Preview 0.9.6；香港两站与后端已发布。大飞新增轻型坦克、电动滑板车与分车型记录，单人撤离调整圈外防守；合并大厅恢复、身份切换、反馈重试及确认框改进。既有练习、可读性与按客户端能力协商的续局保持，地图、联机协议和小齐配置不变。新车型凭证后回退网页仍保留兼容新API，实际验证范围与原生独立阶段见HANDOFF。

Node24，在本目录运行npm ci、npm run dev；npm run build默认生成匿名演示，正式构建使用npm run build:production并要求独立正式素材，npm run preview打开静态预览。单机玩法不以在线服务可用为启动条件；账号功能需要API。

规则、协议、账号/成就类型、社区和玩家内容维护在同级校园共享模块，消费者使用vendor依赖。模型、碰撞、导航、照片、存档及正式素材保持原来源，生产托管由校园服务器部署项目负责。

[架构](../../docs/architecture.md) · [开发与短验收](../../docs/development.md) · [发行运维](../../docs/operations.md)。历史报告、失败样本及旧发行保留。
