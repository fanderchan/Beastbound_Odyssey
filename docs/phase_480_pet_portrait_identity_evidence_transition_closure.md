# Phase 480：历史宠物头像身份账本迁移闭环

日期：2026-08-18

## 结论

正式开放就绪复核发现的三只历史宠物、六条 `identityEvidence` 重放错误已经关闭。当前权威画像审计为：

- 三只目标 single-target 均为 `status=ok / errors=[]`；
- 完整目录为 `mode=combined / audited=36 / status=ok / errors=[]`；
- 画像审计仍正确保持 `releaseGate=false / owner_review_pending`，没有借工程通过授予美术批准；
- 首批融合仍为 `releaseApproved=false / runtimeEnabled=false / playerEntryOpened=false / portraitReleaseGate=false`。

本阶段没有修改任何宠物头像、身份图、世界帧、战斗帧或运行配置，也没有调用 ImageGen、上传素材或生成 owner approval。改动只涉及只读审计合同、回归测试和三份项目相对路径的 SHA-256 迁移账本。

## 根因复核

对以下三份 `generation-attestation.json` 的已存 `identityEvidence` 与当前权威 identity bundle 重放结果做递归字段比较：

| formId | 差异字段数 | 唯一差异 |
| --- | ---: | --- |
| `blue_man_dragon_water10` | 1 | `bundleMetadataSha256` |
| `rebirth_beast_earth_lv50` | 1 | `bundleMetadataSha256` |
| `novice_tiger_mount` | 1 | `bundleMetadataSha256` |

其余身份图文件／RGBA 哈希、身份锁、pipeline、catalog 身份切片、ownership、prompt、路径、状态和像素绑定逐字段完全相同。

三份 attestation 中记录的旧 `action-bundle-meta.json` SHA-256 在 Git 历史各版本及当前 `.run` 内全部同名元数据归档中都找不到对应字节。因此不能改写旧 attestation，也不能声称历史元数据可重放。两只 2026-08-16 后更新的宠物元数据确有 world/provenance 证据补全；蓝人龙则只剩旧哈希记录，原字节未保留。

## 失败关闭迁移合同

新增合同 `beastbound_pet_portrait_identity_evidence_metadata_transition_v1`：

1. 共享 allowlist 只登记上述三个 `formId`；
2. 每项同时固定 attestation 旧哈希和当前权威新哈希；
3. 只删除 `bundleMetadataSha256` 后比较两份完整 identity evidence；其余任一字段漂移立即失败；
4. 每只宠必须在固定路径提供独立 JSON 账本，账本与工具重算结果逐字段完全一致；
5. 账本明确声明没有提供历史元数据字节、没有声称历史重放、没有修改画像像素、没有授予 owner 批准、没有授予 runtime 发布；
6. 新宠或其他 33 只正式宠不能复用该通道；当前元数据哈希再变化也会失败，必须另行审计和显式更新合同。

旧 `generation-attestation.json` 保持逐字节不变，因此历史事实没有被“修成正确”；当前权威身份仍由实时重放证明。

## 改动范围

- `tools/pet_identity_replay_contract.py`：登记三组精确旧／新哈希；
- `tools/build_pet_portrait.py`：共享迁移账本预期值和只读验证；
- `tools/audit_pet_portrait_catalog.py`：只在精确账本验证成功后保留历史 attestation snapshot；
- `tools/test/test_build_pet_portrait.py`、`tools/test/test_audit_pet_portrait_catalog.py`：增加通过、篡改、非元数据漂移回归，并把本地临时目录夹具改为沙箱可写位置；
- 三只宠各新增 `source/portrait/identity-evidence-transition-ledger.json`。

## 验证

### Python 与画像目录

- `python3 -m py_compile ...`：PASS；
- builder + catalog audit 完整单元：`106/106 PASS`；
- 三只目标 single-target：全部 `status=ok / errors=[]`，比较图像数分别为 `554 / 261 / 275`；
- 完整画像目录：`audited=36 / status=ok / errors=[]`。

新增负向回归证明：

- 把账本中的 `ownerApprovalGrantedByLedger` 或 `runtimeReleaseGrantedByLedger` 改为 `true`，立即失败；
- 身份锁等任一非 `bundleMetadataSha256` 字段变化，立即失败；
- 非 allowlist form 或不在固定旧／新哈希合同内的变化，立即失败。

### 相邻产品门禁

- Pet Design Inspector：`36 forms / 2 fusion targets / errors=0 / warnings=0`；
- 战斗动作目录：`status=ok / 34 actions / 10 passives / 36 forms`；
- 融合关闭态 verifier：`PASS / 2 forms / 1350 copied / 22 portrait / 2 QA controls`；
- Godot headless parse：PASS；
- Godot parse + 正式画像目录 + 共享画像消费者：`3/3 PASS`。

## 隐私与发布边界

三份账本只含项目相对路径、公开 `formId`、SHA-256 和布尔限制声明；不含本机绝对用户目录、用户名、凭据、数据库、玩家档案、`.run` 截图／视频或外部素材地址。本阶段不需要项目所有者追加视觉批准，也不会改变仍在等待的融合正式开放决定。
