# Phase 331：NPC 补齐实装与地图普通运行发布收口

日期：2026-07-24

## 本阶段边界

本阶段只处理用户在正常 `Main.tscn` 登录路径中实际看到的两个回归：

1. 第二批 NPC 已有形象却仍显示占位人，以及训练场另外两名 NPC 根本没有正式外观；
2. Phase 330 已完成的地图候选在普通启动中仍显示旧程序格子，看起来像“地图没了”。

NPC 部分已经完成普通运行实装与定向回归。地图代码层的生命周期门禁、统一深度层、地图边缘覆盖、真实点击输入、冻结性能证据、Computer Use 操作矩阵与正式 promotion 也已完成。两套地图 bundle 现均为 `released / approved / true / true`，普通玩家路径直接加载正式地表与环境物件，不再回退到旧程序网格。

## 根因

### NPC：不是同一种“占位”

截图中的占位人来自两种不同情况：

- Phase 329 的七类职业 NPC 已经有正式八向世界像和四态人像，但当时仍是 `owner_review_pending`，普通运行目录依法拒绝加载它们；
- `firebud_training_yard` 中的 `overlap_tester` 与 `trainer` 当时没有绑定正式 `appearanceId`，因此即使其他职业外观已发布，它们仍只能走占位绘制。

这不是 Godot 图片导入失败，也不是同一套外观随机失效。前者是发布生命周期未完成，后者是真正缺少外观与地图实例绑定。

### 地图：候选资产存在，但普通运行被生命周期门禁拒绝

Phase 330 的火芽区域与雾帽湿地 bundle、atlas、独立物件和三张 binding 都仍在仓库中。正常运行只允许同时满足以下四项的地图 bundle：

```text
status=released
ownerReviewStatus=approved
releaseApproved=true
runtimeEnabled=true
```

本阶段开始时两套 bundle 都是：

```text
status=owner_review_pending
ownerReviewStatus=pending
releaseApproved=false
runtimeEnabled=false
```

因此用户使用正常登录命令启动时看到旧程序格子，是生命周期失败关闭的预期结果；不是登录参数、服务器 URL 或地图文件丢失。显式 QA preview 能看到候选地图，也不能替代正式普通运行发布。

## NPC 补齐与实装

### 已有七类职业外观发布

完成生命周期批准、release attestation 与普通运行启用的七类 Phase 329 外观为：

- 玩家转生导师；
- 宠物 MM 试炼导师；
- 2 转 MM 保管员；
- 钻石商人；
- 宠物技能训练师；
- 福利管理员；
- 说书人。

### 新增两类外观

为训练场真正缺失的两个实例新增并绑定：

- `npc_village_civilian_f_v1`：普通女村民，绑定 `overlap_tester`；实例名改为“村民阿禾”，继续保持可重叠、不阻挡移动；
- `npc_novice_trainer_m_v1`：男性新手训练师，绑定 `trainer`；保留原训练设施、任务、对话和阻挡规则。

两套新外观均为独立真八向待机源图，不使用运行时或离线镜像；每套另有四态对话人像。新增外观只替换表现与身份文字，没有移动 NPC 格子，也没有改变任务、设施或碰撞语义。

### 当前普通运行目录

最终 NPC 目录为：

```text
17 类已发布并启用的 appearance
136 张世界方向帧（17 × 8）
68 张对话人像（17 × 4）
35 个地图 NPC 实例解析到正式 appearance
0 个运行时镜像
0 个 pending appearance
```

这里的“17 类”是可复用职业／身份外观，不等于 35 个 NPC 都各自建模。不同村庄的同类职业 NPC 仍可复用同一个 `appearanceId`，而 `npcId` 继续拥有名字、地图、对话和服务。

## 地图运行层修复

### 统一世界深度层

新增聚焦的世界深度层与覆盖层，避免继续把高物件、人物和标记混画在一个不可控的 `_draw` 顺序中：

- `WorldDepthLayer` 以 `(depthY, tiePriority, stableId)` 形成稳定顺序；
- 玩家、跟随宠物、NPC、远端玩家、地图高物件、守护物、记录点、招牌和地面宠物掉落进入同一深度序列；
- 玩家与宠物使用脚底接触点参与排序，而不是按纹理中心；
- 任务／设施标记、选择圈和移动目标进入独立覆盖层，既不挡脸，也不参与世界遮挡；
- 远端玩家点选按实际前后顺序解析，不再与画面遮挡顺序相反。

这样人物从高物件前后经过时，遮挡关系由脚底 Y 值稳定切换；同 Y 的对象仍由明确优先级与稳定 ID 保持确定性。

### 地图边缘黑角

两套 binding 增加显式地表边缘 padding，renderer 预构建完整的地表 draw list。相机移动时不再依赖基于初始视口的 CPU 裁剪，也不会在地图 footprint 外露出黑色菱形角。

