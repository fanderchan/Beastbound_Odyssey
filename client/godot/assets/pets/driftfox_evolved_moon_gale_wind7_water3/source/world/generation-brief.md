# Phase343 月岚风狐世界八方向生成与取舍记录

- 对象：月岚风狐独立宠物。
- 目标：八个独立方向；每方向 1 帧 idle 与 4 帧 walk；512px 源帧派生 256px 运行帧。
- 禁止：运行时镜像、离线镜像、人物/宠物分层拼接、程序重画主体、方向标签代替视觉验收。
- 视觉锁：成年银白月蓝风狐、严格两条大尾巴、肩背毛鳍克制；骑乘帧必须是完整人宠整图。
- 当前门禁：主审与 Phase347 去标签方向语义复核均通过；项目所有者此前已基于 Phase343 的 1× 连续成片批准 `standalone_pet_world_true8_visual_only`。该批准不扩展到战斗、骑乘战斗、进化或路线开放，`runtimeEnabled=false`。

## 源组决策

### pet-a

- 结论：southwest and west selected; south and northwest rejected before integration。
- `south`：`rejected`；two authored tails merge into one unreadable silhouette。
- `southwest`：`selected`；correct three-quarter direction and two readable tails。
- `west`：`selected`；strict side direction and two readable tails。
- `northwest`：`rejected`；only one tail remains visually traceable。

### pet-b

- 结论：all four directions selected after primary visual review。
- `north`：`selected`；direction, identity and two-tail silhouette accepted。
- `northeast`：`selected`；direction, identity and two-tail silhouette accepted。
- `east`：`selected`；direction, identity and two-tail silhouette accepted。
- `southeast`：`selected`；direction, identity and two-tail silhouette accepted。

### pet-northwest-repair

- 结论：northwest row selected; the unused south row remains visible in the untouched raw。
- `south`：`rejected_raw_only`；oversized lateral fur fins read as wings or extra tails。
- `northwest`：`selected`；correct away-facing diagonal with two traceable tails。

### pet-south-repair-v2

- 结论：first five strict-front poses selected; sixth pose archived as a non-runtime audit hold。
- `south-sequence`：`selected`；strict front direction, two separated tails, no wing-like fins。
- `south-audit-hold`：`archive_only`；extra generated hold pose is not part of the runtime contract。

## Phase347 去标签方向语义复核

- 复核方式：把八个方向按随机顺序编码为 A–H，隐藏目录方向名；每个编码只展示 `idle + walk 1..4`，先冻结方向预测和视觉观察，再揭示映射。
- 方向结果：`8/8` 与真实目录映射一致；正面、背面、两侧向和四斜向均可只凭主体朝向辨认。
- 身份结果：40 帧均保持成年银白月蓝风狐、长腿、月白颈鬃、深青眼、月纹和两条可追踪大尾巴；没有单尾、并尾、九尾化或翼状毛鳍。
- 独立性结果：40 张 decoded RGBA 全部唯一，完全重复帧 `0`，跨方向水平镜像对 `0`，最小安全边 `14px`。
- 运行像素结果：显式重导入后，当前源 PNG、import `source_md5` 与 Godot 实际加载的 canonical RGBA `40/40` 一致。
- 边界：这是 Codex 的第二遍去标签技术盲审，不是新的项目所有者决定；原有 owner 批准只覆盖独立宠物 world true8 视觉，`runtimeEnabled=false`。
