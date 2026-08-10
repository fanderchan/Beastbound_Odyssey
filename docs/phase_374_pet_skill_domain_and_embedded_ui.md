# Phase 374：宠物技能设计域与嵌入式玩家技能页

## 结论

本阶段把旧“宠物技能：技能槽”程序员弹窗替换为宠物大页内的正式玩家技能页，
并新增项目专用 `design-beastbound-skills` Skill。它统一约束技能说明、机制、
目标、原创图标、战斗反馈、AI、服务端权威、平衡仿真和实机验收，避免以后只在
JSON 里写一个名称就把技能误称为完成。

界面保持左侧完整宠物和底部宠物卡带，右侧按“被动技能 → 主动技能”显示：

- 当前所有权威被动技能；
- 固定七个主动技能槽；
- 12 个主动、10 个被动的精确 ID 原创图标；
- 技能名称、来源／类别、主动／被动类型、真实目标与效果；
- 可展开的玩家说明；
- 训练师状态下的已学、价格、覆盖和清空技能槽流程。

项目在本阶段交付时没有技能升级机制，因此本页没有照抄参考图中的虚构
“等级 1／2”。2026-07-30 项目所有者提出正式引入技能 `Lv1–Lv5` 与宠物形态
等级上限；该玩法仍处于产品规则确认阶段，不能把尚未进入权威数据、存档和结算
链路的等级先画进 UI。一级四维、成长、转生和技能仍是相互独立的系统。

## 参考意图与 Beastbound 规则

参考图提供的是产品层级：宠物仍是页面主角，技能以有图标的长卡嵌在宠物页中，
玩家先识别技能，再按需展开阅读。Beastbound 保留这一意图，但使用项目自己的
深木、暗底、暖金、紫色被动和橙色主动视觉，不复制参考游戏的美术资产。

本阶段没有修改既有技能伤害、状态概率、训练价格、AI 决策或服务端结算公式；
只为已有权威能力补齐 canonical 展示、原创图标和玩家入口。`quick_instinct`
目前仍是未实现的表现占位，页面明确显示效果尚未开放，不把它伪装成已生效被动。

## 专用 Skill

新增：

```text
.agents/skills/design-beastbound-skills/
```

主要合同：

- 先查动作、被动、训练、Node 结算、Godot 回放和生产 AI 的真实能力；
- 新技能必须明确角色、反制、目标、公式、边界、失败反馈和自动战斗行为；
- 图标必须按精确技能 ID 交付，32px 仍能辨识，禁止文字、emoji、角色头像和
  烘焙 UI 外框；
- 不受支持的效果必须标为 `blocked`，不能只改 JSON。例如当前宠物技能还不支持
  友方治疗／净化的完整权威链；
- 正式新增或数值重平衡要求每个关键 matchup 至少 1000 场、换边验证和证据路径；
- 玩家可见技能必须有真实 `Main.tscn` 截图、`1×` 视频、性能证据，并保持
  `owner_review_pending` 直至项目所有者明确接受。

Schema v2、示例、validator 和 catalog inspector 已一并交付。Inspector 当前能
识别 12 个主动、10 个被动、4 个训练技能和 22 个正式图标，并会拒绝未受支持的
宠物治疗／净化 JSON-only 设计。

## 数据与运行架构

Canonical 展示字段进入现有权威目录：

- `client/godot/data/battle_actions.json`
- `client/godot/data/battle_passive_skills.json`
- `client/godot/data/pet_skill_training.json`

动作／被动／训练模型统一返回 `description`、`role`、`source`、`iconPath` 和
`mechanicsImplemented`，训练目录不再复制另一份容易漂移的说明。

新 UI 由以下聚焦组件组成：

- `PetSkillPresentationModel`：把宠物的被动、七槽和训练候选投影为玩家卡片；
- `PetSkillIconCatalog`：精确 ID 图标解析与安全空槽；
- `PetSkillVisualSkin`：技能卡、徽章、选中态和滚动面板的共享视觉；
- `PetSkillCard`：普通、展开、空槽、训练候选和清空操作卡；
- `PetSkillOverviewPanel`：被动优先、七槽、训练候选及事件路由。

`PanelFlowCoordinator` 只负责把新面板接到既有宠物详情模式和既有权威训练动作。
旧弹窗节点暂留隐藏兼容，不再作为正常玩家或训练师入口。

## 原创图标包

图标包位于：

```text
client/godot/assets/skills/pet_skill_icons_v1/
```

它包含 22 个精确技能 ID 图标和 1 个空槽图标：

- `source/generated`：512×512 原稿；
- `runtime/active`、`runtime/passive`：256×256 运行图；
- `runtime/common/empty_skill_slot.png`：石骨加号空槽；
- generation ledger、prompt、来源／权属说明和 SHA-256 manifest。

