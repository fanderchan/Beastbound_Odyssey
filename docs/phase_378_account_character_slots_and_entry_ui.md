# Phase 378：单账号四角色槽与角色入口

## 结论

项目所有者本阶段明确决定启用“单账号固定四个角色槽”。这项决定覆盖
`stoneage_gap_plan.md` 中早期“单账号多角色暂缓”的历史文字。本阶段已完成服务端
角色权威、MySQL 增量持久化、Godot 正常登录接线、原创角色入口美术、创建／选择交互
及 `1×` 实机验收视频；工程验证通过，项目所有者视觉验收保持待确认。

核心规则如下：

- 每个账号固定 `4` 个槽位，技术索引为 `0..3`，玩家界面显示为第 `1..4` 个角色；
- 每个已占用槽拥有独立 `playerId`、档案、档案版本和角色资产；
- 创建新角色只创建全新默认档案，不复制当前角色的货币、背包、宠物、任务或装备；
- 单角色账号的服务端会话继续兼容自动绑定原角色；Godot 登录后统一展示角色入口，
  多角色账号必须先选择角色；
- 角色选择写入会话，所有角色资产操作都由服务端会话确定角色，客户端不能提交
  `playerId` 绕过权威选择。

## 四槽权威契约

服务端根字段 `accountCharacterSlots[accountId]` 始终规范为长度为 `4` 的数组。空槽为
`null`，已占用槽包含：

```text
accountId
slotIndex
playerId
createdAt
updatedAt
lastSelectedAt
schemaVersion
```

`profileBindings[accountId]` 只表示当前被激活的角色，不能代替四槽名册；角色档案仍以
`profiles[playerId]` 独立保存。旧账号若只有既有 binding/profile，会无损桥接到槽位
`0`，保留原 `playerId`、档案版本和全部资产，不重建角色。

角色名最多 `24` 个字素、UTF-8 最多 `96` 字节，拒绝控制字符；同一账号内按 NFKC
规范化后不得重名。当前没有删除、覆盖或移动角色槽的玩家接口。

## 登录、刷新与兼容

### 单角色兼容

- 注册后的首个角色位于槽位 `0` 并自动选中；
- 只有一个已占用槽的旧账号登录时继续自动选中该角色；
- refresh 继承同一角色和同一 `selectionEpoch`，旧客户端的单角色入口不需要新增一步。

### 多角色未选状态

账号有两个或以上角色时，登录返回 `selectionRequired=true`：

- 会话不包含 `playerId`、`slotIndex` 或 `selectionEpoch`；
- `profileBinding`、`profileSummary`、`runtimePosition` 均返回 `null`；
- 服务端清除账号旧位置并发布 presence removal；
- 未选角色会话不进入在线玩家列表，也不能读取或修改角色档案；
- 未选状态 refresh 后仍保持未选，不会静默落回上次角色。

玩家文案保持中文，例如“请先选择角色进入游戏”“角色创建成功，请选择角色进入
游戏”。正常玩家界面不显示错误码、selection epoch、审计字段或测试信息。

## 角色接口

### `GET /characters`

返回固定四槽列表、`slotLimit=4`、`selectionRequired` 和当前选中角色。未选角色会话
也可读取自己的角色列表。

### `POST /characters`

创建空槽角色：

- 请求包含 `displayName`，可选 `slotIndex`；未指定槽位时使用第一个空槽；
- 必须携带 `Idempotency-Key`；
- 创建不自动切换角色；
- 满四槽、槽位已占用、名字非法或同账号重名时原子拒绝；
- 成功后返回角色摘要，不返回完整私有档案。

### `POST /characters/select`

按 `slotIndex` 或 `playerId` 选择角色；两者同时提供时必须精确指向同一槽。成功后：

- 服务端更新 active binding 和该槽的 `lastSelectedAt`；
- 签发带角色快照的新 token，并使旧 token 以 `character_session_rotated` 失效；
- 清除上一角色运行位置，发布 `session.replaced` 和 presence removal；
- 返回新 session、角色档案摘要和中文成功文案。

