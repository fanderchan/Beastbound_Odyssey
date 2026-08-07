# Phase 393：服务端权威 PvE 战后奖励上漂与连续验收视频

## 参考意图与范围

- 主要参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-8732b753-37bc-483b-a0ae-4cc94977e89c.jpg`；
  前序挂机选择、匹配、组队和回到世界的上下文参考为同轮提供的另外五张截图。
- 本阶段只提炼参考中的战后信息节奏：回到世界后，以短暂、居中、逐条向上滚动的文字
  告知人物、宠物与伙伴所得经验及其他奖励，不要求玩家再点一次“确定”。
- 参考图里的“新功能开启：世界首领”是项目所有者明确指出的干扰项；本阶段没有复制、
  接入或模拟该遮罩，也没有复制参考截图、角色、宠物、地图、商标或任何像素。
- 挂机场景选择、立即／匹配挂机、便捷组队、战斗过程、失败惩罚与新功能解锁不属于
  Phase 393；它们继续沿用各自既有合同。

## 玩家承诺

- 服务端组队 PvE 胜利并完成权威结算后，客户端先退出战斗、恢复世界，再在世界中央播放
  “战斗胜利”和奖励队列；世界 HUD 保持可见，浮层全程鼠标穿透，挂机流程无需停下来确认。
- 奖励按人物、骑宠、战宠、伙伴、伙伴宠、石币、背包物品、邮箱物品、捕获宠物的稳定
  顺序投影；同一宠物同时作为骑宠与战宠出现时只播一次经验。
- 升级不由客户端用经验公式猜测。只有权威条目 `levelsGained > 0` 且 `level > 0` 时，才在
  该角色的经验行后立即追加“升到了 N 级！”高亮行；`beforeLevel` 保留为可审计的服务端
  结算字段，但画面不据此重算等级。
- 零经验、空 item ID 和非正数量不制造假奖励；背包未收下、经验写回失败或档案写回跳过
  进入暖橙警告队列，不伪装成成功奖励。

## 服务端权威与只读展示合同

- 权威来源仍是关闭房间中的 `battle.result` 和当前账号隔离后的
  `battle.profileWriteback.profiles[]`。Phase 393 没有修改结算公式、钱包、背包、宠物实例、
  捕获、邮件、档案 revision、协议版本、HTTP/WS 路由或数据库结构。
- 可复用经验条目为 `exp.player`、`exp.ridePets[]`、`exp.pets[]` 与
  `exp.trainingPartners[].player/pet`；服务端已有 `name / amount / beforeLevel / level /
  levelsGained / beforeExp / exp / nextExp / overflowExp`，Presenter 只消费玩家可见部分。
- 其他可见结果来自 `rewards.stoneCoins / addedItems / mailedItems / lostItems`、
  `capturedPets[]` 与 `profileWriteback.skippedProfiles[]`；物品名称由现有 `BackpackModel`
  投影，玩家界面不显示 item ID、account ID、schema、接口名、错误码、QA 或 agent 文案。
- `BattleOutcomePresentationModel.build_view()` 产出单一只读 view-state：
  `outcomeId / dedupeKey / title / resultKey / rewardRows / warningRows / detailText`。奖励行使用
  `text / kind / role / amount / stableId / level / levelsGained / isLevelUp` 的有界子集，
  不是第二份玩家档案，也不能回写任何资产。
- `outcomeId` 使用 `battleRecordId:accountId`，缺少记录号时才回退到 `roomId:accountId`；
  `BattleOutcomeFloatOverlay` 在当前客户端生命周期内拒绝同 ID 重播，避免关闭房间重复事件
  让同一奖励再次出现。
- 组队 PvE 的服务端 `reason="defeat"` 也可能表示敌方被击败，因此胜负不能只看 `reason`。
  现行客户端继续按逃跑／超时、本人是否在 `loserAccountIds` 以及敌方是否仍存活判定；
  存活队友成为 `winnerAccountId` 时，本人也能得到正确的团队胜利展示。

## 运行状态机与接线边界

1. 收到关闭房间后，先判定战斗模式和当前账号结果。
2. 若为组队 PvE 胜利，在清理战斗节点前从关闭房间冻结只读 view-state；这样
   `_end_battle()` 清空 actor 与战斗漂字后，奖励数据仍完整可用。
3. 应用既有挂机写回、播放胜利音、结束战斗并处理回记录点，再恢复世界日志。
4. 仅组队 PvE 胜利调用 `_present_battle_outcome_float()`；随后照常排队权威 profile pull，
   浮层自身不修改档案。
5. 浮层播放金色标题，按 `0.24s` 间隔加入奖励行；已有行用 `0.20s` 上移，最多同时保留
   五行。队列结束后停留 `0.65s`，再整体上移 `64px` 并淡出，最后自动隐藏。
6. 重复 outcome ID 直接拒绝；新 outcome 可继续排队。浮层隐藏时没有轮询、网络请求或
   全档案扫描。

非组队 PvE、庄园战、切磋，以及组队 PvE 的失败、逃跑和超时继续使用既有结果框；本阶段
没有把仍需确认损失或对手信息的流程悄悄改成一闪而过的提示。

## 页面与视觉实现

- `battle_outcome_presentation_model.gd` 负责权威 payload 到玩家 view-state 的纯投影；
  `battle_outcome_float_overlay.gd` 只负责有界队列、上移、升级脉冲、警告色、淡出和去重；
  `PanelFlowCoordinator` 只做创建、时序接线与兼容结果框路由。
- 正式视口为 PC `1280×720`。标题位于世界上半部，奖励卡基准为 `470×40`，暗褐半透明
  底、铜金边与浅金文字保持当前 Beastbound 木石 UI 语气；升级行为更亮金色和双描边，
  警告行为暖橙色。
- 所有节点均为真实 Godot `Control/Label/PanelContainer`，不是截图裁片、视频贴图、emoji
  奖励图标或假数据面板。浮层 `mouse_filter=IGNORE`，不会抢夺世界点击或成为挂机操作门槛。
- 参考图与 Beastbound 地图构图不同，因此工程 Design QA 检查的是信息层级、世界上下文、
  上移节奏、文字可读性和无阻断，不做无意义的全图像素相似度评分。

## 验证

- Godot 解析与既有 `--auto-server-battle-target-mapping-check` 合计 `2/2` 通过；后者明确
  记录 `pve_overlay=true / pve_dedupe=true / teammate_victory=true`，并覆盖人物、骑宠、
  战宠、升级、石币、背包物品、邮箱物品和写回警告。
- 独立 `battle_outcome_float_overlay_check.gd` 为 `status=ok`：Presenter、首次接收、重复
  拒绝、出现、上移、完整收敛、自动关闭和鼠标穿透全部为 `true`。
- 录像包装器 Python 聚焦测试 `4/4` 通过；它会拒绝错误时长、帧率、编码、音轨、章节、
  非 Main 入口、后端连接、服务端写入、漏项、未上移、未淡出或脚本错误。
- `SHA256SUMS` 当前 `17/17` 通过；H.264 与 AAC 双流完整解码为 `passed`。
- 自动检查和录像保留既有 HUD anchor warning；录像退出还报告 ObjectDB/resource 清理
  warning。这些警告没有被冒充为 Phase 393 通过项，也没有在本阶段顺带改动宿主布局。
- 同一 `eeceeb43` 基线与 Phase 393 候选均使用相同已导入资源和隔离 user-data 运行
  before／after 性能探针：900 帧 idle 均稳定 `60 FPS`，基线 `process_total=0.14..0.21ms`，
  候选含首次预热为 `0.10..0.38ms`、预热后为 `0.10..0.19ms`；1800 帧真实跨帧移动均为
  `status=ok / path_len=11 / 60 FPS`，基线 `0.11..0.26ms`、候选 `0.14..0.24ms`。浮层
  隐藏时没有常驻处理、网络请求或档案扫描，未观察到持续热路径回归；这不是 200 人同图
  或服务端并发性能证明。
- 更宽的 `--auto-battle-knockaway-result-check` 在干净 `eeceeb43` 基线与 Phase 393 候选均
  保持同一既有 `pet=false / pet_state=""` 失败，其人物、敌方、捕捉、逃跑、互相击飞均为
  `true`；本阶段没有把该非本项宠物夹具残余冒充为通过，也没有修改本地击飞结算。

## 连续视频证据

- 视频：
  `.run/evidence/phase393_battle_outcome_owner_review/phase393-video-foundation-smoke-v2/battle-outcome-owner-review-1x.mp4`；
- 联系表：
  `.run/evidence/phase393_battle_outcome_owner_review/phase393-video-foundation-smoke-v2/contact-sheet.png`；
- 摘要：
  `.run/evidence/phase393_battle_outcome_owner_review/phase393-video-foundation-smoke-v2/summary.json`。
- 成片来自真实 `res://scenes/Main.tscn` 与 Metal Forward Mobile，共四章：世界上下文
  `2.0s`、胜利引入 `1.0s`、奖励队列 `4.5s`、收敛后的世界 `2.0s`。
