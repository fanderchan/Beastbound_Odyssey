# Phase248：当前 GM 核心 QA 档案的幂等补齐与玩家拒绝边界

## 阶段目标

本阶段完成 `P0.5d-1` 的最小安全切片：为已经登录且经过服务端 GM 命令授权的当前账号提供一次可重复执行的核心 QA 资源补齐。命令固定为 `gm_prepare_qa_profile`，资源方案固定为服务端自包含 manifest `qa_core_v1`。

它不是任意账号改档工具，也不是整档覆盖、角色重置或全内容解锁器。首版只解决以下实际问题：

- 当前 GM 账号缺少稳定的石币、钻石和核心消耗品，验收商店、战斗道具、捕捉及遇敌时仍依赖历史档案；
- 手工重复领取容易多发资源，客户端也可能在响应丢失后重复提交；
- 普通玩家、只有 GM 角色但没有具体命令授权的账号，以及客户端伪造的目标账号都必须被服务端拒绝；
- P0.5c-2 后，交易所 GET 仍需与前序 durable 写保持有序，不能越过尚未确认的档案提交读取旧状态。

## Beastbound 原创合同

### 1. 只补当前 GM 自账号

`POST /gm/commands/gm_prepare_qa_profile` 只允许作用于 bearer session 解析出的当前账号及其当前绑定档案：

- 请求体不得接受 `username`、`accountId`、`playerId`、完整 profile、资源数量或 manifest 内容；
- 服务端重新执行 session、有效 GM 身份和 `gm_prepare_qa_profile` command grant 三层校验；
- 客户端隐藏按钮不构成授权，直接调用 HTTP 仍必须得到同样结果；
- 响应中的账号、档案摘要和 manifest 摘要都由服务端产生，不能回显客户端提供的身份事实；
- 当前账号没有档案、账号绑定与档案归属不一致，或档案含不能安全改写的未来/冲突资产时失败关闭。

成功或失败都不得影响其他账号、其他 profile binding、市场挂单、邮件、家族、庄园或运行时战斗状态。

### 2. 自包含 manifest `qa_core_v1`

manifest 是服务端版本化常量，不从客户端 payload 动态拼装，也不随着商店或背包目录新增条目而自动扩大授权范围。`qa_core_v1` 的目标固定为：

| 类别 | ID | 最低目标 |
| --- | --- | ---: |
| 石币 | `stoneCoins` | 1,000,000 |
| 钻石 | `diamonds` | 100,000 |
| 背包扩展 | `backpackExtraSlots` | 5，即总容量 20 格 |
| 核心物资 | `item_meat_small` | 50 |
| 核心物资 | `item_heal_single_5` | 20 |
| 核心物资 | `item_heal_all_5` | 20 |
| 核心物资 | `item_poison_single_5` | 20 |
| 核心物资 | `item_poison_all_5` | 20 |
| 核心物资 | `item_cleanse_single_5` | 20 |
| 核心物资 | `capture_rope_basic` | 20 |
| 核心物资 | `capture_net` | 20 |
| 核心物资 | `capture_net_reinforced` | 20 |
| 核心物资 | `capture_poison_wuli_net` | 20 |
| 核心物资 | `encounter_stone_low` | 20 |
| 核心物资 | `encounter_stone_mid` | 20 |
| 核心物资 | `encounter_stone_high` | 20 |
| 核心物资 | `item_pet_salve_large` | 20 |
| 核心物资 | `item_pet_exp_pill_lv131` | 20 |

本切片不调整银行石币。manifest 加载时必须校验每个物品 ID 仍存在、目标数量为安全整数且不超过当前物品堆叠上限；合同失效时应拒绝整笔命令，而不是跳过坏条目后部分发放。

### 3. 只增不删，按差额补齐

候选档案从当前服务端权威档案深拷贝产生。每个目标使用 `max(现值, 目标值)` 或等价差额算法：

