# Phase94 转生与远程兽栏路线设计

## 本轮结论

当前宠物面板里的 `存入` / `取出` 本质上已经是开发期的随身兽栏。正式规则应拆成两个入口：

- `村内兽栏`：普通玩家在村里通过兽栏管理员或兽栏柜台使用。
- `远程兽栏`：后期永久能力。Phase101 已调整为 `4转 Lv1` 后可选学习，用来配合 4->5 需要四只转生兽的兽栏压力。

在远程兽栏解锁前，普通宠物面板不应默认提供随身存取。GM/QA 面板可以继续保留测试快捷入口，但它不是正式玩法。

## 8.0 参考语义

只参考机制方向，不复制代码或数据。

从 `fanderchan/StoneAge` 8.0 源码可确认：

- 转生是 NPC 对话驱动流程，不是普通随身按钮。
- 人物转生有等级门槛，源码里有 `CHAR_LV < 80` 的失败条件。
- 转生次数保存在角色字段里，源码里使用 `CHAR_TRANSMIGRATION`，并支持 5 转 / 6 转上限分支。
- 转生前置不是单一等级判断，还会检查事件旗标、任务进度、特定宠物或物品。
- 新基础点不是简单固定奖励，源码里会把当前等级、任务完成数量、旧属性总量和转生次数共同纳入计算。
- 六转有特殊处理，不能简单等同于前五次的线性累加。

这说明 Beastbound 的转生也应该有“练级时机、任务完成度、加点方向”带来的技巧空间，否则就无法形成极品人和废号的差异。

## Beastbound 核心定义

### 转生次数

- `0转`：默认角色。
- `1转` 到 `6转`：每次都需要完成对应任务链和等级条件。
- 第一版只做人物转生，不做宠物转生。
- 宠物转生另开后续系统，避免和人物极品人公式混在一起。

### 远程兽栏

- 解锁条件：完成四转后，人物回到 Lv1 时可选学习。
- 解锁结果：玩家获得永久能力 `remoteStable`。
- 解锁后宠物面板可以显示远程 `存入` / `取出`。
- 解锁前需要去村内兽栏管理员处打开兽栏。
- GM/QA 可以绕过正式条件打开兽栏，用于测试。

### 极品人空间

转生收益应来自三类变量：

- `当前等级`：至少 Lv80 才能转生；越接近阶段上限收益越好。
- `转生任务完成度`：主线必须完成，额外考验任务影响转生后的能力重算。
- `转生前基础属性分布`：生命、攻击、防御、敏捷的投入会影响新一轮基础属性分布。

这会形成可理解的玩家技巧：

- 太早转生：速度快，但转生后基础能力收益低。
- 不做额外任务：能转，但上限差。
- 加点乱：新基础属性继承方向可能不理想。
- 练满、任务做全、按目标流派加点：更容易做极品人。

## 建议存档字段

放在 `player_profile.player` 或独立 `progression` 节点中，具体实现时再按现有 `PlayerProgressModel` 风格落地。

```json
{
  "rebirthCount": 0,
  "rebirthHistory": [
    {
      "fromRebirth": 0,
      "toRebirth": 1,
      "level": 100,
      "questScore": 18,
      "baseStatsBefore": {
        "maxHp": 160,
        "attack": 45,
        "defense": 28,
        "quick": 90
      },
      "statCarryScore": 24
    }
  ],
  "rebirthQuestCompletions": [],
  "unlockedAbilities": []
}
```

## 建议公式方向

第一版不把最终数值定死，但先保留可调字段：

```text
等级分 = clamp(当前等级, 80, 等级上限)
任务分 = 必做转生任务 + 额外考验任务
旧点分 = 当前基础四维总量
内部转生评分 = f(等级分, 任务分, 旧点分, 当前转生次数)
新基础四维 = 默认新手四维 + 按旧四维分布分配的能力继承值
```

设计要求：

- Lv80 只是门槛，不应是最优。
- 每转都要有明确的“最佳准备方式”。
- 六转可以有特殊规则，但远程兽栏不再绑在六转之后。
- 界面必须展示“转生前 / 转生后预览”，避免玩家误操作废号。
- 真正执行转生前必须二次确认。

## 里程碑拆分

### 里程碑 A：正式兽栏设施与远程兽栏锁定

目标：

- 火芽村新增 `兽栏管理员` 或 `兽栏柜台`。
- 对话主按钮叫 `兽栏`。
- 村内兽栏打开现有宠物存取界面。
- 宠物面板里的随身存取改为受 `remoteStable` 能力控制。
- 未解锁远程兽栏时，普通宠物面板仍可查看、改名、排序、图鉴详情、丢弃，但不能随身存取。
- GM/QA 保留测试入口。

核对点：

- 是否现在就把普通宠物面板的 `存入` / `取出` 隐藏，还是先显示为禁用并提示去村内兽栏。
- 正式 NPC 名字用 `兽栏管理员`、`兽栏柜台`，还是村内具体人物名。

