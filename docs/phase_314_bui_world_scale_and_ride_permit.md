# Phase 314：芽耳布伊地图比例与指定驯宠证闭环

日期：2026-07-19

> 语义更正（2026-07-19）：本阶段把“驯宠证”错误地当作了指定宠物骑乘资格。当前正式含义以 Phase 317 为准：驯宠证只解锁放出游街，骑宠证只解锁骑乘；本文件保留为当时实现和证据的历史记录，不再作为现行证书合同。

## 问题与目标

项目所有者实机对比发现，地图中的整体骑乘形象明显大于徒步人物。运行事实是徒步人物使用 `0.36`，芽耳布伊整体骑乘图使用 `0.58`，使组合图又被额外放大约 61%；战斗场景另有独立 `0.88` 配置。本阶段只统一地图展示基准，不把战斗人物比例错误地绑到地图比例。

同时，钻石商店需要售卖真正可用的“芽耳布伊 驯宠证”，形成购买、消耗、永久资格和骑乘校验的服务端闭环，而不是只增加一个没有玩法作用的商品行。

## StoneAge 8.0 对照与 Beastbound 决定

稳定本地参考 `/Users/fander/projects/_local_references/StoneAge` 显示，StoneAge 8.0 采用按宠物种类学习骑乘资格的道具：`gmsv/src/item/item_event.c` 的骑乘学习逻辑把指定宠物资格写入人物骑乘集合，`data/item/itemset6.txt` 也存在多种指定宠物骑乘学习书。Beastbound 沿用“通用骑宠术 + 指定宠物资格”这一成熟信息结构，但不复制原作源码、数值、名称或资产。

本作规则如下：

- 芽耳布伊继续是所有新玩家免费获得的教学战宠；购买驯宠证不是获得宠物的前提。
- 新档案必须先学会通用骑宠术，再使用绑定的“芽耳布伊 驯宠证”，才可骑乘芽耳布伊。
- 驯宠证价格暂定 `600` 钻石、不可出售、不可交易，使用后永久写入账号角色档案；它不改变宠物 4V、隐藏成长、技能、等级或绑定状态。
- 为避免已有玩家突然失去已经可用的骑乘能力，旧档案若完全缺少 `petRidePermits` 字段，只对芽耳布伊继承旧资格；新档案显式写入空资格集合，未来其他宠物不会自动套用该兼容规则。
- 重复使用已解锁的证会失败且不消耗道具；损坏或未来版本资格资料失败关闭。
- 价格保存在共享商店数据中，后续数值策划可调；本阶段不引入真实充值、支付订单或退款语义。

## 实现

### 地图与战斗比例分离

- `mount_visual_profiles.json` 将芽耳布伊 `worldPresentationScale` 从 `0.58` 改为与徒步人物相同的 `0.36`。
- `battlePresentationScale` 保持 `0.88`，战斗排布、接触距离和 10V10 验收不受地图缩放牵连。
- 两个真八方向验收场同步改为同尺度比较；整体骑乘美术门禁固定检查世界 `0.36` 与战斗 `0.88`，防止后续误合并。

### 骑乘资格与商品

- 新增客户端 `PetRidePermitModel` 和服务端 `pet-ride-permit` focused domain，统一读取、校验、兼容和一次性解锁规则。
- 芽耳布伊模板声明资格 ID、对应道具 ID 和仅此形态的旧档案兼容开关。
- 背包目录新增绑定、单格堆叠上限 1 的驯宠证；钻石铺新增 600 钻石、不可出售商品。
- 背包“世界”筛选、使用按钮和无目标直接使用流程接入资格证；商店详情现在展示道具说明，并把不可出售商品明确写为“不可出售”，不再显示一个误导性的推算回售价。
- 服务端 `world_item_use` 复核道具、形态、资格 ID 和模板交叉引用，先规划、再扣证、再写资格；成功响应继续继承既有 durable mutation 的 MySQL COMMIT 后发布边界。
- 服务端骑乘状态切换和客户端本地/展示校验都要求资格；没有资格的芽耳布伊仍可正常出战、待机、休息和培养。

没有修改协议版本、MySQL 表结构、真实玩家数据或宠物成长公式。

## 自动验证

- `node --test server/node/test/pet-ride-permit.test.js server/node/test/auth-profile-actions.test.js`：`42/42` 通过；覆盖新号门禁、600 钻石购买、扣证、永久资格、成功骑乘、重复使用不吞证、损坏资料失败关闭和旧档案兼容。
- Godot 定向门禁：parse、整体骑乘美术、骑乘系统、商店、背包筛选 `5/5` 通过；日志 `.run/godot_auto_checks/2026-07-19T03-55-52-482Z.log`。
- Pet Design Contract `bui_ride_permit_v1` 校验通过，芽耳布伊 Inspector `--check` 通过；`battle_action_catalog_check` 为 `actions=29/passives=5/petForms=34`、状态 `ok`。
- `godot --headless --path client/godot --scene res://scenes/Main.tscn --fixed-fps 60 -- --movement-perf-check --perf-probe`：真实跨帧移动 `status=ok`，稳定 60 FPS；`process_total=0.03..0.04ms`，首次世界绘制 `0.76ms`、后续重绘 `0.13ms`。比例变化没有增加运行时层或进入新热路径，这也不构成 200 人同图容量证明。
- `git diff --check`、JSON 解析、Node 语法和 Godot parse 通过。

## 真实 Metal 证据

1280×720、Apple M5、Metal 4.0 实际 `Main.tscn` 截图：

- `.run/evidence/phase314_bui_world_scale_and_ride_permit/world_on_foot.png`：同一地图的徒步人物。
- `.run/evidence/phase314_bui_world_scale_and_ride_permit/world_mounted.png`：同一出生点的芽耳布伊整体骑乘，使用 `0.36` 世界比例。
- `.run/evidence/phase314_bui_world_scale_and_ride_permit/world_scale_comparison.png`：正式人物与整体骑乘源图并排检查。
- `.run/evidence/phase314_bui_world_scale_and_ride_permit/diamond_shop_bui_permit.png`：真实钻石铺中选中的驯宠证、600 钻石价格、不可出售及永久资格说明。

这些静态证据足以验收本次比例与商品信息，不要求额外录制 MP4。若项目所有者仍认为地图组合图偏大，后续应只调整 `worldPresentationScale` 并重新对照同出生点截图，不应动战斗 `0.88` 或重新拆分人物/宠物整图。
