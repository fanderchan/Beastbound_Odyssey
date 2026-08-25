# Phase 538：R1.08 布伊冲撞 VFX 延期运行时收口

## 结论

R1.07 已给出“视觉内部冻结、首发延期”的受委托审查结论。本阶段把该决定落实为 fail-closed 运行时合同：`pet_bui_charge_vfx_v1` 的八张候选 PNG 在普通玩家战斗中不可准备、不可从旧缓存继续读取；同一技能反馈计划仍然附着在事件上，因此现有叶／土程序化施法、命中、闪避和暴击回退继续工作，不改变服务端或本地权威事件的伤害与结算。

只有 `PetBattleReviewLab` 这一显式隔离 QA 审片场会开启 review override。审片场关闭或单循环录片退出前都会再次关门并清除候选纹理缓存。除发布门自动测试中的局部开关外，普通 Main、玩家 UI、常规战斗入口和其他 QA 控制器没有开启调用点。

当前生命周期保持：

```text
decision=deferred
ownerReviewStatus=pending
releaseApproved=false
runtimeEnabled=false
ownerAcceptance=null
ownerDecisionDigest=null
releaseAttestation=null
```

R1.08 完成，但生产发布结论仍为 `BLOCKED`。

## 精确发布门

新增：

```text
client/godot/data/pet_bui_charge_vfx_release_gate_v1.json
```

当前 SHA-256：

```text
bb6d2fc0d60d88b071d2c0b4067fc680d9ef635cc32fa4b40ad1d089318bd768
```

门文件精确绑定：

- `bundleId=pet_bui_charge_vfx_v1`、`actionId=pet_bui_charge` 和 `skill_feedback_bitmap_vfx` scope；
- Phase 537 延期决定来源；
- `vfx-bundle.json` 的 SHA-256 `ee05bbe4…`；
- `source/provenance.json` 的 SHA-256 `d4563d43…`；
- 四张 charge 与四张 impact runtime PNG 的路径及完整 SHA-256；
- 仅允许 `dedicated_isolated_pet_battle_review_only` override；
- 关闭态不得携带伪造的 owner acceptance、decision digest 或 release attestation。

`BattleSkillFeedbackAssetCatalog` 第一次解析 canonical bundle 时验证上述字段、布尔类型、生命周期组合、八张运行帧数量和所有绑定文件的实时 SHA-256。门缺失、JSON 损坏、字段漂移、文件漂移或关闭态夹带发布产物时均保持不可用；非 canonical 的聚焦测试 bundle 不受本候选生命周期误伤。

## 普通运行时与回退

普通事件准备顺序现在为：

```text
feedback plan valid
-> canonical release gate valid
-> runtimeEnabled=false and no review override
-> prepare=false
-> skillFeedbackAssetReady=false
-> bitmap helper returns false
-> existing procedural leaf/earth fallback draws
```

事件不会丢掉 `skillFeedbackPlan`，所以 `contactDistanceScale=3.2`、施法／接触时序、闪避不播命中爆点和暴击强度语义仍由原 presentation contract 控制。只关闭候选位图，不删除技能、不替换动作 ID，也不改变权威 damage、dodge、critical 字段。

关闭 review override 时即使同一进程刚刚准备过候选，也会删除 canonical texture cache；`texture_for()` 还有第二道运行时访问检查，旧事件不能用 `assetReady=true` 绕过缓存关闭。

## 隔离复审入口

唯一产品代码开启点为：

```text
client/godot/scripts/qa/pet_battle_review_lab.gd
```

审片场打开后显式开启 override，普通／闪避／暴击三段可以准备当前冻结字节；`close()` 与单循环录片退出路径都显式关闭并释放纹理。自动目录检查只在局部测试窗口打开，随后同样关闭。仓库调用点审计没有发现玩家入口或普通战斗入口。

`pet_battle_review_lab_check.gd` 还验证审片场打开时 `runtimeAccessAvailable=true`，最终退出后同时满足：

```text
reviewOverrideEnabled=false
runtimeAccessAvailable=false
candidateTextureCached=false
```

## 定向验证

### 目录、门与审片生命周期

```text
node tools/battle_action_catalog_check.mjs
node tools/run_godot_auto_checks.mjs \
  --only=--auto-battle-action-catalog-check,--auto-pet-battle-review-lab-check \
  --fail-fast \
  --output-dir=.run/godot_auto_checks/r1_08_bui_vfx_gate_targeted_final
```