### 里程碑 B：转生数据模型与预览

目标：

- 新增人物转生字段。
- 新增 `RebirthModel` 或同等聚焦模型，避免继续膨胀 `main.gd`。
- 做第一版转生资格判断：
  - 人物 Lv80 以上。
  - 当前转生次数低于 6。
  - 当前转生任务链完成。
- 做转生预览，不实际执行。
- 状态面板显示 `0转 / 1转 / ... / 6转`。

核对点：

- 第一版等级上限按多少算预览上限。
- 公式先用“方向正确的临时公式”，还是等你拍最终数值后再写。

### 里程碑 C：一转任务链与转生执行

目标：

- 加入第一条一转前置任务链。
- 加入转生 NPC。
- 转生执行后：
  - 等级回到 Lv1。
  - 经验清零。
  - 转生次数 +1。
  - 基础属性按预览结果重算。
  - 生命恢复满。
  - 装备、宠物、背包是否保留按规则处理。

核对点：

- 转生是否保留当前装备穿戴。
- 转生是否保留属性点未分配状态。
- 一转任务链长度和叙事风格。

### 里程碑 D：二转到六转框架

目标：

- 抽象任务链结构，避免写六套重复代码。
- 每转有独立入口任务、考验目标、交付 NPC。
- 四转后可触发远程兽栏任务，且它是可选任务，不阻断后续转生。

核对点：

- 每转是否需要不同村落 / 地图。
- 每转是否必须引入指定宠物、指定道具或战斗考验。

### 里程碑 E：远程兽栏任务

目标：

- Phase99 首版为六转后开放；Phase101 已改为四转后开放。
- 完成后写入 `remoteStable` 永久能力。
- 宠物面板恢复随身 `存入` / `取出`。
- 玩家界面明确这是学会的能力，而不是开发期快捷入口。

核对点：

- 远程兽栏是否随时可用，还是战斗中 / 特殊地图禁用。
- 远程兽栏是否有冷却、费用或道具消耗。

## 里程碑 E 实现记录

Phase99 已落地：

1. 新增 `远程兽栏` 任务。
2. 任务要求人物已完成六转，并且尚未学会 `remoteStable`。
3. Phase101 调整后，四转执行后，远程兽栏作为可选任务在 `兽栏管理员阿牧` 处可完成，不占用主线 active。
4. 任务由 `兽栏管理员阿牧` 完成，对话主按钮为 `完成`，不会被普通 `兽栏` 设施按钮挡住。
5. 任务奖励新增通用能力奖励类型，领取后写入 `unlockedAbilities: ["remoteStable"]`。
6. 学会后，普通宠物面板里的 `存入` / `取出` 会恢复可用；未学会前仍只能去村内兽栏或使用 GM/QA 入口。
7. 第一版远程兽栏暂不做费用、冷却和地图限制；后续可在 `_pet_panel_has_stable_access` 外围加正式禁用条件。

本阶段自测：

```sh
godot --headless --path client/godot --quit
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-remote-stable-unlock-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-player-rebirth-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-quest-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-quest-ui-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-stable-facility-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-pet-stable-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-qa-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-player-rebirth-execute-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --shop-select-perf-check
```

结果：

- `--auto-remote-stable-unlock-check`: ok。
- `--auto-player-rebirth-chain-check`: ok，Phase101 后六转主线 active 为空，远程兽栏为四转可选任务。
- `--auto-quest-chain-check`: ok。
- `--auto-quest-ui-check`: ok。
- `--auto-stable-facility-check`: ok。
- `--auto-pet-stable-check`: ok。
- `--auto-qa-panel-check`: ok。
- `--auto-player-rebirth-execute-check`: ok。
- `--movement-spam-click-check`: ok，`clicks=120`，`applied=2`。
- `--shop-select-perf-check`: ok，`item_us=633363`，`equipment_us=900568`。

性能对比：

- Phase98 基线：`movement applied=2`，商店 `item_us=574987`，`equipment_us=890959`。
- Phase99 当前：`movement applied=2`，商店 `item_us=633363`，`equipment_us=900568`。
- 结论：移动连点保持合并；商店切换为小幅波动，没有回到秒级卡顿。

预览：

```sh
godot --path client/godot --scene res://scenes/Main.tscn --write-movie ../../.run/godot/phase99_remote_stable_unlock.png --quit-after 120 -- --remote-stable-unlock-preview
```

截图证据：

- `/Users/fander/projects/Beastbound_Odyssey/.run/godot/phase99_remote_stable_unlock00000119.png`

## 里程碑 A 实现记录

本阶段已落地：

1. 火芽村入口新增 `兽栏管理员阿牧`。
2. 对话主按钮为 `兽栏`。
3. 村内兽栏打开现有宠物存取界面。
4. 普通宠物面板的 `存入` / `取出` 受永久能力 `remoteStable` 控制。
5. 未解锁远程兽栏时，普通宠物面板仍能查看、改名、排序、图鉴详情、丢弃，但存取按钮禁用并提示去村内兽栏。
6. GM/QA 面板新增 `兽栏` 测试入口，等同站在村内兽栏旁。
7. 新增 `--auto-stable-facility-check`。

