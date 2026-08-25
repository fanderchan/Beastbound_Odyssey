# Phase 540：R1.W021 共享地图运行目录与八方向基线收口

## 结论

R1.W021 已完成。普通地图运行目录不再把已经与当前权威 Firebud map data／collision 漂移的历史 v1
制品冒充为可运行的 `released` 地图；Firebud v1 的 bundle、manifest、证明和历史哈希均未改写。普通目录
现在只包含仍满足冻结合同的 `mistcap_marsh`，Firebud v2 与 Earth Vein 四层继续只存在于 review catalog，
且普通玩家生命周期访问继续失败关闭。

八方向红灯不是寻路算法退化，而是旧 canary 固定在 Firebud 当前障碍簇已占用的坐标：权威出生点
`(14,12)` 的右斜线会经过新增 blocker 的禁切角组合。自动检查现从权威出生点向外按确定顺序寻找最近的
真实地图双向直线 canary，最终稳定选择 `(14,10)`；它仍要求左右两条两格斜线都为三点直达且屏幕 y
完全相同，没有放宽真八方向规则。

本阶段不改变 Firebud／Earth Vein 的 owner 状态，不生成 acceptance、digest、attestation，也不执行
promotion。Earth Vein 仍为 `owner_review_pending / pending / false / false`，下一游标为 R1.W022。

## 运行目录修复

### 历史 Firebud v1 只退役路由，不改制品

`map_visual_catalog.json` 移除了 `firebud_training_yard` 与 `firebud_village_gate` 的 v1 主目录路由。
两张地图的当前权威 data、collision 与历史 v1 binding 已经不一致，继续把它们列为普通 released 只会让
严格运行门同时声称“已发布”和“哈希过期”。现在的目录边界为：

- primary：`mistcap_marsh`；
- review-only：Firebud v2 的两张地图与 Earth Vein 四层；
- Firebud v1：保留历史文件和历史证明，但不再参与普通运行目录。

正常 Main 对没有 active released 视觉包的 Firebud 继续使用既有程序化世界回退；本阶段没有把 pending
候选偷接进普通路径。

### 冻结报告与当前目录职责分离

严格检查仍逐项验证当前目录成员、精确 manifest／binding 路径、当前 binding hash、权威 map data hash、
bundle manifest、release attestation、生命周期与重复 prepare I/O。历史 bundle 报告中的全目录
`catalogSha256` 改为只要求合法 64 位冻结值，不再要求它等于今天整个共享目录文件的哈希。

这样删除一个无关的陈旧目录项或新增 review-only 候选，不会迫使未改变的 released bundle 覆盖历史证明；
同时也不能借此替换该 bundle 自己的路径、数据、素材、manifest 或发布状态，因为这些仍由当前独立门逐项
失败关闭。

目录报告生成器还修复了一个模式串线：即使 review catalog 已加载，普通
`catalog_contract_generation` 也只能写 primary bundle；只有
`review_catalog_contract_generation` 才能写 review bundle，精确 override 仍优先。独立目录合同检查已
冻结这两条行为。

## 八方向 canary 根因与修复

当前 Firebud 训练场权威出生点为 `(14,12)`。旧右斜 canary 需要经过 `(15,11)`，但 W014 后的
`(15,10)` 与 `(16,11)` blocker 使第二个对角步违反禁止切角规则；左斜路径仍直达。这证明实际寻路在
正确拒绝穿角，失败的是固定测试坐标。

新的选择器只接受同时满足以下条件的真实地图格：

1. canary 自身可走；
2. 右上两格路径精确为 `start → start+(1,-1) → start+(2,-2)`；
3. 左下两格路径精确为 `start → start+(-1,1) → start+(-2,2)`；
4. 两条路径继续通过现有同屏幕 y 断言。

当前确定性结果为：

- spawn：`(14,12)`；
- canary：`(14,10)`；
- right：`[(14,10),(15,9),(16,8)]`；
- left：`[(14,10),(13,11),(12,12)]`；
- `right_flat=true / left_flat=true`。

## 验证

### 固定 QA lane 的 Godot 回归

以下自动检查使用 `/Applications/Godot.app/Contents/MacOS/Godot`、固定 automation QA lane 与真实
`Main.tscn`：

```text
node tools/run_godot_auto_checks.mjs \
  --only --auto-map-visual-runtime-check,--auto-world-presentation-profile-check,--auto-pathfinding-check,--auto-eight-direction-check,--auto-movement-check,--auto-map-transfer-check \
  --fail-fast \
  --output-dir .run/godot_auto_checks/r1_w021_adjacent
```

结果 `7/7 PASS`（包含 Godot parse）。摘要：
`.run/godot_auto_checks/r1_w021_adjacent/2026-08-25T21-36-13-465Z_summary.json`，SHA-256
`284a31fd81e14d60468586e6c08b31af9672503123f53b0be1ec5b4e67f599e5`。

运行目录回执为 `PASS / errors=[]`：`testedMapIds=[mistcap_marsh]`，六张 Firebud v2／Earth Vein 地图
精确列为 `reviewOnlyMapIds`，`normalLifecycleAccessValid=true`、`normalPendingDisabled=true`、
`repeatPrepareIoStable=true`。寻路、真实跨帧点击移动和训练场↔村口双向转图也全部通过。

独立 `map_visual_review_catalog_check.gd` 在同一个固定 automation lane 中为
`PASS / errors=[]`，包括 primary/review 生成模式不串线的新增合同。lane 清理后 absent，真实玩家目录
SHA-256 前后均为
`d6b1961ed53be04c8b8f1c398e5f5daec4d361a3c69033aee66dbb306e1310f0`。

### 工具与源合同

- `python3 -m unittest tools.test.test_map_visual_release_tools tools.test.test_map_visual_evidence_builder tools.test.test_record_firebud_v2_owner_review`：40 项测试全部 PASS；
- `python3 -B tools/godot_qa_user_data_lane.py source-check --repo-root .`：`source_contract_passed`；
- `git diff --check`：PASS；
- `jq empty client/godot/data/map_visual_catalog.json`：PASS。

## 发布边界

本阶段只恢复共享地图基础门，不等于 Earth Vein 视觉合格。R1.09 的 HUD 覆盖、相机锚点、人物仅
`82.080px`、逐层密度和录片音频资源未收口仍然成立，必须依次由 R1.W022–R1.W025 解决。普通玩家
不会因本阶段获得 Firebud v2 或 Earth Vein pending 地图访问权。
