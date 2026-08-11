# Phase 407：融合宠真实 Main 验收门禁

## 结论

首批两条融合路线现已拥有真实 `Main.tscn`、1280×720、30 FPS、`1.00x` 的有声连续验收片。录像由正式 Main 启动参数触发，只在 automation QA 用户数据通道挂载关闭态展示层；它不接入正常玩家菜单，不登录账号，不连接后端，不保存档案，也不执行第二次不可逆确认。

本阶段只把 Phase 376 的独立 QA 展示提升为可重复、失败关闭的 Main-hosted 项目所有者审查门禁。生产目录继续保持：

```text
releaseApproved=false
runtimeEnabled=false
playerEntryOpened=false
portraitOwnerReviewStatus=owner_review_pending
ownerReviewStatus=pending
```

因此，本阶段不代表融合正式开放，不消耗任何玩家宠物，不创建 runtime decision 或 release attestation，也不勾选 P1.4 父项。

## Main-hosted 关闭边界

`Main.tscn` 只新增一个显式 QA flag 分派器。捕获 helper 必须满足以下边界：

- 当前场景必须是实际 `res://scenes/Main.tscn`；
- 必须由 owner-attested `automation` QA lane 启动；
- 使用空账号会话，关闭 profile save，并取消现有 HTTP 请求；
- 生产融合目录必须继续关闭，正常玩家入口必须不存在；
- QA 展示层只在本次捕获的高层 CanvasLayer 中临时挂载；
- 两条路线各发送一次跨帧的真实左键按下／释放；
- 首次点击只展开不可逆确认，第二次确认总数必须始终为零；
- 网络请求、服务端写入和玩家档案写入总数必须为零；
- 结束时卸载展示层、停止并释放有声流，再退出 Main。

普通 `PanelFlowCoordinator` 与正常玩家菜单没有引用融合面板。录像器同时静态锁定这一接线边界，避免后续有人借 QA 入口暗开生产功能。

## 连续片结构

正式片包含 6 章、900 个稳定展示帧；Godot 报告另记录 13 个状态切换帧：

| 章节 | 状态 | 路线 | 展示帧 |
| --- | --- | --- | ---: |
| `closed_open` | 关闭 | 曜冠 | 120 |
| `solar_preview` | 预览 | 曜冠 | 180 |
| `solar_armed` | 首次确认后 | 曜冠 | 150 |
| `moss_preview` | 预览 | 苔垒 | 180 |
| `moss_armed` | 首次确认后 | 苔垒 | 150 |
| `closed_final` | 关闭 | 曜冠 | 120 |

最终媒体连同捕获生命周期帧为 918 帧、30.600 秒；音视频双流均完成全片解码。实际左键点击为 `2`，网络请求为 `0`，第二次确认为 `0`。

## 美术指导自审

本轮按 StoneAge-inspired 但不复制原作像素的方向，对两张正式大头照和整页信息层级做了 1280×720 原尺寸复核：

- 曜冠角兽的暖橙面部、紫金背棘和前倾轮廓形成清楚的稀有攻击型终局身份；在大圆主肖像与小候选卡中都保持可辨识；
- 苔垒角兽以低重心、甲壳和圆钝体块形成防御型／厚重型身份，与曜冠不是换色关系；
- 木、石、金边和叶片装饰与现有宠物培养界面一致，没有临时 QA 面板感；
- 三材料、融合目标、遗传规则、三步流程与候选栏的阅读顺序明确；预览按钮和已武装确认按钮有足够状态差异；
- 所有中文均在边框内，没有标题、规则、按钮或底栏文字裁切／越界；正式头像和 5 张候选头像均无占位图；
- 中央规则栏信息密度偏高、右侧流程栏视觉权重较轻，但这是高价值不可逆操作的次级说明区，当前仍清楚可读，不构成发布阻断。

