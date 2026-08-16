# Phase 453：战斗人物敌方朝向回归修正

## 结论

项目所有者连续指出战斗双方人物面向不对后，本阶段用当前四套正式人物源帧、同侧正式宠物和同一
1280×720 十对十 Main 实机做了重新核对。结果确认 Phase 412 的敌方人物判断错误：敌方人物沿用
`front_3quarter_sw` 源图却没有展示翻转，实际朝向左下战场外侧；同一侧宠物已经翻转并朝右下场心，
因此人物与宠物互相背离。

修正后唯一权威规则为：

- 敌方人物：独立制作的 `front_3quarter_sw` 源图，`flipH=true`，最终朝右下场心；
- 我方人物：独立制作的 `back_3quarter_ne` 源图，`flipH=true`，最终朝左上场心；
- 未知阵营：`flipH=false`，失败关闭；
- 正式宠物与整体骑乘：原有双方翻转合同不变；
- 世界真八方向：仍全部使用独立源图，禁止运行时镜像。

这里的 `flipH` 只属于战斗棋盘展示层，不生成另一张源图，也不改变动作、锚点、阵位、碰撞或世界
朝向。四套正式人物的当前正／背 idle 源帧均逐张查看；敌方正视角的脸部、肩线和武器轮廓与同侧宠物
最终几何共同证明需要翻转，不能继续只凭先前文字结论判断。

## 根因与防回归

Phase 412 曾把“正、背视角独立制作”误推导成“两套源图水平语义不对称”，并把该误判同时写入：

- `CharacterActionAssetCatalog.battle_flip_h_for_side()`；
- 人物运行时外观自动检查；
- 十对十审片入口的正式素材断言。

因此旧自动检查只能证明代码和错误断言一致，不能证明最终画面正确。本阶段没有在 Main 再加特殊分支，
而是把人物目录恢复为与宠物目录一致的场心合同，并同时反转两处 QA 断言：任一正式人物敌方未翻转、
我方未翻转或未知阵营被翻转都会失败。Phase 412 文档顶部增加后续纠正说明，避免历史证据继续被当作
当前规范。

## 同状态前后实机证据

两次录像使用同一 Main 入口、同一苔光草甸候选、同一 20 actor 阵型和同一 1280×720 状态；每份均为
30 FPS、406 帧、13.533333 秒、1× H.264/AAC，完整音视频解码通过。两边均完成 5 次真实跨帧左键、
2 个精确目标，HUD collision／passthrough 均为 0。

| 证据 | 结果 | SHA-256 |
| --- | --- | --- |
| 修正前录像 `phase453-before-enemy-facing-v1` | 敌方人物朝左下，与同侧宠物相反 | `d7f1b793ae62bcf4bd7019450969bc50afacadb45d26d800317d1436f9cba2d0` |
| 修正前首帧 | 同状态静态基线 | `e273ae7bb4ce0ab96e9a9ca47593112a537d9c8de83ca041187aea5af0e7fcbd` |
| 修正后录像 `phase453-after-enemy-facing-v1` | 敌方人物与宠物共同朝右下场心；我方保持朝左上 | `b63de2b7c71b9fb37e0d17acee6747db80712e15b8e759c57ef90f7d8b3ac783` |
| 修正后首帧 | 同状态最终静态证据 | `7a97398efc5ad705792987c0ca2691c91587bc13e356ddcd052801157ac6facb` |

证据目录：

```text
.run/evidence/phase453_battle_character_facing/
  phase453-before-enemy-facing-v1/
  phase453-after-enemy-facing-v1/
```

两次录像都在隔离 `automation` QA lane 完成，不启动后端、不访问 MySQL、不允许玩家档案保存；每次结束
后 lane 均不存在，真实玩家目录 inventory SHA-256 前后一致。苔光草甸仍保持
`ownerReviewStatus=pending / runtimeEnabled=false / releaseApproved=false`；本修正不构成美术批准。

## 性能证据

修正只改变已有绘制的水平比例符号，没有新增 draw call、纹理加载或逐帧扫描。仍按真实 Main、Metal
Mobile、VSync、60 FPS、前台 1280×720 跑完整 idle、指令选择和真实相邻目标切换门槛：

| 状态 | 最低／raw FPS | 帧间隔 P95 | `process_total` P95 | `draw_battle` P95 |
| --- | ---: | ---: | ---: | ---: |
| idle | 60.0／60.002 | 17.119 ms | 0.06 ms | 4.00 ms |
| command selection | 60.0／60.004 | 16.762 ms | 0.06 ms | 3.93 ms |
| target switch | 60.0／60.006 | 17.795 ms | 0.05 ms | 4.07 ms |

最终报告：

```text
.run/evidence/phase453_battle_character_facing_performance/
  phase453-enemy-facing-perf-v6/summary.json
```

报告 `status=passed / finalStatusAuthority=true`，三段各 217 个帧间隔样本、丢帧样本 0，25 次真实跨帧
左键、8/8 相邻目标精确命中、HUD passthrough 0；真实玩家目录未变且 QA lane 已清理。报告 SHA-256
为 `b1f85a799a495685706e9226f19ca09021c31b03fb45b3539e73e1e0181bdc9a`。

性能 v1～v5 因测试窗口未取得 macOS 前台焦点被原门槛正确拒绝，不作为通过证据；v6 起止快照均为
`windowFocused=true`。没有修改时长、阈值、解析器或失败规则来换取通过。

## 验证

- `git diff --check`：通过；
- `node tools/run_godot_auto_checks.mjs --only --auto-character-runtime-appearance-check --fail-fast`：
  Godot 4.7 parse 与人物运行时检查 `2/2` 通过；
- `/usr/bin/python3 -m unittest tools.test.test_record_battle_layout_owner_review tools.test.test_capture_battle_layout_perf`：
  `25/25` 通过；
- 修正前／后真实 Main 录像：均 `status=passed`，最终几何已同状态对照；
- 修正后真实 Main 性能：全部 21 项 FPS、帧间隔、process 和 draw 门槛通过。

## 未越界事项

本阶段没有修改人物或宠物像素，没有改 Boss、技能、数值、协议、服务器或数据库，没有启用待审战场，
也没有更改任何宠物／骑宠 `ownerReviewStatus`。工作区中其他待审美术和 P1.5c 候选继续保持原状态，
不随本修正暂存或发布。
