# Phase 411：当前美术总监审计与审图证据加固

## 结论

本阶段把“技术上能显示”和“画面已达到发布水准”重新分开判定，并用当前 `main` 的真实
1280×720 Main 画面复核世界、骑宠和 10v10 战斗：

- 火芽村口／训练场 v2 的人物、宠物、任务卡和场景层次可继续维持项目所有者已冻结的方向；
- 五里橙焰骑乘包的八方向、角色／宠物／骑乘三层帧数与锚点结构通过，但造型和材质仍属于较早一代，
  可用但不作为新美术标杆；
- 10v10 战斗的布局、点击和 HUD 安全区通过，画面本身不通过发布级审美：灰色空地、同模复制感和
  过小的战斗单位使其仍像工程验证场；这是当前最高优先级的视觉短板；
- Phase 407 的融合宠最终 Main 成片继续等待项目所有者单独批准。本阶段没有代替 owner 批准，
  没有生成 release attestation，也没有打开融合运行态。

## 审图链路修复

### 官方 QA 隔离区

火芽 v2 成片和性能矩阵原工具仍在使用 Godot 已不接受的自定义 `--user-data-dir`。现在每次真实 Main
运行都使用项目的 owner-attested `automation` QA lane，并且：

- native 与 MovieWriter 都验证 lane attestation；
- 每段结束后验证并清理 QA lane；
- 对真实玩家目录做前后 inventory SHA-256 比对；
- 不接受登录、服务器 URL 或任意 Godot 透传参数；
- 不启动 Node、不访问 MySQL、不保存临时 showcase profile。

性能矩阵的 8 个单元也各自拥有 source check、Godot 4.7 preflight、进程组收口、原生日志、lane
lifecycle 和 owner evidence；`SHA256SUMS` 覆盖 49 个保留文件并已逐项校验。

### 地图审图退出资源收口

地图截图控制器在每次成功或失败退出前都会停止战斗音频时间线、停止全部音频、等待渲染帧并释放
`GameAudioManager`。报告新增 `runtimeCleanup`；任一音频资源未释放都会让证据失败，不再把 Godot
退出期资源泄漏当作可忽略噪声。

### 任务页文字与锚点

觉醒任务页本来已经使用 full-rect anchors，宿主布局又写入 `position/size`，Godot 会在 `_ready()`
之后覆盖尺寸并在正常 Main 启动时产生布局警告。现在统一使用 full-rect preset；自动回归同时精确检查
四个 anchors、四个 offsets 和可视 viewport 尺寸。当前真实回归输出 `layout=true`，任务文字保持在
任务卡边界内。

## 当前美术判断

| 范围 | 判断 | 处理决定 |
| --- | --- | --- |
| 火芽村口／训练场 v2 | 人宠比例、脚底落点、遮挡层次和任务卡可读性通过；大面积草地仍略平、灌木重复、HUD 图标偏杂 | 保持已冻结构图，不为追求变化而重画；把地表节奏和 HUD 降噪列为后续精修债务 |
| 五里橙焰骑乘 | 角色、宠物、骑乘各 120/120 帧，真八方向与接触表可审；轮廓和材质表现弱于当前火芽方向 | 保留为可用旧资产，后续按新标杆升级，不阻塞当前地图闭环 |
| 10v10 战斗 | 20 单位、5 次真实跨帧左键、目标格和 HUD 均通过；但背景近乎纯灰、同模密集、单位视觉权重不足 | 仅判定工程布局通过，美术不通过；下一视觉批次先做原创战斗环境和前中后景层次 |
| 融合宠 | 技术和事务证据已齐，Phase 407 成片仍是 owner 最终判断依据 | 继续关闭，不因本次审计自动放行 |

StoneAge 参考只用于成熟行为和信息层级基线；后续战斗环境必须原创，不复制参考项目的地图、数值或
美术资源。

## 性能证据

性能报告：

```text
.run/evidence/phase411_art_director_audit/performance/phase411-art-director-perf-current/
```

游戏内 `process_total` 均值（毫秒）：

