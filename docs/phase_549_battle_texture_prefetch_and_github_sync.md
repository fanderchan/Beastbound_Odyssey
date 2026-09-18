# Phase 549：战斗贴图后台预取与主分支同步

日期：2026-09-18。继续在唯一日常主目录开发；项目所有者明确要求连续推进并提交 GitHub。本阶段关闭守护战首次同步加载约一秒的已复现问题，不新增玩法、经济规则或资产开放范围。

## 主分支同步

先 fetch，确认本地 main 比 origin/main 超前 56 个提交且没有落后。将已验证的成果按功能显式暂存并分为六个提交，SSH 推送后，本地 HEAD、origin/main、远端 main 均为 `56c62880655df6f90c3be9d1b96ff55a60b3b9d7`。

| 提交 | 内容 |
| --- | --- |
| `9568553ac` | HTTP 分页参数适配器等价拆分 |
| `c701656d5` | 持久化测试迁移到当前可站立坐标 |
| `ce5829fbb` | 集中式地图录片、性能及精确证据校验工具 |
| `fb89bb654` | 守护战表现、权威结束边界与绘制热点优化 |
| `262adc082` | 进化试炼对话使用当前共享规则 |
| `56c628806` | 统一代码/文档入口及 Phase 543–548 证据 |

推送前复查：服务端相关 `107/107`、地图工具 `134/134`、bundle 审计器 `42/42`、Godot runner `56/56`、导航工具 `6/6`、五人 HTTP/WebSocket 守护战驱动 `1/1`，QA 源合同、索引和 diff 检查通过。没有把 `.run/`、真实档案或凭据提交。

Earth Vein 原有 **107 个**待重冻的地图证据/manifest 修改继续保留在本地，不把旧截图、旧 Computer Use 回执或旧性能报告提交为当前精确候选。原始备份及历史工作区不变。

## 预取实现与边界

