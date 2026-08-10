# Phase 390：觉醒式商店、银行与装备合成

## 参考意图

- 装备合成的视觉层级参考用户提供的《石器时代：觉醒》锻造截图：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-a9125da2-b792-4708-8bba-654258fd7cc3.jpg`。
- 提炼左侧方案、中央产物／材料／属性、右侧功能与底部主动作的成熟层级；不复制参考图
  像素、商标、素材、数字或 Beastbound 当前没有的数据域。
- 商店和银行没有直接外部截图，按已经落地的背包、图鉴、家族、地图、任务和设置页的
  暗木、玄武岩、骨绳与暖金视觉语言原创设计。

## Beastbound 规则

### 商店

- 保留真实商店目录、石币／钻石、购买、出售、数量、最大值、双击快速交易、拖放拆分、
  装备对比、购买后装备和整身修理。
- 客户端不相信画面中的价格或库存完成结算；正常联网交易继续由服务器重新读取目录、
  资格、钱包、背包和装备实例并返回权威档案。
- “购买后装备”仍是购买成功后再提交一次装备请求，不在 UI 中暗示为一个可回滚的原子
  事务。

### 银行

- 保留六页／每页十五格、顺序解锁、普通堆叠物、精确装备实例、石币存取、左键双击、
  拖放和数量拆分。
- 装备不能按 `itemId` 折叠：选择、存入和取出继续携带现有稳定实例／信封身份。
- UI 不做乐观资产修改，只有服务端成功返回权威档案和 revision 后才刷新背包与银行。

### 装备合成

- 当前只开放两个真实且确定成功的配方：木质碎片合成硬木棒、皮革碎片合成缝皮背心。
- 材料槽按配方动态渲染并居中；当前配方各只有一种材料，因此不会为了模仿参考图伪造
  两个空材料、随机词条、失败率或镶嵌收益。
- 玩家先看产物、材料持有量、石币、成功率与属性，再经内嵌确认页提交；预览阶段不发出
  合成事件，确认后只提交一次。
- `/equipment/synthesize` 现在强制合法 `Idempotency-Key`；缺键不修改档案，同键同请求只
  重放原回执，同键不同意图拒绝，避免网络重试造成重复扣料或重复产物。

## 明确非目标

- 不显示宝石、乐器合成、宠技合成、分解、宠装打造／强化、珊瑚强化；这些当前没有真实
  目录、实例、结算或服务合同。
- 宠物融合是另一套终局系统，生产目录仍为 `runtimeEnabled=false`，不得借三个槽位映射为
  “宠技合成”或提前开放玩家入口。
- 本阶段不新增商品、配方、价格、银行容量、解锁费用、概率、词条、协议版本或数据库表。
- 服务端配方目录未来仍应独立补齐与客户端同等级的严格启动校验；当前两份正式配方仍由
  现有服务端权威读取和结算。

## 实现合同

- `CommerceAwakenedVisualSkin` 统一三页字体、底板、槽位、页签、主按钮、状态色和物品图标。
- `ShopAwakenedPanel`、`BankAwakenedPanel` 和 `EquipmentSynthesisAwakenedPanel` 只负责
  `1280×720` 呈现与稳定语义信号。
- `EquipmentSynthesisAwakenedPresenter` 纯投影配方、材料、币额、产物属性和资格状态。
- `PanelFlowCoordinator` 只替换面板构造、连接信号和把现有权威状态刷新到新视图；原商店、
  银行、装备实例、合成和强化写路径不迁移到视图层。
- `main.gd` 只识别三种觉醒面板并给同一个注册面板全视口布局；PanelRegistry、NPC／家族
  入口和互斥关系不增加第二套平行状态。

## 视觉与交互证据

- 商店正式入口实机帧：
  `.run/evidence/phase390_commerce_awakened_ui/shop/frame00000089.png`；
- 银行拖放预览后的实机帧：
  `.run/evidence/phase390_commerce_awakened_ui/bank/frame00000109.png`；
- 装备合成最终实机帧：
  `.run/evidence/phase390_commerce_awakened_ui/synthesis-final/frame00000059.png`；
- 合成确认内嵌页：
  `.run/evidence/phase390_commerce_awakened_ui/check/equipment-synthesis-confirm-1280x720.png`；
- 参考／实现同屏：
  `.run/evidence/phase390_commerce_awakened_ui/design-qa/synthesis-source-vs-implementation.png`；
- 工作台聚焦同屏：
  `.run/evidence/phase390_commerce_awakened_ui/design-qa/synthesis-workbench-source-vs-implementation.png`；
- `design-qa.md` 的 Phase 390 最终结果为 `passed`。初版两个无意义材料槽和灰暗当前页签
  已在复核前修复。

## 验证证据

- `godot --headless --path client/godot --quit`：解析通过；
- `commerce_awakened_panel_check.gd`：`PASS`，覆盖三页 `1280×720` 边界、正式物品图标、
  商店出售左键、银行存入左键、合成预览／确认／一次提交和未开放功能不泄漏；
- `--auto-shop-check`：通过；
- `--auto-equipment-synthesis-check`：通过；
- `--auto-equipment-instance-check`：通过；
- `--auto-panel-registry-check`：通过；
- `auth-http-server.test.js`：`30/30` 通过，包含合成缺幂等键、成功、同键重放和同键不同
  意图冲突；
- `--auto-stage6-content-check` 的银行相关断言全部为真，但整项仍因当前工作树既有
  `market_button=false` 退出 1；本阶段没有把该非目标失败误报为通过。
- 觉醒商店保持打开时 `process_total=0.23–0.48ms`；装备合成为 `0.28–0.41ms`；银行拖放
  预览后为 `0.21–0.56ms`。对照 Phase 389 已记录的页面静置 `0.38–0.51ms`，未出现新的
  逐帧热路径。
- 真实跨帧移动／连点：`status=ok`，`36/36` 屏幕坐标往返一致，`avg/max=1/4us`，稳定
  `60 FPS`，`process_total=0.31–0.33ms`。

## 残余风险

- Phase 391 已补齐商店／银行正式 NPC 身份、职责和人像；三页仍复用同一套已存在的
  觉醒底板，独立商店／银行底板属于后续 P3 视觉精修，不阻塞本轮功能和层级验收。
- 正式联网资产写入没有在本次截图录制中执行；写路径由既有服务测试、客户端自动检查和
  新增幂等 HTTP 回归覆盖，不能把离线预览描述成真实生产交易。
