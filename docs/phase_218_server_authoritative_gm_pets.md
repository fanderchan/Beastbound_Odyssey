# Phase 218 — GM 宠物创建/升级服务端化与旧 Lv1 观察兼容

## 目标

本阶段完成 `P0.2c-3c`：联网 GM 面板只能向服务器提交“创建哪个成长档宠物”或“哪只宠物升一级”的意图，宠物身份、Lv1 4V、隐藏成长、逐级结算、容量、图鉴、档案 revision 与审计全部由服务端决定。客户端不得在联网会话里直接改档案；本地修改只保留给显式 `auth_auto_bypass` 的隔离 QA。

## 修复前事实

旧 GM 面板会直接调用 Godot `PlayerProgressModel.gm_grant_growth_pet()` / `gm_level_up_pet_once()`，随后尝试保存整份档案。这条路径既绕过服务端成长目录和审计，又无法证明不同升级来源使用同一 dispatcher。

另外，`seed-demo-data.js` 可以面向复用数据源直接写演示档案，宠物还由脚本自行拼装；这是一条剩余的非权威创建/升级入口，不能继续用于真实 MySQL 或覆盖已有测试档案。

## 服务端 GM 宠物契约

新增聚焦域 `server/node/src/auth/gm-pets.js`：

- `gm_grant_pet` 只接受 `growthSpeciesProfileId` 或 `formId` 二选一，拒绝客户端提供等级、属性、种子、roll 等额外字段；
- 服务端从严格成长目录解析形态，并调用唯一 `newPetFactory.finalizeLevelOne()`；linked 形态生成 authority-v1，unlinked 形态保持 legacy 兼容边界；
- 新宠先检查随队 5 只与兽栏 20 只容量，再生成唯一实例 ID、写图鉴、revision `+1`、保存一次并记录 GM 审计；
- `gm_level_pet` 只接受 `instanceId`，使用现有 canonical EXP dispatcher 精确升一级；合法 authority-v1 逐级结算四维，损坏 v1 失败关闭，legacy 保持原兼容语义；
- 参战期间两项档案变更都被锁定；权限与 command grant 继续按账号和命令分别校验；
- HTTP 响应只返回公开档案与安全结果摘要，不返回 raw pet、private seed/roll 或精确最终品质。

`POST /gm/commands/gm_grant_pet` 与 `POST /gm/commands/gm_level_pet` 复用既有 GM 路径；其他 GM 命令仍走原授权探测，不改变协议版本。

## 客户端路由与重试安全

Godot 新增非幂等 GM command request，固定 `RETRY_POLICY_NONE`。联网账号无论是否本地也开启 QA bypass，都必须走服务器；只有无服务器会话且显式 bypass 时才允许旧本地 QA 路径。请求进行中创建与升级按钮同时禁用。

服务器成功后，客户端必须先通过严格宠物档案投影再替换运行态并刷新 GM 下拉框。若服务器已经完成变更但客户端拒绝档案：

- 响应明确标记 `profileApplied=false`，不把返回实例误选成当前本地宠物；
- 玩家提示改为“服务器已完成操作……请勿重复操作，正在重新拉取”，避免把同步失败误认为创建失败而重复领取；
- 自动排队拉取权威档案，但不会重发非幂等创建请求。

## auth1373 真实问题与旧档兼容

用户在真实本地 QA 后端点击“获取Lv1”时，服务器连续成功创建了 4 只蓝人龙，profile revision 从 119 增至 123；新宠的 authority marker、公开 Lv1 4V 和成长 envelope 全部合法。客户端显示“暂无宠物”的真正原因是档案里三只历史 Lv1 宠保存了合法的“尚未观察”摘要：`observedLevels=0`，三个四维统计 map 均为空。严格投影把空 map 当成损坏数据，因而拒绝了整份档案。

兼容规则现收窄为：仅当 `observedLevels == 0` 时允许空统计 map；只要已经观察过等级，或 map 非空但缺少四轴，仍返回 `invalid_growth_observation` 并失败关闭。该修复不重建、不改写旧宠，不降低 authority marker、当前四维、Lv1 事实、隐藏字段和公开 envelope 的校验强度。

