# Phase 548：战斗热点优化与联网结算边界

日期：2026-09-18。开发目录仍为主目录 `Beastbound_Odyssey`，基线 `0bd9ea705` 加现有未提交成果。没有创建提交、推送或提升候选资产。

## 本阶段解决的问题

1. 20 actor 场景原先每次绘制和鼠标选取都深复制角色数组，并为 190 次比较重复计算 380 次站位。现在由 `battle/battle_draw_order.gd` 每个角色计算一次深度；返回独立数组，角色引用只读。保留原交换排序，包括相同深度时的原有前后关系，因此画面遮挡与点击优先级一致。每次调用重新取坐标，不跨帧缓存角色和站位，服务器换快照、相机或布局变化立即生效。
2. 宠物每帧取图和首次预热反复复制整份美术目录、筛动作、读动作参数。`PetActionAssetCatalog` 现在缓存资源根目录、动作列表和帧数/FPS/循环参数，同一战斗状态按形态去重预热。公开动作列表仍返回副本；QA 预览、独立 overlay 切换时失效缓存，取图每次仍先检查 exact-form 发布权限。没有改 PNG、帧序、播放速度、朝向或发布登记。
3. 真实守护战复跑发现：人物在第三回合被击飞时，客户端套用本地单人结束条件，清掉后续事件并显示胜利；服务器仍在第四回合等待指令，档案 revision 仍为 102。现在联网播放完整消费服务器事件，在回合边界按服务器结果/关闭房间结束；空房间或尚未关闭的房间不能进入胜负呈现。原本地单人击飞回城规则保留。

这沿用 Phase 176、185、547 的服务器权威与现有战斗规则，没有新增玩法、经济规则、协议字段或美术决策。StoneAge 的回合表现仍是参考，不从外部工程复制实现或数据。

## 定向验证

两组检查均走固定隔离 QA 车道，真实玩家目录未变：

```sh
node tools/run_godot_auto_checks.mjs --only=--auto-battle-formation-check,--auto-pet-action-asset-check,--auto-standalone-pet-art-overlay-check --fail-fast --timeout-ms 180000 --output-dir .run/godot_auto_checks/phase548-cache
node tools/run_godot_auto_checks.mjs --only=--auto-server-battle-target-mapping-check,--auto-battle-knockaway-result-check,--auto-battle-visual-timing-check,--auto-server-battle-boss-replay-check,--auto-server-battle-return-check --fail-fast --timeout-ms 180000 --output-dir .run/godot_auto_checks/phase548-completion-v2
```

- 缓存/排序组 `4/4`（含解析）：100 组排序对照覆盖空阵容、同深度、20 actor、换快照及坐标变化；五种守护战形态的 900 帧逐帧对照资源路径，并验证 elapsed 循环/停末帧、progress 越界、非法动作/视角回退、公开列表不可污染缓存、七/十二动作预览切换和关闭预览后拒绝取图。独立 overlay 原有检查通过。
- 联网结束组 `6/6`（含解析）：人物击飞/空视觉快照不能提前结束联网战斗，开放房间不能触发结果或清场；本地击飞、视觉时序、Boss 回放和权威回城通过。
- 新增联网回归先在修复前失败，证据 `.run/godot_auto_checks/phase548-launch-before/`；修复后通过。旧本地击飞测试还暴露了过时夹具：新账号默认已无宠物，测试仍从空档案取出战宠；只将该用例改为已有专用战斗档案，没有修改新账号或玩家规则。
- 日志：`.run/godot_auto_checks/phase548-cache/2026-09-18T04-42-59-868Z_summary.json`、`.run/godot_auto_checks/phase548-completion-v2/2026-09-18T04-46-35-794Z_summary.json`。
- 性能工具纯测试：`python3 -m unittest tools/test/test_capture_battle_layout_perf.py`，`14/14` 通过，记录 `.run/phase548-perf-tool-tests.log`。
- 最后执行 `node tools/run_godot_auto_checks.mjs --performance-suite --fail-fast --timeout-ms 180000 --output-dir .run/godot_auto_checks/phase548-performance`，静止、移动、跨帧连点、商店选择和加点探针 `5/5`，114 秒完成。记录 `.run/godot_auto_checks/phase548-performance/2026-09-18T04-54-34-249Z_summary.json`；所有进程组关闭、车道清理、真实档案未变。

## 真实联网复跑

使用 `python3 tools/play_guardian_review.py --autoplay --timeout-seconds 360`，真实 1280×720 Main、一个客户端及四个 HTTP 队友驱动，后端为一次性内存服务。自动 viewport 输入，不冒充 Computer Use 或老板美术接受。