本阶段故意不做转生数值、转生 NPC、六转任务链，只保留 `remoteStable` 永久能力字段，供六转后任务奖励写入。

## 里程碑 B 实现记录

本阶段已落地：

1. 新增 `RebirthModel`，集中处理人物转生字段、资格判断和预览公式。
2. 玩家档案新增 `rebirthCount`、`rebirthHistory`、`rebirthQuestCompletions`。
3. 状态面板显示 `转生: 0转`，并新增 `转生预览` 按钮。
4. 转生预览只展示资格、要求、当前能力和转生后预览能力，不提供执行按钮。
5. 玩家界面不出现额外隐藏数值概念；内部公式只作为临时预览评分，后续可替换正式数值规则。
6. GM/QA 面板新增 `转生预览` 快捷入口，走同一套玩家预览面板。
7. 新增 `--auto-player-rebirth-preview-check`。

本阶段故意不做转生 NPC、不做一转任务链、不实际执行转生。

## 里程碑 C 实现记录

本阶段已落地：

1. 火芽村入口新增 `转生导师阿岚`，地图设施标签为 `转生`。
2. 新手链在 `捕捉乌力` 后追加 `一转资格`。
3. 完成 `一转资格` 会写入 `rebirth_1` 完成标记。
4. 转生预览面板新增 `执行转生` 按钮，第一次点击变成 `确认转生`，第二次才真正执行。
5. 执行一转后：
   - `rebirthCount` 从 0 变为 1。
   - 等级回到 Lv1。
   - 经验清零，下一经验按 Lv1 重新计算。
   - 基础四维按预览结果重算。
   - 生命恢复满。
   - 未分配属性点清零，避免把上一轮未用点数带到下一轮。
   - 装备、背包、宠物保留。
   - `rebirthHistory` 写入一条转生历史。
6. GM/QA 命令清单新增 `--auto-player-rebirth-execute-check`。

本阶段仍只做人物一转；二转到六转任务框架、六转后远程兽栏奖励不在本阶段执行。

## 自测命令

基础解析：

```sh
godot --headless --path client/godot --quit
```

正式兽栏与远程兽栏门槛：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-stable-facility-check
```

人物转生预览：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-player-rebirth-preview-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-player-rebirth-execute-check
```

手动预览：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --player-rebirth-preview
```

回归检查：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-pet-stable-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-player-status-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-quest-chain-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2200 -- --auto-quest-reward-choice-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-map-panel-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-facility-marker-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-facility-dialog-options-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-qa-panel-check
```

性能基线：

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --movement-spam-click-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --shop-select-perf-check
```

本阶段性能目标是继续保持 Phase93 后的水平：移动连点不触发大量重复寻路，商店切换不出现秒级卡顿；若后续阶段明显劣化，应优先暂停功能开发排查性能。

本阶段实测：

- `auto-player-rebirth-execute-check`：`status=ok data=true mentor=true quest_record=true execute=true first_button=true confirm=true ui=true count=1 level=1 history=1`。
- `auto-quest-chain-check`：`status=ok ... capture=true rebirth_quest=true ... final_task=当前没有任务`。
- `auto-quest-reward-choice-check`：`status=ok ... rope_active=quest_rebirth_1_guidance active=quest_rebirth_1_guidance`。
- `auto-facility-dialog-options-check`：`status=ok ... rebirth=true rebirth_primary=true`。
- `auto-facility-marker-check`：`status=ok ... data=true map_buttons=true target_pick=true quest_target=true`。
- `auto-map-panel-check`：`status=ok ... markers=true marker_count=10`。
- `auto-player-rebirth-preview-check`：`status=ok default=true ready=true maxed=true status_button=true ui=true after_hp=146 after_attack=23`。
- `auto-player-status-check`：`status=ok ... rebirth=true equipment_route=true`。
- `auto-qa-panel-check`：`status=ok ... stable=true rebirth=true gm_10v10=true gm_capture=true`。
- `auto-stable-facility-check`：`status=ok ... village_stored=true village_withdrawn=true remote_enabled=true remote_stored=true`。
- `auto-pet-stable-check`：`status=ok ... no_pet_battle=true full_blocked=true`。
- `movement-spam-click-check`：`status=ok clicks=120 applied=2`。
- `shop-select-perf-check`：`status=ok item_us=508993 equipment_us=762662`。
- 结论：移动连点仍被合并；商店切换没有出现秒级卡顿回退。

本阶段视觉证据：

- `/Users/fander/projects/Beastbound_Odyssey/.run/godot/phase94b_rebirth_preview00000119.png`
- `/Users/fander/projects/Beastbound_Odyssey/.run/godot/phase94c_rebirth_execute_preview00000119.png`
