# Phase 328：首批 NPC 职业原型正式运行发布

日期：2026-07-22

## 本阶段结论

项目所有者在审阅普通登录路径仍显示占位人的根因后，明确要求将 Phase 327 当前冻结的 8 套 NPC 职业形象“实装看看”。本阶段把这句话作为只针对该冻结批次的正式上线授权，不扩充岗位、不更换像素，也不把尚未建模的 NPC 借用成其他职业。

8 个 `appearanceId` 现均为：

```text
status=approved
ownerReviewStatus=approved
releaseApproved=true
runtimeEnabled=true
```

每套新增一份精确绑定当前冻结证据的 `release-owner-decision.json`，再由其最终文件 SHA-256 生成 `release-attestation.json`。目录只在 attestation 覆盖当前完整 12 帧安装矩阵、owner decision、严格证据摘要和 source set 后才打开普通运行权限。任一 decision、attestation、证据或安装图哈希漂移，`NpcArtCatalog` 会失败关闭并回退到明确占位，而不会借用另一个职业或镜像图。

## 发布范围

本次仅发布 Phase 327 已冻结的 8 类静态职业原型：

- 兽栏管理员、银行管理员、杂货商、庄园管事；
- 村庄守卫、村医、装备工匠、骑宠导师。

8 类仍按职业跨地图复用，共覆盖现有 26 个 NPC 实例；64 张真八向世界图与 32 张四状态人像全部进入普通运行目录，运行时镜像数为 0。

火芽村入口当前共有 14 个 NPC，其中 7 个已绑定上述职业外观并在本次实装后显示正式人物：村口守望者、村医、杂货商、兽栏管理员、骑宠导师、装备工匠和银行管理员。转生导师、MM1、MM2、钻石商、宠技训练师、福利员和说书人仍没有 `appearanceId`，继续显示安全占位是当前数据合同的真实结果；本阶段不把它们伪装成首批职业，也不因此勾选整个 P2.2。

第 8 类庄园管事由 9 个庄园实例复用，不在火芽村入口同屏画面内；目录、地图复用和实际纹理路径均由定向检查覆盖。

## 实装后 NPC 身份显示纠正

项目所有者在普通客户端实装画面中指出，原有 `facilityLabel` 被作为世界常驻牌绘制在 `marker.y - 62px`，恰好压住约 92px 高的正式 NPC 头脸。根因在运行时绘制层，不在 NPC 图片；`facilityLabel` 仍被地图分类、寻路目标和设施检查使用，因此不能删数据。

现行玩家界面合同为：

- `kind=npc` 不再绘制任何头顶常驻中文设施牌，任务 `!/?` 标记保持不变；
- 记录点等非 NPC 设施仍保留必要世界短牌，例如“记录”；
- 鼠标指向 NPC 实际人物范围时，在顶部中央固定 UI 条只显示实例身份；火芽村采用可选 `roleLabel + personalName` 输出 `银行管理员：阿衡`，没有个人名的村口守望者回退完整 `name`；
- 鼠标移出人物、进入任一 UI、进入对话/遭遇/战斗或切图后立即隐藏；
- 指向人物脸部与点击人物脸部共用同一命中矩形，避免“能看见名字却点不中”；
- 地图载入后从已预热纹理一次缓存当前 NPC 的 alpha 包围框并增加 4px 指向容错；透明的 256×256 画布不再吞掉相邻空地，鼠标事件只查询这个有界缓存，不解析 JSON、不取新纹理、不刷新世界绘制签名；
- 左键仍统一经过既有点击解析器，保持“地面宠物掉落 → 可见 NPC 人物 → 非 NPC 设施 → 地面移动”的顺序，并继续服从遭遇/战斗门禁；
- 相机采用平滑跟随时按 `Camera2D.get_screen_center_position()` 的实际屏幕中心更新悬停，玩家停步后的平滑尾段也不会留下过期身份。

本地 StoneAge 8.0 参考仅含服务端，无法证明原客户端具体使用头顶、顶部、底部或悬停布局；它能确认 NPC 实例身份与职业模板分离、查看后交互、对话反馈携说话者姓名。Beastbound 的固定顶部悬停条是针对 PC 鼠标路径的原创适配，不冒充原版复刻。

## Owner decision 与 attestation

- owner identity：`project-owner:fander`；
- 统一批准时间：`2026-07-22T14:23:46Z`；
- 每套 owner decision 的 `acceptedEvidence` 与 attestation 的 `strictEvidence` 精确包含同一 10 个字段；
- source set、方向录像、Stage A、Stage B、最终盲审、匿名 packet、producer mapping、Main report 与 Main screenshot 均绑定 Phase 327 冻结哈希；
- 每份 attestation 完整覆盖 8 张世界图与 4 张人像，并绑定 owner decision 最终文件哈希；
- catalog 冻结各自 attestation 的仓库相对路径与最终文件哈希，正常玩家启动不读取 `.run` 外部证据。

