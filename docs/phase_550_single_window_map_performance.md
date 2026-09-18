# Phase 550：单窗口地图性能对比与前台采样边界

日期：2026-09-18。继续 R1.W024；这一切片完成性能采样工具的集中运行和可信回执校验，不代表四层地图性能或正式美术已经验收。

## 画面反馈与范围

老板看到的两个岩脉洞穴窗口来自旧表现基线与待审美术候选的对比。基线使用原网格和 1× 相机，候选使用现有洞穴素材和 1.52× 相机，所以人物与地图的显示尺寸不同。它们不是两个日常开发目录，也不是地图资产丢失。测试窗口此前未标明用途，造成当前游戏退回空地图的误解。

每组测试现在明确显示 `性能测试 N/48｜旧网格基线（非试玩效果）` 或 `当前美术候选`，并标明静止/移动。标签只出现在专用 QA 窗口。正常玩家的资产生命周期、相机、地图数据、战斗和奖励规则均未改变。

本轮没有新增玩法或视觉资产，因此不重新设计 StoneAge 行为。沿用已建立的地图/输入/表现合同，使用 Godot 客户端与地图生产技能的隔离和证据要求。Earth Vein 仍为 `owner_review_pending / pending / false / false`。

## 实现

- `tools/run_map_visual_performance_evidence.py` 默认把每个 bundle 的完整矩阵交给一个原生进程和一个 root Window。四层 × 两种表现 × 静止/移动 × 三次重复共 48 组，不再启动 48 个窗口。
- `map_performance_batch.gd` 每组重新实例化真实 `Main.tscn`；销毁后检查旧 Main 已释放。只共享引擎资源缓存与窗口，所以这是稳定状态 CPU 比较，不是冷启动比较。
- 原 180 帧预热、480 帧测量、60 帧一组统计保持不变。移动仍为跨帧的 60 次左键点击、120 个输入事件，双方使用同一对权威可站立坐标。CPU 范围、配对中位数与全部四项性能阈值保持不变。
- 只在启动的 5 秒有界窗口请求前台。采样逐帧记录焦点，失焦样本不可用，完成当前组的资源回收后停止；不会继续抢回焦点或把后台采样当作通过。
- 每组先执行既有音频收口，再取消并排空后台贴图预取，随后释放 Main。完整矩阵结束后才封存进程退出、窗口关闭、QA lane 清理和真实目录未变的证明。
- 原始回执新增 schema 2，绑定计划、工具源码 SHA、Godot 二进制 SHA、同一进程/窗口、不同 Main、连续帧区间、逐帧焦点以及原始结束/资源释放日志。schema 1 的历史独立进程回执继续按旧合同校验。
- 生成器与地图独立审计器都校验新格式；审计器仍独立重算旧有的采样、移动、数值、聚合和阈值。缺失样本、跨进程拼接、焦点丢失、未释放 Main、后台资源残留或不匹配原始日志均拒绝。
- CLI 的 `PASS` 明确带 `scope=raw_capture_and_cleanup` 和 `performanceGatesEvaluated=false`；采样完成不会冒充性能报告通过。`--scratch-only` 只保存本机诊断，不覆盖已有正式证据。

固定步长 `--fixed-fps 60` 仅用于相同模拟负载，日志里的 60 不能解释成实际显示帧率；普通 PC 流畅度仍需原生实际帧间隔与进程 CPU 证据。

## 实机记录与尚未通过的门槛

1. `.run/map-performance/phase550-single-window-20260918/`：48 组执行后引擎报告 ObjectDB 残留，整批拒绝，未安装正式证据。原始失败记录保留。
2. `.run/map-performance/phase550-prefetch-drain-20260918/`：在显式预取收口后，一个原生进程/窗口完成 48 个独立 Main 和 48 次排空，退出无资源警告，隔离目录清理成功。不能仅凭这次结果断言此前泄漏的根因已经完全确定。
3. 对第二次原始数据重新计算：二层静止 `process_scope_total` 基线中位数 0.166 ms，候选 0.340 ms，增加 0.174 ms；配对增量中位数 0.162 ms，两者都超过既有 0.100 ms 上限。只有 5/48 组首尾保持前台记录；这一批不能作为合格的前台性能证明。没有放宽阈值或删掉较慢样本。
4. 最终逐帧前台约束实测 `.run/map-performance/phase550-foreground-20260918/`：第一组观察 765 帧，其中 99 帧失焦，明确以 `foreground_lost_0` 拒绝整批；已释放该 Main、退出进程并清理 QA lane。真实玩家目录保持 698 项及 SHA-256 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。没有安装这批失败证据。

前台重测仍需完成，二层开销原因尚未证实。不能把失焦当作唯一根因，也不能把旧的 48 组采样完成写成 48 组性能验收通过。107 项待重冻地图证据保持原状，本阶段提交只包含工具和文档。

## 验证

```sh
git diff --check
python3 -m unittest discover -s tools/test -p 'test_map_performance_batch.py'
python3 -m unittest discover -s tools/test -p 'test_map_visual_evidence_builder.py'
python3 -m unittest discover -s tools/test -p 'test_run_map_visual_performance_evidence.py'
python3 -m unittest discover -s .agents/skills/design-beastbound-maps/tests -p 'test_audit_map_bundle.py'
node tools/run_godot_auto_checks.mjs --parse-only --output-dir .run/godot_auto_checks/phase550-foreground-parse
```

Python 分别 `8/8`、`51/51`、`11/11`、`45/45` 通过。Godot 隔离解析 `1/1` 通过；真实窗口也执行了新增批处理脚本、首组预热/测量、失焦拒绝和清理路径。没有把这次失败的完整矩阵算作通过，没有执行全量 CI、正式导出、数据库迁移或生产发布。

另外核对 Phase 549 的零经验提示：当前服务端经验按实际击杀参与归属结算，现有定向用例覆盖宠物尾刀时人物零经验；本轮没有证据表明结算规则回归，因此没有擅改奖励公式。

## 下一步

先在持续前台环境完成当前代码的重复静止/移动对比，定位仍可复现的开销差异；随后继续同一候选的四层动作安装、原生/录片、实际 Computer Use 与路线/战斗转换证据。R1.W024、P2.1a 继续未勾选，全局发布仍为 BLOCKED。
