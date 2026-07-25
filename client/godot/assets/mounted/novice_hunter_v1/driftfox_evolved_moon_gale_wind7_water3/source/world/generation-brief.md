# Phase343 月岚风狐世界八方向生成与取舍记录

- 对象：见习猎人骑月岚风狐的一次生成完整主体。
- 目标：八个独立方向；每方向 1 帧 idle 与 4 帧 walk；512px 源帧派生 256px 运行帧。
- 禁止：运行时镜像、离线镜像、人物/宠物分层拼接、程序重画主体、方向标签代替视觉验收。
- 视觉锁：成年银白月蓝风狐、严格两条大尾巴、肩背毛鳍克制；骑乘帧必须是完整人宠整图。
- 当前门禁：主审已通过；独立语义复核和项目所有者连续视频验收仍 pending；runtimeEnabled=false。

## 源组决策

### mount-a

- 结论：southwest, west and northwest selected; south rejected before integration。
- `south`：`rejected`；walk drifts toward southwest and the idle tail pair is not readable。
- `southwest`：`selected`；integrated rider and mount face the correct diagonal。
- `west`：`selected`；integrated rider and mount hold a strict side direction。
- `northwest`：`selected`；integrated rider and mount face the correct away diagonal。

### mount-b

- 结论：all four integrated whole-frame directions selected after primary visual review。
- `north`：`selected`；direction, rider seat and integrated silhouette accepted。
- `northeast`：`selected`；direction, rider seat and integrated silhouette accepted。
- `east`：`selected`；direction, rider seat and integrated silhouette accepted。
- `southeast`：`selected`；direction, rider seat and integrated silhouette accepted。

### mount-south-repair

- 结论：first five strict-front integrated poses selected; sixth pose archived as an audit hold。
- `south-sequence`：`selected`；strict front direction, readable two tails and stable rider seat。
- `south-audit-hold`：`archive_only`；extra generated hold pose is not part of the runtime contract。
