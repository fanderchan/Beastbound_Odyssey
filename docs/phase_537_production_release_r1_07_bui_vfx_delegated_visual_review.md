# Phase 537：R1.07 布伊冲撞 VFX 受委托人眼验收

## 结论

项目所有者已明确要求 Codex 自行验证并持续推进，但没有亲自观看或签署本轮精确证据。受委托的宠物技能／美术审查结论为：Phase 487 的 `pet_bui_charge_vfx_v1` 候选在当前提交、真实 `Main.tscn`、20 actor、1× 战斗速度和四种审片战场中均具备清晰的施法、普通命中、闪避和暴击语义；没有发现需要为素材本身新增返工任务的视觉缺陷。

工程建议是“内部冻结、首发延期”。原因不是画面不合格，而是仓库发布合同要求项目所有者对精确视频明确接受后才能生成 owner acceptance、decision digest、release attestation 或执行 promotion。本阶段因此继续保持：

```text
deliveryStatus=owner_review_pending
ownerReviewStatus=pending
ownerAcceptance=absent
ownerDecisionDigest=absent
releaseAttestation=absent
promotion=not_run
```

R1.08 必须执行延期分支：让这套待审位图在普通玩家运行时不可达，同时保留显式隔离 QA 复审入口和不改变权威结算的安全回退。生产发布结论继续为 `BLOCKED`。

## 当前字节与合同复核

当前 `vfx-bundle.json`、两张原始 2×2 母表、八张 256×256 runtime PNG、两个透明处理结果、prompt 和 provenance 仍只由提交 `06becae711d488d5e878a39ff00d27f69f318c4e` 引入，Phase 487 后没有同路径代码或素材提交漂移。

`node tools/battle_action_catalog_check.mjs` 当前输出：

```text
status=ok
actions=34
passives=10
petForms=36
petSkillSlots=7
```

该门逐文件重算两张母表与八张 runtime 帧的 SHA-256，校验 bundle/action/style、四帧顺序、阈值、比例、锚点、无触边清单、权属与无本机路径合同。当前 bundle 仍为 `owner_review_pending / pending`；没有借本次委托改写生命周期。

## 真实 1× 四背景证据

Phase 487 最终 I 版只展示苔光草甸，不能独立满足 R1.07 的“不同背景”要求。本阶段使用固定 QA lane 在当前提交重新录制四支真实 `Main.tscn` 视频；seed 与战场由当前 `BattleArenaVisualCatalog` 精确映射：

| seed | 战场 | 视频 SHA-256 | 联系表 SHA-256 | summary SHA-256 |
|---:|---|---|---|---|
| 1 | 苔光草甸 `moss_meadow` | `1efbc76e9e9eb363de916380a693c93c07eed260cc086e79a7b68d323bf9ab19` | `a188d2ac3c5d01cde6c5c2408a512ce1384f0919b8a0ae34eea0f31b19a405a8` | `8d5cd7067c5eb30c81c6c233c59f341e6697a6899d16d7a5e4b7c02823fdaf8d` |
| 2 | 琥珀砂岩 `amber_sandstone` | `41377a655307e4a68847fefdb7b583e7ab25de9acd71f2a2c65189a4e4b37d2b` | `4b5cc0a3524d6c7463a32701f5694d842bfabcfce8ec7a278176aeb204c59e1b` | `52f41e0606f7d7b3b2b99c22d118c946e052833ee8ec5fb259e27478c6f2790e` |
| 3 | 月影石坪 `moonlit_slate` | `28b1d28e770a3d270dbf173962fc20575be8a9568aa06c0ff1cb9a0ecff5f72a` | `41da0355899ca5e495f320703a25b409c984b7e6fbad0e16c92aa20632ac44b4` | `1a39726e8736c9ec0c46d8e97a482f4bbf169ca7612aa861ef6c7d37deeaeae2` |
| 4 | 赤土高原 `red_clay` | `e261bc58161ff6b1892b27c28a2b8a97b12780e416455ecf862e59048774a1b1` | `4c16a2c3e195f860b6a178f55a72213c533b923c0d02fb960ad2cffa77eea504` | `f3ea2a7a7a81941715c16f1215cf83c5137951d3392c53e83f2a53d4e1e9a78a` |

每支视频均为：

```text
1280x720 / 30 FPS / 1.00x / 223 frames / 7.433333s
H.264 yuv420p + AAC 48kHz stereo
normal Main.tscn
20 actors
skill -> skill_dodge -> skill_critical
planAttached=true / assetReady=true
```

四支视频的 MP4 与音频流均完成全片解码；本阶段只审 VFX，不把音轨存在、解码或技术电平冒充 bundle 级听感批准。

## 人眼审片判断

