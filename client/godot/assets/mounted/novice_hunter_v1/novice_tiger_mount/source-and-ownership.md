
# 见习猎人骑新手老虎正式资产来源与归属

- 资产范围：既有真八向世界 `idle 1 + walk 4` 共 40 帧；2026-08-16 重新制作的双正式战斗视角 12 动作共 180 帧。
- 来源类型：Beastbound 项目内原创，由 OpenAI 内置图像生成辅助制作；人物、老虎、鞍具与缰绳在每一帧中均为一张整体插画。
- 不使用运行时或离线人物／宠物分层拼接，不用一个源视角镜像伪造另一个源视角；正式前、背三分之四视角均独立绘制。
- 未使用、描摹、切取 StoneAge 8.0、私服、第三方游戏、图库或网络宠物素材；StoneAge 只作为玩法成熟度与战斗可读性参考。
- 正式目录采用精简归档：跟踪 256px 运行帧、24 份 exact prompt、逐动作流水线与 QC、来源哈希账本、安装清单、联系表和 GIF；每个视角另保留一张无损待机母表作为来源金丝雀。
- 24 张完整原始母表、512px 源帧与精确重放结果保存在忽略目录 `.run/art_repair_phase457_tiger_mounted/formal-production-v1`；仓库内 `source/battle/source-ledger.json` 绑定全部来源与派生哈希。
- 当前总运行帧为 220（世界 40 + 战斗 180）；战斗 bundle digest 为 `7f18dc67434cc7aa66444a3526c83468c615c9a65ce86fa778f674a27d0e0dcb`，战斗运行帧通过 8px 安全边、洋红残边、透明 RGB 泄漏及倒地／复起连续性检查。
- 战斗展示合同：敌方 `front_3quarter_sw + flipH=true`，我方 `back_3quarter_ne + flipH=true`，两侧均朝向战场中心。
- 当前状态：工程自评通过、项目所有者视觉验收 `pending`；`runtimeEnabled=false`，不会通过本次技术收口自动开放给普通玩家。
