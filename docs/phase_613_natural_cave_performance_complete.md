# Phase613：新版洞穴完整性能通过，进入外观验收

日期：2026-09-22。承接 Phase611 的自然地表与岩壁返工、Phase612 的窗口诊断。R1.W026–W028 的技术与实机证据现已齐全，游标推进到 **R1.W029 所有者外观验收**；普通启动尚未启用候选。

## 恢复原生窗口操作

本轮恢复后，两次 `cua.getState()` 仍超时，中间执行一次官方会话重置也未解决；现场 `IOConsoleLocked=false`。只读日志与两秒进程采样未确认死锁或权限缺失。直接访问 Codex 自身 UI 被工具安全策略拒绝，未改变权限或改用其他方式操作它。

随后 `cua.listApps()` 立即返回原生应用列表，正式 QA runner 启动后，通过已知 `local.beastbound.qa.native` 直接取得游戏准备页、截图并真实点击开始。**汇总状态查询失败不能推断所有原生应用操作不可用。** 本轮没有确认汇总调用具体卡在哪个子项，也没有确认此前窗口失绘的系统根因；只证明这次原生路径可用且完成了整轮。测量开始后没有追加 Raise、按键、点击或截图，没有强制补绘。

官方隔离入口保持原样，另有随 runner 结束的临时 `caffeinate -d -i -s`。未重启 Codex、电脑交互服务或系统，没有改安全权限、显示或电源偏好。

## 完整性能结果

run ID：`phase613-natural-cave-performance-native`。四层各测旧网格／当前美术、静止／真实跨帧鼠标移动，并进行三次重复，共 **48/48** 组。一个原生窗口，Main 每组重建，旋转楼层顺序、交替新旧顺序，保留 180 帧预热与 480 帧测量合同。

36,768 个焦点／绘制观察帧中，失焦为 0，不可绘制为 0，无首次失绘诊断事件。48 个 Main 均释放，剩余 0，进程正常退出。没有拼接 Phase611／612 的失败批次。

| 候选楼层 | 静止处理区间均值中位数 | 移动处理区间均值中位数 | 相对本轮网格基线的静止／移动增量 |
| --- | ---: | ---: | ---: |
| 一层 | 0.181 ms | 0.214 ms | -0.036 / -0.013 ms |
| 二层 | 0.153 ms | 0.208 ms | +0.004 / +0.059 ms |
| 三层 | 0.160 ms | 0.226 ms | +0.001 / +0.039 ms |
| 四层 | 0.167 ms | 0.217 ms | -0.030 / -0.055 ms |

正式生成器验证绝对门槛（静止 0.5ms、移动 0.6ms）、汇总增量与逐次配对增量门槛全部通过，未改阈值。表中为 `processScopeTotalMs`，不是整进程 CPU、实际显示 FPS 或 200 人容量；对照是本轮网格与新美术，不能当作严格的旧美术修改前后收益，也未外推 Windows 表现。

## 精确证据安装与验证

采集提交为 `a518fda4bb2eb4f451e4568aa262be9d742edc67`，运行内容摘要保持 `beastbound-map-runtime-surface-v2:28dbd813cd8e1c24165fcefc1f299970dedd02a6715253b9b4446e057f54a43d`。与 Phase611 的像素和运行内容一致；没有重录有效动作，也未改写旧截图、鼠标与影片的 Git 前缀。

原 manifest、旧性能报告及旧 receipt 的字节和哈希先备份到 `.run/phase613-working/performance-before/`，再安装本轮完整 receipt，经正式生成器生成报告并回填 `performanceReport` 引用。只改这三个 bundle 文件；像素、绑定、权威地图、候选生命周期与所有者记录未改。

- 新 receipt SHA-256：`f538726dd6a31467039b38d1ce4d3db12b7ae438af5efe7a0e7005204072b98b`。
- 新报告 SHA-256：`84260b4bc6dd2ee42434c671effb380b0204f804d158987be82103c92e4aa874`。
- 独立 bundle 审计：**166 files / 51 PNG / 29 JSON / errors=[]**。`releaseReady=false`，只剩所有者接受、发布证明与正式启用三项。
- 官方 QA 清理：`realUnchanged=true / laneAbsent=true / leaderReaped=true / processGroupClosed=true`；真实玩家目录摘要仍为 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。
- 隔离 Godot 解析 `1/1 PASS`，摘要 `.run/godot_auto_checks/phase613-evidence/2026-09-21T17-55-41-251Z_summary.json`；文档索引／链接及 `git diff --check` 通过。未重跑无关服务端套件或全量 CI。

实际 argv、原生日志、计划与清理证明在 `.run/map-performance/phase613-natural-cave-performance-native/earth_vein_cave_visual_v1/`。安装脚本、备份与独立审计输出在 `.run/phase613-working/`；最终正式报告在 bundle 的 `evidence/performance-report.json`。

## 可供老板审看的结果

[Phase611](phase_611_natural_cave_visual_revision.md) 的四层 20 组自动画面、20 项真实鼠标、碰撞、64.4 秒四层影片及 8.333 秒双台影片继续有效。本轮再次查看四层原尺寸对比图；一层干燥、二层湿地菌群、三层琥珀晶簇、四层共鸣通路的区分和连续岩壁可见。仍如实保留地表块状重复与围壁轮廓重复的外观限制，没有把技术通过当作画面接受。

老板可采用本次画面、继续指定返工，或决定首发延期；采用后才执行 R1.10 的精确提升及普通客户端实测。当前仍为 `owner_review_pending / pending / false / false`，所有者接受与发布证明为空，P2.1a 继续未勾选。整款游戏的正式发布、正常难度与多人容量仍未完成。

```sh
python3 -B tools/run_map_visual_performance_evidence.py --bundle-id earth_vein_cave_visual_v1 --build-identity '<current-build-identity>' --godot '<native-qa-godot>' --run-id '<new-run-id>' --scratch-only
python3 -B .agents/skills/design-beastbound-maps/scripts/audit_map_bundle.py client/godot/assets/maps/earth_vein_cave_visual_v1
node tools/run_godot_auto_checks.mjs --parse-only --output-dir .run/godot_auto_checks/phase613-evidence --timeout-ms 120000
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
git diff --check
```
