# Phase 391：商业服务身份与连续验收视频

## 目标

- 在 Phase 390 已通过的商店、银行与装备合成全屏页上补齐服务 NPC 身份，不改交易、
  银行、装备实例、合成、强化、货币或服务器权威规则。
- 沿用项目已批准的正式 NPC 职业原型，不新造人物、不复制外部商业游戏素材：
  - 杂货／庄园道具场：`npc_item_shopkeeper_f_v1`；
  - 装备铺：`npc_equipment_artisan_m_v1`；
  - 钻石铺：`npc_diamond_merchant_m_v1`；
  - 银行：`npc_bank_keeper_f_v1`。
- 交付一条可重复生成、可完整解码的真实 `Main.tscn` 连续视频，供项目所有者直接验收。

## 身份合同

- `CommerceServiceIdentityPresenter` 只投影 `npcId / displayName / roleLabel / dutyLabel /
  appearanceId / portraitState`，不持有业务状态。
- 从 NPC 对话进入商店或银行时，`DialogQuestCoordinator` 在关闭对话前复制实际
  interaction，并沿 `main.gd -> PanelFlowCoordinator -> awakened panel` 传递；因此阿芸、
  阿石和阿衡不会在开页时丢失。
- 无 NPC 上下文的家族远程商店按真实 `shopId` 显示店铺目录名称与职业型头像；无实际
  银行 NPC 的 QA／远程入口只显示无头像的“银行服务”，不得冒充阿衡。
- 正式人像只经 `NpcArtCatalog` 的发布门禁和缓存加载；纹理失败只隐藏头像，不阻断交易。
- 商店身份卡显示姓名、职业、供应职责；银行身份条显示管理员、岗位和“石币与物品保管”。
  关闭页面会清空头像与文字状态，避免切换店铺时残留上一位 NPC。

## 录像合同

- 固定入口：`--commerce-awakened-owner-review-capture`；正常 release 入口仍受现有 dev gate
  限制。
- 真实场景：`res://scenes/Main.tscn`，Metal Forward Mobile，`1280×720 / 30 FPS /
  1.00×`；录像器必须通过项目所有者证明的 `automation` QA user-data lane，先执行一次
  原生 Main，再执行一次 MovieWriter，结束后验证并清理 lane；不启动后端、不访问 MySQL、
  不写正常玩家存档。
- 九个连续章节：世界、杂货身份、出售、装备铺身份、银行身份、银行拖放数量页、合成
  配方、合成确认、返回世界。
- 页面按钮使用真实跨帧左键；银行演示先发送真实跨帧拖动轨迹。MovieWriter／headless 若
  不派发系统拖放结束，验收控制器只调用同一 `ItemSlotButton` 的 `_can_drop_data /
  _drop_data` 控件合同打开数量页，不调用交易接口，也不修改资产。
- 包装器强制检查官方 QA lane 来源合同、原生／MovieWriter 两轮 attestation、lane 清理、
  Metal、Movie Maker 尺寸与帧率、脚本错误、章节顺序、20–30 秒时长、H.264
  `yuv420p`、AAC 48kHz 双声道、可听音量、音视频双流完整解码、截图、联系表与 SHA-256；
  `ERROR`、ObjectDB／资源泄漏和 orphan StringName 均直接失败。

## 最终视频证据

- 视频：
  `.run/evidence/phase391_commerce_identity_owner_review/phase391-commerce-final-v2/commerce-awakened-owner-review-1x.mp4`；
- 联系表：
  `.run/evidence/phase391_commerce_identity_owner_review/phase391-commerce-final-v2/contact-sheet.png`；
- 元数据：
  `.run/evidence/phase391_commerce_identity_owner_review/phase391-commerce-final-v2/metadata.json`；
- 摘要：
  `.run/evidence/phase391_commerce_identity_owner_review/phase391-commerce-final-v2/summary.json`；
- 成片为 `22.833333s / 685` 帧，H.264/AAC、`1280×720 / 30 FPS / 1.00×`，
  音视频完整解码通过；MP4 SHA-256：
  `1a9530938ada8058515f81a0fb937e4a23c75e068aa6773a4f64bb3c66b78ff1`。
