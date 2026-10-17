# 开发与短验收

游戏、实时与 API 使用项目锁文件，运行环境为 Node 24。主站在自己的 `site` 目录构建；管理后台构建由 API 的 `scripts/build-admin.mjs` 调用，不包含游戏引擎。先读取交接快照和任务对应源码，再进入项目目录。

| 项目 | 常用入口 |
|---|---|
| 游戏 | `npm ci`、`npm run dev`、`npm run build` |
| 主站 site | `npm ci`、`npm run dev`、`npm run build`；本机静态预览 `npm start` |
| API | `npm ci`、`npm run build`；本机隔离服务 `node scripts/dev-server.mjs` |
| 实时 | `npm ci`、`npm run build`、`npm run typecheck` |
| 共享模块 | `node scripts/build.mjs`，`node scripts/sync-consumers.mjs` |

共享同步会修改四个消费者的 manifest、锁文件和 vendor。Windows重建optional依赖图曾遗漏Linux所需 `@emnapi/core/runtime`；0.8.1已补齐并验证两后端的干净Linux生产安装，游戏锁也补齐缺失peer记录。不要把同步成功视为可上线，仍须核对锁图及干净安装。详细历史证据保留于本机发行记录。不要 `npm audit fix --force` 或无计划升级依赖。

0.9.0复现了Windows上npm忽略SQLite13的`gypfile:false`、错误触发`node-gyp`的问题。API模块保留`.npmrc`的`ignore-scripts=true`，安装后由构建入口执行真实SQLite／Sharp自检；其他模块不全局禁用脚本。公开CI增加Windows，与Linux分别做干净演示检查。环境检查使用`node scripts/check-environment.mjs`，原生检查可在API目录执行`npm run check:native`；完整说明见[本地演示](DEMO.md)。

常规验收目标总计不超过10分钟。选择实际改变的权限、写入、撤销、来源重算和关键页面；运行目标项目构建和少量真实行为检查，不为样式或文档添加镜像测试。数据库变化使用内存／临时库验证迁移及兼容；共享或后端依赖变化验证干净 Linux 安装。真实浏览只覆盖改动流程及一个窄屏，历史容量、网络损伤或所有版本的长测仅在相关变更需要时进行。

开发服务仅监听本机。测试数据库、身份、反馈和申诉独立于生产；不使用正式玩家数据做可变测试。每阶段完成后更新 [HANDOFF](HANDOFF.md)，记录通过的检查和仍未检查的事项。真实 iPhone／安卓、多指和移动网络仍须由独立真机证据确认。
