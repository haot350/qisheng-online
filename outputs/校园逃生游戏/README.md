# 齐盛Online

游戏源码与本地玩法位于本目录。正式游戏 https://game.tianhw.top，主站 https://zbqsgz.tianhw.top。继续开发先读[项目交接](../../docs/HANDOFF.md)，源码、验证与正式发布分别记录。

当前源码为Preview 0.9.2；香港两站与后端已发布。房间装备摘要/固定准备、触控道具轮盘、战斗提示避让、摄影P/V、真实评分与楼梯指引、账号与反馈入口整理已完成。玩法、规则、地图和小齐配置保持，实际验证范围与原生独立阶段见HANDOFF。

Node24，在本目录运行npm ci、npm run dev；npm run build默认生成匿名演示，正式构建使用npm run build:production并要求独立正式素材，npm run preview打开静态预览。单机玩法不以在线服务可用为启动条件；账号功能需要API。

规则、协议、账号/成就类型、社区和玩家内容维护在同级校园共享模块，消费者使用vendor依赖。模型、碰撞、导航、照片、存档及正式素材保持原来源，生产托管由校园服务器部署项目负责。

[架构](../../docs/architecture.md) · [开发与短验收](../../docs/development.md) · [发行运维](../../docs/operations.md)。历史报告、失败样本及旧发行保留。