美术指导建议为“批准当前候选，不再为留白做无收益改版”。但机器和 Codex 自审不能代替项目所有者决定，因此正式 owner 状态继续保持 `pending`。

## 退出泄漏修复

MovieWriter 首轮诊断发现，有声 Main 捕获结束时 `GameAudioManager` 仍持有城镇 Ogg 播放对象和缓存资源，Godot 因而报告 4 个 ObjectDB 对象及 2 个资源未释放。最终 helper 在退出前显式停止全部声音、跨帧排空、释放音频管理器并再次跨帧排空；正式重录日志已为零 `SCRIPT ERROR`、零 `ERROR`、零 ObjectDB／resource／StringName 泄漏。

用于定位对象类型的 `--verbose` 只存在于作废诊断轮次，正式 recorder 已移除该参数。失败轮次 `a` 至 `e` 不是可发布证据；最终权威 run 仅为 `phase407-main-review-20260812-g`。

## 最终证据

本地忽略目录：

```text
.run/evidence/phase407_pet_fusion_main_owner_review/
  phase407-main-review-20260812-g/
```

关键产物：

| 产物 | SHA-256 |
| --- | --- |
| `pet-fusion-main-owner-review-1x.mp4` | `7ea8e76e9e05491b10b7f05288c4269cacf474499280c12efc2b3f3ab05082f5` |
| `contact-sheet.png` | `5ccd4b0b33e367ef0903b664e70e851b7d2fa4e9f68435c7fdb90a032b133600` |
| `summary.json` | `3963f351de0354bf3475d4fe9a055d246b59b19b79f6ea5793f5022428e0e89c` |
| `SHA256SUMS` | `d733d1abcfeca365d538b32b3a84f380565ab5ce4860f003001143fe89defee9` |

媒体合同：

- H.264 / yuv420p / 1280×720 / 30 FPS / `1.00x`；
- AAC / 48 kHz / 双声道；
- 30.600 秒 / 918 帧；
- 音频 `mean_volume=-27.7 dB`、`max_volume=-13.5 dB`，不是静音轨；
- release verifier 在录像前后 canonical SHA 均为 `d6eab31c…`，证明录制没有改写关闭态发布合同；
- automation lane 结束后为 absent，真实玩家目录清单 SHA 在前后保持 `681dec98…`。

## 验证

正式提交前已全部通过：

- 两套录像器 Python 回归合计 `42/42`；
- 独立关闭发布校验 `PASS`：`2 forms / 1350 copied / 22 portrait / 2 QA controls`，并继续证明三个发布开关均为 false；
- Godot 融合 client domain `PASS`，覆盖关闭态零请求、本地资格、双确认、路线和 deferred 技能等级规则；
- Godot 1280×720 panel `PASS`，两条路线均 `layoutWithinViewport=true / formalPortraitCount=5 / placeholders=0`；
- `python3 -B tools/godot_qa_user_data_lane.py source-check`：`source_contract_passed`；
- `godot --headless --path client/godot --quit`：退出码 `0`，仅保留既有 HUD opposite-anchor 基线警告；
- `git diff --check`：通过；
- 正式 Main recorder 全流程 `passed`，覆盖原生预检、MovieWriter、转码、音量、全片解码、关键帧、release verifier、用户目录不变性和最终 SHA 清单。

## 后续门禁

下一步仍须按顺序完成：

1. 项目所有者观看本阶段 Main 成片，明确接受或拒绝两张专用大头照与当前融合信息布局；
2. 接受后创建独立 runtime decision 与 release attestation，绑定本片、两张头像和当前发布目录哈希；
3. 接入正常玩家入口与服务端真实报价／确认，但仍保持全局运行开关关闭；
4. 验证三宠原子消耗、幂等重试、断线恢复、冲突与回滚零残留；
5. 完成真实 1280×720 交互、移动前后性能和最终发布检查后，才允许打开 `runtimeEnabled` 与 `playerEntryOpened`。
