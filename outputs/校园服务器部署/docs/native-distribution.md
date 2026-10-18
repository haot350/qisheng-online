# 原生客户端独立分发

该流程不切换网页发行、不修改数据库、不重启 API 或实时工作进程。网页清理策略不删除原生发行。尚无合格原生验收收据时，公共更新接口继续返回不可下载。

## 一次性下载路由

由维护者审阅 patch-native-downloads.py 和 patch-native-downloads.sh。服务器拥有者以 root 明确填写正式游戏 Host 和服务器工作目录：

    bash patch-native-downloads.sh check --host "$GAME_HOST" --workspace "$SERVER_ROOT"
    bash patch-native-downloads.sh apply --host "$GAME_HOST" --workspace "$SERVER_ROOT"

默认动作是只读 check。apply 在原配置旁保留受限备份，校验 Caddy 后只 reload Caddy；失败恢复原配置。restore 仅在配置未被后续修改时恢复。

下载目录为服务器工作目录下 native/releases/<sha256>/<filename>.zip 或 .apk。只有符合路径且实际存在的普通文件长期缓存；其他 native 路径和缺失文件返回不缓存的404。原生包不放进 sites/releases，不参与网页版本淘汰。

API 私密配置的 nativeManifestFile 需单独审阅后指向同工作目录下 native/updates.json。发布工具不修改私密配置，不要求重启服务。如果接口未读取该清单，发布复检会恢复旧清单，原生包保留待排查。更新接口始终 no-store，下载地址为同源相对路径。

## 源码与验收身份

native-release-policy.mjs 的 nativeSourceHash(projectRoot,mapIdentity) 由导出和发布共用。摘要包含 src、scenes、themes、Rust源、锁文件、项目／导出配置、正式武器规则与资源清单、校园转换清单及四项地图身份；排除导入缓存、work、docs及构建输出。源码或身份变化后，旧收据不再匹配。

总验收在真实安装包生成、实际启动和边界检查之后出具，避免要求尚未生成的包提前拥有哈希。收据没有人为的24小时有效期；合法时间、源码摘要、安装包哈希和每份证据哈希共同绑定实际验收。

收据字段：schema为1，kind为native-release-acceptance，profile为production；提供platform、version、passed、checkedAt、sourceHash、protocolVersion、mapIdentity、artifact.bytes／sha256、minimumOS、notes和tests。公开说明最多8条、每条240字符，minimumOS为1至80字符。每项tests必须有passed、evidence和evidenceSha256；evidence仅可引用收据所在目录内的相对文件。

10项检查标识和额外字段如下，所有字段必须来自实际记录：

| 检查 | 必要字段 |
| --- | --- |
| physics-parity | maxPositionErrorM不超过0.005 |
| crossplay-tdm、crossplay-ffa | realNativeClient、realWebClient、completed为真，durationSeconds至少600 |
| prediction-network | applicationDelayMs包含0／100／200，unobstructedCorrectionP95M低于0.25，unexplainedHardJumps为0 |
| combat-capabilities | capabilities覆盖策略导出的NATIVE_COMBAT_CAPABILITIES |
| credentials-isolation | originBound；Windows的dpapi，安卓的keystore |
| package-boundary | formalAssets、fullOpenCampus、secretsExcluded、closedAreasPreserved |
| licenses | runtimeNoticesIncluded |
| startup-install | nativeRuntime；Windows的portable，安卓的signed |
| performance | frameP95Ms、longestFrameMs、residentBytes、drawCalls，以及unexplainedSevereFreeze为假 |

安卓另需realDevice.verified、model、os，且操作员显式传入--allow-android。没有真机结果不能通过。

## 检查与发布

在发行工具目录中执行，默认只有本机检查，既不连接 SSH，也不上传：

    node scripts/publish-native.mjs --qa <acceptance.json> --package <native.zip> --check

检查通过并完成一次性服务配置后，明确发布：

    node scripts/publish-native.mjs --qa <acceptance.json> --package <native.zip> --publish --target <target-name> --report <result.json>

目标从现有未跟踪配置读取，SSH连接地址及主机身份在每次写入前核对。流程为：校验本机源码／协议／四地图原始字节／安装包与证据 → 上传私有暂存目录 → 远端复核SHA → 独立不可变目录 → 公网Range和缓存复检 → 原子更新清单 → API无缓存复检。

有界文件锁避免并发覆盖。失败只回退本次清单，且先核对清单未被另一位维护者修改；已上传包、旧版本和数据库均保留。回退不能覆盖后续修改，不删除先前安装包。

## 本工具检查

    node scripts/check-native-release.mjs

策略测试使用合成资料，不是原生游戏通过证明。实际路由与远端事务检查应在临时环回服务／临时目录进行，不修改正式Caddy和数据。正式发布仍需真实跨端、安装包、许可证和设备证据。
