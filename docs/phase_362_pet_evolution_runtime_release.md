# Phase 362：两条正式宠物进化路线开放与 P1.3 验收

日期：2026-07-26

## 结论

P1.3e 已完成，P1.3「一转前置的宠物进化」至此整体完成。

本阶段正式开放两条生产路线：

| 路线 | 源形态 | 目标形态 |
| --- | --- | --- |
| `wuli_crystal_evolution_v1` | 高防乌力 | 晶甲乌力 |
| `driftfox_moon_gale_evolution_v1` | 高地风狐 | 月岚风狐 |

两条路线的资格任务、材料遭遇、服务端权威事务、独立宠物世界/战斗、完整人骑宠世界/战斗和进化成功演出均已从历史待审状态切换为正式运行状态。

这次开放不包含融合。P1.4 三宠融合与技能遗传仍是下一个独立大系统，本阶段没有提前实现、开放或替它决定遗传规则。

## 现行进化规则

本阶段只正式开放此前已经确定并实现的规则，没有改变数值合同：

- 源宠必须是指定普通形态、资料完整的 `authority-v1` 实例；
- 必须恰好一转、Lv140，并达到同形态一转成长战力 P90；
- 必须完成对应一次性资格任务，并持有共用刷楼核心、族系材料和足额石币；
- 成功后保留同一个宠物实例 ID，保留源宠 0转/1转公开履历和一转培养加成；
- 目标形态回到 Lv1，目标二代 Lv1 4V 与隐藏成长独立重抽；
- 目标实例保持一转次数语义，并进入不可逆终局；
- 进化宠不能再普通二转、不能作为融合材料，也不能付费重置到 0转；
- 失败、资格不足、材料不足、陈旧 revision、重复 operation ID 或持久化失败均不得吞宠、吞材料或重复扣款。

普通二转和进化继续保留一转胚子的价值；未来融合成品数值不继承三只材料宠的数值强弱，只在后续 P1.4 白名单规则内处理技能遗传。

## 正式开放证明

历史 visual-only 批准不能单独打开生产路线。本阶段新增两层独立证明：

1. `pet_evolution_runtime_release_owner_decision_v1.json`
   - 精确批准 P1.3e 的两条路线、两个目标形态和八类运行范围；
   - 明确排除融合、普通二转规则、付费重置规则、协议与数据库迁移；
   - SHA-256：`725d166395e0b5342c0807dad0263d48fad45b0ccf3bd1b84b46c97c4c3daeaf`。
2. `pet_evolution_release_attestation_v1.json`
   - 绑定上述 owner decision；
   - 绑定两只进化宠共十项 visual-only owner decision；
   - 绑定 Phase355 两拒两放、Phase358 高清源档封口和 Phase361 最终视觉批准；
   - SHA-256：`b8ad6bce3e27910fe2ec39dd348a60c8582dfceb36a197f879dbb53afd887c9d`。

客户端与服务端各自验证同一份 release attestation。任意路径、SHA、route ID、form ID、批准状态、预期 bundle 生命周期或证据文件不匹配，正式路线都会失败关闭。仅修改路线 JSON 的布尔开关不能绕过该门禁。

## 运行时接线

本阶段完成以下生产接线：

- `pet_evolution_routes.json` 全局运行开关开启，两条 `assetGate.status` 均为 `formal`；
- 两条一次性资格任务开放；
- 两种族系材料的正式遭遇入口开放；
- 晶甲乌力、月岚风狐的 pet art catalog、template 和动作包进入正式运行；
- 两套完整人骑宠世界/战斗动作包进入正式运行；
- 两只坐骑新增生产比例档，世界 `0.36`、战斗 `0.88`，继续只绘制一张人物与宠物一体生成的 body texture；
- 两条进化成功演出继续只在权威成功结果已应用、route/form/instance/等级转换全部一致时播放；
- GM 进化验收客户端从历史关闭提示切换为服务端权威正式门禁提示。

没有修改公共协议版本，没有数据库迁移，也没有连接共享 MySQL 或修改真实玩家档案。

## 两拒两放端到端验收

新增的本地 HTTP QA 使用临时内存档案和真实 HTTP 路由，完整经过正式服务端 mutation，不直接调用内部成功函数：

1. 高防乌力一转 Lv140、未达 P90：拒绝，宠物、材料、钱包和 revision 全部不变；
2. 高地风狐一转 Lv140、未达 P90：拒绝，宠物、材料、钱包和 revision 全部不变；
3. 合格高防乌力：同实例成功进化为晶甲乌力 Lv1；
4. 合格高地风狐：同实例成功进化为月岚风狐 Lv1。

结果为：

```text
rejected = 2/2
completed = 2/2
qaPreview = false
```

