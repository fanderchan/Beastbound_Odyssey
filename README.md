# Beastbound Odyssey / 万兽纪元

Beastbound Odyssey / 万兽纪元是一个原创的、受石器时代启发的 2.5D 回合制宠物 MMORPG 原型。

## 当前状态快照

当前仓库已经进入工程治理和数值策划前置阶段：Godot 4.7 客户端具备完整地图、任务、背包、装备、商店、宠物、图鉴、自动战斗、自动捉宠、骑宠、人物转生、宠物转生、GM/QA 测试入口和数值表骨架。正常游玩入口已经切到本机 Node 账号/档案服务，玩家界面不再提供本地单机账号入口。README 只保留快速入口和功能快照；架构边界见 [docs/architecture.md](docs/architecture.md)，测试与性能基线见 [docs/testing.md](docs/testing.md)。

功能快照：

- 45 度/等距起步地图。
- 第二张地图：`火芽村入口`。
- 可走格和阻挡格来自结构化地图数据。
- 鼠标/触摸点击后会绕开阻挡区寻路。
- 较大测试地图上已有镜头跟随。
- 已有 8 方向占位朝向。
- 已有 idle/walk 占位动画提示。
- 可通过 `驯宠戒` 开启宠物跟随。
- NPC 和门点可以点击互动。
- 地图之间已有可踩踏传送点。
- `火芽村入口` 有可见遇敌区域，自然走格会按概率直接进入战斗。
- 战斗结束回地图后有 1 秒遇敌保护，避免刚回地图立刻再次遇敌。
- 动作栏 `挂机` 会在遇敌区内自动来回走动，复用自然遇敌逻辑。
- 火芽杂货铺出售初级 / 中级 / 高级遇敌石，站在遇敌区使用后按 3 / 2 / 1 秒固定触发遇敌。
- 动作栏 `挂机` 在来回走动或遇敌石生效时会变为 `停`；停止会同时清掉自动移动和遇敌石。
- 战斗指令面板使用用户指定布局：
  `攻击` / `精灵` / `捕捉` / `help`，下一排是 `防御` / `物品` / `换宠` / `逃跑`。