- 十二张代表帧和联系表已人工检查：杂货、出售、装备铺、银行身份条、拖放数量页、锻造、
  确认页和返回世界均无越界、截断或遮挡；工程 Design QA 无 P0/P1/P2。
- `ownerReviewStatus` 保持 `pending`，只等待项目所有者观看本视频后的主观反馈。

### 2026-08-12 当前 Main 安全通道复验

Phase 391 原录像器使用的显式 `--user-data-dir` 已被当前 Main 的 QA lane 证明门禁正确拒绝。
录像器现改用官方 `automation` lane，先跑一次原生 Main，再跑一次 MovieWriter；两轮均取得
精确 attestation，结束后 lane 为 `absent`，真实玩家 user-data inventory SHA 前后不变。

- 最终复验目录：
  `.run/evidence/phase391_commerce_identity_owner_review/phase410-commerce-qa-lane-v4/`；
- MP4：`23.000000s / 690` 帧、`1280×720 / 30 FPS / 1.00×`、H.264
  `yuv420p`／AAC 48kHz 双声道，SHA-256
  `159118750887ffa7111c2500b8dbde5642197bdc7a05bef44051dbf163f20ad1`；
- 音轨：`mean_volume=-28.0dB / max_volume=-13.5dB`，自动可听门禁通过；
- 联系表 SHA-256：
  `79b2457eecad1ad9fd390b83240e5d998083d19433d50f4aa7ae9c276d0c9e5f`；
- `summary.json` SHA-256：
  `d27ca5cba7a4636270d4dacc9ab92bd62e103839c1fd4567a4610c97eb38fa1d`；
- 原生／MovieWriter 日志均无 `SCRIPT ERROR`、`Parse Error`、`ERROR`、ObjectDB／资源泄漏或
  orphan StringName；音视频双流完整解码通过；
- 12 帧联系表在 1280×720 原比例复核：商店、出售、装备铺、银行、拆分数量、合成确认和
  返回世界均无越界、裁切、错层或身份残留。

本次复验只证明录像工具与当前 Main 的安全、媒体和布局合同；商业页主观美术状态仍诚实保持
`ownerReviewStatus=pending`。

## 验证

- `godot --headless --path client/godot --quit`：解析通过，仅保留既有 anchor warning。
- `commerce_awakened_panel_check.gd`：`PASS`；覆盖正式头像、姓名／职业／职责、安全回退、
  清理旧头像、1280×720 边界、真实出售／存入左键和合成确认一次事件。
- Godot 定向组合 `9/9`：商店、装备铺、装备合成、装备实例、PanelRegistry、NPC 外观、
  NPC hover 身份和庄园商店全部通过。
- `--auto-facility-dialog-options-check` 中本阶段相关字段均为真：`shop_primary=true / bank=true /
  bank_primary=true / bank_task=true / bank_task_secondary=true`；整项仍被当前工作树非本阶段的
  `trainer_primary=false` 判为失败，未误报为整项通过。
- 录像工具 Python 测试当前为 `5/5`、`py_compile`、`git diff --check` 通过；最终录制日志无
  `SCRIPT ERROR`、`Parse Error` 或 capture failure。
- 打开商店身份页静置 `process_total=0.33–0.60ms`；对照 Phase 390 的
  `0.23–0.48ms` 仍为同一低于 1ms 量级，身份与人像解析只在开页执行，不进入刷新／逐帧
  热路径。
- 真实移动探针 `status=ok`，稳定段 `60 FPS`，`process_total=0.49–0.75ms`；没有遗留
  Godot 或录像进程。

## 非目标与后续

- 本阶段没有增加商品、价格、配方、银行容量、概率、词条、协议、数据库或联网资产写入。
- 三页仍复用 Phase 390 的统一觉醒底板；独立商店／银行背景可在项目所有者确认当前视频后
  再做，不以缺少专属背景否定已完成的身份和功能闭环。
