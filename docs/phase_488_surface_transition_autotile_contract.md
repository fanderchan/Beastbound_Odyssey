# Phase 488：道路／广场完整地表过渡合同

日期：2026-08-19

## 结论

地图视觉运行时现支持可选的道路与广场过渡地砖，但正式合同不是“四张单边图随机选一张”，而是四条
等距边全部 15 种非空暴露组合的完整 autotile。窄路、拐角、孤立格和三／四边暴露格都必须选择与真实
邻接关系精确一致的完整地砖，不再为了复用四张图而丢掉其中一条边。

本阶段只发布通用能力、离线审计器、自动回归和生产规范：

- 没有修改任何正式或待审地图 binding、manifest、atlas、地图 JSON、任务、碰撞或传送；
- 当前已发布 binding 均未声明新字段，因此普通玩家像素、地表 draw 数和玩法行为不变；
- Firebud v2 本地四张道路单边图与四张广场单边图只够证明材质方向，不够覆盖窄路和拐角，继续作为
  中间候选，不进入本批次；
- 没有改变任何 `ownerReviewStatus`、`releaseApproved` 或 `runtimeEnabled`。

## 美术判断与方案纠正

本地 2×2 候选母表中的每格都是一张完整不透明地砖：道路／石坪占满菱形，只在一条边加入草地侵入。
它们不能像透明边缘遮罩一样叠加。若运行时在两条暴露边里稳定或随机挑一条，一格宽道路会长期只柔化
一侧，拐角另一侧仍以硬边接草地，并在连续格上形成左右交替的视觉噪声。

因此四选一方案被退回。正式能力要求 15 张独立组合地砖；这会增加后续美术量，却避免把明显缺边的
半成品固化为运行合同。后续 Firebud 激活前，路径与广场各自仍需补齐 11 张多边组合图，并在真实
`1280×720 Main.tscn` 中审查接缝、材质连续性和重复感。

## 运行合同

方向缩写和等距格偏移为：

| 缩写 | 邻格偏移 |
|---|---:|
| `nw` | `[-1, 0]` |
| `ne` | `[0, -1]` |
| `sw` | `[0, 1]` |
| `se` | `[1, 0]` |

`ground.pathTransitionTileIds` 与 `ground.plazaTransitionTileIds` 均为可选对象；一旦声明，就必须精确包含：

```text
nw, ne, nw_ne, sw, nw_sw, ne_sw, nw_ne_sw,
se, nw_se, ne_se, nw_ne_se, sw_se, nw_sw_se,
ne_sw_se, nw_ne_sw_se
```

准备地图时，道路、广场和 warp 互相视为连续地表；其余邻格或地图外部视为暴露边。运行时按暴露边的
规范顺序构造唯一 signature，并选择对应 tile，不使用随机数，也不在 draw 热路径计算。

所有过渡 tile 必须：

- 已在 manifest 注册且为稳定 ID；
- 在同一对象内 15 张互不重复；
- 道路与广场之间不得复用；
- 不得复用 default／blocked／encounter／warp／path／plaza／edge／layered base 或任一 tile variant；
- 缺少语义 base、任一 signature、未知或重复 ID 时失败关闭。

后处理只允许改变 `tileIdsByCell`、`tileCounts` 以及道路／广场各自的诊断计数。原始 mapData、
`semanticTileIdsByCell`、道路／广场／warp／encounter／blocked lookup、碰撞、寻路、保护格和任务事实
必须逐项保持不变。

## 实现边界

- `MapVisualCatalog` 在 `_build_ground_state` 之后、构造 layered draw 之前完成过渡选择；字段不存在时
  立即返回，现有地图只增加两个常数级 `has` 判断。
- 表面 signature 由一个共享纯函数生成；道路与广场使用同一邻接定义，避免两个实现逐渐漂移。
- Python bundle auditor 与 Godot catalog check 使用相同 15-key、独立 tile、跨表面复用和语义保护合同。
- Godot 回归以已发布 Firebud v1 binding 加入内存中的合成 15-tile 映射，不依赖 owner-pending
  Firebud v2 文件；夹具实际覆盖道路与广场多边拐角。

## 验证

通过项：

```text
git diff --check
PASS

python3 -m py_compile \
  .agents/skills/design-beastbound-maps/scripts/audit_map_bundle.py
PASS

python3 -m unittest discover \
  -s .agents/skills/design-beastbound-maps/tests \
  -p 'test_audit_map_bundle.py'
16/16 PASS

Godot 4.7 headless parse
PASS，Client2 QA user-data attestation passed

map_visual_review_catalog_check.gd
PASS：pathTransitionsComplete=true / plazaTransitionsComplete=true

map_visual_runtime_check.gd
PASS：正式 Firebud v1、Mistcap 及只读 review catalog 严格冻结回归无误
```

受控 Client2 通道在检查后 `verify` 证明正常玩家目录 SHA-256 前后相同，随后由安全助手清理为 absent。
第一次把独立脚本与自动 runner 并行启动时，runner 发现真实 Godot `logs/` 被另一进程轮换而在产品检查前
主动中止；它保留 Automation 通道供人工恢复，没有被绕过或手工删除。后续验证全部串行隔离执行。
一次缺少 Main lane 参数的 Client2 解析也被 attestation 拒绝；它只生成一份 650-byte 测试日志，该固定
测试目录已整体移动到 ignored `.run/quarantine/`，未删除或改写正常玩家目录。

## 发布与后续

本批次可独立提交，因为它不启用任何候选资产，也不要求项目所有者审美批准。Firebud v2 若要使用此
能力，必须先完成道路 15 张和广场 15 张独立组合图、更新来源与 atlas、通过严格 bundle 审计、真实
Main 接缝／性能证据和 owner acceptance；四张单边母表不能直接提升为正式运行资产。
