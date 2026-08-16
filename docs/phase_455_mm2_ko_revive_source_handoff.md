# Phase 455：MM2 倒地／复起高清来源交接

## 结论

2 转小 MM（`pet_rebirth_mm_stage2`）现有独立战斗运行包保持原样，补入一份范围明确、可重复核验的
倒地／复起来源交接：两个正式视角各保留 `down-8` 与 `revive-1` 两张 512×512 来源帧，共 4 张。
四张来源帧按已记录的历史直通 RGBA Lanczos、位移与边缘清理规则重新派生后，与当前 256×256 运行帧
逐 RGBA 完全一致；同一视角的 `down-8 == revive-1` 在来源层和运行层均成立。

本阶段没有修改 180 张运行 PNG，没有重新创作、镜像或全图去色，也没有扩大视觉批准、启用普通玩家
运行路径或宣称 180 张高清原始母版已经全部归档。`ownerReviewStatus=pending`、`runtimeEnabled=false` 保持
不变。

## 背景与边界

Phase 323 曾拒绝一批无法由统一 canonical 管线精确重现当前运行帧的 512px handoff，避免错误来源记录
覆盖已经验证的运行资产。本阶段只接收能够精确回放的四张倒地／复起边界帧，并在审计中显式登记：

- 外部完整工作档仍位于忽略目录 `.run/art_full_g11_g12/pet_rebirth_mm_stage2/pet/battle`；
- 仓库跟踪的是 4 张精确交接帧，不是 180 张完整原始生成档；
- 正面运行帧历史位移为 `-18px`，背面为 `0px`；反向求解迭代次数和初始 RGB 差异均写入审计；
- 来源 alpha 保持不变，运行 alpha 改动为 `0`，没有 global despill；
- 交接前后 180 帧运行树摘要均为
  `b792058f1eb66d4cd446a3869e301270f8f8541196bac3096e7ed910967f1adf`。

因此这是一项来源可恢复性补强，不是美术像素升级，也不替代未来完整 180 帧原始来源归档。

## 交付内容

- `source/formal-production/handoff-512/`：双视角各两张 512px 交接帧；
- `source/formal-production/source-handoff-v1-audit.json`：派生、哈希、连续性和运行树不变证明；
- `qa/battle/repairs/mm2-source-handoff-v1-contact.png`：来源与运行结果并排证据；
- `action-bundle-meta.json`、`qc-summary.json`、来源 ledger、语义修复 manifest 与安装 manifest：只同步
  安装完成和来源交接事实；
- `install-manifest.sha256`：安装清单外置自哈希，避免循环引用。

## 验证

```text
python3 tools/audit_pet_battle_catalog.py --require-complete
PASS：36/36 forms，6480/6480 battle frames

godot --headless --path client/godot \
  --script .run/evidence/phase323_all_pet_battle_candidates/check_all34_battle_runtime.gd
PASS：checkedForms=36 / checkedFrames=6480 / errors=[]

godot --headless --path client/godot --quit
PASS：Godot 4.7 parse/import

python3 tools/pet_art_batch_audit.py --repo-root . \
  --json-out .run/pet-art-batch-current-audit.json \
  --markdown-out .run/pet-art-batch-current-audit.md
PASS（发布错误门）：36 forms / runtime=3 / errors=0 / warnings=0；关闭候选缺口继续诚实记录为 pending

JSON 解析、安装 manifest 外置 SHA-256、四张交接帧 SHA-256、git diff --check
PASS
```

## 未完成项

- 其余 176 张 512px 原始来源尚未作为完整 full archive 跟踪；
- 本阶段不批准 MM2 的整体审美，也不改变任何 owner decision；
- MM2 世界真八向、整体骑乘包与普通玩家运行开放仍按各自路线单独验收；
- P2.2／P2.3 继续保持未完成。
