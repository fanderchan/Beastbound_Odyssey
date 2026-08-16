# Phase 464：当前实机美术总监复核与世界 HUD 正式录制恢复

## 结论

本阶段重新以当前 `main`、真实 `res://scenes/Main.tscn`、1280×720 和 `1.00×` 录制世界与普通
10v10，而不是继续沿用旧截图判断。当前双方朝向回归已关闭：左上敌方人物／宠物朝右下场心，右下我方
人物／宠物朝左上场心；没有再次出现同边朝外或双方同向。

焰芽斗士世界 v3 的六阶段、9 FPS 真八向步态在本轮真实世界移动中继续生效。逐帧可见相反支撑腿和
passing／recovery，不再是旧版单腿拖行。新手老虎与地灵转生兽的整体骑乘八帧候选也保持前后肢交替；
这些结论仍只是工程与美术自审，不能替代项目所有者观看动态证据。

整体审美尚未达到商业发布级：地图地表、职业 NPC 与战斗草地已经形成统一暖色 2.5D 基础，但世界 HUD
同时展示过多重复入口，普通 10v10 又用同一人物和同一宠物大量复制，导致“功能齐全”压过“世界可信”。
当前质量顺序是地图／NPC > 人物动作 > 普通战斗编排 > HUD 信息层级。P2.2 与 P2.3 均保持未完成。

## 世界 HUD 录制回归与修复

`record_world_hud_owner_review.py` 仍通过已经失效的 `--user-data-dir` 启动 Godot 4.7；修正为项目现行的
官方 `automation` QA lane 后，真实 Main 又严格报告：

```text
完整世界 HUD 缺少真实入口：quest
```

根因不是产品 HUD 缺任务，而是 Phase 395 已把旧 `WorldHudTaskTab / WorldHudPartyTab` 退休到隐藏容器，
当前正式入口是嵌入右栏的 `WorldHudPartyTaskTab / WorldHudPartyTeamTab`。旧验收控制器仍要求退休按钮可见，
并读取旧 `WorldHudAwakenedView.activeSideTab` 判断内容状态。

本阶段完成：

- 录像器统一走官方 QA lane 的原生实机 + MovieWriter 双通道，录前、两进程之间和录后均复核用户数据；
- 控制器要求正式任务／五席组队组件可见、稳定 API 存在且确实嵌入 WorldHud；
- 真实跨帧左键改点正式任务／组队页签，并核对 `active_tab`、task/party body 与五席数量；
- 展开态要求正式页签可见，收起态要求它们随 HUD 一起隐藏，旧 quest/party 按钮则必须持续隐藏；
- 保留真实人物、背包、宠物、地图、聊天、更多、收起／恢复和世界移动的原门槛，没有删断言换取通过。

第一次失败后的官方 lane 已安全清理，正常玩家目录未改变；最终世界与战斗录制也都完成 lane 清理。

相邻的 `record_hang_matchmaking_world_hud_owner_review.py` 仍沿用同一个已经失效的
`--user-data-dir` 参数。为避免普通世界录像已恢复、正式组队流程却继续断线，本阶段将它一并迁到同一条
官方 QA lane；它仍保留挂机路线、五席权威投影、正式任务／组队页签、取消匹配继续挂机及停止挂机的原有
硬门槛，没有放宽产品真值。

联合复测还暴露了既有 Phase 403 战斗录像防篡改测试的一行基线漂移：生产哈希表和运行时精确键集均已
要求 `_validate_arena_visual_marker`，但测试的 `expected_battle` 漏列该函数。本阶段只补回相同函数名，未改
哈希、录像器实现或视觉门槛；该项从单独复现失败恢复为通过。

## 当前真实 Main 证据

### 世界 HUD、地图、NPC 与移动

```text
.run/evidence/phase464_current_art_director_audit/world/
  phase464-current-world-20260817-c/
```

- 视频：44.300 秒、1329 帧、1280×720、30 FPS、H.264/AAC、`1.00×`；
- MP4 SHA-256：`2c3b4dc5fd9aa3eaec2965bdd7dde036684c80515aad46943f4ed36b0d60ba74`；
- 联系表 SHA-256：`e34c0175e1dfcb283a960ad600a686105b3a59924f0bbc3af80ade6721216af0`；
- 14 章覆盖完整 HUD、地图、人物、背包、宠物、任务／组队、聊天、更多、仅恢复按钮收起态和真实移动；
- 原生与 MovieWriter 均通过，完整音视频解码通过。

### 挂机匹配与正式五席组队栏

