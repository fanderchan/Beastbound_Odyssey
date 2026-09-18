# Phase 551：地图证据提交后的版本来源校验

日期：2026-09-18。修复 R1.W024 重冻证据后的确定性误拒；不改客户端、素材、玩法或性能阈值。

## 问题与修复

地图构建标识包含 `git:<提交号>+beastbound-map-runtime-surface-v2:<运行内容指纹>`。旧截图审计器把整串标识与当前 HEAD 严格比较，因此记录完成后，仅提交文档或证据本身，也会让未变的场景、代码和素材失去有效性。这会造成反复重录仍无法稳定提交的循环。

新增回归先复现了这一误拒，错误为 `capture.batchBuildIdentity: must equal the current map_visual_evidence_builder build identity`。修复后，当前代码重新计算的运行内容指纹仍须完全一致；记录中的 Git 提交必须等于当前提交，或由本地 Git 证实是当前提交的祖先。未知提交、无关分支历史、非法格式、运行内容变化及 Git 查询失败全部拒绝。

原记录的提交号和原始授权不改写。现有的工具源码、manifest、地图截图对应关系、运行表面、资源 SHA、输入动作、Computer Use 和老板美术接受检查全部保留。录制期间发生源码变化仍按原规则中止；本次仅让已经完成的同内容证据能随正常的后续提交保留有效性。

## 验证

```sh
python3 -m unittest discover -s .agents/skills/design-beastbound-maps/tests -p 'test_audit_map_bundle.py' -k later_metadata
python3 -m unittest discover -s .agents/skills/design-beastbound-maps/tests -p 'test_audit_map_bundle.py'
git diff --check
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

第一条回归在修复前明确失败；修复后完整审计器 `47/47` 通过。测试另外创建独立临时 Git 仓库，验证仅 README 变化的后续提交、无关历史、未知提交、运行指纹变化和非法格式。没有改变日常仓库历史或全局 Git 配置。

本轮没有 GDScript/游戏资源修改，未重复执行客户端解析、全量 CI 或正式导出。

## 同期前台性能诊断

Phase 550 已提交推送为 `eef4e2df184f9cf32a0cc1cf3634837c83454611`，本地 HEAD、upstream、GitHub main 当时逐项一致。基于该固定版本又执行 `.run/map-performance/phase551-foreground-repeat-20260918/`：

- 前 9 组全程前台，第 10 组出现 577 帧失焦，以 `foreground_lost_9` 停止整批。
- 10 个 Main 均释放，原生进程 34925 已退出，QA lane 已清理。真实玩家目录 SHA-256 仍为 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。
- 未生成或安装完整矩阵回执。原始日志与明确标注为局部诊断的 `partial-diagnostic-summary.json` 保留，不能把其中成功片段拼成一份验收通过报告。
- 第一轮二层前台静止的 `process_scope_total` 均值为基线 0.310 ms、候选 0.516 ms；移动为基线 0.266 ms、候选 0.641 ms。它们只是一轮诊断，尚不满足三次重复的正式比较要求，但表明不能把此前差异全部归因于失焦。移动样本中相机区段约 0.221 ms，需继续定位；静止差异分散在多个区段，尚未确认单一根因。

没有通过反复抢焦点、放宽阈值或只挑快样本推进验收。本阶段交付审计误拒修复，四层完整性能和正式动作/路线证据继续未完成；R1.W024、P2.1a 不勾选，107 项旧待重冻地图证据继续原样保留。
