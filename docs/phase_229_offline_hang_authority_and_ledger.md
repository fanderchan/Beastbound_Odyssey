# Phase 229：离线挂机权威结算、GM 配置与防重放账本

日期：2026-07-11

## 初始问题

现有 `walk` / `encounter_stone` 挂机都要求客户端在线移动或保持连接，服务端没有真正的离线收益。若只按登录间隔直接发奖，会产生四个高风险问题：玩家可以伪造地点或时长、在线与离线双产出、重复请求重复领、宠物成长绕过统一 dispatcher。

## Beastbound 离线规则

- 默认离线收益率为在线基准的 50%；
- 默认最多累计 8 小时，在线基准按 30 秒一场折算，至少累计 5 分钟后可领；
- GM 命令 `gm_offline_hang_config` 可调整收益率、封顶时长、折算战斗间隔和最短领取时间；
- 单次会话在开始时冻结配置快照，后续 GM 调整不追溯改变已开始会话；
- 只在适合人物当前等级的正式重复练级区开始，并锁定该地图、区域、遇敌组和奖励表；
- 离线修行不是伪造战斗回放：只发人物/开始时当前战宠的修行经验和石币，不生成捕捉宠、物品掉落、战报、死亡或装备耐久；
- 人物与战宠分别按自身等级和服务端怪物等级计算经验衰减，宠物最终仍经统一权威成长 dispatcher 结算；
- 石币用正式奖励表的稳定期望值折算，钱包溢出不越过上限并写入账本；
- 离线修行进行时，服务端拒绝移动、战斗、经济、社交等在线变更，玩家只能查看、领取、取消或退出，防止双产出；
- 取消不发奖；领取以服务器生成的 `sessionId` 幂等，同一会话重放只返回原账本，不再次修改档案。

## 持久化与接口

服务端状态文档新增 `offlineHangConfig`；玩家档案新增 `offlineHang.session` 与最多 100 条 `ledger`。MySQL 继续复用增量 profile 写入和 `server_state`，没有新增全表扫描或 delete/reinsert。

接口：

- `GET /hang/offline/status`
- `POST /hang/offline/start`
- `POST /hang/offline/claim`
- `POST /hang/offline/cancel`
- `GET|PUT /gm/hang/offline/config`

客户端 transport/contract 已声明这些端点和中文错误边界；玩家面板入口留给 P0.3c-2。

## 验证

- 定向 Node：离线服务、HTTP 鉴权与 MySQL 状态持久化 35/35；完整 Node 296/296；
- 固定 60 分钟默认配置折算 60 场，成长训练档发 4,080 石币，人物和当前战宠均经权威经验入口成长；
- 20 小时离线只计 480 分钟、480 场；25% / 60 秒 GM 配置下 60 分钟只计 15 场；
- 领取重放不增加 revision，开始后在线商店操作返回 `offline_hang_active`，取消后无账本收益；
- Godot 4.7 parse + auth/client/version/profile contract/hang settings 7/7、Node syntax、`git diff --check` 通过；
- 未连接或修改真实 MySQL、真实账号和真实宠物。

## 后续

P0.3c-2 在挂机设置面板接入状态读取、开始、领取与取消，登录后显示待领取提示；P0.3c-3 再做真实客户端截图与断线/重登录人工闭环，完成后才勾选整个 P0.3c。