```text
.run/evidence/phase464_current_art_director_audit/world-party/
  phase464-current-world-party-20260817-a/
```

- 视频：20.933333 秒、628 帧、1280×720、30 FPS、H.264/AAC、`1.00×`；
- MP4 SHA-256：`a44fdc5b48c2978a9295354190c553903268b6bd30fe4e0db4bf6468db7087e0`；
- 联系表 SHA-256：`53fb04c8506773ff336b35e8201ecfa3ad6d7bca43c3793ad6df04a2bf407175`；
- 10 章覆盖路线选择、开始匹配、一人四空、一人四 NPC、二人三 NPC 下一场替换、正式任务／组队页签、
  取消匹配继续挂机、停止挂机和完整世界返回；
- 原生与 MovieWriter 各完成 9 次真实跨帧左键，五席、旧 UI 隐藏、无服务端写入等门槛全部通过；
- 官方 lane 录后不存在，正常玩家目录清单 SHA-256 前后均为
  `2065a5c491972208147ec063c06b4ad9b2dbdcf5632e4c92575a78f5f2f43a4d`。

### 普通 10v10 阵型与最终朝向

```text
.run/evidence/phase464_current_art_director_audit/battle/
  phase464-current-battle-20260817-a/
```

- 视频：13.533333 秒、406 帧、1280×720、30 FPS、H.264/AAC、`1.00×`；
- MP4 SHA-256：`d9821df3d8bc645914c6ecbfcca503900542e44a61a7d7755890fa444f2509c1`；
- 联系表 SHA-256：`480f8b1ec7f677776481735e3bbaf3b4133309a1ff4cecd27365c2379677957d`；
- 20 个 actor、5 次真实跨帧左键、相邻两个精确目标、HUD 穿透与碰撞均为 0；
- 当前草地不再是历史灰场，人物与晶甲乌力两侧最终几何均朝场心。

## 美术总监判断与下一项返工

### 可保留

- 火芽系地图色温、草地纹理、石路、职业 NPC 与暖棕 UI 材质已经有统一世界观；
- 战场留白和两侧楔形阵列可读，场心足够容纳动作，不需要再次推翻布局；
- 世界焰芽斗士 v3 步态、当前人物／宠物最终朝向不再列为技术阻断；
- 新手老虎和地灵转生兽整体骑乘候选可以交给项目所有者按 1× 视频审片。

### 仍阻断商业发布

- 世界 HUD 同屏存在顶栏、左栏、底栏、右栏和抽屉重复入口，图标密度过高，世界内容失去主角位置；
- 普通 10v10 两边大量复制同一人物和同一宠物，战术角色、队伍身份和攻击目标主要靠位置与血条，而不是轮廓；
- 角色名、被动说明和亮绿血条在密集阵型中仍会与主体争夺注意力；
- 蓝人龙整体骑乘 `walk` 的远侧肢体和骑手重心变化偏弱，视觉上仍比老虎、地灵更接近两拍抬腿，不建议先于后二者开放。

下一项美术返工固定为“普通 10v10 角色差异化与层级”：优先消费现有四人物、已批准或严格候选宠物和
角色职责配色，减少同模复制感，并建立一条真实 1× 动作片验证目标识别、双方阵营与技能焦点。HUD 去重归入
P2.5 的底栏重组，不在本阶段混做。这个选择保留成熟的阵型几何，只解决玩家第一眼最明显的测试场观感。

## 验证与发布边界

- `python3 -m unittest tools.test.test_record_world_hud_owner_review`：4/4 通过；
- `python3 -m unittest tools.test.test_record_hang_matchmaking_world_hud_owner_review`：6/6 通过；
- 三个相关录像器联合测试：31/31 通过（包含正式 lane 与 Phase 403 防篡改合同）；
- `python3 -m py_compile tools/record_world_hud_owner_review.py tools/test/test_record_world_hud_owner_review.py`：通过；
- `godot --headless --path client/godot --quit`：通过；
- 世界 HUD 官方 lane 原生 + MovieWriter：PASS；
- 挂机匹配／正式五席组队栏官方 lane 原生 + MovieWriter：PASS；
- 普通 10v10 官方 lane 原生 + MovieWriter：PASS；
- 三条 MP4 完整音视频解码：PASS。

本阶段不改产品 UI、战斗规则、人物／宠物像素、运行开关、服务端、数据库或玩家档案，不创建任何 owner
decision。V4E 苔垒角兽头像、Firebud v3 精确动态及所有仍为 pending 的人物／宠物／骑乘资产继续等待项目
所有者明确观看与批准。
