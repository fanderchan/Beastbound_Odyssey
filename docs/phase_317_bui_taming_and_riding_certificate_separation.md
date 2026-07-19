# Phase 317：芽耳布伊驯宠证与骑宠证拆分

日期：2026-07-19

## 玩家问题与根因

宠物面板里的“驯宠”表示把宠物放到地图中跟随游街；“骑乘”表示人物骑在宠物上。Phase 314 虽把商品显示为“芽耳布伊 驯宠证”，运行数据却把它声明为 `pet_ride_permit`，消费后写入的也是骑乘资格。因此玩家即使购买或使用了界面所称的驯宠证，宠物面板的“驯宠”仍可能保持禁用。这不是操作问题，而是商品名称、道具效果和两个资格状态被错误合并。

## StoneAge 8.0 对照与本作决定

稳定本地参考 `/Users/fander/projects/_local_references/StoneAge` 中，`ITEM_petFollow` 与 `ITEM_useLearnRideCode` 是两条不同入口；宠物跟随状态与指定宠物骑乘学习也分别处理。参考只用于确认成熟玩法的概念边界，没有复制原作源码、数值或资产。

Beastbound 的现行规则进一步按项目所有者决定统一为“消耗一次、永久学会”：

- 芽耳布伊驯宠证只解锁芽耳布伊放出游街；不解锁骑乘，也不要求通用骑宠术。
- 芽耳布伊骑宠证只解锁芽耳布伊骑乘；仍需人物先学会通用骑宠术，不解锁游街。
- 两种证都是绑定、不可出售、单格上限 1 的独立商品，使用成功后消失，永久资格分别保存在 `petTamePermits` 与 `petRidePermits`。
- 两种商品当前各为 `600` 钻石，沿用原切片的测试价格且在共享商店数据中可分别调整；本阶段不涉及真实支付、充值订单或退款。
- 两种证都不改变宠物 Lv1 4V、隐藏成长、等级、技能、绑定或培养状态。

## 旧道具与存档兼容

- 已发布到本地档案的旧道具 ID `bui_novice_sprout_taming_certificate` 继续兑现它原先展示给玩家的“芽耳布伊 驯宠证”含义；未消费库存不会被偷换成骑宠证。
- 新建 `bui_novice_sprout_riding_certificate` 作为真正的芽耳布伊骑宠证；既有 `petRidePermits` 不删除、不重写，已学骑乘资格继续有效。
- 若旧档案尚无 `petTamePermits`，但存在明确的 `ride_bui_novice_sprout` 记录，说明它曾消费过当时误接的旧证：该档案补偿继承芽耳布伊游街资格。
- 仅缺少新字段、但没有明确旧消费记录的账号不会白送资格；新档案显式创建空的两套资格集合。
- 损坏、重复或证书与宠物配置不匹配时失败关闭；重复使用不扣证。

## 实现边界

- 新增客户端 `PetTamePermitModel` 与服务端 `pet-tame-permit` focused domain，负责独立状态读取、旧误接补偿、一次性学习和失败分类。
- 芽耳布伊模板分别声明 `taming` 与 `riding` 的资格 ID、道具 ID 和兼容条件；GM 获得、任务孵化等不同来源的同形态芽耳布伊遵循同一规则，不再依赖单次获取流程写入的 `tameEligible`。
- 背包使用入口根据 `pet_tame_permit` / `pet_ride_permit` 分流；服务端在扣除前交叉校验道具、形态、模板和资格 ID，成功结果仍走现有 MySQL COMMIT 后发布边界。
- 宠物列表与右键菜单在缺证时显示所需证书原因；使用正确驯宠证后“驯宠”立即可用，跟随展示仍是客户端地图表现，不把临时跟随位置写入持久档案。
- 原任务奖励中含义模糊的“驯宠证”文字更正为“基础驯宠术”，避免与指定宠物证混淆。

没有修改协议版本、MySQL 表结构、宠物数值、批量玩家数据或热路径轮询。

## 验证

- JSON 解析、Node 语法、Godot parse 与 `git diff --check` 通过。
- `node --test server/node/test/pet-tame-permit.test.js server/node/test/pet-ride-permit.test.js server/node/test/auth-profile-actions.test.js`：`45/45` 通过；覆盖两证互不串线、分别购买/消费、重复使用不吞证、新档空状态、旧误接消费补偿与无条件白送防护。
- Godot parse、宠物跟随、骑乘系统、商店和背包筛选定向门禁 `5/5` 通过；宠物跟随门禁同时验证驯宠证不解锁骑乘、骑宠证不解锁驯宠。
- Pet Design Contract `bui_taming_riding_split_v1`、Pet Design Inspector 与 `battle_action_catalog_check` 通过；Inspector 保留既有一条“完整档案公开投影尚未统一”的项目级 warning，本切片没有新增宠物数据错误。
- 正常 Metal 客户端验证：驯宠菜单启用、芽耳布伊跟随移动、钻石铺两件商品同时可见且说明不同。
- 本地 MySQL 后端重启后只读核对 `auth1373`：档案尚无两套新资格字段，背包已有 1 张旧 ID 的芽耳布伊驯宠证，说明玩家尚未消费而非道具丢失。没有代替玩家消费、购买或改货币；UI 核对时临时切换的芽耳布伊状态已沿正式服务端动作恢复到原“战斗”状态。
- `godot --headless --path client/godot --scene res://scenes/Main.tscn --fixed-fps 60 -- --movement-perf-check --perf-probe`：真实跨帧移动 `status=ok`、稳定 60 FPS，`process_total=0.03ms`、首次世界绘制 `0.77ms`、后续重绘 `0.13ms`；新资格只在档案变更和面板刷新时计算，不进入每帧热路径。

## 实机证据与玩家复验

- `.run/evidence/phase317_taming_riding_split/pet_tame_enabled.png`：使用驯宠证后，宠物菜单“驯宠”可点击。
- `.run/evidence/phase317_taming_riding_split/pet_following_world.png`：真实地图中芽耳布伊已放出并跟随人物，消息栏显示“已放出来游街”。
- `.run/evidence/phase317_taming_riding_split/diamond_shop_two_certificates.png`：钻石铺同时显示“芽耳布伊驯宠证”和“芽耳布伊骑宠证”，两者说明不再混用。

玩家手工复验只需三步：在钻石铺购买并使用芽耳布伊驯宠证；打开宠物面板选中芽耳布伊，点击“驯宠”；关闭面板并移动，宠物应跟随游街。此时若尚未另学骑宠证，切换骑乘仍应提示需要“芽耳布伊 骑宠证”。