- 高于目标的石币、钻石、背包扩展格和物资数量保持原值；
- 非 manifest 物品、未知但合法保留的字段、现有格子内容及顺序不得被清空、出售、替换或降级；
- 已有目标物资优先补入合法同类堆叠，剩余差额才使用空格；
- 不合并或重排无关格子来制造空间，也不把放不下的物资写入 `lostItems`、地面掉落、邮件或银行；
- 一次命令至多让档案 revision 增加一次；若全部目标已经满足，则返回 `changed=false`，资源和 profile revision 都不变化；
- 使用同一 `Idempotency-Key` 回放第一次成功时不得再次执行领域逻辑、重复发放或追加第二条同次成功审计。

这里的“幂等”指 manifest 资产终态幂等。使用新的 operation key 再次主动执行仍可留下独立 GM 调用审计，但不得改变已满足的档案资产或 revision。

### 4. 20 格容量预检与原子失败

`backpackExtraSlots >= 5` 只表示最多可使用 20 格，不表示允许覆盖第 16–20 格的既有内容。服务端必须在请求私有 candidate 上完成全部物资差额、堆叠上限、现有格子和最终容量预检，再一次提交：

```text
读取当前权威档案
→ 校验背包/资产安全边界
→ 计算货币、扩展格与 15 种物资差额
→ 在 candidate 中模拟完整补齐
→ 校验最终背包不超过 20 格且每格合法
→ 一次 profile revision
→ durable COMMIT
→ 发布缓存并返回成功
```

只要任一目标无法完整放入，整笔操作失败：石币、钻石、扩展格、物资、revision 和其他根状态全部保持原样。禁止先发货币、后因背包满而返回失败；也禁止为了让测试资源进入背包而删除玩家已有资产。

### 5. 强制 durable `Idempotency-Key`

`gm_prepare_qa_profile` 是持久资产 mutation，HTTP 入口必须要求合法 `Idempotency-Key`：

- 缺失或格式非法时在领域发放前拒绝，不生成任何资产变化；
- 同 key、同账号、同 action、同请求摘要返回第一次结果；
- 同 key 改 action、改请求或跨账号使用返回 `idempotency_key_conflict`；
- 资源变化、GM 成功审计和 operation receipt 必须处于同一次 durable 提交边界；
- MySQL COMMIT 前不得更新客户端档案、发布成功或显示“准备完成”；
- 明确写失败、超时与模糊提交沿用 Phase247：同一次自动网络重试必须复用原 key；结果未确认时不得显示成功，并立即拉取权威档案。

客户端 request builder 在一次用户点击时生成 key；同一次网络重试复用该 key，按钮在请求完成前保持禁用。自动重试全部耗尽后再次点击会生成新 key；`qa_core_v1` 因为只做终态差额补齐仍不会重复发资产，但后续带随机宠物、装备实例或消耗动作的 GM 命令必须持久保存 pending operation key，不能套用本切片的终态幂等假设。

### 6. 普通玩家、缺命令授权与拒绝审计

固定拒绝矩阵：

| 调用者 | 预期 |
| --- | --- |
| 无有效 session | 认证失败，档案与 GM 审计均不伪造当前用户 |
| 普通玩家 | `gm_denied`，零资产变化 |
| 有效 GM 身份但缺少 `gm_prepare_qa_profile` grant | `command_denied`，零资产变化 |
| 命令已授权但缺少/非法 idempotency key | 幂等边界拒绝，领域方法不执行 |
| 命令已授权且请求合法 | 只补当前账号，等待 durable COMMIT 后成功 |

HTTP 传输层先校验本资产入口必须携带 `Idempotency-Key`，再进入领域权限判断。因此普通玩家携带合法 key 直调得到 `gm_denied`；若任何调用者连 key 都不带，会先得到 `idempotency_key_required`。两条路径都不会进入发放逻辑或改变档案。

可识别到账号和命令的权限拒绝需要进入服务端 GM 审计，但拒绝接口不能成为写放大攻击：

