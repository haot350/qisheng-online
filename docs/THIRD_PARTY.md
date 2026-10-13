# 第三方软件与素材

公开演示中的匿名 SVG 和小场地由 OpenQS 原创，按根目录 MIT 许可提供，不含照片、人脸或正式校园资源。`@qisheng/shared` 由本仓库当前共享源码构建，遵循同一 MIT 许可。

第三方运行库包括 React／React DOM（MIT）、Three.js（MIT）、Vite（MIT）、TypeScript（Apache-2.0）、Fastify 及插件（MIT）、better-sqlite3（MIT，内含 SQLite 公有领域代码）、Colyseus SDK／服务库（MIT）、ws（MIT）、Rapier（Apache-2.0）和 recast-navigation（MIT）。完整依赖与传递依赖版本以各模块 `package-lock.json` 为准，安装包内的 LICENSE／NOTICE 是各软件的最终许可证文本。这里不将第三方软件重新许可为 MIT。[保留的第三方许可](../THIRD_PARTY_LICENSES/dependencies.json) 记录直接依赖名称、安装版本及对应许可文件；可用 `node scripts/collect-third-party-licenses.mjs` 从锁定安装重新收集。

0.3.2 的枪械表现与移动交火曾参考 Dust Corridor／claude-of-duty 的 ViewModel 和 DIVE 的 AttackGoal 思路。当时实施记录明确记载独立原创实现，未复制或修改其源码；当前公开清单及 vendor 未包含这两个项目的代码或素材。[思路参考致谢](../THIRD_PARTY_LICENSES/REFERENCE_ONLY-NOTICE.md) 保留项目及源文件链接，区分参考思路和实际打包代码。

生产素材的第三方许可证、人物或校园素材授权未随公开代码发行；使用正式素材需要独立授权与对应署名。请勿从本机历史目录、线上网站或发行包复制素材到公开仓库。需要新 demo 素材时优先使用原创可重建 SVG／几何图形，并记录作者与许可证。