- 旧石器战斗方向：指令在右上，敌方在左上，我方在右下。
- 10v10 阵型槽位：双方各两排、每排五个；PC/手机共用同一套移动端优先阵型模板。
- 10v10 我方阵型中，受控人物占位用红金色区分。
- 战斗预览使用连续地面，不再有天空/地面分界线。
- `--battle-preview-10v10` 会填满 20 个槽位，并显示检查用网格/锚点。
- `攻击` 和 `捕捉` 会进入敌方选目标模式；PC 悬停显示目标圈，点击/触摸确认目标。
- 人物和受控宠物都选择指令后，`攻击` 会生成按敏捷/速度排序的本地战斗事件列表。
- `攻击` 会命中当前选择的活着敌人；人物必须先选敌人，才进入受控宠物指令步骤。
- 活着的我方和敌方按混合速度顺序行动，不再是我方整批、敌方整批。
- 敌方攻击会在活着的我方单位中选目标，不再固定打中间位或主角位。
- 相邻且同目标的我方攻击可以折叠成可见 `合击` 事件。
- 命中目标上方会飘伤害数字，倒下/捕捉的占位角色会淡出。
- `捕捉` 可以抓住弱化后的野怪，并返回地图。
- 10v10 中只有 `见习猎人` 和 `小布伊` 由玩家控制，其他我方单位使用简单攻击 AI。
- `精灵` 会打开人物精灵菜单：`恩惠精灵5`、`滋润精灵5`、`毒精灵5`、`毒雾精灵5`。
- 人物指令后，同一个右上面板会切换成受控宠物的 `宠物` 面板。
- 宠物面板已有 `技1 攻击`、`技2 防御`、`技3 布伊冲撞`；敌方目标技能走同一套悬停/点击/触摸选目标流程。
- 战斗面板标题行保留短按钮 `自动`；开启后人物和受控宠物会按 `内挂设置` 自动提交指令。
- 自动开启后会显示 `停止`；回合播放导致指令面板隐藏时，也会保留独立浮动 `停止` 按钮。
- 自动攻击开关会在本次客户端运行期间跨战斗保留，方便后续挂机遇敌循环衔接。
- 动作栏新增 `内挂` 入口，设置面板使用滚动内容区。
- 人物内挂动作区分 `首回合` 和 `一般回合`，可选攻击、防御、精灵和当前战斗物品。
- 宠物内挂动作区分 `首回合` 和 `一般回合`，并且只按 `技1` 到 `技7` 选择；`技2 防御` 仍然是一个技能槽，不是独立宠物动作。
- 内挂支持目标策略：第一个活着、生命比例最低、当前生命最低。
- 内挂支持人物/宠物血线自动回血，并可按优先级选择 `滋润精灵5`、`肉`、`回复药5`、`恩惠精灵5`、`群体草药5`。
- 回血道具会检查当前战斗数量；前一个来源不可用时会继续尝试下一个来源。
- `内挂设置` 新增 `挂机` 页签，第一版只保留 `低血停止`。
- `低血停止` 默认 `0%`，表示人物战斗中倒下过就停止挂机；回世界后人物生命保底为 `1`。
- `低血停止` 只判断人物生命，不判断宠物生命；也可设置为 `不停止`。
- 动作栏新增 `伙伴` 入口，可加入、移除、加满或清空练级伙伴。
- 最多加入 4 个陪练伙伴；进入草丛后会形成最多 5 人 5 宠的练级队。
- 陪练伙伴和陪练宠在加入时复制当前人物/出战宠，之后独立保存和成长。
- 有陪练时，草丛遇敌会生成 10 个敌方野怪，方便测试 10v10 自动练级和合击频率。
- 陪练人物和陪练宠默认自动攻击，目标顺序按敌方前排 1-5、后排 1-5。
- 胜利结算会给陪练人物和陪练宠经验，并按简单成长规则升级加点。
- `--full-client-preview --gm-10v10-map` 会用完整客户端进入 `GM练级测试场`，测试草丛固定出现 10 只野生宠物。
- `--battle-auto-10v10-preview` 会打开 10v10 练级观察战斗，敌方血量加厚，并直接开启自动攻击，方便观察其他友方 AI 和合击频率。
- 人物、精灵、宠物技能、物品的标签、效果、目标规则都声明在 `client/godot/data/battle_actions.json`。
- 精灵目标规则使用明确布尔字段表达全体、我方、敌方、是否需要点选。
- `物品` 会打开由同一行动目录驱动的测试物品菜单。
- 当前测试物品覆盖四种目标规则：我方全体、我方单体、敌方单体、敌方全体。
- 战斗物品按钮会显示本地数量，例如 `群体草药5 x2`；成功使用会消耗数量。
- 物品数量为 `0` 时，对应按钮禁用。
- `防御` 从回合开始就生效，不再等到自己的速度位置才进入防御。
- 近战攻击、宠物近战技能、合击、击飞/飞出效果已有占位接触动作。
- 玩家宠物队伍区分 `出战中` / `待机` / `休息`；被击飞的宠物进入休息，本场战斗不能再换出。
- `换宠` 复用战斗指令面板，只启用待机宠物。
- 每个成功应用的战斗事件都会产生 `battle_event_ledger`，记录声明目标、实际目标、是否重定向、目标列表、效果值、击飞结果和播放时序。
- Godot 战斗播放读取账本里的实际目标和时间线，因此重定向攻击、延迟扣血、合击击飞、浮字都指向同一份事实。
- 物理攻击、宠物近战技能或合击在原目标死亡后重定向时，会按实际目标防御重新计算伤害。
- 战斗单位现在有统一的 `statuses` 字典，用于异常状态。
- 当前异常状态覆盖 `中毒` / `睡眠` / `混乱` / `石化`。
- `毒精灵5`、`毒雾精灵5`、`毒粉5`、`毒雾粉5` 会在目标承受即时伤害后，如果还活着，就附加持续中毒。
- 中毒会生成回合末 `status_tick` 事件，并显示类似 `毒 -7` 的浮字。
- 睡眠和石化会把尝试行动转成 `status_skip` 事件。
- 混乱会把攻击类行动改打同阵营活着单位。
- 石化会提高目标承受物理伤害时的防御效果。
- 物理伤害会唤醒睡眠目标。
- 状态事件事实会写入战斗事件账本，但不会把调试字段暴露在玩家 HUD 上。
- `--battle-status-test` 会打开可见 `毒` / `眠` / `乱` / `石` 徽标的 10v10 异常状态手工测试战斗。
- 异常状态技能效果现在声明在 `client/godot/data/battle_actions.json`。
- 中毒行动现在在数据里声明 `statusId`、`statusTurns` 和 `statusPotencyRatio`，不再依赖硬编码持续回合。
- 宠物技能槽现在从行动目录读取标签和效果元数据。
- 宠物 `技4 催眠粉`、`技5 迷惑吼`、`技6 石化凝视` 可以点选目标，并结算为 `skill_status` 事件。
- `--battle-status-skill-test` 会打开用于测试新宠物状态技能的 10v10 手工测试战斗。
- 状态行动新增 `statusHitRate` 基础命中率。
- 战斗单位新增 `statusResist` 状态抗性字典。
- 状态最终成功率按 `statusHitRate - statusResist[statusId]` 计算，并限制在 `0.0` 到 `1.0`。
- 状态命中 roll 使用战斗种子、行动、攻击者、目标、状态、回合和事件序号生成，方便自动测试和未来服务器复现。
- 状态被抵抗时不会写入目标 `statuses`，玩家界面只显示 `抵抗` 这类游戏反馈。
- 毒类行动仍会先造成即时伤害；如果持续中毒被抵抗，只扣本次毒伤，不挂持续中毒。
- `statusChance`、`statusRoll`、`statusResistance` 会进入战斗账本/trace，不显示在普通 HUD。
- `--battle-status-hit-test` 会打开 10v10 状态命中与抗性手工测试战斗。
- 状态规则新增 `statusImmune`，可让单位对某个状态完全免疫。
- 战斗单位新增 `passiveSkillIds`，被动技能数据声明在 `client/godot/data/battle_passive_skills.json`。
- 被动技能会先应用到底层规则，例如 `石化免疫` 会给单位写入 `statusImmune.stone = true`。
- 鼠标悬停或触控点选带被动的战斗单位时，顶部会显示 `被动技能名：[被动技能] 解释。`。
- 宠物模板数据声明在 `client/godot/data/pet_templates.json`，当前覆盖布伊系和乌力系。
- 宠物模板源数据里，一个种系必须且只能配置一个 `passiveSkillId`。
- 布伊系种系被动是 `抗性皮肤`，会根据地水火风属性分别提供石化、中毒、混乱、睡眠抗性。
- 乌力系种系被动是 `硬壳体质`，会根据地属性提供石化抗性；10地时表现为石化免疫。
- 现有布伊、乌力战斗测试单位会从宠物模板合成 `formId`、`elements`、`activeSkillIds` 和 `passiveSkillIds`。
- 被动提示条层级低于右上战斗操作框；二者重叠时，操作框在上层。
- `sleep`、`confusion`、`stone` 当前按控制状态处理，互相覆盖；`poison` 可以和一个控制状态并存。
- `物品` 面板新增 `净化草5 x2`，可选择我方单体解除 `毒` / `眠` / `乱` / `石`。
- 状态覆盖会写入 `remove_overwritten`，净化会写入 `remove_cleanse`，免疫会写入 `statusResult = immune`。
- `--battle-status-rule-test` 会打开 10v10 状态解除、覆盖、免疫手工测试战斗。
- 战斗行动播放期间，右上指令面板会自动隐藏；回到可下指令阶段再出现。
- `人物` 面板保持固定 2x4 布局；`宠物`、精灵、物品、换宠面板使用固定宽度的纵向菜单。
- 战斗操作面板和按钮使用轻度半透明样式，便于观察下方阵型和单位。
- 工程/GM 风格的战斗审计输出保持在玩家 UI 之外，可以写入 `.run/battle_trace/latest.jsonl`。
- Node 校验器会检查战斗行动目录和被动技能目录，并能输出后续精灵、宠物技能、道具的起步模板。
- 敌人全灭、捕捉成功和 `逃跑` 会返回地图。
- 走到可互动目标附近后会打开对话。
- 第一个本地任务旗标是 `和训练师阿土对话`。
- HUD 会适配桌面和手机布局。
- 正常启动需要本机 Node 服务，默认地址为 `http://127.0.0.1:8787`。