审查先在 QuickTime 以 1× 连续播放当前 seed 1 视频，再以四支视频的逐段时序与 12 帧联系表复核背景对比和峰值帧；没有使用单张静帧替代运动节奏判断。

### 施法与冲锋

- 叶风／土尘尾迹沿真实冲锋方向从行动者脚下展开，启动意图先于接触点出现；它没有盖住行动者主体、名称和血条。
- 苔光草甸与琥珀砂岩上，深绿叶片提供方向对比；月影石坪上暖尘没有过曝成白片；赤土高原上土尘虽然接近地面色，但绿色叶片与暖芯仍保留清晰运动方向。
- 20 actor 队形中，尾迹只占行动者到单一目标的局部区域，没有形成跨排光幕或误导为群攻。

### 普通命中

- 爆点从接触位置出现，暖芯、土块与叶片集中在单一目标，不会遮住邻近两名单位。
- 目标受击动作、`技能 -24` 浮字和局部爆点在 1× 速度下同向加强，不依赖聊天日志才能判断命中。
- 四种战场均保留可见轮廓；亮砂岩没有吞掉核心，暗石坪没有让深绿叶片完全消失。

### 闪避

- 冲锋尾迹穿过让开的目标格，但没有播放普通／暴击爆点；`回避` 浮字与目标避让动作同时出现。
- 画面不会先说“命中”再由文字纠正；这是本候选最重要的结算语义门，四背景均通过。

### 暴击

- 暴击沿用同一叶／土语言，但暖芯更大、更亮、土尘展开更宽，停留重量明显高于普通命中；`暴击 技能 -29` 只补充数值，不是唯一差异。
- 暗蓝月影石坪没有白块过曝，赤土高原也没有因同色土尘而丢失暖芯；效果仍局限于目标周围，没有盖住整排角色。

### UI 与密度

- 战斗自身的长角色名与浮字在 20 actor 同屏时仍偏拥挤，这是全局战斗标签密度问题，不由本 VFX 新增，也没有被本 VFX 放大到遮挡血条或相邻角色。
- 普通玩家画面没有 `assetReady`、路径、QA 收据或性能标签；这些只写入隔离日志。

因此本轮没有按“一个视觉问题一个任务”创建无依据返工项。

## 当前性能观察

四支原生 Main 的导演收据均为 `PASS`，每个背景都记录普通／闪避／暴击各 `46` 个 `process_total` 样本。分段最大值中最差为琥珀砂岩暴击 `4.565ms`，仍低于 60 FPS 单帧 `16.67ms` 预算；原生探针观察到的 `draw_battle` 最高窗口为约 `4.52ms`。

苔光草甸、琥珀砂岩和赤土高原在启动窗口后保持 60 FPS；月影石坪中段出现 `56.8 / 54.0 FPS` 两个一秒窗口，随后恢复 60 FPS，且同窗口 `process_total` 仍为 `0.16 / 0.09ms`。这不构成可归因于单个 VFX 的视觉返工证据，但也不能覆盖 Phase 487 已记录的目标切换窄余量。R1.08 无论执行批准或延期，都必须跑当前运行分支的定向性能／回退验证，不能只引用审片视频。

## 数据隔离

四轮录制均由 `record_pet_management_owner_review.py` 准备 `beastbound_qa_automation` custom feature、独立用户目录和受控进程组；没有启动后端、访问 MySQL 或写正常玩家档。

每轮真实玩家目录摘要均保持：

```text
d6b1961ed53be04c8b8f1c398e5f5daec4d361a3c69033aee66dbb306e1310f0
```

四轮均为 `realUnchanged=true / qaLaneCleanup.status=cleaned / laneAbsent=true`。机器上另有一个已运行八天的用户 Godot 编辑器进程，未关闭、未接管、未作为 QA 残留处理。

## 生命周期决定

本轮在视觉专业判断上接受候选作为内部冻结字节，但不把“Codex 受委托自行验证”改写成项目所有者亲自接受精确视频。发布分支选择为：

```text
decision=deferred
engineeringRecommendation=internally_frozen
ownerReviewStatus=pending
releaseApproved=false
runtimeEnabled must become false in R1.08
```

这同时满足两个边界：不为已经通过人眼审查的素材制造无依据返工，也不让未亲签候选以 `owner_review_pending` 状态继续进入首发普通玩家路径。

## 下一任务

R1.08 执行延期：新增精确绑定 bundle/provenance/runtime 帧的 fail-closed 发布门；普通运行不得准备该位图包，专用隔离审片可显式 override，回退不得改变服务端权威事件、伤害、闪避或暴击结果。完成后跑目录、Godot 事件回放、真实 Main、回退与性能定向门，再进入 R1.09 Earth Vein Cave v1 地图审片。
