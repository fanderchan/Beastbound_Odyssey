# Phase 403：正式战斗阵位与 Phase 397 HUD 安全区

日期：2026-08-08

## 当前结论

Phase 402 的静态战场候选审计暴露了一个与候选底板无关的运行时布局问题：既有
10v10 网格只检查阵位锚点，Phase 397 正式 HUD 上线后没有重新检查人物／宠物的
完整可见包络。其冻结的 `96×128` 抽样曾精确报告：

- `enemy.front.5` 与顶部回合／计时安全区相交 `1792px²`；
- `ally.back.1` 与右侧指令安全区相交 `1736px²`。

这个抽样小于当前正式角色、整体骑乘和焦点长名的真实上限，不能作为修复后的通过
标准。Phase 403 因此区分两份诚实合同：

- `PHASE402_FROZEN_SAMPLE_ENVELOPE` 仅保留旧报告 `1792/1736px²` 的负例复现；
- `FORMAL_MAX_VISIBLE_ENVELOPE` 才是新旧布局的正式主门，覆盖当前最大正式绘制范围。

本阶段只调整客户端 10v10 的表现坐标，并新增包络级安全合同。没有接入 Phase 402
底板，没有改变任何资产 lifecycle、地图绑定、战斗数值、协议、服务端排序或
`slotId`。

当前状态为 `runtime_contract_ready_visual_perf_pending`：静态几何、Godot cold import／parse、
focused model check、阵位／自动 10v10／正式指令定向回归均已通过。真实性能、完整动态
技能路径和 1280×720 实机视觉证据仍待执行；在这些门禁完成前不得提交、推送或宣称
Phase 403 发布完成。

## StoneAge 参考意图与 Beastbound 规则

稳定本地参考 `/Users/fander/projects/_local_references/StoneAge` 中：

- `gmsv/src/include/battle.h` 用 `BATTLE_ENTRY_MAX=10`、`BATTLE_PLAYER_MAX=5` 和
  `SIDE_OFFSET=10` 固定每侧十个战斗身份；
- `gmsv/src/battle/battle.c` 把每侧十位分成两组五位，人物与宠物通过相差五位的
  身份配对，并在前后排空缺时按既有排语义回退。

Beastbound 只采用“每侧两排五位、身份稳定、前后排可读”的成熟行为意图，不复制
参考项目坐标、客户端 UI、数值、源代码或素材。Beastbound 的权威名字继续是
`{ally|enemy}.{front|back}.1..5`；服务端现有主角／战宠 `back.3/front.3`、组队
`[3,4,2,5,1]` 和敌方 `front.1..5 → back.1..5` 顺序完全不变。

## 正式安全区合同

第一验收视口固定为 PC `1280×720`。正式可见包络相对 home anchor 为左／右各
`66px`、向上 `148px`、向下 `16px`，即 `132×164`。依据当前正式绘制上限：

- 10v10 `visual_scale=0.74` 下，`156px` 人物／宠物画布宽 `115.44px`；
- 当前整体骑乘宽度上限为 `256×0.88×0.74×0.72=120.03px`；
- compact 焦点名宽度上限为 `max(176×0.74,128)=130.24px`；
- 整体骑乘姓名 baseline 为 `188×0.74=139.12px`，再保留 9px 字体上沿。

持续存在的 Phase 397 HUD 组件再外扩 `8px` 安全边：

| 区域 | 正式组件 | 安全区 |
| --- | --- | --- |
| 顶部回合／计时 | 回合 `(576,18,128,40)`；计时 `(584,62,112,44)` | `(568,10)-(712,114)` |
| 左下战斗消息 | `(57,469,348,233)` | `(49,461)-(413,710)` |
| 消息页脚时钟／经验 | `(57,703,204,17)` | `(49,695)-(269,720)` |
| 右列指令 | `(1186,402,68,300)` | `(1178,394)-(1262,710)` |
| 底排指令 | `(776,630,478,72)` | `(768,622)-(1262,710)` |

展开消息框与技能／物品子菜单属于玩家主动打开的短暂遮罩：它们被模型单独报告，
不用于永久压缩 20 个阵位。子菜单沿用既有指令流程管理；展开消息框不会自动收起，
玩家需要用已有按钮收起后恢复完整目标视野。这个显式点击墙不是阵位永久安全区的
一部分。

这份 HUD／actor 合同只对正式 PC `1280×720` 权威。顶部计时是固定像素居中，指令板
是统一缩放后右下锚定，actor visual scale 也不随阵位模板同比缩放；因此不能用 x/y
比例缩放冒充其他视口的正确结果。focused model 对其他尺寸明确返回 `supported=false`；
Main 在其他尺寸保留既有 anchor／live panel 检查，后续若要正式支持，必须接实时 HUD
Rect 和真实 actor visual scale，不能复用近似值。