玩法地图的 grid、spawn、blocker、warp、NPC、interaction 和 encounter 均未因此扩张；padding 只是视觉地表覆盖，不是新增可行走拓扑。

### 点击屏幕坐标与移动探针

玩家和宠物挂入统一深度层后仍使用全局世界坐标，输入继续接收真实 `InputEventMouseButton.position`。本阶段把高频点击探针改为逐次核对输入屏幕坐标 round-trip，并等待 pending 屏幕点、pending 目标和实际自动移动全部收口后，再以玩家最终逻辑格判断成功。

该修复避免了重建深度层后把“仍在移动途中”误判为坐标没有应用，也锁定真实输入事件没有被错误改写。三张地图的功能门禁均记录 `screen_roundtrip=true`、`screen_mismatches=0`、`moved=true`、`settled=true` 与 `final_match=true`。

### 发布前审查补洞

在冻结最终证据前又修复了四个不会被普通 happy-path 捕获的问题：

- release attestation 的 JSON payload 缓存改为绑定 `path + 当前实际 SHA`，验证缓存命中前也会重读并核对当前字节；同一路径热替换为篡改文件不能复用旧的已通过 payload；
- 世界深度比较移除非传递的 `0.01` epsilon 判断，改为严格 `(depthY, tiePriority, stableId)` 全序，并以三节点 epsilon chain 的全部六种输入排列锁定稳定结果；
- 登录、切换账号、服务端整档 pull 和会话失效／登出都会让地面宠物深度缓存失效，并立即清除旧的 `ground_pet_drops` 节点，不等待下一次服务器请求成功；
- 普通 `--auto-camera-check` 不再暗中强制启用 QA preview；pending 地图应验证合法回退，released 地图才验证普通 runtime 美术，避免“正常客户端没地图但测试仍 PASS”。

## 已完成验证

| 验证 | 当前结果 |
| --- | --- |
| `godot --headless --path client/godot --quit` | PASS |
| NPC appearance / hover / interaction / collision / facility dialog / facility marker 定向套件 | PASS `7/7`；见 `.run/godot_auto_checks/2026-07-23T16-41-50-308Z_summary.json` |
| NPC 普通运行目录 | PASS；17 appearance、136 世界帧、68 人像、35 地图实例、0 mirror、0 pending |
| 训练师对话、任务推进与阻挡 | PASS |
| 村民可重叠、训练场阻挡 NPC 不可踩入 | PASS |
| 静态相机边缘覆盖 | PASS；`edge_visual=true`、`full_draw_list=true`、`moved_view_covered=true` |
| 三图真实高频点击功能门禁 | PASS；112／113／117 次真实输入，均 `screen_roundtrip=true` 且最终格匹配 |
| 训练场 ↔ 村口地图传送定向回归 | PASS |
| 地面宠物整档缓存边界 | PASS；同时把旧 QA 夹具从已不再自带宠物的 `default_profile()` 改为显式 `_qa_bui_pet_profile()`，玩法代码未变 |
| Computer Use 三图人工矩阵 | PASS `15/15`；每图均含 pointer / movement_path / warp / collision / occlusion 独立回执 |
| 两套地图 release promotion | PASS；`releaseReady=true`、`missingReleaseGates=[]` |
| 普通登录实机 | PASS；无 QA preview 参数，真实本地后端登录后显示正式火芽村地图、正式 NPC 与普通 HUD |

以上结果证明 NPC 与地图都已进入普通运行，而不是只在候选预览或自动测试中可见。

## 地图正式发布

1. **Computer Use 人工操作矩阵**
   - PASS `15/15`：火芽训练场、火芽村入口与雾帽湿地各自完成 pointer / movement_path / warp / collision / occlusion。
   - 训练场点击“村民阿禾”打开正式对话，陶罐碰撞保持格 `14,7`，人物由陶罐后层 `14,7` 到前层 `16,8` 正确切换，并从 `[30,28]` 进入火芽村；
   - 村口点击“村口守望者”打开正式对话，花台阻挡让人物停在 `[6,17]`，服务亭后层 `[9,3]` 隐藏、前层 `[12,6]` 可见，并从 `[2,15]` 返回训练场；
   - 湿地点地移动、芦苇目标标记、蘑菇簇碰撞与前后遮挡均通过，并从 `[3,22]` 返回火芽村。
   - 每个动作绑定一个唯一的 1280×720 `Main.tscn` 截图／capture pair 和一个独立 `evidence/computer-use-actions/*.jsonl` 原始回执；两份汇总报告分别为两套 bundle 的 `evidence/computer-use.json`。
