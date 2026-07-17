# Phase 289：Lv20 公开成长证据成熟合同

## 结论

P1.1d 的第一片只回答“什么时候可以让成长规则参与判断”，不执行丢弃、移出、替换或删除。新 `authority-v1` 宠物从 Lv2 起仍可向玩家展示实测成长与 Lv140 外推，但服务端自动成长规则必须等到 Lv20，即完成 19 次公开升级观察后才具备资格。所有结果继续 `retainPet=true`。

截图中的 Lv20 蓝人龙公开事实可被 Node 与 Godot 独立复算为：生命成长 9.158/级、攻击 2.579/级、防御 1.000/级、敏捷 1.211/级，四项分位约 89.0/91.9/38.7/30.4，综合成长 7.105/级、A 90%。计算没有读取 private seed、private roll、内置品质或未来逐级结果。

## 石器 8.0 基线与 Beastbound 差异

本地稳定参考中的 `gmsv/src/callfromcli.c` 把丢宠建模为玩家显式 `DP` 指令，战斗中拒绝；`gmsv/src/char/pet.c` 的 `PET_dropPet` 会写 `Drop(丢宠)` 日志。多个宠物获得/邮件/交易入口按 `CHAR_MAXPETHAVE` 检查空位，满位时明确失败。该参考服务端没有可验证的“读取隐藏成长后自动删除宠物”合同，因此不能把自动成长筛选伪装成石器 8.0 原样机制。

Beastbound 的差异是 20 格兽栏、长时间在线/离线挂机和已有的公开实测成长评价。自动判断能减少老玩家批量练宠的重复劳动，值得原创；代价是任何过早或误判都会直接破坏“抓极品、练到约 Lv20 决定去留”的核心乐趣。因此当前采用硬 Lv20 门槛，并把自动处置继续留在关闭状态。

## 服务端合同

`pet-observed-growth-screening.js` 只读取以下公开字段：

- `growthModelVersion`、`growthSpeciesProfileId`、`formId` / `templateId` 和当前等级；
- 两份必须完全一致的公开 Lv1 四维 `initialStats` / `growthSpeciesLevel1Stats`；
- 当前生命、攻击、防御、敏捷；
- 共享 `pet_growth_species_profiles.json` 的 10,000 样本逐级分位表，以及 `pet_growth_profiles.json` 的当前战力公式。

状态固定为：

- Lv1：`unobserved`，还没有升级证据；
- Lv2–19：`observing`，可以展示评价但 `growthRuleEligible=false`；
- Lv20–140：`mature`，只代表成长规则可以参与判断；
- legacy、未知档、形态与成长档不匹配、两份 Lv1 四维不一致、当前四维异常低于 Lv1、数值缺失、未来配置或损坏数据：`unavailable`，失败关闭。

不论状态如何，返回值都为 `retainPet=true`。显式未来观察 schema、缺级、非单调阈值、负成长、全维零成长和非法战力权重会在目录创建时失败；单维零成长是现有正式宠物的合法设计，不会被误拒。后 25 个万人模拟档历史上省略了 `schemaVersion`，其结构与 v1 一致，读取器只对这个既有缺省做 v1 兼容，显式未来版本仍拒绝。

## 客户端一致性

`pet_growth_screening_model.gd` 复用现有玩家可见的 `PetGrowthObservationModel`，再施加与 Node 相同的 authority-v1、两份 Lv1 四维一致和 Lv20 门槛。现有成长自动检查加入蓝人龙跨运行时固定向量，锁定四项成长、四项分位、综合成长、评级、Lv19/Lv20 边界以及 private canary 不影响结果。

这不是新面板，也没有改变当前宠物成长页；玩家仍可在 Lv2 起查看实测预测。当前联网自动丢弃开关继续隐藏并由服务端强制为 false。

## 宠物设计 Skill

项目 Skill 现在把 Lv20/19 次升级写成自动成长规则的硬门槛，并明确：成长筛选结果不等于删除许可。检查器会确认 Node 中存在“公开阈值、Lv20、默认保留”合同，后续自然语言新增宠物必须继续提供 10,000 样本的 Lv2–140 观察表。

## 非目标

- 本片不新增玩家规则字段、按钮、最近处理列表或恢复按钮。
- 本片不让已训练宠绕过现有绑定、锁定、任务、骑乘、出战、技能变化和培养保护。
- 本片不保存派生评级到档案，不增加每帧、每次绘制或网络轮询计算。
- 本片不连接 MySQL、不改共享数据库参数、不启动本地后端，也不操作真实玩家宠物。

## 验证

- Node 观察筛选、成长目录、成长运行时和公开投影：`31/31`。
- Godot parse 与 `--auto-pet-growth-observation-check`：`2/2`，日志中 `screening=true screening_status=mature`。
- Pet Design Inspector：`errors=0 warnings=2`；两个警告均为既有的蓝人龙显式世界位置和完整公开投影范围问题。
- JavaScript/GDScript 解析与 `git diff --check` 通过。

## 后续

P1.1d-2 再加入服务端权威的成长规则与玩家预览，但仍只 dry-run、不移动宠物。之后才设计已训练野外宠的专用保护模式、玩家可见最近处理记录和可恢复处置；最终开关必须等容量竞态、重复请求和恢复组合全部通过。