- 拒绝审计按账号和拒绝原因进行有界窗口限流；命令 ID 不进入限流 key，避免攻击者用无限不同路径绕过；
- 同一窗口内的重复拒绝继续返回相同权限错误，但审计行数不得随请求数无界增长；
- 窗口结束后新的拒绝可再次留下证据；
- 成功、首次拒绝、被抑制拒绝和 receipt 回放要能从安全摘要区分，但不得向玩家暴露内部限流 key、token、密码或完整 profile；
- 限流只抑制重复审计写，不得把被拒绝请求放行为成功。

### 7. GM 交易所配置 GET 的 durable 审计修复

`GET /gm/market/config` 表面是读取配置，但现有领域合同会先执行 `gm_market_tax` 授权并写 GM 审计，因此它不是零写查询。生产 async store 下若绕过 durable facade，会在 `save()` 时触发 `durable_context_required` 并向合法 GM 返回 503。

本阶段把 `getMarketConfig` 纳入同一 durable 有序 facade：

- 不要求 `Idempotency-Key`，也不创建 operation receipt；
- 授权、审计与响应仍属于同一个请求，审计持久化失败时不能伪装成读取成功；
- 合法 GM 得到当前配置，普通玩家和缺命令账号继续按拒绝矩阵处理；
- 不改变普通 `GET /market/listings` 的只读热路径，也不改变税率、挂单、购买或教学市场规则。

## 客户端身份提示

GM/QA 面板必须把作用对象说清楚，避免用户误以为可以给任意角色发放：

- 按钮使用玩家可理解的中文，例如“准备当前 GM 测试档”；
- 按钮附近显示当前 session 的 `displayName（username）`，没有服务器 session 或身份不完整时不允许提交；
- 不提供目标用户名输入框，也不沿用可编辑账号文本作为请求参数；
- 提交前后的提示明确“只补齐、不删除已有资产”；
- 成功后应用服务器返回的公开权威档案与 revision，并展示固定方案的安全补齐摘要及 `changed` 状态；只有 `profileApplied=true` 且 `qa_core_v1` 摘要完整时才允许显示成功；
- 失败使用现有服务端错误映射，不能把 raw code、operation receipt、token、内部审计结构或 QA 断言显示在普通玩家界面。

普通玩家看不到该入口；客户端 GM 插件授权仍只是额外本地门槛，最终权限以服务器 session 和 command grant 为准。

## 非目标

以下内容明确留给 P0.5d 后续切片，不能为了让首版看起来“全面”而直接拼进 profile：

- 宠物创建、Lv1 4V 样本、成长等级、图鉴及宠物容量；
- 装备实例、穿戴、强化、耐久、精灵和具体实例选择；
- 银行物品、银行装备 envelope、银行石币和页签解锁；
- 教学任务、任务完成态、支线、挂机状态和邮件；
- 人物转生、宠物转生、转生资格、证明与奖励；
- 家族、成员、庄园、市场挂单、社交关系和其他账号；
- 重置、降级、删除或精确覆盖已有玩家档案；
- 真实充值、支付订单、商业宠发货或生产服通用运营发奖。

## 预期涉及文件

- 聚焦的服务端 GM QA manifest/domain：定义 `qa_core_v1`、差额补齐和拒绝审计限流；
- `server/node/src/auth-service.js`：注入最小依赖并暴露服务方法；
- `server/node/src/http-server.js`：命令路由、强制 idempotency key 与市场 GET durable 读屏障；
- `server/node/src/auth/durable-mutation-state.js`：明确市场配置 GET 不生成 mutation receipt；
- `client/godot/scripts/progression/gm_qa_profile_client_model.gd`：固定 payload、身份与安全摘要投影；
- `client/godot/scripts/ui/qa_panel_catalog.gd`、`panel_flow_coordinator.gd`：当前 GM 身份提示、入口和薄提交 wiring；
- 服务端/Godot 聚焦测试与本文件。