选择接口不要求幂等键，也明确排除 durable receipt；即使客户端额外发送
`Idempotency-Key`，也不会把新 token 写入回执。若客户端在选角成功后丢失响应，可
重新登录回到角色列表并再次选择，不会永久锁死账号。

切换到不同角色前，服务端会拒绝仍有活动战斗、队伍或邀请、面对面交易、庄园战
参战、交易所挂单、未领取资产邮件或挂机状态的账号。选择当前 active 角色仍被允许，
便于玩家进入原角色处理阻塞事项。

## 会话角色身份

选中角色的服务端 session 固化：

```text
playerId
slotIndex
selectionEpoch
```

`selectionEpoch` 由服务端单调生成，用来区分同一账号甚至同一 `playerId` 的不同选角
世代。每次角色接口解析 session 时都会验证：槽位属于账号、槽位中的 `playerId` 与
session 一致、active binding 仍指向该角色；任何漂移都按失效选择拒绝，而不是回退到
账号当前 binding。

## 跨角色幂等隔离

durable mutation receipt 新增显式 `scopeKind`：

- `scopeKind=account`：只允许服务端方法白名单中的 `createCharacter` 使用；可在未选角
  或选角后重放同一次创建结果；
- `scopeKind=character`：同时固化 `playerId` 和 `selectionEpoch`，只有同账号、同角色、
  同选角世代可重放；
- 无 `scopeKind`：仅作为旧单角色回执兼容。账号一旦拥有多个角色，无论当前是否已
  选角，都拒绝这类 account-only 角色资产回执。

account scope 的授权依据是服务端方法名白名单，不信任可由调用方影响的 `actionId`。
同一选角世代的 refresh token 可继续重放 character receipt；重新选角产生新 epoch 后，
旧回执返回幂等冲突，不能把上一角色或上一世代的结果投影到当前角色。

## 战斗写回与捕捉

战斗 participant 在入场时保存 `profileSummary.playerId`，离队 participant 也保留同一
快照。战斗记录同时写入该 `playerId`。

捕捉容量检查、自动捕捉预筛选、捕捉落档、收容结算预检和最终战斗档案 writeback
均以 participant 快照中的 `playerId` 为目标。active binding 只用于确认仍与快照一致，
不能改写结算目标；发生 mismatch 时：

- 捕捉以 `battle_capture_character_stale` 或
  `battle_capture_settlement_character_stale` 停止；
- 普通 writeback 记录 `character_selection_stale` 并跳过该档案；
- 不读取、消耗或奖励当前 active binding 指向的另一角色资产。

活动战斗本身仍禁止正常切角；上述校验是对跨节点陈旧状态、异常 binding 漂移和恢复
路径的第二层 fail-closed 防线。

## MySQL 增量迁移

运行时 schema 新增 `account_character_slots`：

- 主键：`(account_id, slot_index)`；
- `slot_index` 限制为 `0..3`；
- `player_id` 全表唯一；
- 行内保存创建、更新、最近选择时间和完整 JSON 文档。

启动加载会把行恢复成固定四槽数组。旧库没有槽位行时，从既有 profile binding 无损
桥接槽位 `0`；下一次持久化只插入缺失的槽位行，不重写原 profile/binding。

保存使用严格增量 diff：未变化槽位不产生 SQL，元数据变化执行带旧身份条件的更新，
删除与新增使用精确行操作，不使用 `ON DUPLICATE KEY UPDATE`，也不执行整表
delete/reinsert。角色 profile 继续沿用现有按 `playerId` 的增量持久化和 revision 校验。

## 客户端入口与原创视觉

Godot 正常登录路径现已接入固定四槽角色页：

- 注册／登录成功后先展示角色入口；服务端仍可为单角色会话自动绑定原角色，但客户端
  不绕过入口，玩家明确点击“进入游戏”后才载入角色档案并进入世界；
- 已占用卡片显示独立头像、中文角色名、等级和状态；空卡片显示正式加号图标与
  “创建角色”；
- 创建弹窗只要求角色名和确认槽位，创建成功后刷新列表并选中新卡，不自动进入世界；
- 选择成功后先替换本地 token，再载入该 `playerId` 的独立 profile；账号与角色缓存按
  `accounts/<username>/characters/<playerId>/...` 隔离；