用 auth1373 revision 123 的只读公开档案重新投影后，11 个 petInstances 与 3 个训练伙伴引用共 14 条宠物路径全部通过；4 只新蓝人龙未重滚，3 只旧 Lv1 宠也不再阻断档案。用户重复点击产生的 4 只蓝人龙被保留，没有自动删除真实账号资产。

## 演示种子入口收口

`seed-demo-data.js` 现在只允许一次性、空的 memory/JSON 测试数据源：

- 明确拒绝 MySQL，不连接运行时数据库；
- 已有输出默认拒绝覆盖，只有显式 `--reset-output` 才能重建一次性夹具；
- 演示宠物也通过正式 factory 创建蓝人龙并使用 canonical dispatcher 升级，不再由脚本拼私密成长字段；
- 测试锁定四个账号各一只 authority-v1 宠、CSPRNG 私有身份、真实 Lv1 事实和目标等级。

## 验证

- `npm --prefix server/node test`：274/274 通过；
- `node --test server/node/test/auth-gm-pets.test.js server/node/test/demo-seed-script.test.js`：8/8 通过；
- Godot 4.7 parse 通过；
- `--auto-auth-server-client-check`、`--auto-pet-growth-observation-check`、`--auto-server-pet-growth-boundary-check` 与 parse：4/4 通过；
- auth1373 revision 123 公开档案离线严格投影：`ok=true`、`projectedPetCount=14`、无 pet/profile error；
- 宠物设计 inspector：`errors=0`，现有 24 个未接成长档形态与被动目录等 26 个既有 warning 保持显式；
- `--auto-qa-panel-check` 中本阶段新增的 pending、route、grant、level 均为 true；总检查仍被既有 `stable=false` 拖红，本阶段未混入兽栏入口修复；
- `git diff --check` 通过。

## 玩家验收

1. 完全退出并重新启动客户端，登录 `auth1373`，打开 GM/QA；宠物目标下拉应能看到账号现有宠物，不再显示“暂无宠物”。
2. 只点击一次“获取Lv1”：左下角应显示“获得 Lv1 蓝人龙……”，下拉框自动选中新实例；不要连续点击测试。
3. 打开宠物详情，核对 Lv1 四维可见、成长为“未观察”，没有精确 Lv140 或隐藏品质。
4. 对同一只宠分别升到 Lv5、Lv10、Lv20；每次只增一级，四维与成长观察随服务器档案刷新，约 Lv20 可用于继续/放弃判断。
5. 若未来再次出现客户端同步拒绝，提示必须明确“服务器已完成操作、请勿重复”，而不是暗示再次领取。

## 剩余边界

1. 当前真实账号已有 4 只本次重复点击产生的蓝人龙；它们是合法服务器资产，是否清理应由用户决定，不能由客户端自动撤销。
2. 24 个 unlinked legacy 形态仍只走旧升级兼容语义，正式逐级四维接档与旧宠迁移报告属于 `P0.2d`。
3. 蓝人龙仍无正式世界遇敌投放；GM 创建只用于养成验证，不代表首发内容已完成。
4. GM 面板既有兽栏入口自动检查 `stable=false` 需单独复现和处理，不能与本阶段混提交。

## 涉及文件

- `server/node/src/auth/gm-pets.js`
- `server/node/src/auth-service.js`
- `server/node/src/http-server.js`
- `server/node/scripts/seed-demo-data.js`
- `server/node/test/auth-gm-pets.test.js`
- `server/node/test/demo-seed-script.test.js`
- `client/godot/scripts/net/server_sync_coordinator.gd`
- `client/godot/scripts/progression/server_auth_client_model.gd`
- `client/godot/scripts/progression/pet_growth_public_projection_model.gd`
- `client/godot/scripts/ui/panel_flow_coordinator.gd`
- `client/godot/scripts/qa/auto_check_coordinator.gd`
- `client/godot/scripts/main.gd`
- `stoneage_gap_plan.md`