不可变 production bundle 内的候选 manifest 保留 Phase 327 当时的 `owner_review_pending` 历史状态，没有为发布而重写生产档案。根级 `action-bundle-meta.json`、来源与权属记录、owner decision、attestation 和运行目录共同表达当前批准状态。

## 验证

发布前先独立复核冻结链：

- `8/8` production bundle 经 `audit_npc_bundle.py` 完整审计通过；
- `96/96` 安装图与 production runtime 源图逐字节及声明 SHA-256 一致；
- 80 个 action-meta 证据绑定全部匹配；
- 两个 evidence index 共 162 个文件存在且哈希一致；
- 方向 evidence index 保持 `3613f0e939a06ed2e425b1bec76cf439ef920cb6c4a8f52e1c1e705cc20e6326`，Main evidence index 保持 `9564834a2de0af83a73cd9be8d7d5b52e9618d625581a1645aedd636cd7cfdb0`。

发布后验证结果：

| 验证 | 结果 |
| --- | --- |
| `godot --headless --path client/godot --script res://scripts/qa/npc_art_release_evidence_check.gd` | PASS；owner decision、attestation、12 帧矩阵和篡改拒绝合同通过 |
| Godot parse + NPC/设施定向回归 | `4/4`：parse、appearance、interaction、facility dialog 全通过；日志 `.run/godot_auto_checks/2026-07-22T14-25-13-687Z.log` |
| 身份悬停与联合回归 | `6/6`：parse、真实跨帧鼠标悬停、脸部点击、遭遇门禁、地面宠物优先、透明画布/旧 marker 空地释放、相机平滑尾段、appearance、interaction、facility marker、facility dialog 全通过；日志 `.run/godot_auto_checks/2026-07-22T15-32-43-238Z.log` |
| 正式目录汇总 | `appearanceCount=8`、`releaseApprovedCount=8`、`catalogRuntimeEnabledCount=8`、`releaseRuntimeAppearanceCount=8`、`worldFrameCount=64`、`portraitCount=32`、`mapNpcArtInstanceCount=26`、`runtimeMirroringCount=0`、`errors=[]` |
| 空闲性能 | 稳态 `process_total` 通常 `0.14..0.18ms`，无热路径文件扫描或重复纹理加载 |
| 真实跨帧移动 | `status=ok`、稳定约 60 FPS、`process_total=0.38..0.46ms`，实际位移到目标且路径收口 |
| 普通账号实机 | 重启原 Godot 客户端，不带 `--npc-art-review-preview` / Main capture 参数，后端未重启；7 个火芽村已覆盖 NPC 显示正式人物，银行管理员真实对话显示正式发言人像 |
| 身份条性能复核 | 1280×720 headless 空闲及移动稳定 60 FPS、`process_total=0.07..0.08ms`；640×360 可滚动视口同样稳定 60 FPS、`process_total=0.07..0.08ms`；319 次连续真实点击 `avg/max=6/281us`、`status=ok` |
| 身份条普通账号实机 | 常驻 NPC 中文牌为 0；悬停银行人物脸部显示 `银行管理员：阿衡`，移入顶部 UI 后隐藏，点击脸部打开银行管理员阿衡正式人像对话 |

普通登录实机证据保存在：

- `.run/evidence/phase328_npc_runtime_release/normal-login-world.jpg`
- `.run/evidence/phase328_npc_runtime_release/normal-login-bank-dialog.jpg`
- `.run/evidence/phase328_npc_runtime_release/npc-labels-removed.jpg`
- `.run/evidence/phase328_npc_runtime_release/bank-hover-final.jpg`
- `.run/evidence/phase328_npc_runtime_release/bank-face-click-dialog.jpg`

## 回归边界

`npc_art_catalog_check.gd` 现额外锁定：首批 8 类必须全部 approved/runtime enabled；在 QA preview 开启前必须能通过普通发布链预热；关闭 QA preview 后，已批准外观仍必须保留世界纹理和对话人像。Python builder 与 production bundle auditor 的 pending 规则不变，自动生产流程仍不得制造 owner approval。

## 仍未完成

1. 火芽村剩余 7 类岗位仍需分别确定职业复用边界、制作正式形象并独立验收；本阶段不自动扩批。
2. 其余正式人物、宠物、地图和 UI 美术仍未覆盖首发路径，因此 `P2.2 原创高清 2.5D 正式美术` 总项继续未勾选。
3. 本阶段未改变 NPC 服务、对话内容、任务、碰撞、经济、服务端、协议或玩家档案。