- `battle_texture_prefetch_plan.gd` 在地图/档案变化时准备当前人物、出战宠物及本地图明确列出的遭遇形态。没有全图鉴扫描、遭遇随机抽样、档案归一化或额外网络请求。
- `battle_texture_prefetcher.gd` 使用 Godot 线程资源加载；同时最多 4 个请求，单帧最多 8 个队列操作，调度目标预算 1.5 ms。仅在状态为 `THREAD_LOAD_LOADED` 时获取资源，不在游戏线程等待尚未完成的读取。参见 [Godot ResourceLoader 官方接口](https://docs.godotengine.org/en/stable/classes/class_resourceloader.html#class-resourceloader-method-load-threaded-get)。
- 预取范围最多 6 种宠物、1536 张纹理；队列按路径去重，持有引用以供既有目录复用。切换范围后释放不再需要的预取引用；已提交的最多 4 个旧请求完成后回收，空队列停用处理。既有正式战斗目录自身的缓存生命周期未改变。
- 人物/宠物目录只新增已可访问资源的路径枚举。宠物 exact-form 发布门继续生效，独立外部 overlay 不进入预取；关闭 QA 预览后，即使资源已在引擎缓存中，也不能绕过原取图权限。
- `_start_battle`、服务端房间、指令、事件播放和结算保持原流程。来不及预取、超过预算的形态、未预知的队友/对手，仍走原同步预热，因此本次不宣称所有突发切战都已无卡顿。

首次无窗口性能回归复现 Godot 4.7 Dummy 渲染器 `texture_2d_initialize: Parameter "t" is null` 及一项 RID 泄漏。无窗口环境不需要显示纹理，现明确停用可选后台预取，保留原同步加载；不是忽略错误或降低验收条件。定向检查验证此能力边界，原生 Metal 验证实际后台读取。

## 守护战实测

真实 1280×720 Main，隔离内存后端，一个客户端与四个 HTTP 队友；沿用既有跨帧走路、对话及战斗输入，没有为了完成预取增加等待。

| 首次进入 20 actor 守护战 | 人物 | 宠物 | 其他 | 合计 |
| --- | ---: | ---: | ---: | ---: |
| Phase 548 最终基线 | 161.180 ms | 836.438 ms | 4.726 ms | 1002.344 ms |
| 本轮首跑 | 0.943 ms | 4.340 ms | 4.771 ms | 10.054 ms |
| 加入无窗口边界后的最终代码 | 0.895 ms | 4.094 ms | 5.001 ms | 9.990 ms |

两个本轮进程均在实际走路/对话期间完成 1080 张纹理预取，进入战斗时 queued/inFlight/failed 均为 0。主线程预取调度最大耗时分别为 292 / 302 微秒。这是指定场景的新进程首次切战测量，不是全游戏加载时间或磁盘冷缓存基准。

首跑 `.run/guardian-review/20260918T055053.497757Z/` 已完整通过：20 actor、5 人、人物倒下后宠物可操作、权威胜利、五账号 revision `102→103` 且每人地之戒 `+1`、回到 F4。截图已按原尺寸检查。最终代码复跑 `.run/guardian-review/20260918T060219.335117Z/` 再次 passed/errors=[]，五账号 revision 和奖励逐个核对一致。击飞/宠物接管分支来自首跑；不把随机第二场未出现的分支也算覆盖。

两轮后端与 Godot 均收尾、官方 QA lane 清理通过，真实玩家目录 698 项 SHA-256 保持 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。本轮自动 viewport 输入不冒充 Computer Use；音频关闭，没有重录正式视频。

## 性能和回归

```sh
node tools/run_godot_auto_checks.mjs --only=--auto-battle-formation-check,--auto-pet-action-asset-check,--auto-standalone-pet-art-overlay-check --fail-fast --timeout-ms 180000 --output-dir .run/godot_auto_checks/phase549-prefetch
node tools/run_godot_auto_checks.mjs --only=--auto-battle-formation-check,--auto-server-battle-target-mapping-check,--auto-battle-knockaway-result-check --fail-fast --timeout-ms 180000 --output-dir .run/godot_auto_checks/phase549-prefetch-final
node tools/run_godot_auto_checks.mjs --performance-suite --fail-fast --timeout-ms 180000 --output-dir .run/godot_auto_checks/phase549-performance-final
python3 tools/capture_battle_layout_perf.py --run-id phase549-prefetch-final-20260918 --timeout-seconds 180
python3 tools/play_guardian_review.py --autoplay --timeout-seconds 360
```

前两组分别 `4/4`（各含解析），覆盖有界并发、去重、切图释放、失败/拒绝请求、不读取未完成任务、发布门、无窗口回退、900 帧像素资源映射、overlay、阵型和权威结束边界。世界性能探针最终 `5/5`，114 秒完成；失败的第一次 Dummy 记录保留，不计为通过。

严格原生性能门禁首跑与最终代码复跑均通过：macOS / Metal / 1280×720 / VSync=1，首尾前台焦点均为 true。最终稳定样本：

| 状态 | 实际平均 FPS | process_total 中位数 | draw_battle 中位数 | 帧间隔 p95 |
| --- | ---: | ---: | ---: | ---: |
| 静止 | 60.003 | 0.148 ms | 3.750 ms | 17.659 ms |
| 指令选择 | 60.003 | 0.143 ms | 3.857 ms | 17.190 ms |
| 跨帧目标切换 | 58.722 | 0.128 ms | 3.629 ms | 21.050 ms |

8 次目标切换、24 次跨帧操作均命中，HUD 穿透为 0。目标切换的平均 FPS 未达到严格恒定 60，但通过既有门槛；没有修改 FPS/焦点/时序校验。Phase 548 的三次失焦失败继续作为历史失败保留，本轮已有合格后测。

## 后续

预取代码与证据单独提交推送。持续开发目标已恢复，后续继续 R1.W024 的当前源码精确地图证据、真实操作、集中式重复移动性能及路线/战斗转换验证；本轮不是整个地图发布验收。实机日志还暴露人物退场时的零经验原因表述值得核对，后续按服务端真实结算原因处理，不猜奖励规则。

没有运行全量 CI、正式导出或 200 人容量验收；没有修改正常 MySQL、玩家档案或资产审批。Earth Vein 与新战场仍是待验收候选，全局发布仍为 BLOCKED。