| 地图 | 模式 | v1 baseline | v2 candidate | 结果 |
| --- | ---: | ---: | ---: | --- |
| 火芽村口 | idle | 0.386 | 0.343 | 通过，候选更低 |
| 火芽村口 | moving | 0.385 | 0.480 | 通过，增加 0.095 ms，仍低于 0.5 ms |
| 训练场 | idle | 0.355 | 0.325 | 通过，候选更低 |
| 训练场 | moving | 0.400 | 0.490 | 通过，增加 0.090 ms，仍低于 0.5 ms |

moving 四格都由跨帧真实鼠标按下／释放触发，并验证 moved、coalesced、settled、final match 和 screen
roundtrip。外部 `ps` 采样包含 Godot 启动和固定帧无垂直同步的快速运行区间，因此只保留为原始旁证，
不替代游戏内热路径数据，也不据此宣称 200 人容量。

## 冻结证据

证据位于忽略目录 `.run/evidence/`，未提交媒体本体：

火芽当前冻结目录为
`.run/evidence/phase383_firebud_v2_owner_review/phase411-art-director-firebud-current-v3/`；其中
`SHA256SUMS` 恰好覆盖除自身和临时目录外的全部 81 个保留文件。

| 证据 | SHA-256 |
| --- | --- |
| 火芽 v2 当前 22 秒成片 | `cc874457a1bb3571074f4da55e418b1618dfdf270930e448049601cfbfb8125a` |
| 火芽 v2 接触表 | `dfefb4726c3c9d53901e03080d743d1f8d9de2dcbb6bec5a1c773954956f4d23` |
| 火芽 v2 `summary.json` | `afcebf966898cd0caf2aa8c66cd0c01e9f404a05867251b1ae6879865f660170` |
| 火芽 v2 `SHA256SUMS` | `79f2675c8db82741af762d516704ab5afa5506d7af861f899aa6ad121322bcda` |
| 五里骑乘 `evidence-index.json` | `80c0999a55cea4868c864b06dbf83d2d5663f09d9e32b99ff60048590127fa49` |
| 五里骑乘 14.433 秒成片 | `c85a24f61544680564ace4bfd3f23dcd63313b3629f03d9ed7231362955b71af` |
| 五里骑乘八方向网格 | `b94f3f40ba26fd4af66b0c10d1962d9c71d0733f9d3b554b0bf1f504b47a3240` |
| 五里骑乘接触表 | `4f6ccb341bc022485505f14d49c5217132e8d6b9b47b6f27460836c9ca2e00bd` |
| 10v10 当前 13.633 秒成片 | `8cb49eb7fab8ade24d6a85fd9905f97631b9e86315850dbf04f3b08b7f568bab` |
| 10v10 接触表 | `ec8f8b9e59ef726b01a7b2a62b444a03a920ee3eaf92a766fb5f67ec1b5e3dd1` |
| 10v10 `summary.json` | `dffa51bfaaa0c95d305f554496ec92888f27db89d79617a56105ef5bd9187109` |
| 性能矩阵 `summary.json` | `a98541de3fa3163352ac1dadd4ef9187be046dd8916dfefb41f5c57c1e3b34f8` |
| 性能矩阵 `SHA256SUMS` | `6c8bc91201fbf8028fb8f9b3843840fde0c9eedcaefa1526692142e1a9e7ca8c` |

## 验证

- Python 语法：4 个审图／性能工具与测试文件通过；
- 定向 Python 单测：`12/12`；
- `godot --headless --path client/godot --quit`：Godot 4.7 解析通过、零警告；
- `--auto-map-visual-review-showcase-profile-check`：连同 parse `2/2`；
- `--auto-quest-ui-check`：连同 parse `2/2`，`layout=true`；
- 火芽 native + MovieWriter 四段：全部严格日志、媒体解码、真实移动、资源收口和 QA lane 清理通过；
- 五里骑乘：角色／宠物／骑乘 `120/120/120` 帧一致；
- 10v10：20 actor、5 次真实跨帧左键、零 HUD collision／passthrough；
- 性能矩阵：`8/8`，真实玩家 inventory SHA-256 八格一致，QA lane 最终为空；
- `git diff --check`：通过。

## 未越界事项

本阶段没有修改、暂存或提交工作区内仍在整理的宠物／骑乘候选素材；没有连接后端或数据库；没有写入
真实玩家档案；没有改动融合目录关闭态。下一批可以独立推进战斗环境视觉，但正式替换仍须保留来源、
所有权、可替换路径、1280×720 成片和 owner review 门禁。
