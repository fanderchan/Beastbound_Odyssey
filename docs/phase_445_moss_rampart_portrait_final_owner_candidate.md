# Phase 445：苔垒角兽 V4E 最终 owner-review 头像候选

## 结果

Phase 443 的 V3M 从未提交或发布。虽然它通过工程门禁，但美术复核仍认为毛皮、岩片微纹理过密，
整体偏写实，与已经冻结的曜冠角兽头像不属于同一套干净的商业 2.5D 语言，因此本阶段明确作废。

本阶段重新以正式 `front_3quarter_sw.png` 身份姿势和曜冠角兽已批准头像作为约束，最终选择 V4E：
一根前向分段角、短奶油色口鼻、琥珀眼、暖锈橙毛皮、深棕鬃毛、克制苔藓岩甲，以及可清楚数出的
三枚肩部琥珀菱纹。1280×720 真实 Main 中，苔垒头像在圆形融合目标框内轮廓完整、眼神和身份焦点
清楚，没有可见色键边或贴边；它比曜冠略低、略轻，但仍处于同一视觉等级，不再继续盲目生成。

V4A／V4B 因烘焙棋盘格且无真实 Alpha 作废；V4C／V4D 因请求证明或构图边距不合格作废；V4F
因明显背景渐变作废；V4G 因主体再次接触右／下边缘作废。只有 V4E 进入正式 11 文件头像包。

本阶段只把 V4E 冻结为“工程完整、艺术指导自审通过、等待项目所有者观看”的候选，不冒充 owner
批准，也不提前开放融合。以下状态继续失败关闭：

```text
semanticIndependenceVerified=false
portraitReleaseGate=false
ownerReviewStatus=owner_review_pending
releaseApproved=false
runtimeEnabled=false
playerEntryOpened=false
```

## 正式头像包与来源

- ImageGen generation ID：`exec-477b5023-0daa-40e8-b36f-71c2741cc6da`；
- 实际生成请求 SHA-256：`74aab066a41b2e7f0d27def50d34d348147700b7f91c68b3303f03a7808a660e`；
- 正式身份参考 SHA-256：`a556b4b3990849105b24ab2ce15d8678d7ff9d0f13bb7e6d04fc54a63f31684b`；
- 原始生成 PNG SHA-256：`c96a666c17272dedaa5de11f434ef309812767eefbeb7dda3a0bf33eb23f2ff9`；
- 1024 透明主文件 SHA-256：`33cd6012e5ef03b0db68c67c12bb42ec94ff160b5b3e44da836f69035f5710eb`；
- 512 运行头像 SHA-256：`0d4aba0c27e449dc77a161720c7c553d630e0eb0f69af8d9c19ee52738a9f124`；
- 512 可见覆盖率 `24.8913%`，可见边界 `[152, 141, 429, 471]`，四边留白分别为
  `152 / 141 / 83 / 41` 像素，满足最低 `41` 像素安全边距；曜冠覆盖率为 `28.8342%`，差异已在
  相同真实 Main 圆框内复核为可接受，而不是只比较独立 PNG；
- ImageGen 将请求的 `#FF00FF` 整体偏移；正式处理键使用四角极小最大距离采样得到的 `#EA22D6`，
  四角距离为 `11.576 / 3.464 / 10.392 / 6.557`，继续使用默认透明／不透明距离 `36 / 140`，
  没有放宽阈值；
- 同操作资格掩码内去色 `2340` 个 RGB 像素，Alpha 改动 `0`、掩码外改动 `0`；强品红边缘残留
  比例 `0.005497`，低于作废 V3M 的 `0.007132`；
- duplicate guard 与 521 张同根身份／世界／战斗图比较，没有发现精确或缩放复用。该门禁只排除
  机械复制，不替代语义独立性、版权来源或项目所有者审美判断。

## Godot 导入一致性

标准资源重导入后，当前 `default.png` 的 MD5 与 Godot `.md5` 记录均为
`82e6efa65924374ac1dde275cca27bb0`，对应导入文件为本轮执行时间。真实 Main 证据只使用这次重导入
后的 V4E，不复用 V3M 录像或缓存。

## 真实 Main 证据

唯一权威轮次位于本地忽略目录：

```text
.run/evidence/phase445_moss_portrait_owner_review/
  phase445-moss-v4e-owner-review-20260815-a/
```

| 产物 | SHA-256 |
| --- | --- |
| `pet-fusion-main-owner-review-1x.mp4` | `6cd6f70922e1cbd26c6a86fa1d054b0329b6ab220bc6eb54d485285067796771` |
| `contact-sheet.png` | `13203bde3c2e3ef54d8c210594c4e1386f19535dee1518833e140a0a7751d128` |
| `summary.json` | `d582fb0c7e82a4f0382e653b8caf03a75ec4ff688aa1eb8cb5ae2c458b8f7ded` |

权威视频为 H.264／yuv420p、1280×720、30 FPS、`1.00x`、918 帧／30.600 秒，含 48 kHz AAC
双声道可闻音频。它从真实 `Main.tscn` 进入 QA-only 关闭态融合界面，完成两次真实跨帧左键；
网络请求、服务端写入和第二次不可逆确认均为 `0`。录像前后关闭发布校验一致，真实玩家目录未变化，
音视频完整解码与 `SHA256SUMS` 收口通过。它只证明当前关闭态呈现，不证明正常玩家入口已经开放。

## 验证

- `python3 -m py_compile tools/build_pet_portrait.py tools/audit_pet_portrait_catalog.py tools/verify_pet_fusion_closed_release.py`：通过；
- `python3 -m unittest tools.test.test_build_pet_portrait tools.test.test_audit_pet_portrait_catalog tools.test.test_verify_pet_fusion_closed_release`：`131` 项，`130 PASS / 1 SKIP`；
- `python3 tools/verify_pet_fusion_closed_release.py`：PASS，覆盖 `2 forms / 1350 copied / 22 portrait / 2 QA controls`，四个发布开关保持 false；
- `python3 tools/audit_pet_portrait_catalog.py --catalog-only`：正式目录 `36/36`、`errors=[]`；
- `node tools/run_godot_auto_checks.mjs --only --auto-pet-portrait-art-catalog-check,--auto-pet-shared-portrait-consumer-check --fail-fast`：解析与消费者检查 `3/3 PASS`；
- `godot --headless --path client/godot --script res://scripts/qa/pet_fusion_panel_check.gd`：曜冠／苔垒两条路线均为 `candidateFormalPortraitCount=5 / candidatePlaceholderCount=0 / targetPortraitStatus=formal`；
- `godot --headless --editor --path client/godot --import --quit` 与最小解析：通过；
- `python3 tools/record_pet_fusion_main_owner_review.py ...`：权威轮次 `passed`，音视频完整解码、真实目录不变、关闭发布校验和 QA lane 生命周期均通过。

本阶段没有修改融合配方、成长、概率、经济、网络、协议、输入或逐帧逻辑，不新增运行时热路径；
也不以头像审片替代融合 runtime 的独立发布证明。

## 下一门禁

项目所有者需要观看上述 V4E 权威视频并明确接受或拒绝苔垒角兽头像。若接受，下一独立阶段才可把
曜冠／苔垒专用头像写入 owner runtime decision 与 release attestation，并在所有发布证明和正常玩家
入口验证通过后讨论开启融合；若拒绝，只重做苔垒头像，不改已批准的两只完整非骑乘包。