新领域规则不应塞进 `auth-service.js`、`http-server.js` 或 Godot 大协调器；这些文件只保留依赖注入、薄路由和 UI wiring。

## 验证矩阵

下表是本切片的完成门槛；本阶段已通过聚焦自动验证，未连接真实 MySQL 或改动真实玩家数据。

| 场景 | 必须证明 |
| --- | --- |
| 干净授权 GM | 一次提交达到两种货币、5 个扩展格及 15 种物资目标，revision 只加一次 |
| 部分已有资产 | 只补差额，已有更高数量、非目标物品和字段逐字保持 |
| 已全部满足 | `changed=false`，资源与 profile revision 不变 |
| 背包已有可堆叠目标 | 优先补堆叠，不占用不必要的新格 |
| 20 格仍不足 | 整笔失败，货币、扩展格、物资和 revision 全部回滚 |
| 坏/future 资产 | 失败关闭，不用 QA 命令洗白或删除异常数据 |
| 同 key 重试 | 结果重放，只补一次、只执行一次、无第二条同次成功审计 |
| 同 key 冲突/跨账号 | 409 冲突，不能读取或复用他人结果 |
| 缺少/非法 key | 发放逻辑未运行，持久根不变化 |
| 普通玩家 | `gm_denied`，按钮隐藏与直调 HTTP 均失败 |
| GM 缺命令 grant | `command_denied`，其他 GM 命令授权不能越权替代 |
| 拒绝审计洪泛 | 首次拒绝有证据，窗口内重复请求不造成无界持久写，窗口后可再记录 |
| store 失败/超时 | COMMIT 前无成功、无缓存发布；原 key 恢复一次结果 |
| GM 市场配置 GET | async store 下合法 GM 不再 503；审计提交失败时不返回伪成功 |
| 客户端身份 | 明确显示当前 GM 用户名，无目标账号输入，普通玩家不见入口 |
| 客户端同步失败 | 明确提示不要重复点击；自动重试复用原 key，仍未确认时拉取权威档案且不显示成功 |

已执行命令与结果：

```text
node --check server/node/src/auth/gm-qa-profile.js
node --check server/node/src/auth-service.js
node --check server/node/src/auth/durable-mutation-state.js
node --check server/node/src/auth/gm-pets.js
node --check server/node/src/auth/offline-hang.js
node --check server/node/src/http-server.js

node --test \
  server/node/test/auth-gm-qa-profile.test.js \
  server/node/test/auth-auth-session.test.js \
  server/node/test/auth-gm-pets.test.js \
  server/node/test/auth-offline-hang.test.js \
  server/node/test/auth-economy.test.js \
  server/node/test/auth-http-server.test.js \
  server/node/test/auth-durable-commit.test.js \
  server/node/test/auth-storage.test.js
# 132/132 通过

node --test \
  server/node/test/auth-gm-qa-profile.test.js \
  server/node/test/auth-durable-commit.test.js
# 最终补丁后 19/19 通过

godot --headless --path client/godot --quit
node tools/run_godot_auto_checks.mjs \
  --only=--auto-auth-check \
  --fail-fast --timeout-ms 180000
# parse + focused auth 2/2 通过；覆盖普通玩家隐藏/直开拒绝、身份脱敏、固定 payload、durable key、响应失败关闭

git diff --check
# 通过
```

本切片涉及 GM/QA 面板的身份提示和按钮状态；已生成并人工检查 1280×720 本地证据 `.run/evidence/phase248_gm_qa_core_profile.png`，可见当前账号、固定入口和“只补齐、不清空”文案。截图运行中的新增断言为 `qa_profile=true`、`screenshot=true`；完整历史 QA 面板检查仍被既有 `stable=false`、`gm_tiger_level=false` 拖红，未把它们误计为本切片通过项。本阶段不改变世界、移动、战斗或每帧签名，因此不另跑移动性能探针。