## 运行

先启动本机账号/档案服务：

```sh
cd server/node
npm start
```

完整版功能测试入口：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --full-client-preview
```

`--full-client-preview` 不会打开局部测试场景，也不会隐藏已有系统；它等价于进入当前完整客户端，只是让测试链接语义更明确。以后做整体验收优先用这个入口，并保持 Node 服务运行。

GM 10v10 完整客户端测试地图：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --full-client-preview --gm-10v10-map
```

这个入口仍然是完整客户端，只是出生在 `GM练级测试场`。该地图草丛遇敌率为 100%，每场固定 10 只野生宠物；我方人数用动作栏 `伙伴` 自己加满。

不带测试参数的正常启动也可以，同样会要求服务器账号登录：

```sh
godot --path client/godot --scene res://scenes/Main.tscn
```

下面这些 `--xxx-preview` 是局部预览入口，只用于快速打开某个功能点，不代表完整客户端缺少其他功能：

2 单位战斗预览：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-preview
```

10v10 阵型预览：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-preview-10v10
```

10v10 自动练级观察预览：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-auto-10v10-preview
```

内挂设置预览：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --auto-battle-settings-preview
```

练级伙伴 demo：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --training-partner-demo
```

挂机设置预览：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --hang-settings-preview
```

10v10 手工检查：

