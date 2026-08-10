# Phase 384：觉醒风格宠物图鉴与获取途径内嵌页

## 参考意图与原创边界

本阶段依据项目所有者提供的《石器时代：觉醒》图鉴截图，重建其玩家可感知的信息层级：
左侧种族列表、中部宠物主舞台与同族形态带、右侧成长／属性页签，以及由“获取途径”
按钮打开的中央内嵌页。参考图只用于布局、密度和暗木暖金材质方向；运行时底板、宠物图、
技能图标、物品图标、文字和数据均为 Beastbound 原创或项目内正式来源，不复制外部游戏
资产、数值、商标或截图像素。

正式底板位于
`client/godot/assets/ui/pet_codex_awakened_v1/runtime/pet_codex_backdrop_1280x720.png`；
生成提示、原始结果、SHA-256、替换路径和 `owner_review_pending` 状态与其一同保存。

## Beastbound 规则与数据合同

- 图鉴只显示已经遇见的形态身份；未遇见的种族、名称、画像和获取途径继续隐藏。
- 成长页展示该形态公开的 Lv1 四维区间，不把个体隐藏成长或最终质量提前公开。隐藏成长
  仍需玩家通过升级训练后判断。
- 属性页使用当前形态的真实元素、亚种、捕捉难度、主动／被动技能和对应正式图标。
- 获取途径不维护第二份手写表。野外路线由所有已注册地图的权威 `encounterZones` 与
  `wildPetPool` 推导，显示地图、区域、等级范围和遭遇池占比；进化形态则补充权威进化
  路线。Presenter 只在显式刷新时计算并按形态缓存，不进入 `_process`、`_draw` 或 HUD
  签名热路径。
- “获取途径”是全屏图鉴内部的玩家弹层；左键打开与关闭均消费 UI 输入，不触发世界移动、
  寻路或后端写入。
- 本阶段只改客户端展示和读取，不更改宠物 ID、平衡公式、地图遭遇规则、协议版本或服务端
  权威写入。

## 实现结构

- `PetCodexPresenter`：把图鉴档案、宠物模板、成长档、技能目录、地图遭遇和进化路线整理为
  独立 View State。
- `PetCodexAwakenedPanel`：负责 1280×720 三栏布局、种族／形态选择、成长／属性页签和
  获取途径弹层。
- `PanelFlowCoordinator`：只保留创建、信号接线、选择和刷新协调；没有把图鉴数据规则重新
  塞进宿主入口。
- 正常预览与自动检查都从 `res://scenes/Main.tscn` 进入；获取途径预览通过跨帧鼠标移动、
  按下和释放真实点击按钮，不直接调用弹层方法。

## 验证与证据

最终 1280×720 实机图：

- 主界面：
  `.run/evidence/phase384_pet_codex_awakened_ui/preview-final/pet-codex00000044.png`；
- 获取途径：
  `.run/evidence/phase384_pet_codex_awakened_ui/acquisition-final/pet-codex-acquisition00000049.png`；
- 主界面对照：
  `.run/evidence/phase384_pet_codex_awakened_ui/design-qa/normal-reference-vs-implementation.png`；
- 弹层对照：
  `.run/evidence/phase384_pet_codex_awakened_ui/design-qa/acquisition-reference-vs-implementation.png`。

定向门禁：

```text
Godot parse + pet codex detail + pet codex list + pet management + portrait catalog：5/5 passed
宠物设计合同：errors=0 warnings=0，36 forms
战斗／技能目录：status=ok，34 actions，10 passives，36 petForms
asset-manifest.json：jq parse passed
git diff --check（本阶段目标路径）：passed
```

图鉴检查覆盖 36 形态、11 种族、同族形态数量、中文“鉴”字形、真实画像、未遇见隐藏、
已遇见可见、真实鼠标点击打开“获取途径”、至少一条权威路线、弹层关闭，以及点击过程中
世界寻路计数不变。既有战斗遇见／捕捉记录语义也继续通过。

## 性能证据

- 改造前最近一次可见宠物页基线约 `process_total=0.13–0.14ms`；世界 HUD 空闲基线约
  `0.04ms`，真实移动约 `0.04–0.05ms`。这些是前阶段同机器证据，不冒充本次同一进程
  的严格 A/B。
- 当前图鉴常驻打开、1600 帧 headless 采样，稳定 `process_total=0.42–0.50ms`，低于
  项目空闲门槛；正式 Metal 1280×720 录帧的 CPU render 平均 `0.12ms/frame`。
- 当前关闭面板后的真实跨帧点击移动：启动样本 `54.4 FPS`，后续 `60.0 FPS`，
  `process_total=0.44–0.46ms`，37 次输入全部接受，`max_input_us=3`，最终
  `status=ok`、`coalesced=true`、`settled=true`。

录帧退出时仍出现 `4 ObjectDB instances leaked` 与 `2 resources still in use` 警告；
定向 Godot 解析和自动检查没有脚本错误。本阶段没有运行完整 `tools/run_local_ci.mjs`，因为
变更由图鉴、宠物管理、画像、目录合同、真实输入和性能定向门禁覆盖。

## 非目标与验收状态

- 不制作移动端、竖屏或触屏专用布局；正式基准仍为 PC 1280×720。
- 不伪造尚不存在的转生前后成长范围、成就、稀有度、活动入口或收费获取方式。
- 不把 QA、资源路径、内部 ID、性能或服务端字段显示在玩家界面。
- 工程与 Design QA 已通过；项目所有者观看本文两张最终实机图并明确接受前，底板主观
  美术状态保持 `owner_review_pending`。
