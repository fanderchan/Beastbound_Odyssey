# Phase343 月岚风狐世界八方向生成与取舍记录

- 对象：见习猎人骑月岚风狐的一次生成完整主体。
- 目标：八个独立方向；每方向 1 帧 idle 与 4 帧 walk；512px 源帧派生 256px 运行帧。
- 禁止：运行时镜像、离线镜像、人物/宠物分层拼接、程序重画主体、方向标签代替视觉验收。
- 视觉锁：成年银白月蓝风狐、严格两条大尾巴、肩背毛鳍克制；骑乘帧必须是完整人宠整图。
- 当前门禁：主审与 Phase349 去标签方向语义复核均通过；项目所有者此前已基于 Phase343 的 1× 连续成片批准 `integrated_mounted_world_true8_visual_only`。该批准不扩展到骑乘战斗、进化或路线开放，`runtimeEnabled=false`。

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

## Phase349 去标签人物骑乘方向语义复核

- 复核方式：把八个完整人物骑乘方向按随机顺序编码为 A–H，隐藏目录方向名；每个编码只展示 `idle + walk 1..4`，先冻结方向预测、比例和坐点观察，再揭示映射。
- 方向结果：`8/8` 与真实目录映射一致；骑手胸背、坐骑头部、纯侧轮廓和四个斜向均能共同表达方向。
- 整体结果：40 帧均保持成人见习猎人与月岚风狐同一完整透明主体；髋部、双腿、坐垫和坐骑随步态共同起伏，没有人物/坐骑分层滑动、坐点漂移或异常缩小。
- 身份结果：月岚风狐持续保持银白月蓝体态、紫蓝耳尖、月纹、四足和两条可追踪实体尾巴；骑手发型、服装和成人比例八向一致。
- 独立性结果：40 张 decoded RGBA 全部唯一，完全重复帧 `0`，跨方向水平镜像对 `0`，最小安全边 `14px`。
- 运行像素结果：显式重导入后，当前源 PNG、import `source_md5` 与 Godot 实际加载 canonical RGBA `40/40` 一致；当前文件和 decoded RGBA 与 Phase343 冻结 QC、源账本也均为 `40/40` 一致。
- 边界：这是 Codex 的第二遍去标签技术盲审，不是新的项目所有者决定；既有 owner 批准只覆盖完整人物骑乘 world true8 视觉，`runtimeEnabled=false`。
