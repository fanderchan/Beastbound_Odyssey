# Phase 406：融合宠世界步态锚点共识门禁

## 结论

曜冠角兽、苔垒角兽此前 6 个 `center_drift` 不是整只宠物在画布中横滑，而是独立四相中尾巴、角、前后腿改变了透明外接框极值。两只宠的脚底基线保持 `0–1px`，头、躯干和落脚位置在原始画布上稳定；本阶段不为压低一个不可靠数值而强移整张运行帧。

批量美术审计现同时保留两种独立测量：

- 完整透明外接框中心，用于发现轮廓极值变化；
- 可见主体底部 `18px` 支撑带的 Alpha 加权中心，用于发现落脚区域变化。

只有同一对帧中两个中心都同向移动时，才取两者较小位移作为“整体锚点同向漂移”；四相任意帧对超过 `12px` 才继续报 `center_drift`。尾巴单独张合、正常交替迈腿都不能独自放行或阻断，整张精灵横移仍会让两个信号同时移动并失败关闭。

本阶段没有修改任何宠物 PNG、来源图、目录清单、配方、运行开关或 owner 决定。玩家收益是保留已经批准的自然肢体动作，不因错误居中造成头和躯干左右抖动；代价是审计报告增加了支撑中心和共识位移字段。

## 六个旧报警的重算

| 形态 | 方向 | 透明外接框中心 | 底部支撑中心 | 整体锚点共识 | 结论 |
| --- | --- | ---: | ---: | ---: | --- |
| 曜冠角兽 | north | 13.500px | 4.400px | 4.400px | 通过 |
| 曜冠角兽 | northeast | 15.500px | 4.248px | 4.248px | 通过 |
| 曜冠角兽 | east | 13.000px | 7.761px | 7.761px | 通过 |
| 曜冠角兽 | southeast | 13.500px | 7.524px | 7.524px | 通过 |
| 苔垒角兽 | southwest | 14.500px | 6.542px | 6.542px | 通过 |
| 苔垒角兽 | northeast | 14.500px | 0.674px | 0.601px | 通过 |

两只目标在完整生产审计中均为 `errors=[] / pending=[]`。诊断联系表和完整 JSON 保留在忽略目录：

```text
.run/worktree-triage/2026-08-12/fusion-walk-diagnostics/
.run/worktree-triage/2026-08-12/fusion-anchor-consensus-audit.json
```

这些本地报告只用于复核，不是运行依赖，也不替代项目所有者对最终实机片的审美批准。

## 回归合同

新增三类明确正反例：

1. 只有尾巴扩展、外接框漂移超过 `12px`，支撑中心稳定时必须通过；
2. 只有左右脚交替承重、支撑中心漂移超过 `12px`，外接框稳定时必须通过；
3. 整只主体平移 `18px`，两个中心同向移动时必须失败并报告 `center_drift`。

历史 `centerDriftPx` 继续作为透明外接框诊断字段保留；新增 `supportCenterDriftPx`、`anchorConsensusDriftPx`、`centerGateMetric=alpha_bounds_support_pair_consensus_v1` 和 `supportBandHeightPx=18`，避免旧报告消费者把字段静默换义。

## 验证

- `python3 -m unittest tools.test.test_pet_art_batch_audit`：`38/38`；
- `python3 -m unittest tools.test.test_verify_pet_fusion_closed_release`：运行 `27` 项，`26` 项通过，`1` 项真实外部集成环境按设计跳过；
- `python3 tools/verify_pet_fusion_closed_release.py`：`PASS`，`2 forms / 1350 copied files / 22 portrait files / 2 QA controls`，并继续证明 `releaseApproved=false / runtimeEnabled=false / playerEntryOpened=false`；
- 完整 `pet_art_batch_audit.py`：`36 forms / 3 runtime / 6 ok / 30 pending / 0 failed / 0 errors / 0 warnings`；
- Python 编译与 `git diff --check`：通过。

没有运行 Godot 或完整本地 CI：本阶段只改变只读离线审计算法与回归测试，没有修改运行代码、资产像素或玩家界面。

## 后续门禁

P1.4 父项仍未完成，下一步继续按顺序处理：

1. 以真实 `1280×720 Main.tscn` 最终片绑定两张专用大头照和融合信息布局的项目所有者决定；
2. 创建独立 runtime decision 与 release attestation，不能复用 Phase 372 只覆盖完整非骑乘包的视觉批准；
3. 接入正常玩家入口、服务端执行按钮与真实权威事务，并保持关闭态零副作用回归；
4. 完成发布前性能、断线重试、三宠原子消耗和最终实机验证后，才允许开启全局融合运行开关。
