# Phase 446：整体骑乘候选来源就绪审计

## 当前结论

整体骑乘候选过去只在 `battleVisual.archiveMode=full` 时校验 512px 源帧到 256px 运行帧的规范派生；
`lean` 候选即使缺少正式来源 ledger、安装清单、逐动作 exact prompt，或 metadata／QC 的 bundle digest 已经
互相漂移，仍只会留下笼统的 owner-pending 状态。现已在只读全宠物审计中补齐正式整体骑乘来源门禁：关闭
候选把缺口记为明确 `pending`，如果同一形态被误设为 `runtimeEnabled=true`，则相同缺口直接成为阻断错误。

这次没有修改任何人物、宠物或骑乘像素，没有写 owner decision，没有启用运行时，也没有勾选 P2.2b。

## 审计合同

当 mounted `battleVisual` 声明正式 owner-review 候选时，审计现在同时验证：

- `archiveMode` 只能为 `lean` 或 `full`，并与 `sourceFramesTracked` 精确对应；
- metadata、安装清单、QC 和旧来源账本中存在的 bundle digest 必须一致；
- `source/battle/source-ledger.json` 的形态、人物、归档模式、来源、权属、替换路径和完整来源预验证声明；
- 两个正式视角、12 个动作各自的 exact prompt、pipeline、QC 及 SHA-256；
- 180 个 512px 源帧哈希和 180 个运行帧哈希均在完整验证表中登记；
- `lean` 至少保留两个独立视角的代表性无损生成表，`full` 保留每个动作的无损表和源帧；
- 安装清单登记的每个本地文件仍存在且文件 SHA-256 没有漂移；
- 来源缺口只影响来源就绪结论，不冒充项目所有者的视觉批准。

JSON 报告新增 `mounted.battle.sourceReadiness`，直接给出归档模式、提示词数量、来源帧哈希数量、安装／
完整验证文件数、关联 digest 和 `verified|pending|failed` 状态。

## 当前八个正式骑乘战斗候选

| 候选 | 模式 | exact prompt | 来源帧哈希 | 来源结论 |
|---|---:|---:|---:|---|
| 芽耳布伊 | full | 24/24 | 180/180 | verified |
| 普通乌力 | lean | 24/24 | 180/180 | verified |
| 水晶乌力 | full | 24/24 | 180/180 | verified |
| 月风漂狐 | full | 24/24 | 180/180 | verified |
| 赤角兽 | lean | 24/24 | 180/180 | verified |
| 蓝人龙 | lean | 24/24 | 180/180 | verified；另有独立 1px 洋红边待修 |
| 地灵转生兽 | lean | 0/24 | 0/180 | pending |
| 新手老虎 | lean | 0/24 | 0/180 | pending |

新手老虎当前 metadata digest 为 `cf81ed81f5a0…`，QC 与旧 formal-production ledger 为 `4624eee0e618…`；
同时缺正式 source ledger、安装清单、24 份 exact prompt 和 48 份逐动作 pipeline/QC。其 24 张旧生成母板已按
账本 SHA-256 在本机生成缓存中全部找回，但没有找到能够证明为历史原文的 24 份 prompt，因此不能伪造
`prompt-used.txt`，也不能把现有运行帧包装成完整来源闭环。

地灵转生兽存在同类缺口，metadata digest `5422d70ecb2c…` 与 QC `e3ac6171b528…` 不一致。

## 美术总监判断

在当前四组未提交整体骑乘候选中，新手老虎的身份稳定、骑手落座和双视角动作可读性最好，蓝人龙次之；
赤角兽整体偏小且像素化，地灵转生兽体块与材质较浑，不适合作为下一组视觉冻结对象。这个排序只是返工
优先级，不是 owner approval。新手老虎应优先恢复或重建正式来源，再做真实 Main 的完整动作与运动节奏审片；
在来源闭环前，即使静态画面较好也不得提交为发布成品。

## 验证

```text
python3 -m py_compile tools/pet_art_batch_audit.py tools/test/test_pet_art_batch_audit.py
PASS

python3 tools/test/test_pet_art_batch_audit.py
41 tests PASS（87.272s）

python3 tools/pet_art_batch_audit.py --repo-root . \
  --json-out .run/pet-art-batch-source-readiness.json \
  --markdown-out .run/pet-art-batch-source-readiness.md
status=pending forms=36 runtime=3 errors=0 pending=7698 warnings=0
```

回归包含标准 `lean` 包通过、旧式缺源候选保持关闭并给出具体待办，以及相同缺口在运行启用时 fail closed。

## 后续门槛

1. 新手老虎若能找到 exact 历史 prompt，可用已找回母板重建标准 staging；否则必须按同一身份锁重新生成，
   走 `full` source 安装，不能把重写提示词冒充历史来源。
2. 来源闭环后重新检查真八向 4px 安全边、少量洋红边、双方最终朝向、整骑接触、动作节奏与 1280×720
   真实 Main 性能。
3. 项目所有者明确审美批准后，才允许生成 owner decision 或讨论运行时开放；P2.2b 在此之前继续未完成。