- 最终规格为 `9.533333s / 286` 帧、`1280×720 / 30 FPS / 1.00×`、H.264
  `yuv420p`、AAC 48kHz 双声道；音视频双流完整解码通过。MP4 SHA-256：
  `7d88152f52bae0bb7acd7a17e2b0550c7a273bd06075727f6197f8a104f77f3e`。
- 验收 view 共 `11` 个展示项，覆盖人物／骑宠／战宠／伙伴经验、人物／宠物升级、石币、
  背包物品和邮箱物品；脚本观察到上移、淡出及队列完成。
- 录像使用新鲜隔离 user-data，未启动后端、未访问 MySQL、未写服务器或正常玩家档案，
  也没有排队 profile pull；它证明真实页面和动效，不冒充生产服资产结算。
- `ownerReviewStatus=pending`：工程 Design QA 与媒体门禁已通过，但项目所有者尚未观看并
  接受这支最终视频，P2.2 因此继续保持未勾选。

## 明确非目标与残余边界

- 不新增或改造挂机地图选择、立即挂机、匹配挂机、便捷组队、战斗指令、自动战斗设置、
  新功能开启、世界首领、失败惩罚、耐久、经济公式或商业化规则。
- 不把本地离线战斗、切磋、庄园战、失败、逃跑和超时的旧结果框宣称为已经同样改造；
  本阶段正式接线范围是服务端组队 PvE 胜利。
- 捕获宠物行和 `lostItems/skippedProfiles` 警告已有 Presenter 合同，但最终视频聚焦项目
  所有者指定的经验上漂，只实录了经验、升级、石币、背包物品和邮箱物品。
- 去重集合是当前客户端生命周期内的表现层保护，不是持久化战果回执；客户端重启后由
  既有关闭房间消费和服务端幂等结算继续保证资产安全，本阶段没有新增 durable receipt。
- 本阶段没有复制 StoneAge 资产，也没有为追求相似外观暴露服务端内部字段或引入第二套
  结算状态。
