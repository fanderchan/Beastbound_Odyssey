# Phase 405：焰芽斗士世界真八向双腿步态修复

## 结论

项目所有者先后否决了旧运行步态和第一版四帧修复：前者缺少可辨的双腿交替，后者虽然有
走路姿势，连续播放仍像单腿拖行。最终 v3 没有用加速、角色抖动或光流补帧掩盖问题，而是
把真八向分别重做为六阶段、9 FPS 的完整循环：

```text
contact A → passing A → recovery A → contact B → passing B → recovery B
```

八个方向均为独立画面，不在运行时镜像。当前源帧、运行帧、Godot 导入、真八向审片和真实
`Main.tscn` 移动片均已通过机器门禁与完整人工自审，状态为：

```text
passed_real_godot_and_main_review_owner_pending
```

这表示资产已经达到可提交、可推送的正式候选质量；项目所有者尚未明确接受这条 v3 精确
动态证据，因此不把它写成 owner approved，也不借本轮扩大整个人物包的历史批准范围。

## 根因与作废范围

运行时方向选择、帧序、脚底锚点和移动速度都能正常工作，根因在旧原画：相邻帧的双脚接触
轮廓过于相似，没有形成相反支撑腿及完整的 passing/recovery 半循环。第一版 v2 把每向重做
成四帧，但项目所有者实看后仍判断“单腿”和“不流畅”，因此 v2 的原 sheet、处理产物与 QA
报告已移出正式 bundle，冻结在本地 `.run/rejected-ember-gait-v2/`，不再参与运行或哈希账本。

另外试验过的自动光流插帧出现双腿、头部重影和武器拖影，也被明确拒绝。机器姿态点只用于
比较相邻帧变化是否均匀，不能决定画面里哪条是物理左腿或右腿；相反腿分组由逐向人工审片
完成。

## 正式美术与构建合同

- 八方向：南、西南、西、西北、北、东北、东、东南；
- 每向 6 张冻结输入、6 张 512×512 source、6 张 256×256 runtime；
- 每向共享中位 alpha 高度，source 脚底统一到 `y=478`（exclusive）；
- runtime 使用 premultiplied-alpha Lanczos 缩小，避免透明边缘黑边；
- 背景只做保守 key-magenta 清理，不吞火焰、肤色或装备细节；
- 循环固定 9 FPS，不改世界移动速度、寻路、点击或网络权威。

正式输入选择、生成来源、拒绝记录和替换路径见：

```text
source/world-gait-v3-manifest.json
generation-provenance.json
source/tools/build_world_gait_v3.py
qa/world-walk-gait-v3-report.json
```

## 像素与哈希门禁

构建报告 `qa/world-walk-gait-v3-build-report.json` 为 `passed`：

```text
冻结输入                         48
512px source walk               48
256px runtime walk              48
source/runtime 触边              0 / 0
source/runtime 完全重复          0 / 0
source/runtime 跨方向完全镜像    0 / 0
source/runtime 最大脚底漂移      0px / 1px
```

冻结聚合 SHA-256：

```text
selected inputs  53f84f736895bd468706eeb5c5ecc7a7e4a738bb1983d7da2742a85b0d543aa3
source frames    c4de40f82cc68c5b4c8d0bb75f5dd8f8b8fe1ed9545be3f8a48eda08dab8f006
runtime frames   352d63321b4efa62a21c496d5bdd28d54b26ca5c360b24f0c9fbbc16eb6cdf00
contact sheet    ecb9e1eca4dcc35927f8723b7ec36c340ab6ef24266434ba993b1a3fe4ee4624
```

选择时的姿态点相邻变化系数仅作辅助诊断：最终混合六帧方案 mean/worst 为
`0.356/0.473`，被拒绝的纯生成方案为 `0.413/0.700`。最终判断仍以八向逐帧及连续播放的
双腿语义为准。

## 运行代码与回归

`CharacterActionAssetCatalog` 现在从角色 bundle metadata 读取 world 帧数；idle 必须严格为
1 帧，walk 必须是 4–12 范围内的偶数帧。真八向 review scene、录像时长、标签、import
parity 和工具预期帧数也改为 metadata 驱动；pet／mounted 的既有 40 帧合同及历史默认检查
保持不变。

已通过：

- `python3 -m unittest tools/test/test_record_world_direction_review.py`：17/17；
- Godot parse；
- character runtime appearance 与 map showcase profile 定向自动检查；
- 六帧 9 FPS timing check：idle `0.60s`、walk `1.20s`、总计 `14.40s`；
- 真实 Godot import/source/runtime parity：56/56。

现有 `main.gd:14725` anchor warning 是本轮前已存在的布局警告，不是步态回归。

## 真八向动态证据

真实 Godot review scene：

```text
.run/evidence/phase405_ember_spark_world_gait/
  phase405-ember-gait-v3-final/
  bui_novice_sprout_earth5_wind5/review.mp4
```

媒体合同为 1280×720、H.264、30 FPS、433 帧、14.433333 秒、`1.00×`，全片解码通过；
Godot 实载 56/56 parity。SHA-256：

```text
video             ab58fc67def625f746ce3e333219a923ab8d655d70b5466c8cddd97f49660754
parity report     aa833971d5cdffee661a00bdff53037e8a13d19cbc655275503e06e5263f9d23
loaded source set 18d15d5c03aaa5f00ba2f49a84e79ad20572121abc679ceba80b716ae8764665
```

## 真实 Main 联合片

真实 `res://scenes/Main.tscn` 联合片覆盖村口／训练场 idle 与跨帧鼠标移动，使用
`InputEventMouseButton` 经 `Input.parse_input_event` 分帧按下／释放；人物格确实变化，任务
文字保持在右侧卡片内。录像使用 fresh user-data、内存 showcase profile、不登录、不保存、
不启动后端、不访问 MySQL：

```text
.run/evidence/phase405_ember_spark_world_gait/
  phase405-ember-gait-v3-main-final/firebud-v2-owner-review-1x.mp4
```

媒体为 1280×720、H.264/AAC、30 FPS、644 帧、21.466667 秒、`1.00×`，完整音视频解码
通过。SHA-256：

```text
video         6ab986d2b3633abd1164259cf539566b4315b682531cb993cef3dfe31588cfe7
contact sheet 0eecf8e7e0e11f5be12c3387f800d92a7629f483ad8c3c01b14a2431db3963d3
```

两条完整视频均通过 QuickTime 从头到尾人工自审：八向可见相反接触半循环，中间有 passing
与 recovery，不再接受持续单腿拖行、只上下蹦、双肢、头部重影或武器拖影。

## 性能边界

相邻 Firebud 地图热路径矩阵 8/8 通过，idle 与 moving 全部固定 60 FPS；moving 使用真实
跨帧鼠标事件。当前候选 `process_total` mean 为：

```text
村口      idle 0.339ms / moving 0.343ms
训练场    idle 0.393ms / moving 0.260ms
```

该矩阵证明地图绘制和移动热路径没有回归，不冒充“焰芽人物专属 60 FPS 基准”；人物实际集成
由上述真实 Main 移动片、六帧 timing gate 和 56/56 Godot parity 共同证明。完整 local CI、
移动端与 200 人同图容量不在本轮声明范围内。