两次成功均验证材料与石币只扣一次、源实例 ID 保留、目标形态/等级/履历/终局状态正确；两次拒绝均验证零状态变更。

## 正式美术与资源门禁

两只进化宠各自通过：

- 独立宠物世界真八向：`8` 个独立方向、`40` 帧、禁止镜像；
- 独立宠物战斗：正背双斜向、`12` 动作、`180` 帧；
- 人骑宠世界真八向：`8` 个独立方向、`40` 帧；
- 人骑宠战斗：正背双斜向、`12` 动作、`180` 帧；
- 进化演出：`12` 帧、12 FPS、1.000 秒；
- 人骑宠运行时单一整图主体，无人物/鞍垫/宠物运行时分层拼装；
- 战斗动作 512px 正式源帧、256px 运行帧与规范派生逐帧一致。

Pet Design Inspector 为 `errors=0 warnings=0`，Battle Action Catalog 为 `status=ok`；两条路线各 10,000 次平衡审计 `errors=0`，P90 资格模拟各 20,000 样本，放行率分别为 `10.43%` 和 `10.32%`。

通用宠物美术批量审计同时修复了一个门禁误报：正式登记在 `evolutionVisual` 的运行帧不应在目标形态开放后被当作孤儿 PNG。新增回归测试锁定安全根目录、视角、帧数及逐帧存在性。最终全目录结果为 `forms=34 errors=0 warnings=0`；`pending=7527` 只属于其他尚未生产或保持关闭的资源，不阻断这两条正式路线。

## 1× 正式验收视频

最终成片：

```text
.run/evidence/phase362_pet_evolution_runtime_release/
  Beastbound_Phase362_Pet_Evolution_Runtime_Release_1x.mp4
```

- H.264、1280×720、60 FPS、7683 帧；
- AAC 48 kHz 双声道；
- 128.078 秒，35,665,001 字节；
- SHA-256：`2e333764ee993147c08f66ff8cb23c3cffcd0032b7c3266cf6792a834b3d6d78`；
- 完整音视频解码通过；
- 没有时间倍率缩放、`atempo` 或抽帧；拼接只把各章时间戳归零。

成片依次包含：

1. 新录制的 P1.3e 正式路线门禁与两拒两放；
2. 月岚风狐独立/骑乘世界真八向；
3. 晶甲乌力独立/骑乘世界真八向与月岚风狐独立战斗；
4. 晶甲乌力独立战斗和两只宠物的人骑宠战斗。

联系表 `release-contact-sheet.png` 的 SHA-256 为 `371b85de157d6f458dd6ec85d846e58bd6bf52c87fb289963bc046cdcf4f288a`，人工复核未见异常小人、错误骑乘比例、动作串包、镜像方向或加速播放。

## 性能

真实 `Main.tscn` 目标路径定向性能结果：

- idle：60 FPS，`process_total=0.05..0.07ms`，`draw_world≈0.07ms`；
- 跨帧真实移动输入：60 FPS，`process_total=0.06..0.07ms`，`status=ok`、`path_len=11`。

本阶段没有把完整 profile 归一化、目录扫描、网络请求或文件哈希加入每帧热路径；release attestation 在目录加载时验证。

## 定向验证

执行并通过：

- Node 进化 release attestation、路线目录、平衡、原子事务、durable、HTTP、GM QA、遭遇和任务组合：`59/59`；
- Godot balance catalog、进化 UI、pet template catalog、QA panel 四项自动检查；
- Godot parse；
- Pet Design Inspector：`errors=0 warnings=0`；
- Battle Action Catalog：`status=ok`；
- 两条进化路线各 10,000 次审计：`errors=0`；
- 两条 P90 资格各 20,000 样本；
- 两只独立宠物与两套人骑宠显式资产加载；
- 两只独立宠物的完整战斗源档审计；
- `tools.test.test_pet_art_batch_audit`：`12/12`；
- 最终 MP4 媒体探测、帧数复核、SHA-256 与完整解码；
- idle 与真实移动性能探针；
- JSON parse、Node syntax、Godot parse 和 `git diff --check`。

未运行全量本地 CI：本阶段使用覆盖 release attestation、正式路线、真实 HTTP mutation、任务/遭遇、美术目录、Godot UI 与性能热路径的定向组合验证。没有连接共享 MySQL、启动正式后端或操作真实玩家数据。

## 下一步

下一次项目对话从 P1.4「三只一转材料宠融合与技能遗传」开始。它作为独立大系统先锁定融合配方、底板/材料角色、主动与被动遗传槽、冲突与概率、预览边界、事务幂等及三宠原子消耗，再进入实现；本阶段没有抢先替用户作这些产品决定。
