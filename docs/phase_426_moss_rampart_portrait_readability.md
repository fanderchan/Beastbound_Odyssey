# Phase 426：苔垒角兽专用头像可读性修复

## 结果

本阶段替换 `emberhorn_fusion_moss_rampart_fire4_earth6`（苔垒角兽）原有头像候选，解决其在
48／64 像素候选栏中缩成一团、容易被误读为蜷缩全身图的问题。新版本是独立生成的头肩像，保留
单根玄武岩角、橙色熔纹、小型琥珀眼、短口鼻、岩甲、克制苔藓与肩部橙色菱纹；没有复用世界、
战斗或全身帧裁切。

美术自审结论为“具备提交和项目所有者审片条件”：主角、眼睛和材质焦点清楚，圆形融合目标框内
留白均衡，48／64／96／128 像素下仍能辨认角、面部和甲壳层次。它与曜冠角兽在轮廓、材质和
攻守气质上形成明确区分，不是换色关系。

本阶段不冒充项目所有者批准。以下门禁继续保持关闭：

```text
semanticIndependenceVerified=false
releaseGate=false
ownerReviewStatus=owner_review_pending
releaseApproved=false
runtimeEnabled=false
playerEntryOpened=false
```

## 生成与运行资产

- ImageGen generation ID：`exec-2f8ba0a5-4a22-469e-9460-4738159db22b`；
- 生成原图 SHA-256：`077927295f6bd366fc1681416c860218aab2f67e0dec248f38d18f70c72b517f`；
- 1024 透明主文件 SHA-256：`97fabf485c6d153ca78bb13f2918ed26ff9bdba455e7188daa376665657b6480`；
- 512 运行头像 SHA-256：`1c8f0a7840255675e612f7cb29cfdbfb07d84bbe6ca9f9ba206da175e38ce237`；
- 512 运行图可见覆盖率为 `30.6362%`，可见边界为 `[105, 72, 417, 443]`；四边透明留白依次为
  左 `105`、上 `72`、右 `95`、下 `69` 像素，均超过 41 像素最低安全边距；
- duplicate guard 扫描 521 张既有图片，未发现精确或缩放复用；该结果只排除机械复制，不替代
  语义独立性、版权来源或项目所有者审美判断。

运行头像、1024 主文件、原始生成图、无损 WebP、alpha／色键掩码、生成证明、实际请求 prompt、
来源说明与 48／64／96／128 接触表已作为一个原子资产包更新。`.run` 中的选择过程只作本地追溯，
可移植校验依赖仓库内原图、身份图、哈希和生成证明，不依赖另一台机器拥有 Codex 图片缓存。

## 真实 Main 画面

最终权威录像位于本地忽略目录：

```text
.run/evidence/phase426_moss_portrait_owner_review/
  phase426-moss-portrait-review-20260814-c/
```

| 产物 | SHA-256 |
| --- | --- |
| `pet-fusion-main-owner-review-1x.mp4` | `533c25b9677d412d8363a11f12a838c8974538964519b5b4192750ab8af2f25a` |
| `contact-sheet.png` | `9551a2165c2cc35e60a9d1576d1e4d76be5daf80e3051bfd6321434d8d76cfcf` |
| `godot-native-report.json` | `21557c0236a597f4cf5b296685963edbd1145e18e42464eeb2851d65f85c2863` |
| `godot-movie-report.json` | `21557c0236a597f4cf5b296685963edbd1145e18e42464eeb2851d65f85c2863` |

媒体为 H.264／yuv420p／1280×720／30 FPS／`1.00x`，AAC 48 kHz 双声道，30.600 秒、918 帧。
两条路线各完成一次跨帧真实左键，正式材料头像为 `5/5`、占位图为 `0`；总网络请求为 `0`，
第二次确认为 `0`，真实玩家目录前后未变且 automation QA lane 已清理。

隔离 worktree 的初次直接启动因没有 `.godot` 导入缓存而失败；完成标准 Godot 资源导入后，融合
面板专用检查两条路线均通过。失败轮次 `a`、`b` 不是发布证据，最终权威轮次仅为 `c`。

## 验证

- `python3 -m py_compile tools/verify_pet_fusion_closed_release.py tools/build_pet_portrait.py`：通过；
- `python3 -m unittest tools.test.test_build_pet_portrait tools.test.test_audit_pet_portrait_catalog tools.test.test_verify_pet_fusion_closed_release`：共运行 131 项，`130 PASS / 1 SKIP`；
- `python3 tools/audit_pet_portrait_catalog.py --catalog-only`：`status=ok`，36 个形态全部审计，当前头像仍为 owner pending／release gate false；
- `node tools/run_godot_auto_checks.mjs --only --auto-pet-portrait-art-catalog-check,--auto-pet-shared-portrait-consumer-check --fail-fast`：解析与两项检查 `3/3 PASS`；
- `godot --headless --path client/godot --script res://scripts/qa/pet_fusion_panel_check.gd`：两条路线均为 `candidateFormalPortraitCount=5 / candidatePlaceholderCount=0 / targetPortraitStatus=formal`；
- `python3 tools/verify_pet_fusion_closed_release.py`：`PASS`，继续证明 `2 forms / 1350 copied / 22 portrait files / 2 QA import controls`，三个发布开关保持 false；
- `python3 tools/record_pet_fusion_main_owner_review.py ...`：最终轮次 `passed`，覆盖原生 Main、MovieWriter、音视频解码、关键帧、关闭发布校验与 QA lane 清理；
- `git diff --check`：通过。

本阶段只更新头像资产、头像来源证明与相应关闭发布校验常量，没有修改界面布局、逐帧逻辑、输入、
网络、协议、配方、成长、概率或经济规则，因此没有制造新的运行时热路径，也不以本次头像审片替代
后续融合正式开放与性能门禁。

## 下一门禁

项目所有者需要观看最终成片并明确接受或拒绝这张苔垒角兽专用头像。只有得到明确接受后，才允许
在后续独立阶段更新 owner decision／release attestation；本阶段不得提前开启生产融合。
