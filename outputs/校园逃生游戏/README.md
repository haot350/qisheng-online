# 齐盛Online

游戏源码与本地玩法位于本目录。正式游戏 https://game.tianhw.top，主站 https://zbqsgz.tianhw.top。继续开发先读 [项目交接](../../docs/HANDOFF.md)，源码、正式发行、验证和目标分别记录。

本轮0.8.0接入用户名密码、恢复码、身份保留升级、玩家档案与竞技成就。拒绝升级的旧身份仅本机游玩、公共阅读和匿名反馈。剧情、漫游和摄影不参与竞技成就；成就来自有效服务端记录，保存统计与公开参榜分别选择。

Node24，在本目录 npm ci、npm run dev；构建 npm run build，静态预览 npm run preview。开发服务只监听本机，Vite显示实际端口。单机玩法不以在线服务可用为启动条件；账号功能需要API。

规则、协议、账号／成就类型、社区和玩家内容维护在同级校园共享模块，游戏使用vendor依赖。模型、碰撞、导航和存档保持各自来源编号；正式托管由校园服务器部署项目负责。

[架构](../../docs/architecture.md) · [开发与短验收](../../docs/development.md) · [发行运维](../../docs/operations.md)。历史docs、发行及失败样本继续保留。