2. **冻结构建性能证据**
   - PASS；三图均由真实 `Main.tscn`、macOS Metal、`1280×720` 路径取样，moving 使用跨帧 `Input.parse_input_event`。
   - 火芽训练场 baseline/candidate 的 idle mean 为 `0.058/0.072 ms`，moving mean 为 `0.210/0.152 ms`；
   - 火芽村入口 baseline/candidate 的 idle mean 为 `0.220/0.219 ms`，moving mean 为 `0.223/0.198 ms`；
   - 雾帽湿地 baseline/candidate 的 idle mean 为 `0.090/0.069 ms`，moving mean 为 `0.178/0.192 ms`。
   - 三图 candidate 均低于 idle `0.5 ms`、moving `0.6 ms` 门槛，且 idle/moving 回归增量均未超过 `0.1/0.35 ms`。
   - runner 为 `godot 4.7.stable.official.5b4e0cb0f`，build identity 为 `git:7c67c25266024b0a50e1b2b33e5c2a7bc29d5ebb+beastbound-map-runtime-surface-v2:26596d25cf966682ac068d56fbcd262e69886b3cee2f6efbcc2cb6cd5a783a9a`；v2 对 `project.godot` 做设置语义规范化，格式重排不再造成不可复现身份，而真实设置值变化仍会改变摘要。原始 JSONL 回执分别由两套 bundle 的 `evidence/performance-runner-receipt.jsonl` 冻结。
3. **地图 promotion 与普通登录复核**
   - 项目所有者接受时间统一冻结为 `2026-07-23T18:48:28Z`。
   - 火芽区域最终 manifest SHA-256 为 `ad1cfb7a8a27e5b51cc8f883fbae2c137938f7356a96ce16b69e74d1953d7341`，release attestation SHA-256 为 `66c91669f2b88bd2895d69774ee08c1f157202402dee08e39c99db10f4b7782a`。
   - 雾帽湿地最终 manifest SHA-256 为 `689bb5ea76d2f202354c53e2508c7bf546c5b441c41b73e8bfd45dcd5faf1a8b`，release attestation SHA-256 为 `90c53c0585d750216e3d4afba5b0c3a568f0bc696e7b4a9ac3aa0d0b32a8f29c`。
   - pre-export gate 对火芽 `59 files / 24 PNG / 19 JSON`、湿地 `37 / 14 / 13` 均返回 `PASS`、`releaseReady=true`、`missingReleaseGates=[]`。
   - 使用普通 `Main.tscn` + `--server-url http://127.0.0.1:8787` 启动，没有任何 `--map-art-review-preview` 或其他 QA 参数；登录真实本地账号后，火芽村正式地表、花台／围栏／服务亭、全部正式 NPC 与普通 HUD 同时可见，未出现橙色占位人。

两套地图最终生命周期均为：

```text
status=released
ownerReviewStatus=approved
releaseApproved=true
runtimeEnabled=true
```

## 发布后启动登录隔离时序回归

普通 `--login` 启动会先由父进程创建账号专属 `user://` 目录，再拉起真正承载游戏的子进程。发布后手工终端复核发现：父进程成功创建子进程并请求退出后，Godot 仍可能在退出生效前执行一帧 `_process()`；此时 `_ready()` 已从重启分支提前返回，世界覆盖层尚未创建，因而在重绘热路径调用空 `world_overlay_layer`。子进程随后能正常登录并显示地图，所以玩家窗口看似可用，但父进程终端留下真实 `SCRIPT ERROR`。

修复方式是在 `_ready()` 的第一步关闭 `_process()`，只有世界层、玩家、相机、HUD 和在线同步全部初始化完成后，才通过原有 `set_process(true)` 开启帧处理。没有在重绘函数里单独吞掉空值，以免掩盖其他非启动期的非法生命周期。

修复前，现有真实跨进程 `--auto-startup-login-check` 记录子进程 `status=ok`，但仍因父进程 `SCRIPT ERROR` 正确失败；修复后同一门禁为 `2/2 PASS`，父进程隔离标记和子进程登录成功标记均存在，合并输出中无 `SCRIPT ERROR`，见 `.run/godot_auto_checks/2026-07-23T19-33-00-582Z_summary.json`。地图运行、相机、移动与鼠标点击相邻回归另为 `5/5 PASS`，见 `.run/godot_auto_checks/2026-07-23T19-33-39-224Z_summary.json`。

## 未改变与提交边界

- 未修改服务端、协议、数据库、账号、档案、经济、战斗、任务奖励或地图权威拓扑；
- 未把 NPC 名字重新画回头顶；NPC 身份仍由 hover 顶部提示与对话 UI 呈现；
- 未把 `.import`、`.uid`、`__pycache__` 或 `.run/` 当作产品源码；
- 本阶段提交只应包含 NPC 发布／新增外观、地图发布合同与证据工具、地图 runtime 深度／边缘／输入修复及本阶段文档；
- 工作区中同时存在的宠物、坐骑、服务端、`project.godot` 和其他历史生成改动不属于本阶段，必须从窄范围提交中排除。
