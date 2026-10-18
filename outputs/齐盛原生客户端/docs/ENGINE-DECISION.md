# 原生渲染与虚幻引擎评估

2026-10-18。此文是技术选择，不能作为画质、帧率或发布验收证据。

当前继续 Godot 4.7.2、固定 Rapier 0.30.1 和服务器裁判。0.1.0先排查实际Windows发行程序的启动访问冲突，Compatibility作为首发基线；0.2.0再提供可回退的Forward+选项。

Godot Forward+面向较新桌面硬件，支持屏幕空间反射、间接光照等高级效果。它与Compatibility的驱动、材质和灯光表现不同，需要对同一校园重新调校与实测，不能只切换设置便承诺提升。高端增强主要来自光照、阴影、天空、反射和衍生材质；原模型细节与现有角色表现不会自动增加。网页保留自身预算，天气身份和竞技可见边界一致。

虚幻可承载此类项目，也有成熟的Lumen等渲染能力。用户的4070 Laptop满足Epic列出的Lumen显卡系列条件；完整编辑器推荐还包含32GB内存等要求，本机内存尚未核对，不能宣称完整硬件验收。当前可用的Godot控制器、UI、资源流送、账号与Colyseus显式协议若迁移，仍需重新适配并检验物理预测；换引擎不能直接消除网络往返或现有未知崩溃。

本轮不启动虚幻工程、不迁移玩法或同时升级引擎依赖。先用现有客户端取得稳定性和画质对照，再决定是否值得独立立项。此选择避免把首个可玩测试版与长期引擎迁移捆绑。

依据：[Godot渲染器](https://docs.godotengine.org/en/stable/tutorials/rendering/renderers.html)、[Epic硬件要求](https://dev.epicgames.com/documentation/en-us/unreal-engine/hardware-and-software-specifications-for-unreal-engine)。
