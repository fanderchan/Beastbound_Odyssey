# Phase 388：觉醒式任务目录与多任务追踪

## 参考意图

- 视觉与信息层级参考用户提供的《石器时代：觉醒》“经典任务”截图：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-29d82dfa-428d-4a97-945f-513e9e12841f.jpg`。
- 参考行为是“世界 HUD 只追踪，完整任务背景、目标和奖励进入独立目录页查看”，
  不是把长篇任务说明塞进常驻 HUD。
- Beastbound 复用项目原创木石界面、任务图标、按钮、物品图标和货币图标；不复制参考
  像素、商标或任务内容。

## Beastbound 规则

- 世界 HUD 最多同时显示四条任务，明确标注主线、经典、经验或支线类型；点击任务卡进入
  对应任务详情。
- “经典任务”页列出当前运行时任务目录。当前任务、可领取、可接取、已完成和未开放状态
  分开呈现；未来主线不会被误报成全部可接。
- 右侧详情使用权威 `quests.json` 与玩家档案展示标题、背景说明、目标、进度、等级要求和
  奖励。奖励卡复用真实背包物品／货币图标。
- “立即前往”复用现有任务寻路合同；当前任务、已接支线和可接任务分别路由到目标、交付
  NPC 或接取 NPC。未开放和已完成任务不可寻路。
- “领取奖励”只在服务器／进度模型确认当前主任务已完成时出现，继续沿用现有权威领取与
  自选奖励链路。

## 明确非目标

- 本阶段不照抄参考图的“任务券快速完成”。Beastbound 尚无任务券物品、消耗规则、经济
  来源或权威服务端动作；在产品规则确定前不制造假按钮或客户端直改任务状态。
- 不修改任务数值、奖励数值、任务顺序、存档结构或客户端／服务端协议版本。
- 不把任务目录扫描放进逐帧热路径；HUD 条目只在任务签名失效时重建。

## 实现合同

- `QuestAwakenedPresenter` 负责把权威档案与任务表投影为目录、详情、奖励和 HUD 追踪条目。
- `QuestAwakenedPanel` 负责 1280×720 全屏目录、选择、帮助、奖励预览和既有领取／寻路控件。
- `DialogQuestCoordinator` 仍负责权威领取与导航；新面板只是选择目标和呈现状态。
- 旧 `quest_title_label`／`quest_detail_label` 兼容引用保留为隐藏语义节点，避免破坏既有检查
  和非视觉消费者。

## 验证证据

- 实机任务页：
  `.run/evidence/phase388_quest_awakened_ui/implementation/iteration2/quest-page.png`；
- 实机多任务 HUD：
  `.run/evidence/phase388_quest_awakened_ui/implementation/iteration2/task-tracker.png`；
- 参考与实机同屏比较：
  `.run/evidence/phase388_quest_awakened_ui/comparison/reference-vs-implementation.png`；
- 最低解析检查：`godot --headless --path client/godot --quit`；
- 完整任务链、目录选择和 HUD 多任务检查：`--auto-quest-ui-check`，`status=ok`；
- 自选奖励与追踪寻路：`--auto-quest-reward-choice-check`、
  `--auto-task-tracker-route-check`，均为 `status=ok`；
- 战斗复合检查中的任务断言为 `quest=true`、`quest_readonly=true`、
  `command_after=true/true`；该复合检查仍因既有战斗大体型标签
  `large_visible=false` 失败，与任务页无关；
- idle 探针稳定 `60 FPS`、`process_total=0.10–0.16ms`；真实跨帧移动
  `status=ok`、`60 FPS`、`process_total=0.17–0.27ms`。
