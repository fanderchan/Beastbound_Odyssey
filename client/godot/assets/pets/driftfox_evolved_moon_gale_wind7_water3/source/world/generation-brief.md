# Phase343 月岚风狐世界八方向生成与取舍记录

- 对象：月岚风狐独立宠物。
- 目标：八个独立方向；每方向 1 帧 idle 与 4 帧 walk；512px 源帧派生 256px 运行帧。
- 禁止：运行时镜像、离线镜像、人物/宠物分层拼接、程序重画主体、方向标签代替视觉验收。
- 视觉锁：成年银白月蓝风狐、严格两条大尾巴、肩背毛鳍克制；骑乘帧必须是完整人宠整图。
- 当前门禁：主审已通过；独立语义复核和项目所有者连续视频验收仍 pending；runtimeEnabled=false。

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