- 人物选目标：按 `攻击`，鼠标悬停敌人会显示目标圈，然后点击/触摸该敌人。
- 宠物选目标：人物目标确认后，按 `技1 攻击` 或 `技3 布伊冲撞`，悬停敌人显示目标圈，然后点击/触摸该敌人。
- 精灵选择：按 `精灵`，选择四种精灵之一，再按目标规则操作。
- `恩惠精灵5`：治疗我方全体。
- `滋润精灵5`：选择我方单体。
- `毒精灵5`：选择敌方单体。
- `毒雾精灵5`：让敌方全体中毒。
- 物品选择：按 `物品`，测试 `群体草药5`、`回复药5`、`毒粉5`、`毒雾粉5`。
- `净化草5`：选择我方单体，解除当前异常状态。

异常状态手工检查：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-status-test
```

在这个场景里，检查 `毒` 是否在回合末跳伤，`眠` 是否跳过行动并在受击后消失，`乱` 是否改打同阵营，`石` 是否跳过行动并降低受到的物理伤害。

宠物异常状态技能手工检查：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-status-skill-test
```

在这个场景里，人物先任意选择一个行动，然后用宠物 `技4 催眠粉`、`技5 迷惑吼` 或 `技6 石化凝视` 点选敌方目标。

状态命中率/抗性手工检查：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-status-hit-test
```

在这个场景里，人物先任意选择一个行动，然后用宠物 `技4 催眠粉`、`技5 迷惑吼` 或 `技6 石化凝视` 点选不同敌方目标。例如 `技4 催眠粉` 点 `普通乌力` 应稳定上 `眠`，点 `厚皮乌力` 应显示 `抵抗`。

状态解除/覆盖/免疫手工检查：

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --battle-status-rule-test
```

在这个场景里，`普通猎人` 开局带 `毒` 和 `眠`，可以用 `物品` -> `净化草5` 点他来解除；`高速乌力` 开局带 `眠`，可用宠物 `技6 石化凝视` 覆盖成 `石`；`高防乌力` 来自乌力系 10地 形态，因 `硬壳体质` 表现为石化免疫，点它应显示 `免疫`。鼠标移到高防乌力身上，顶部应显示 `硬壳体质：[被动技能] 根据地属性获得石化抗性；地属性达到10时免疫石化。`

快速解析检查：

```sh
godot --headless --path client/godot --quit
```

战斗指令校验：

```sh
node tools/battle_action_catalog_check.mjs
node tools/battle_action_catalog_check.mjs --list
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 300 -- --auto-battle-action-catalog-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1400 -- --auto-battle-event-ledger-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3000 -- --auto-battle-item-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3600 -- --auto-battle-item-count-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1200 -- --auto-battle-spirit-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1200 -- --auto-battle-pet-command-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-pet-target-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2400 -- --auto-battle-spirit-four-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3600 -- --auto-battle-settings-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 3600 -- --auto-training-partner-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-hang-settings-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-gm-10v10-map-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1400 -- --auto-battle-status-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1400 -- --auto-battle-status-skill-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1400 -- --auto-battle-status-hit-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-battle-status-rule-check
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-battle-passive-hover-check
```

## 阶段门

Phase30 完成后暂停，等用户测试确认，再进入宠物详情 / 图鉴雏形、捕捉归属或服务端权威战斗事件生成。
