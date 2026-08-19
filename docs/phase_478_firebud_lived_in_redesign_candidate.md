# Phase 478：火芽村生活化布局返工候选

日期：2026-08-18

## 结论

Phase 470 的服务 NPC 排队、重复花毯与训练场大块空草地没有达到正式美术标准，本阶段不沿用旧 owner acceptance，也不把旧截图、Computer Use 或性能报告继续挂到新画面上。Firebud v2 当前是结构审计通过、仍待真实 `Main.tscn` 复核的 `owner_review_pending` 候选；没有启用普通玩家入口，没有生成 release attestation，也没有提交或推送。

最新裸图设计预览显示方向已经成立：村口由排队改成围绕摊位、图腾、亭子和树木的三个服务簇，训练场形成目标架、木桩、补给和侧练习区的训练主题。但裸图仍可见土路折线感、村口左侧偏密和外围偏空；必须在正常 HUD、玩家、任务标记和景深共同出现的真实 Main 画面中复核后，才判断是否还要微调。

## 原创资产与隐私边界

新增四个项目自有候选物件：

- `firebud_training_rack.png`：`282b3fec…`；
- `firebud_practice_cluster.png`：`48a301e2…`；
- `firebud_trade_counter.png`：`8ddc94a0…`；
- `firebud_grass_scatter_decal.png`：`0f2914b9…`。

可重复来源链为 prompt、原始母图、色键母图、透明处理图、切图 manifest 和运行 PNG。第一次透明母图把棋盘格烘进 RGB，已明确标记为 rejected lineage，未冒充可用透明源；接受的是独立色键母图及其确定性透明处理结果。

本轮外部图像生成只使用三个仓库内项目美术参考 PNG 与美术提示词，没有发送源码、配置、凭据、用户截图或个人目录内容。项目所有者提出隐私疑问后，没有再向外部服务上传任何本地参考图；之后的透明处理、切图、布局、碰撞和审计全部在本地完成。

## 地图改动

### 火芽村口

- 14 名既有服务 NPC 的 ID、服务、交互和任务语义不变；
- 由规则行列改为三个功能簇，保留贯穿村口、图腾、洞窟与南侧出口的宽通路；
- 重复装饰从花毯式堆叠缩减为少量草丛、花、围栏、石堆和生活道具；
- 新贸易台绑定权威 blocked cells，亭子、古树和路口石图腾形成主次地标；
- 当前 binding 为 `18` 个对象，候选保护格 `227`。

### 火芽训练场

- 训练架、练习组合、木桩、靶子、补给和侧目标形成明确训练区，而不是把装饰平均撒在空草地；
- 主路串联入口、上层训练区、中段平台和下方出口，侧支路通向第二目标；
- 新训练物件、树、花箱与围栏全部绑定权威 footprint／blocked cells；
- 当前 binding 为 `22` 个对象，候选保护格 `148`。

## 权威合同与失败关闭

待审 catalog contract 只为 `firebud_region_visual_v2` 生成：

- `catalog-contract-check.json`：`d28427ee…`；
- 训练场 binding：`b8bf8341…`；
- 村口 binding：`4c67bcc1…`；
- 训练场 map data：`1d4b008a…`；
- 村口 map data：`19bbdcbb…`。

只读 preview 顶层结果为 `PASS`，v2 两图均 `PASS`。已发布 v1 因当前权威地图数据已被 staged v2 改动而单独 `FAIL`，错误没有被隐藏；普通运行仍不能偷偷启用 v2。新生成参数与只读 preview 参数同时出现时会以退出码 `2` 拒绝，避免误写和含混证据。

碰撞 runner 把 Godot 引擎日志重定向到仓库忽略的 `.run/map-visual-runtime-check.log`，避免默认 `user://logs` 权限污染；回执摘要为 `97b457c5…`，碰撞报告为 `ee1688e5…`。证据命令字符串仍记录语义命令本身，不把本机日志路径混入正式合同。

## 验证

- 七份变更 JSON：解析通过；
- v2 真实 renderer prepare：训练场 `22 / 148 / errors=[]`，村口 `18 / 227 / errors=[]`；
- `--preview-map-visual-catalog-contract`：顶层 `PASS`，v2 两图 `PASS`，v1 明确 fail closed；
- preview 与 generate 混用负例：退出码 `2`，返回明确中文错误；
- `python3 -m unittest tools.test.test_map_visual_evidence_builder`：`15/15`；
- 地图 Skill auditor 回归：`17/17`；
- Godot parse 与 `--auto-firebud-village-service-layout-check`：`2/2`；
- 地图 bundle auditor：`PASS / filesChecked=57 / jsonsChecked=5 / pngsChecked=36 / errors=[]`；
- 当前 `releaseReady=false`，缺少正式 Main 截图、Computer Use、性能、owner acceptance、release attestation 与 released/enabled 生命周期。

设计预览保存在忽略目录：

- `.run/evidence/phase478_firebud_redesign/phase478-firebud-redesign-20260818-a/design-preview/firebud_village_gate.png`；
- `.run/evidence/phase478_firebud_redesign/phase478-firebud-redesign-20260818-a/design-preview/firebud_training_yard.png`。

它们由真实地图 renderer、NPC 美术和景深层生成，但不含正常 Main/HUD，只能用于构图判断，不能进入正式 runtime screenshot coverage。

## 当前阻断与下一步

正式 owner-review recorder 和性能 runner 在创建 macOS QA lane 锁文件时均被当前沙箱拒绝：`Operation not permitted: .beastbound_qa_lane_lock_automation.json.pending`。自动检查 runner 能在自身完整生命周期内安全取得、验证并清理 lane，但独立正式录片工具仍不能取得写权限。本阶段没有绕过 lane、没有改写真实玩家档案，也没有把设计预览伪装为正式证据。

恢复正式录片能力后按以下顺序继续：

1. 录制两图正常 `Main.tscn` 的 idle、移动和 HUD 叠加画面；
2. 运行 v1/v2 两图 idle/moving 性能矩阵；
3. 以真实 Main 画面复核路径折线、村口密度、外围留白和任务标记层级；
4. 若画面仍不够成熟，继续局部返工并再次作废证据；
5. 只有 owner approval、严格碰撞、性能和整包审计全部通过后，才签 release attestation、启用、精确提交并推送。