全部为本项目原创生成资产；没有复制参考游戏图标。运行卡片使用 UI 自身边框，
图标不烘焙文字或边框，后续可独立替换而不改技能逻辑。

## 玩家流程

普通宠物页：

1. 点击右侧“技能”；
2. 先看该形态全部权威被动；
3. 再看固定七个主动槽；
4. 点击任一技能卡展开真实目标、效果和说明；
5. 点击底部宠物大头照切换宠物，右侧原位刷新。

宠技训练师：

1. 进入同一嵌入式技能页；
2. 选择要覆盖的主动槽；
3. 选择训练候选，看到已学状态或真实石币价格；
4. 二次确认后沿用既有本地／服务端权威写入；
5. 也可选择“清空技能槽”，经“确认清空”免费恢复空槽。

本页不在普通模式显示石币价格或学习按钮，也不改变服务端价格、资格和 revision
合同。

## 视觉验收

设计对照记录在根目录 `design-qa.md`。原 Phase 374 录像在中段滚动时，滚动裁切
区底边侵入木框约 14px，项目所有者于 2026-07-30 发现了卡片描边越过木框的 P2
问题。该问题已通过把详情底部安全边距从 16px 调整为 32px，并显式启用滚动裁切
修复；自动回归实测木框与滚动区间距为 34px。修复后的工程门禁通过，视觉状态
重新回到 `owner_review_pending`，等待项目所有者查看新录像。

最终连续实机视频：

```text
.run/evidence/phase374_pet_skill_page_owner_review/phase373-20260729T191915.446591Z-226ad206/pet-management-owner-review-1x.mp4
```

| 项目 | 结果 |
| --- | --- |
| 场景 | 真实 `res://scenes/Main.tscn` |
| 分辨率 / 帧率 | 1280×720 / 30 FPS |
| 时长 / 帧数 | 53.533 秒 / 1606 帧 |
| 播放速度 | `1.00x`，录制与转码均未改变时序 |
| 视频 / 音频 | H.264 `yuv420p` / AAC |
| SHA-256 | `d23dee1913cde2a630ca59736e523bdded2ccd62f22c083404f3280b1bda7390` |
| 完整解码 | 视频流与音频流均通过 |
| 隔离 | 未启动后端、未访问 MySQL、独立 `user://` 零文件 |
| owner 状态 | 等待项目所有者观看本片后确认 |

视频连续展示普通技能页、展开详情、切换宠物、训练候选、选择槽位、覆盖确认、
成功学习、清空操作、清空确认和真实空槽结果。

修复滚动越界后的连续实机复核视频：

```text
.run/evidence/phase375_pet_skill_clip_fix/phase373-20260729T195349.615151Z-6b635470/pet-management-owner-review-1x.mp4
```

其中 `screenshots/frame-02.png` 覆盖原截图所示的中段滚动状态；卡片在木框内被
裁切，底部宠物栏与技能视口之间保留 34px 实测安全距离。

## 验证

- Skill example validator：通过；
- Skill `quick_validate.py`：通过；
- catalog inspector：`active=12`、`passive=10`、`trained=4`、
  `icons=22`、`errors=[]`；唯一提示是既有 `quick_instinct` 尚未实现；
- `node tools/battle_action_catalog_check.mjs`：动作、被动、34 个宠物形态和
  七技能槽目录通过；
- `godot --headless --path client/godot --script
  res://scripts/qa/pet_skill_page_model_check.gd`：`ok=true`，22 图标、普通页、
  训练页、尺寸、真实跨帧鼠标点击和信号隔离通过；
- Godot parse、`--auto-pet-management-check` 和
  `--auto-pet-skill-training-check`：`3/3` 通过；
- 录像工具单测：`9/9` 通过；
- 视频媒体合同、音视频完整解码、九个关键截图和联系表：通过；
- idle headless 探针稳定 30 FPS、`process_total=0.23..0.48ms`；
- 真实跨帧移动探针稳定 60 FPS、`process_total=0.33..0.42ms`，
  `status=ok`。

当前工作树包含此前连续开发，无法安全构造完全隔离的改前性能基线；本阶段没有
把目录扫描、完整 profile normalize、网络或阻塞 I/O 放入 `_process`、`_draw`
等热路径，面板只在打开、切宠、训练结果和显式点击时重建。

本阶段没有运行完整 `tools/run_local_ci.mjs`，也没有新增／重平衡技能，因此没有
触发新技能 1000 场平衡仿真。定向目录、模型、真实 Main、训练回归、媒体和性能
门禁覆盖了本次实现范围。