## 几何修复

保留模板 `1280×720` 和 lane step `(152,52)`，把：

- origin 从 `(128,338.4)` 调为 `(94,340.4)`；
- rank step 从 `(76,-48)` 调为 `(64,-48)`。

横向调整是在 `132px` 正式包络与至少 `80px` 同排间距的双重约束下求得，不是两个
危险阵位的特判。整体下移 `2px` 让最上方正式姓名包络不再越出画布；lane 和 rank 的
垂直步长不变，所以 y/depth 次序与中央 `front.3 ↔ front.3` 冲锋向量保持不变；
其他阵位的端点向量会随新锚点改变。

| 指标 | 修复前 | 修复后 |
| --- | ---: | ---: |
| `enemy.front.5` 锚点 | `(584,198.4)` | `(502,200.4)` |
| 正式包络的顶部碰撞 | `5248px²` | `0` |
| Phase 402 冻结抽样的顶部碰撞 | `1792px²` | `0` |
| `ally.back.1` 锚点 | `(1192,406.4)` | `(1110,408.4)` |
| 正式包络的右列碰撞 | `2240px²` | `0` |
| Phase 402 冻结抽样的右列碰撞 | `1736px²` | `0` |
| 其他正式包络碰撞 | `enemy.front.4=96px²`；`ally.back.2=304px²` | `0` |
| 20 位正式包络整体范围 | `x=62..1258`；`y=-2..614` | `x=28..1176`；`y=0..616` |
| 同排最小锚点间距 | `89.89px` | `80.00px` |
| 同 slot 前后排距离 | `160.65px` | `160.65px` |
| 任意敌我最近锚点距离 | `376.81px` | `399.62px` |
| 中央 `front.3 ↔ front.3` 冲锋距离 | `481.95px` | `481.95px` |

10v10 当前选择半径约 `35.52px`，修复后相邻锚点仍比两个选择圆直径多 `8.96px`。
正式包络左边界则从 `62px` 收到 `28px`，这是保住长名／整体骑乘 HUD 安全和相邻点击
间距后的主要视觉风险；最大人物、整体骑乘、大体型宠物、姓名／血条和真实逐帧点击
仍必须通过 1280×720 Main 可视化门禁。

普通本地单敌战斗不带 `formationTemplate=10v10`，继续走旧的稀疏 1v1 布局，不消费
这组常量。所有带 10v10 模板的 1..10 training 子集、服务器决斗／组队／庄园房间继续
消费原 `slotId`，只改变屏幕锚点。近战、反击、合击、投射物和击飞路径均从锚点派生，
因此自动跟随新 home position；中央 `front.3 ↔ front.3` 冲锋相对向量保持不变，其他
阵位端点自动跟随新锚点。

## 代码边界

- `battle_layout_constants.gd`：只保存共享模板常量；
- `battle_layout_safe_area_model.gd`：唯一解释 20 个显式 slot 的模板锚点、正式最大包络、
  1280×720 Phase 397 持续／短暂 HUD 区域、画布边界、碰撞和阵型间距报告；
- `main.gd`：只把原敌我 lane/rank 映射委托给 focused model，并用实际 screen point
  检查正式包络；GM reviewLab 使用自己的 top inset／工具合同，不误套正式玩家 HUD；
- `battle_layout_safe_area_model_check.gd`：锁定真实 `BattleModel` 单敌 legacy slot、1..10
  training 子集、20 位、阵营／前后排、间距、最近敌我、中央冲锋、画布边界与零持续
  HUD 碰撞；两套负例分别复现冻结抽样和正式最大包络下的旧风险；
- `test_battle_layout_safe_area_contract.py`：独立复算几何，并把 focused 常量绑定到 Phase 397
  HUD、正式 render limit、Main 委托／参考视口门和服务端 slot 排序源代码，防止静态漂移。

服务端文件、战斗数据、UI 资产、Phase 401/402 候选和 lifecycle 均不在本阶段修改范围。

## 当前证据与待跑门禁

已执行：

```text
git diff --check
git diff --no-index --check /dev/null <each-new-file>
PASS

/usr/bin/python3 tools/test/test_battle_layout_safe_area_contract.py
6/6 PASS

其中独立 Python 几何复算：
slots=20
formalMaxVisibleEnvelope=132x164
persistentHudCollisions=0
viewportViolations=0
minimumAdjacent=80.000000px
minimumFrontBack=160.648685px
minimumOpponent=399.619819px
centerCharge=481.946055px

godot --headless --editor --path client/godot --quit
exit=0; fatal/parse/script-error scan=0; cold import assets=9723

godot --headless --path client/godot --quit
exit=0; fatal/error scan=0

godot --headless --path client/godot \
  --script res://scripts/battle/battle_layout_safe_area_model_check.gd
ok=true; errors=0; exit=0; fatal/error scan=0

node tools/run_godot_auto_checks.mjs \
  --only=--auto-battle-formation-check,--auto-battle-auto-10v10-check,\
--auto-battle-command-awakened-ui-check \
  --fail-fast --timeout-ms 240000
passed=4; failed=0; total=4; elapsed_ms=46931
parse=4070ms; formation=10455ms; auto10v10=25199ms; command=7190ms
```

