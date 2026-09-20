# Phase 591：晒甲苔背兽候选战斗比例

日期：2026-09-20。继续 R1.W024。普通洞穴遭遇中晒甲苔背兽显得过小，本项修正明确开启 QA 预览时的身体比例，不改变正式素材发布状态。

## 根因与美术意图

现有双视角 idle 共 12 帧均为 256×256，但主体宽仅 `127–147px`、高 `83–110px`。既有普通宠物比例目录只登记三个已发布形态，候选晒甲苔背兽回退 `1.0×`，正常 10v10 的身体因此约宽 `57–66px`、高 `37–50px`。同屏布伊、乌力有更饱满的源图，导致前者像缩小的模型。

沿用该宠物现有身份锁的低重心、宽背、厚甲和粗四肢，并延续 [Phase 466](phase_466_ordinary_pet_battle_sprite_scale.md) 的普通宠物身体比例层。审计已检查现有成长、捕捉、技能和投放目录；临时完整设计合同为 `.run/pet-design/sunbaked_battle_preview_scale_v1.json`，验证通过。数值与玩法合同没有改动。

## 改动与边界

`pet_battle_sprite_scales.json` 新增独立 `previewProfiles`，晒甲苔背兽候选倍率为 `1.55×`。经实际 Godot 贴图边界测量，10v10 的可见身体变为宽 **88.767–102.746px**、高 **58.013–76.885px**，保持横向厚重、纵向低伏。

- 只有已显式开启对应宠物 QA 预览时才读取候选倍率；关闭预览立即回到 `1.0×`，候选本身仍不能在正常玩家路径获得素材资格。
- 三个正式形态的配置及 `0.85..1.35` 发布范围逐字段不变。候选单独使用 `0.85..1.8` 范围，不能冒充正式配置；未知形态、重复登记、候选误登记为已发布形态及缺少素材包均报错。
- 倍率仅传入宠物纹理绘制。普通 actor／接触几何、Boss、血条／姓名锚点、点击范围、怪物数值、遇敌概率和奖励不变。
- 目录在战斗准备时加载，绘制只读内存字典与既有预览标志。180 张原动作 PNG 和美术审批状态均未改动。

## 检查与原生对比

```sh
node .agents/skills/design-beastbound-pets/scripts/validate_pet_design_spec.mjs .run/pet-design/sunbaked_battle_preview_scale_v1.json
node .agents/skills/design-beastbound-pets/scripts/inspect_pet_design.mjs --check
node tools/battle_action_catalog_check.mjs
node tools/run_godot_auto_checks.mjs --only=--auto-rebirth-cave-guardian-check,--auto-pet-action-asset-check,--auto-battle-formation-check,--auto-battle-melee-motion-check,--auto-battle-label-check --fail-fast --timeout-ms 180000 --output-dir .run/godot_auto_checks/phase591-candidate-scale-green
python3 .run/phase591-pet-preview/native/run.py
python3 .run/phase591-world-after/run.py
git diff --check
```

旧代码定向回归真实失败：没有候选比例、未应用目标倍率、主体边界不满足低伏重甲目标。修复后 Godot 含解析 **6/6**；12 帧实载边界、默认／开启／关闭预览、Boss 排除、权威字段及既有晶甲乌力比例检查全部通过。宠物设计和战斗动作目录无错误／警告。

原生对比使用真实 `Main.tscn`／Metal／1280×720，从上一场三层遭遇的公开房间快照构建**离线渲染夹具**，同屏 20 个单位。一只我方宠物改用同形态以核查两侧朝向；先在内存中复现旧 `1.0×`，再恢复真实候选 `1.55×`，无服务器命令或档案写入。

- [调整前](../.run/phase591-pet-preview/native/baseline.png) 与 [候选比例](../.run/phase591-pet-preview/native/candidate.png) 已实际查看：身体重量与同屏队友接近，低甲轮廓、两侧向内朝向及邻位可读性保留。
- [连续对比视频](../.run/phase591-pet-preview/native/guardian-1x.mp4)：`10.066667s / 302 frames / 1280×720 / 30 FPS`，严格源时间线和完整解码通过，SHA-256 `5a0daa187bd2c8cd1db212145020fc39500adc8f6facfee4b6d07bfa87939d55`。
- 候选 PNG SHA-256 `c507b24061b0e8db30cb8c0eae2e0144c2234caf2b5e60096f2ff2980ff80e94`。源码前后哈希一致，180 张素材逐字节不变。测试进程、音频和官方 QA 目录均已清理，真实玩家数据保持不变。

这是身体比例的渲染对比，不是 Computer Use 操作验收、真实权威战斗、完整动作语义验收或前台性能证据。原有素材身份与动画问题不能靠本次统一缩放自动获得通过；所有者接受继续 pending。

前后 Main 静止／移动各三组，移动每组 60 次跨帧点击／120 个输入事件全部接受，投影错误为零。headless `process_total` 均值静止 `0.023250 → 0.021125ms`、移动 `0.048208 → 0.041333ms`；该诊断不证明原生战斗绘制收益。Phase 579 正式静止性能增量 FAIL 继续有效。

下一步处理地图静止性能热点，并在原生窗口恢复可操作后补齐超时和 F4→F3→F2→F1→村口连续路线。P2.1a／R1.W024 仍未完成，107 项本地地图候选文件保留。