结果：Node 目录 `status=ok / actions=34 / passives=10 / petForms=36 / petSkillSlots=7`；Godot parse、发布门／资源目录和完整 10V10 审片场 `3/3` 通过。门检查回执为：

```text
feedback=true
feedback_gate=true
feedback_assets=true
errors=0
```

summary SHA-256：`785df0c2cf5f78bfbeb0c4352ce668993cb3866adb9246fc50d00c7130967094`。

### 权威结算与视觉时序

```text
node tools/run_godot_auto_checks.mjs \
  --only=--auto-battle-action-system-check,--auto-battle-event-ledger-check,--auto-battle-pet-command-check,--auto-battle-visual-timing-check \
  --fail-fast \
  --output-dir=.run/godot_auto_checks/r1_08_bui_vfx_settlement_and_timing
```

Godot parse 加四个定向门 `5/5` 通过：动作系统、事件账本、宠物指令和视觉时序均为 `status=ok`，没有用位图开关改写伤害或推进时机。summary SHA-256 为 `011f73ae47338cce1c61f354160217928752a5b223eeec8a31ca594f4709ed77`。

### 当前提交隔离复审实录

当前工作树重新录制真实 `Main.tscn` 审片路径：

```text
1280x720 / 30 FPS / 1.00x / 223 frames / 7.433333s
H.264 yuv420p + AAC 48kHz stereo
normal -> dodge -> critical
planAttached=true / assetReady=true for all three
```

- MP4 SHA-256：`3bff1316908275738e685ec87a9f480f258140f30d3abfc7dfde983afe7d11fa`；
- 12 帧联系表 SHA-256：`8790d78212f5ca75c58aff3cf03761d64c125ae5c9360a4737217c4cb0af9ada`；
- 原生三段 `process_total` 最大 `1.153 / 0.978 / 1.253ms`；MovieWriter 三段最大 `2.617 / 4.182 / 2.729ms`；
- 原生启动窗口 `46.6 FPS` 后连续恢复并保持约 60 FPS，`draw_battle` 约 `4.03..4.38ms`。

该实录只证明专用复审仍可用，不把它升级为 owner acceptance。

### 五项性能门

```text
node tools/run_godot_auto_checks.mjs \
  --performance-suite \
  --fail-fast \
  --output-dir=.run/godot_auto_checks/r1_08_bui_vfx_performance
```

`perf-idle / perf-moving / perf-movement-spam / perf-shop-select / perf-player-stat-spam` 全部通过，summary SHA-256 为 `bf3da02c68427a1382d4ee52319a6b75e00362e292c9406e65e539fc2e5c3851`。移动真实输入 35 次全部投影一致，移动稳态约 60 FPS、`process_total` 约 `0.30..0.46ms`；普通待机探针 `process_total` 约 `0.25..0.54ms`。

## 数据隔离与开发过程

所有最终 Godot 检查和录片均通过固定 `beastbound_qa_automation` lane。真实玩家目录摘要始终为：

```text
d6b1961ed53be04c8b8f1c398e5f5daec4d361a3c69033aee66dbb306e1310f0
```

各轮最终均为 `realUnchanged=true / laneAbsent=true / processGroupClosed=true`。一次初始 parse 被 GDScript 的未显式 bool 类型推断错误拦下，补全类型后复跑通过；一次为录制普通回退而尝试增加的 QA 参数被来源合同先行拒绝，相关改动已撤销，没有放宽或重签 QA 安全合同，检查后 lane 为 absent。

## 残余边界

- 普通路径的 `assetReady=false` 与程序化回退分支由真实 Main 自动事件、资源门和视觉时序门共同验证；本阶段没有为普通回退另造新的玩家入口或 QA 参数，也没有把隔离审片视频冒充普通玩家视频。
- bundle 仍为 `owner_review_pending / pending`，没有 promotion；若项目所有者未来明确接受精确证据，应走新的批准门更新，而不是在运行时临时打开 override。
- R1.07 的月影石坪短 FPS 波动没有在本轮苔光草甸复现；五项通用性能门与当前隔离战斗性能均通过，但不把单背景结果夸大为所有战场长期容量证明。

## 下一任务

进入 R1.09，对 Earth Vein Cave v1 当前字节执行完整路线、入口／出口、遮挡、碰撞、NPC、遭遇、战斗切换和移动性能的受委托人眼验收；没有项目所有者精确签收时继续遵守不生成 owner acceptance／digest／attestation 的边界。
