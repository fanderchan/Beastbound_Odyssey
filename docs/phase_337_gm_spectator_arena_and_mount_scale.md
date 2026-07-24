# Phase 337：GM 纯观战、随机战场与骑乘比例校准

日期：2026-07-25

## 玩家问题与根因

本阶段只修正 Phase 336 的 GM 隔离观战呈现，不改变战斗 AI、数值、结算或
正式玩家地图。

1. “收起”只隐藏了工具主体，仍保留 60px 顶栏并让战斗阵型预留 64px；
   因而名字叫纯观战，画面却没有真正让出来。
2. `_draw_battle_scene()` 把底色写死为灰绿色，再叠少量程序噪点；任何随机
   种子都看见同一块灰地。
3. 整体骑乘统一按 256×256 透明画布缩放，没有看画布中主体的真实高度。
   当前随机坐骑待机主体实测从 `115.5px` 到 `219.5px`，同一系数下最小
   坐骑在 10V10 中只剩大坐骑约一半高。

## 参考行为与 Beastbound 原创规则

本地 StoneAge 8.0 参考的 `BATTLE_getBattleFieldNo()` 会从所在地图格读取
三个 battle map 候选并随机选择；字段无效时又会从战场范围随机回退。这
证明成熟基线并非“永远一张灰底”，但本阶段没有复制其地图编号、图片、
素材或代码。

Beastbound 的差异是：GM 验收需要可复盘，所以战场由验收种子确定；同一
种子永远回到同一地面，换种子按目录轮换。该选择只影响画面，不参与战斗
随机数、碰撞、寻路、AI 或结算。

## 实现合同

### 真正纯观战

- 点“纯观战”或按 `H` 后，整个顶部 GM 工具根节点隐藏，而不是只折叠主体。
- `reviewTopInset` 从 `164` 变为 `0`，20 个单位重新使用完整 1280×720
  战斗区。
- 右侧边缘只保留一个 60×34 的“GM工具”恢复按钮；它不占布局高度，鼠标
  点击与 `H` 都能恢复完整工具。
- 普通战斗 HUD、战斗记录和停止按钮没有被伪装成 GM 工具，也没有删除。

### 四种种子化地面

新增 `BattleArenaVisualCatalog`，目录顺序为：

1. `moss_meadow`：苔光草甸；
2. `amber_sandstone`：琥珀砂岩；
3. `moonlit_slate`：月影石坪；
4. `red_clay`：赤土高原。

四张图均为本阶段独立生成的 1280×720 烘焙地表，中央 80% 保持低干扰。
提示词、1672×941 原稿、规范化命令、运行图和 SHA-256 均保存在
`client/godot/assets/battle/review_arenas_v1/`。当前生命周期为
`ownerReviewStatus=pending / runtimeEnabled=false / qaPreviewEnabled=true`；
只在显式 GM 宠物战斗验收场加载，正式普通战斗继续走旧回退背景。

选择函数为 `(seed - 1) % 4`。它使复盘保持同一地面，并让连续换场明确
轮换。普通启动不预载四张候选图；进入 GM 观战时只在战斗开始前加载当前
种子的纹理，`_draw()` 只查缓存，不读文件、解析 JSON 或创建纹理。

### 骑乘主体高度归一

新增 `MountedBattlePresentationModel`：

- 正式 bundle 预热后，只读取正背两个 `idle` 首帧的透明主体包围框；
- 以源画布 `196px` 主体高度为目标，只放大小主体，不缩小已足够大的主体；
- 校准系数限制在 `1.0..1.6`，避免异常透明边或小素材无限放大；
- 报告和系数按 `characterId|formId` 缓存，逐帧绘制只查缓存，不做图像扫描。

本次五种随机坐骑的最终 10V10 待机估算高度为：

| 坐骑形态 | 原主体高度 | 系数 | 画面估算高度 |
|---|---:|---:|---:|
| 地灵转生兽 | 115.5 | 1.600 | 86.65 |
| 新手老虎 | 166.5 | 1.177 | 91.90 |
| 普通乌力 | 181.0 | 1.083 | 91.90 |
| 蓝人龙 | 219.5 | 1.000 | 102.92 |
| 赤角兽 | 175.0 | 1.120 | 91.90 |

这修正的是透明画布利用率，不改素材本身、不写回用户当前尚未提交的
mounted metadata，也不改变地图骑乘比例。

## 验证

基础与定向门禁：

```text
git diff --check
arena-bundle.json parse PASS
godot --headless --editor --path client/godot --quit
godot --headless --path client/godot --quit
node tools/run_godot_auto_checks.mjs \
  --only=--auto-pet-battle-review-lab-check --fail-fast

Godot parse + review lab = 2/2 PASS
.run/godot_auto_checks/2026-07-24T21-00-35-220Z.log
level140=20
ally/enemy player roles=5/5
ally/enemy pet roles=5/5
mounted=10
random mount forms=5
mount scale reports=5/5
errors=[]
```

定向门禁还实际切换纯观战，确认：

- 顶部工具不可见、右侧恢复按钮可见、`reviewTopInset=0`；
- 阵型顶端相对展开状态上移超过 80px；
- 鼠标恢复后顶部工具可见、右侧按钮隐藏、`reviewTopInset=164`；
- 同种子复盘同一 arena，不同连续种子切换 arena。

Computer Use 运行 `/Applications/Godot.app` 的真实 `Main.tscn`，依次查看
四种地面，并实际鼠标点击右侧“GM工具”恢复完整面板。MovieWriter 又以
四个固定种子各录 120 帧并抽取精确 1280×720 截图：

```text
.run/evidence/phase337_spectator_visuals/moss_1280x720.png
.run/evidence/phase337_spectator_visuals/amber_1280x720.png
.run/evidence/phase337_spectator_visuals/moonlit_1280x720.png
.run/evidence/phase337_spectator_visuals/red_clay_1280x720.png
.run/evidence/phase337_spectator_visuals/arena_contact_sheet_1280x720.png
```

四场均确认中央战斗区没有装饰遮挡，坐骑放大后没有压住相邻单位；夜场
人物、血条、伤害数字仍可辨。最终 600 帧 Apple M5 Metal 探针：

```text
fps=60.0
process_total=0.07..0.23ms
battle_process=0.07..0.23ms
draw_battle=6.20..6.41ms
.run/evidence/phase337_spectator_visuals/perf_spectator_moss_600f.log
```

Phase 336 旧背景为 `draw_battle=5.93..6.15ms`；本阶段最差增加约
`0.26ms`，总绘制仍低于 60 FPS 的 `16.67ms` 帧预算。该结果只证明本机
GM 观战画面，不代表服务器负载或 200 人同图容量。

## 非目标与验收状态

- 没有改变战斗 AI、技能选择、数值公式、音频、奖励或服务端权威。
- 没有把 GM 候选地面发布到普通玩家战斗，也没有为地面添加碰撞或交互。
- 没有重制任何人物骑宠动作；只是修正运行时主体可见高度。
- 工程门禁和自审通过，但四张地面的最终美术喜好与长期观战舒适度仍由
  项目所有者验收，因此 P2.2/P2.3 均不在本阶段勾选。
