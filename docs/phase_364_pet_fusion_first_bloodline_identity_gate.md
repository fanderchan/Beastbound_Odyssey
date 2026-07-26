# Phase 364：融合首批血脉与不可骑身份门

## 结论

P1.4 本阶段选择炽角兽系作为第一批候选核心族，并建立两条待项目所有者审图的精选路线：

- 炽角核心 + 炽角共鸣Ⅰ → 工作名“曜冠角兽”，定位为高速单体破阵；
- 炽角核心 + 苔背共鸣Ⅰ → 工作名“苔垒角兽”，定位为中慢速攻坚耐久；
- 共鸣Ⅱ继续只提供技能候选，不改变目标形态、元素或成长档。

这不是生产开放决定。共享融合目录仍为 `runtimeEnabled=false`，正式配方仍为 `0`，客户端没有玩家入口，任何宠物都不会被消费。当前完成的是五个普通形态的真实血脉基因数据、不可骑宠物的正式设计/美术合同能力、两份完整候选设计合同和两张身份审图板。

## 路线选择

本地 StoneAge 8.0 参考只用于确认“三个固定材料角色、主宠/副宠一决定目标、副宠二补充遗传、专用确认流程和持续融合身份”这些成熟语义，不复制盲配方、材料数值影响、当前技能槽混合、先删除后创建或养蛋惩罚。

选择炽角而不是乌力作为首个核心族的原因：

- 炽角的攻击/敏捷定位和苔背的生命/防御定位能形成一眼可懂的两条路线；
- 两族在裂日荒原已有真实捕捉来源，不依赖 GM 造材料；
- 乌力已有正式晶甲进化路线，同族融合容易被误解为另一只进化乌力；
- 炽角同族可复用既有冲锋动作语法，炽角×苔背又足以验证跨骨架混血的美术边界。

## 五个形态级血脉

血脉由形态目录显式定义，不从材料宠当前技能栏推断。五个首批形态各有一个不可训练的特殊主动和一个被动候选：

| 形态 | 特殊主动 | 战斗事实 | 被动 | 战斗事实 |
| --- | --- | --- | --- | --- |
| 赤角兽 | 赤角重冲 | 单体，伤害加成28，可闪避，不暴击、不反击 | 灼心 | 混乱抗性25% |
| 灰烬角兽 | 灰烬追角 | 单体，伤害加成6，必中，不暴击、不反击 | 烬息 | 中毒抗性25% |
| 岚角兽 | 岚角裂风 | 单体，伤害加成10，可闪避、可暴击、不反击 | 醒风 | 睡眠抗性25% |
| 湿地苔背兽 | 湿甲稳压 | 单体，伤害加成2，必中、可暴击、不反击 | 沼生甲 | 四种状态各12%抗性 |
| 晒甲苔背兽 | 晒甲重压 | 单体，伤害加成20，可闪避，不暴击、不反击 | 地脉甲 | 石化抗性35%，不是免疫 |

五个主动全部复用现有服务端与 Godot 的单体物理伤害、闪避、暴击和反击开关，不增加控制、治疗、群攻、触发链或新效果解释器，也不加入宠技训练师目录。五个被动只复用现有状态抗性解释器。

生产目录可以提前严格校验这五个基因，但没有配方时仍不可报价或执行。两份候选合同把共鸣Ⅱ的首发白名单限定为这五个已审计基因；正式配方落地时也不能用通配符把未来未审计形态带入首发组合。

## 两个候选目标的独立数值

两档完整候选成长数据现收敛在可随 Git 复验的 `docs/data/p1_4b_fusion_candidate_growth_profiles.json`。该文件及档内两档均明确为 `owner_review_pending / runtimeEnabled=false`，没有被生产成长目录、目标模板或正式配方引用；忽略目录中的完整 Pet Design Contract 只作本机补充证据：

| 候选 | 元素 | Lv1基础血/攻/防/敏 | 每级中心血/攻/防/敏 | 角色 |
| --- | --- | --- | --- | --- |
| 曜冠角兽 | 火7风3 | 172 / 31 / 11 / 90 | 8.8 / 3.1 / 1.15 / 2.75 | 高速单体破阵 |
| 苔垒角兽 | 火4地6 | 205 / 27 / 25 / 52 | 12.0 / 2.7 / 2.15 / 1.45 | 攻坚耐久 |

两档都固定为 `weighted_center + 2% extreme`。使用直接复用正式 `pet_growth_authority_v1` 的只读工具，对每档按 `audit:<profileId>:000001..010000` 做 10,000 个确定性种子：

| 候选 | Lv140战力 最低/均值/最高 | 每级生命成长 最低/均值/最高 | 每级攻防敏之和 最低/均值/最高 |
| --- | --- | --- | --- |
| 曜冠角兽 | 1336 / 1453.62 / 1560 | 7.799 / 8.799 / 9.799 | 6.360 / 6.998 / 7.691 |
| 苔垒角兽 | 1311 / 1447.94 / 1575 | 10.698 / 11.997 / 13.302 | 5.612 / 6.300 / 6.935 |

复验命令：

```sh
node tools/pet_fusion_candidate_growth_audit.mjs \
  --samples 10000 \
  --output .run/godot/p1_4b_fusion_candidate_growth_audit.json
```

候选源 SHA-256 为 `3ad4505bc5a9175fef6bfeb23ec9a05e11430ef99b07456139460e46311a11de`，审计工具 SHA-256 为 `1dd9c78df31c3a11b0f30118e1d592e16703ccd33114402b40e4c3e928d19e86`，本次确定性报告 SHA-256 为 `e7d1c5f4ae40424ec104924124d5fa49491ac7f01e46df4440ffe14f61e3960b`。报告同时证明两档候选未进入生产成长/模板目录，生产融合目录仍为关闭且零配方。