- 返回按钮会注销待选会话并回到登录页；旧 token 失效、响应丢失和接口失败均不会沿用
  上一角色缓存；
- 主流程仅需左键和按钮，不把右键设为必需输入；玩家界面不显示 raw code、epoch、
  debug、smoke 或 agent 指令。

画面采用参考图的信息层级：左侧完整人物、右侧四槽纵排、左上返回、右下进入，
但背景、人物、独立头像、槽框与图标均为 Beastbound 原创 ImageGen 美术，没有复制
参考图像素、角色或商标。正式运行素材与来源／所有权清单位于：

- `client/godot/assets/ui/character_entry_awakened_v1/manifest.json`；
- `client/godot/assets/ui/character_entry_awakened_v1/source-and-ownership.md`。

最终实机证据：

- `1280×720` 主画面：`.run/character_entry/character_entry_final_1280x720.png`；
- 创建弹窗：`.run/character_entry/character_entry_create_final.png`；
- 参考／实机并排：`.run/character_entry/character_entry_reference_comparison.png`；
- `1×` 视频：`.run/evidence/phase378_character_entry_owner_review/phase378-character-entry-final-v2/character-entry-owner-review-1x.mp4`；
- 联系表：`.run/evidence/phase378_character_entry_owner_review/phase378-character-entry-final-v2/contact-sheet.png`。

## 非目标

- 不增加第五角色槽、付费扩槽、角色删除、改名、换槽或账号间转移；
- 不复制 StoneAge 的角色数值、界面像素或美术资产；
- 不改变角色成长、经济、战斗公式、掉落率或充值规则；
- 不把所有账号级社交／商业实体在本阶段重构为 player 级实体，切角安全由现有 blocker、
  session 身份和资产回执隔离保证；
- 不增加移动端、触屏或竖屏入口；
- 不把本阶段工程验证扩张为项目所有者视觉验收或正式发布门禁通过。

## 验证状态

服务端最终定向回归分两组完成：

- 角色、receipt、跨节点读穿和 MySQL 写入合同：`134/134`；
- session、HTTP、战斗、捕捉、presence、存储和事件：`304/304`；
- 合计：`438/438` 通过，相关代码 `git diff --check` 通过。

覆盖内容包括：旧单角色槽位桥接、四角色档案隔离、未选登录与在线列表、创建回执
重放、跨角色回执冲突、选角 token 旋转、响应丢失恢复、presence removal、battle
participant mismatch、MySQL 固定四槽 DDL／加载／增量 diff 和 receipt scope 校验。

客户端验证完成：

- `godot --headless --path client/godot --quit`：解析通过；
- `character_entry_flow_check.gd`：固定四槽、创建、选择、返回和状态隔离通过；
- `--auto-character-entry-live-check`：隔离 QA 后端真实 HTTP 链路返回
  `register=true entry=true create=true select=true initial=1 created=2 slot=1 sync=ready`；
- `--auto-auth-server-client-check`：角色接口请求／解析合同通过；
- 预览 CPU render 平均 `0.16ms/frame`；
- idle 与真实跨帧 movement `--perf-probe` 均稳定 `60 FPS`，`process_total=0.04ms`，
  movement 结果 `status=ok`；
- 录屏工具单测 `4/4` 通过，最终视频为 `17.966667s / 539` 帧、
  `1280×720 / 30 FPS / 1.00×`、H.264/AAC，完整音视频解码通过；
- 录屏使用真实 `Main.tscn`、独立 user-data 和跨帧鼠标／键盘输入，不连接后端或
  MySQL，也不写正常玩家存档。

仍未执行完整 `tools/run_local_ci.mjs`，也未在共享／生产 MySQL 上进行破坏性建表或
并发迁移演练；最终录屏退出时保留 Godot 的标准 ObjectDB／resource leak 警告，未影响
画面、交互、编码或完整解码。运行素材 `ownerReviewStatus` 保持
`owner_review_pending`，直到项目所有者观看视频并明确验收。