- 修改前 `.run/guardian-review/20260918T043506.802566Z/`：第三回合提前返回世界并显示胜利，服务器尚在第四回合，五人档案未结算；保留失败与截图，不计作通关。
- 修改后 `.run/guardian-review/20260918T045032.678920Z/`：从第五回合房间快照开始，`洞穴探路者` 明确为 launched；客户端没有退出，宠物仍可操作，完整进行到第九回合并收到 `battle.room_closed`。`autoplay.json` 为 passed、errors=[]；五个账号均 revision `102→103`、各增加一个 `ring_earth_trial`，当前客户端回到 F4。三段跨帧走路也到达预期格子并观察到地标淡化。
- `backend/stopped.json`、官方车道 `lifecycle-result.json` 均收尾成功，真实玩家目录 698 项 SHA-256 仍为 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。音频关闭，本轮没有重录视频。
- 原生 CPU 诊断分别为修改前 31 个战斗样本中位数 33.6%、修改后 94 个样本中位数 26.45%（后者峰值 66.5%）。两个运行回合长度、焦点和外部负载不同，保留原始 `cpu-samples.json`，不据此宣称固定比例 CPU 改善。

## 性能证据与限制

先修复原有性能入口的配置冲突：通用 `--perf-probe` 会关闭 VSync，Phase 403 原生门禁却要求 VSync 开启。仅原生性能夹具显式恢复 VSync，仍要求原有 macOS/Metal/1280×720/60 FPS/前台焦点合同，未放宽校验。

固定场景命令：

```sh
python3 tools/capture_battle_layout_perf.py --run-id phase548-before-v2-20260918 --timeout-seconds 180
python3 tools/capture_battle_layout_perf.py --run-id phase548-after-v3-20260918 --timeout-seconds 180
```

基线合格，优化后三次采样均因结束时 `windowFocused=false` 被门禁拒绝，**不能算完整性能验收通过**。保留失败回执，没有修改焦点判断来取得 PASS。以下仅为前后诊断样本的稳定后半段中位数（毫秒），待相同前台条件复测：

| 状态 | 原 draw_battle | 优化后 draw_battle | 原 process_total | 优化后 process_total |
| --- | ---: | ---: | ---: | ---: |
| 静止 | 4.513 | 3.134 | 0.0755 | 0.0870 |
| 指令选择 | 4.5325 | 3.389 | 0.0770 | 0.0915 |
| 跨帧相邻目标切换 | 4.5705 | 3.6365 | 0.0720 | 0.0870 |

三段各保留 4 个稳定样本、8 次目标切换/24 次真实跨帧点击，目标命中与无 HUD 穿透成立；焦点不合格仍优先于这些数值。原始目录为 `.run/evidence/phase403_battle_layout_perf/phase548-before-v2-20260918/` 与 `phase548-after[-v2/-v3]-20260918/`，诊断提取为 `.run/phase548-diagnostic-comparison.json`。

世界路径的 headless 探针对照最近 Phase 547 修改后基线（同主目录、此次优化前代码）：

| process_total（ms，中位数 / p95） | Phase 547 修改后基线 | 本轮 |
| --- | ---: | ---: |
| 静止 | 0.550 / 0.620 | 0.437 / 0.586 |
| 移动 | 0.694 / 0.753 | 0.220 / 0.345 |
| 跨帧连点 | 0.618 / 0.817 | 0.472 / 0.800 |

基线来自 `.run/godot_auto_checks/guardian-world-after-20260918/`，本轮来自上述 `phase548-performance/`。静止稳定样本 26 个，移动 4 个，连点 2 个；属于短时窄范围回归，不能代替原生绘制、长期负载或 200 人同图证据。连点实际发送 70 个鼠标事件，35 次接受、11 次合并应用，最终格子吻合。

真实守护战首次准备新增仅在性能探针开启时输出的分项日志：

| 单次原生样本 | 人物预热 | 宠物预热 | 其他准备 | 合计 |
| --- | ---: | ---: | ---: | ---: |
| 修改前 | 156.863 ms | 1007.467 ms | 5.014 ms | 1169.344 ms |
| 修改后 | 161.180 ms | 836.438 ms | 4.726 ms | 1002.344 ms |

首次冷加载仍约一秒，本阶段没有实现异步贴图预加载；不能据此宣称首次切战已经无卡顿。`process_total` 不含全部绘制及渲染线程工作，因此不能单用它解释进程 CPU。QA 期间也存在其他应用/WindowServer 负载，没有停止用户进程来制造空载数据。

## 交付边界

- 本轮不运行全量 CI、不连接正常 MySQL/共享后端、不改真实账号或资产生命周期；真实多人、最终鼠标/声音接受、正式打包和容量验收仍不在本轮通过范围。
- 发布游标仍为 `R1.W024`，全局发布结论仍为 `BLOCKED`。后续优先首次贴图加载与同条件前台性能复测，继续保持候选与已发布状态分开。