两档裸数值中心约为 1450，构筑优势留给概率遗传技能，不用材料数量和获取难度换取无条件数值碾压。成品生成只能读取目标成长档与服务端私密根种子，三只材料的 Lv1 4V、隐藏成长、培养加成、等级和战力仍为零影响。

可交付候选成长源：

- `docs/data/p1_4b_fusion_candidate_growth_profiles.json`

本机补充设计合同：

- `.run/pet-design/p1_4b_emberhorn_solar_crown_fusion_v1.json`
- `.run/pet-design/p1_4b_emberhorn_moss_rampart_fusion_v1.json`

两份合同都通过 Pet Design validator，并精确声明 `paidResetPolicy.allowed=false / terminal_fusion`。

## 不可骑乘不是美术欠债

首版融合宠明确不可骑乘，因此正式 Pet Design Contract 和宠物美术目录现在支持两种严格分支：

- 可骑宠：必须有 `character + pet + mounted_character_pet` 三主体、支持人物和完整 mounted 合同；
- 首版融合宠：必须是 `rideable=false`、世界主体精确为 `["pet"]`，完全禁止 `mounted` 字段和 mounted 目录登记，并且其 `formId` 必须匹配共享 `pet_fusion_recipes.json` 中一条明确正式配方的 `targetFormId`；目录即使保持 `runtimeEnabled=false` 也不会跳过该交叉校验。

两条分支都必须满足独立真八向、双战斗视角、完整 standalone 战斗语义、真实同屏朝向、owner review 和证据门禁。不可骑融合宠不生成空骑乘包、假骑手或未来一定会返工的占位素材。

## 身份审图候选

身份板只停在美术流程的 key-pose gate：

- `.run/evidence/p1_4b_fusion_identity/solar_crown_identity_board_candidate_v1.png`，SHA-256 `74f2408f5f8cacba5ae195cd20a380f4c6cbf6ce513d782880a28d175c4c73f7`
- `.run/evidence/p1_4b_fusion_identity/moss_rampart_identity_board_candidate_v1.png`，SHA-256 `2f8838316ce6cdee7cf8948c106d60658e16a7d73a3772a59dd53b8c480ac698`

曜冠角兽锁定单根盾基前向角、强肩窄腰、连续双层冠鬃和宽菱形尾簇；苔垒角兽锁定炽角楔头/单角/冲锋轴，并只从苔背继承低矮分段有机甲片、克制苔藓和守势重量。两者都用背部结构主动覆盖鞍位，不制作骑乘版本。

自审确认两张图的核心族、单角、四足比例和两条路线差异可读，但当前图像生成器把棋盘格烘进了 RGB 图片，即使再次要求透明 Alpha 仍然如此。因此这两张图严格保留在 `.run` 作为审图候选，不登记 `pet_art_catalog.json`，不能作为世界帧、战斗帧或 512px 正式源文件。项目所有者确认身份后，正式生产仍须从批准身份重新生成真实透明源与完整证据链；当前没有把失败格式伪装成素材债。

## 验证

- 两份 Pet Design Contract：`2/2` 通过；
- Pet Design 终局/不可骑合同：`14/14` 通过；
- Python 宠物美术目录正负测试：`21/21` 通过（`python3 -m unittest tools.test.test_pet_art_batch_audit`）；
- Node 融合随机权威、目录、生成/工厂、分布、事务、HTTP、持久化、战斗被动与反应规则定向测试：`92/92` 通过；
- Godot `pet_fusion_contract_check.gd`：PASS，生产关闭、5 个基因、0 配方；
- Godot parse + battle action catalog + battle reaction + pet template catalog + fusion instance passive：`5/5`；
- Pet Inspector：`petActiveSkills=12`、`passiveSkills=10`、`errors=0 warnings=0`；
- 两个候选成长档各 10,000 样本，确定性报告 `errors=[]`，均落在合同审计带内；
- 未连接共享 MySQL、未修改真实玩家数据、未启动或重启玩家后端、未运行完整本地 CI。

Node `92/92` 的精确命令为：

```sh
node --test \
  server/node/test/pet-fusion-random-authority.test.js \
  server/node/test/pet-fusion-recipe-catalog.test.js \
  server/node/test/pet-fusion.test.js \
  server/node/test/pet-fusion-distribution.test.js \
  server/node/test/auth-pet-fusion.test.js \
  server/node/test/auth-pet-fusion-http.test.js \
  server/node/test/auth-pet-fusion-durable.test.js \
  server/node/test/auth-pet-fusion-battle.test.js \
  server/node/test/battle-passive-catalog.test.js \
  server/node/test/battle-reaction-resolver.test.js \
  server/node/test/battle-reaction-rules.test.js \
  server/node/test/new-pet-factory.test.js
```

## 下一步门禁

正式目标模板、成长档、配方、UI 和三宠消费入口继续等待：

1. 项目所有者确认或修改“曜冠角兽 / 苔垒角兽”身份方向；
2. 项目所有者决定额外成本是仅三只材料、石币、道具或组合；
3. 项目所有者决定绑定材料能否参与、成品绑定和独立交易规则；
4. 正式透明身份锁、独立真八向与双视角战斗素材获得 owner approval；
5. 发布证明按路径与 SHA 锁定后，才允许生产目录出现正式配方并考虑 `runtimeEnabled=true`。

基础攻击、防御和遗传技能以后能否主动遗忘仍未决定，本阶段没有偷加永久锁定规则。