没有启动 ffmpeg，也没有运行 Metal 或性能探针。仍须按窄到宽顺序补跑完整动态路径：

```sh
node tools/run_godot_auto_checks.mjs \
  --only=--auto-battle-target-check,--auto-battle-pet-target-check,\
--auto-battle-melee-motion-check,\
--auto-battle-combo-motion-check,--auto-battle-launch-check,\
--auto-battle-reaction-check,--auto-battle-retarget-visual-check \
  --fail-fast --timeout-ms 180000
```

随后必须用真实 `Main.tscn` 在 `1280×720` 覆盖 1 敌 legacy、2／5／10 敌模板、人物／
宠物／自动三态、最大正式人物／宠物／整体骑乘、普通与展开消息、子菜单开关、邻位
真实点击、近战／反击／合击／远程／击飞，并记录 battle idle／moving／draw 的前后性能。
Phase 402 若以后合入，必须让其静态审计读取这份权威常量或同步重跑；旧 FAIL 报告不能
直接改字冒充新证据。

### 真实 Main 证据控制器（待窗口执行）

静态闭包已新增专用 `battle_layout_owner_review_capture.gd`，只经 `Main.tscn` 的 debug
flag 启动。录像 fixture 固定为正式 20 actor `10v10`：所有人物使用可进入战斗运行时的
`ember_spark_v1`，所有宠物使用 approved 的
`wuli_evolved_crystal_earth8_water2`；两者均保留 `512×512` 正式源图，并以 `256×256`
运行帧进入 Main。人物名精确 24 字、宠物名精确 8 字。控制器把实际
Main screen anchor 与 `layout_report` 的 20 个 anchor 一一比对，并检查正式最大 actor
包络对画布、回合／计时、消息／页脚和右／底指令控件均零交。

两次目标证据固定命中同排最近邻 `enemy.front.4` 与 `enemy.front.5`。人物“攻击”、两个
actor 和中间的宠物“撤回”均使用跨 process/physics frame 的真实左键事件；运行时同时
断言预解析 actor、最终 `battle_selected_target_id`、pending command target、slot 与
世界移动接受计数，拒绝 HUD 穿透或近邻误选。

普通正式录像的 `battle_state` 明确包含 `mounted_player_actors=0`。现有整体骑乘仅绑定
已经登记的 integrated `256×256` 运行帧 canary，并验证
`0.88×0.74×0.72=120.03px` 小于 `132px` 水平包络。该 bundle 的元数据没有在本合同中
证明源图尺寸，因此 marker 明确写 `source_image_frame=not_asserted`；同时写明
`vertical_recomputed=false / anchor_recomputed=false /
slot_collisions_recomputed=false`，不再输出或暗示骑乘 slot 零碰撞结论。它仍是
`geometry_only=true / width_covered=true / player_visible=false /
ordinary_battle=false / inserted_into_battle_state=false` 的 review-only 宽度证据，不是普通
玩家战斗截图或录像。控制器会实际预热其已登记的独立八向整体 bundle，但不把它插入
战斗状态，也不改变任何人物／宠物／骑乘 lifecycle。

本轮只执行了 Python 静态合同与 diff 检查，没有再次启动 Godot 或 ffmpeg：

```text
/usr/bin/python3 -B -m unittest \
  tools.test.test_battle_layout_safe_area_contract \
  tools.test.test_record_battle_layout_owner_review \
  tools.test.test_capture_battle_layout_perf
16/16 PASS

git diff --check
PASS
```

获得独占窗口后，按以下顺序冻结真实证据；第一条产生有声 1280×720、30fps、1× MP4、
联系表、严格 Godot marker 与 SHA256，第二条分别统计 idle、指令选择、相邻目标切换的
`fps / process_total / draw_battle / frameIntervalMs`：

```sh
python3 tools/record_battle_layout_owner_review.py
python3 tools/capture_battle_layout_perf.py
```

两条工具均拒绝附加 Godot 参数、不启动 backend、不写正常玩家存档；在真实 marker、
20 actor、布局 identity、精确相邻 slot、跨帧计数、HUD 零交／零穿透或 review-only
边界任一项不符时 fail closed。
