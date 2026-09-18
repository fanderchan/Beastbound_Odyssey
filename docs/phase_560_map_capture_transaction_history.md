# Phase 560：地图动作取证区分历史记录与未完成事务

日期：2026-09-19。解决 Phase 559 复现的地图截图启动阻断，继续 R1.W024。只改 Python 取证工具及测试；游戏运行、地图资源、性能阈值、资产批准状态均未变。

## 根因与修复

动作取证工具在任何模式启动时都会扫描所有历史正式安装事务。已经发布汇总的旧事务也会再次要求当前正式截图保持旧 SHA；后续正常替换截图后，旧记录因此报 `formal transaction committed summary formal artifact 字节数不一致`。工作区同时保留 Phase 554 和 Phase 557 两个已提交且已发布汇总的事务，符合这个复现条件。

现行处理边界：

| 情况 | 处理 |
| --- | --- |
| `--scratch-only` | 不读取或恢复正式安装事务，只在新 run 目录构建临时动作证据；仍持有 bundle 排他锁，保留路径限制和隔离启动合同。 |
| 已 committed，只有正式汇总存在 | 验证事务完整结构、固定路径、汇总 SHA 与提交绑定，将其视为已完成历史；不要求可被后续版本替换的目标文件仍等于旧版本。 |
| 已 rolled_back | 验证每个条目已经达到回滚终态，作为历史保留；不再次修改后续版本的目标。 |
| committed 但汇总尚未发布 | 继续完整校验当前安装文件后发布汇总。缺失、同时存在 pending/final、字节漂移仍失败关闭。 |
| 其他未完成安装 | 继续原有完整预检和逐项恢复；未知并发修改仍拒绝，不能覆盖新字节。 |

扫描历史时也检查完整路径链，拒绝通过目录符号链接读取事务。没有删除或重写历史 journal、summary、截图或回执。显式 `_recover_formal_transaction()` 的当前字节校验保持严格；历史扫描成功不是当前资产审计通过。

## 验证

新增行为用例覆盖连续两次完整替换、中间失败回滚、损坏历史对临时／正式模式的不同影响、未发布提交的正确恢复、未知当前修改、汇总篡改／缺失／双份、非法回滚条目与目录符号链接。所有文件操作均在临时测试仓库内。

```sh
python3 -B -m unittest discover -s tools/test -p test_record_map_visual_action_captures.py
python3 -B -m unittest discover -s tools/test -p test_refresh_map_visual_action_evidence.py
git diff --check
```

分别 `41/41`、`3/3` 通过。将两个新增行为用例运行于修改前的完整工具源码，分别复现 scratch 被坏 journal 阻断，以及已完成历史在后续替换后报字节不一致；不是仅因新函数不存在而失败。旧代码红灯日志保存在 `.run/phase560-regression-red.log`。

真实工作区的两份事务现在均被识别为已完成，持有真实 bundle 锁的恢复扫描正常结束。另执行真实目录的 scratch 预检，已生成 20 项动作计划并到达官方隔离启动步骤；由于 Mac 锁屏，在进程创建边界明确中止，Godot 启动数为 0。这只证明预检阻断已修复，不声称重新取得截图或 Computer Use 验收。记录在 `.run/evidence/map_visual_action_captures/earth_vein_cave_visual_v1/phase560-scratch-preflight-20260919/preflight-result.json`。

原有 107 项候选文件、两份事务和两份汇总共 111 项的 SHA-256 均与 `.run/phase560-before/inventory.json` 一致。没有创建 QA lane、账号、后端或新客户端进程；无需重复 Godot 解析或全量 CI。

## 性能数据的后续方向

继续核对 Phase 559 的有效 48 组原始数据，确认 60 次点击及跨帧释放都发生在测量窗口内，不能把移动样本误认为测量前已经完成输入。已有数据的分段统计保存在 `.run/phase560-native-cost-attribution.json`，不修改原回执或正式性能报告。

二层移动三轮均值的中位数：相机区段旧网格 `0.011125ms`、当前美术 `0.106625ms`；世界绘制区段则由 `0.826250ms` 降至 `0.210250ms`。因此，相机值得继续定向定位，而仅看 process scope 不能说明整个绘制路径变慢。两个区段也不能证明正常运行的进程 CPU 或整体帧延迟；不以另造宽松指标替代现有门槛。

下一步继续针对移动构图开销做保持结果一致的优化，并在解锁后完成正常窗口的 CPU、当前画面及鼠标复核。R1.W024 保持未勾选，Phase 559 的完整性能门槛失败结论不变；正式动作、录像、Computer Use 与最终候选审计仍须按当前源码重新取得。
