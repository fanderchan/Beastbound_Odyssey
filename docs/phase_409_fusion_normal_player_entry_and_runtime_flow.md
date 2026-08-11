# Phase 409：融合正常玩家入口与失败关闭运行流

## 结果

本阶段把既有融合预览页接入正常宠物管理流程，并补齐报价、两段确认、幂等提交、服务端结果回写
与会话清理。玩家可从宠物页左侧功能列点击“融合”，关闭后返回宠物页；所有主流程继续只要求
左键。

生产目录仍保持 `runtimeEnabled=false`。因此当前正式入口只展示干净的“功能尚未开放”画面，
不会选择材料、请求报价或执行融合；本阶段没有创建发布证明、伪造美术验收或绕过 Phase 408 的
运行时门禁。

## 交互与权威边界

- `PetFusionPanel` 只负责玩家界面、选择状态和 `quote_requested`／`fusion_requested` 信号，
  不依赖 HTTP 或服务端客户端实现。
- `PanelFlowCoordinator` 在目录真正开放且存在服务端角色会话时才接线：三只有效材料选齐后恰好
  请求一次报价；材料、配方、目录和 `profileRevision` 任一变化都会拒绝旧报价。
- 第一次确认只在本地展开不可逆提示；第二次确认才发出一次执行请求，并立即锁定材料、确认和
  关闭操作，直至服务器返回。
- 执行使用稳定幂等操作标识。网络失败、提交超时、存储结果未知等不确定结果保留原标识以便
  安全重试；修订冲突、目录冲突等确定失败释放标识并重新获取报价。
- 成功结果只通过服务端返回的档案和修订回写；同时使旧的重置／进化／融合报价失效。退出会话
  会清空待处理报价、确认和幂等状态。
- 目标正式画像缺失时，真实运行态明确显示“画像加载失败”；仅隔离 QA 预览允许标注预览占位。
  正常玩家画面不显示 raw ID、测试标志、调试字段或 Agent 指令。

## 1280×720 画面审查

真实 `res://scenes/Main.tscn`、Metal、1280×720 检查生成：

```text
.run/evidence/phase409_pet_fusion_player_entry/
  pet_panel_with_fusion_entry_1280x720.png
  main_closed_entry_1280x720.png
```

证据尺寸均为 1280×720，SHA-256：

```text
pet panel   2d6e17a5e940c937c0b51c53a010a8ae92fdd50c0286678ddc77c95628ee64ff
closed page d86a637b9348c9a758851a684866b6a0ade5c488fa694da58aa4bd50974e637f
```

审查结果：第五个“融合”页签没有越界；关闭态使用克制的琥珀色状态徽章，主次层级清楚，未选
材料不再误呈现金色焦点，候选宠以禁用态降权但仍保留内容上下文。画面没有任务框溢出、遮挡、
滚动内容穿透或测试文案。当前画面具备发布级失败关闭质量，但融合专属成品画像和正式开放态
布局仍为项目所有者待验收项，不能以工程截图替代审美批准。

## 验证

- `godot --headless --path client/godot --quit`：解析通过，仅保留既有非等距锚点警告。
- `godot --headless --path client/godot --script res://scripts/progression/pet_fusion_client_domain_check.gd`：
  `PASS`，覆盖不确定结果保留幂等标识。
- `godot --headless --path client/godot --script res://scripts/qa/pet_fusion_panel_check.gd`：`PASS`；
  运行态恰好一次报价、首次确认零提交、第二次恰好一次提交、旧报价拒绝和 1280×720 边界均通过。
- `godot --headless --path client/godot --script res://scripts/progression/pet_fusion_contract_check.gd`：
  `PASS`。
- `/usr/bin/python3 -m unittest tools.test.test_record_pet_fusion_main_owner_review`：`12/12 PASS`；
  录像工具要求正常玩家入口存在且生产失败关闭，同时仍禁止把融合面板直接塞入 `main.gd`。
- `node --test server/node/test/pet-fusion-release-attestation.test.js server/node/test/pet-fusion-recipe-catalog.test.js server/node/test/auth-pet-fusion.test.js`：
  `69/69 PASS`。
- `node tools/run_godot_auto_checks.mjs --only --auto-pet-management-check --fail-fast`：`2/2 PASS`；
  正常玩家入口可见、可返回，生产关闭态请求数为 `0`。日志为
  `.run/godot_auto_checks/2026-08-11T22-26-43-610Z.log`，隔离 QA 通道结束后清理通过。

## 性能对照

在同一机器、同一 QA 用户数据隔离通道上串行比较本阶段基线 `2660a6372` 与当前候选；基线使用
独立 detached worktree，完成 Godot 资产导入后再运行。空闲探针各取 52 组，移动探针使用真实
跨帧鼠标事件、各取 8 组：

| 场景 | 基线 | 当前候选 | 结论 |
| --- | --- | --- | --- |
| 空闲 | 30 FPS，`process_total` mean `0.380ms`，范围 `0.280–0.590ms` | 30 FPS，mean `0.379ms`，范围 `0.190–0.640ms` | 均值无回归；单次尖峰仍远低于帧预算 |
| 移动 | 60 FPS，mean `0.246ms`，范围 `0.200–0.260ms` | 60 FPS，mean `0.295ms`，范围 `0.260–0.330ms` | 增加 `0.049ms`，绝对值低，路径与停稳均通过 |

两组移动结果均为 `status=ok / path_len=11`。日志位于
`.run/evidence/phase409_pet_fusion_player_entry/{baseline,current}_{idle,moving}_perf.log`。这些数据
只证明本阶段正常客户端空闲和移动热路径没有可见帧级回归，不冒充 200 人同图、服务端并发或
融合正式生产执行证明。

## 非目标与验收状态

- 不启用生产融合，不执行真实宠物消耗，不修改配方、概率、成长、绑定或经济规则。
- 不新增协议版本，不把临时位置、请求状态或幂等缓存写入持久化档案。
- 不提交 `.run` 截图、性能日志、QA 账号数据或 Godot 导入缓存。
- 融合专属成品画像与正式开放态整体美术仍为 `ownerReviewStatus=pending`；只有项目所有者明确
  批准并生成可验证发布证明后，后续阶段才可考虑开启生产目录。
