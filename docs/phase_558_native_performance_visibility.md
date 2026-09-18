# Phase 558：原生性能采样须同时证明可见与绘制

日期：2026-09-19。承接 Phase 557 的性能失焦调查。本阶段修复 QA 的有效性判定，不修改地图、角色比例、镜头、玩法或发布范围。R1.W024 保持未完成。

## 已复现的判定缺口

本地短诊断在同一个原生窗口内依次运行空场景、二层旧网格 Main、二层当前美术 Main、空场景。明确点击启动后，四段 `window_is_focused()` 均没有失焦；然而后三段首个观察点的 `Window.can_draw()` 为 false。固定步长模式在不可绘制时仍快速推进逻辑帧。因此，“有焦点”不能单独证明样本来自正常可见绘制。

这与 [Godot 4.7 macOS 实现](https://github.com/godotengine/godot/blob/4.7-stable/platform/macos/display_server_macos.mm#L2500) 一致：焦点与可见性读取独立状态；[Engine 文档](https://docs.godotengine.org/en/stable/classes/class_engine.html#class-engine-method-get-process-frames) 也区分逻辑帧与已绘制帧。上述诊断不能证明是谁遮住窗口，也不能替代性能测量。

记录保存在 `.run/phase558-focus-diagnostic-start-gate/`，包含实际入口、焦点报告、原生日志和隔离目录生命周期。早期两次诊断分别因缺少固定测量参数、启动点击超时失败，另一次启动被尚未清理的 QA 所有权锁拒绝；失败记录均保留。确认所属进程已回收和真实目录未变后，通过官方 helper 清理了测试目录，没有直接删除锁或玩家资料。

## 修复后的采样合同

- 准备页提供明确的“开始性能测试”按钮，说明约 12 分钟、旧网格与当前美术的对比用途。最多等待 120 秒；点击后还须连续 1000ms 有焦点、可绘制、渲染循环开启，且至少产生 30 个实际绘制帧。准备页在第一个 Main 创建前销毁。
- 测量期间逐帧观察焦点、可绘制状态及渲染循环状态，边界记录 `drawFrame`。任何不可绘制帧使整批失败；绘制帧增量须至少为观察帧数减一，唯一的一帧余量对应初始 `process_frame` 信号可能早于首次绘制。
- Python 回执验证器同步校验上述数据与原始边界行，策略升级为 `foreground_drawable_required_v2`。缺字段、布尔值冒充计数、可见性丢失、关闭渲染循环或逻辑空跑均不能通过。
- 只有空准备页使用 10ms 等待以避免不可见时忙循环。测量部分不加等待、不抢焦点、不强制绘制。180 帧预热、480 帧测量、真实跨帧移动、三次重复、性能阈值、音频和贴图回收均保留。

## 原生验证及仍未通过项

官方入口使用 `--scratch-only --run-id phase558-visible-native-20260919`，内容仍为 runtime 指纹 `e3af2bc097a68127a050d83d55f598db6f21d0a3487e2a041836d8a8d1e4bccb`。Computer Use 实际点击准备按钮并看见第一层旧网格对照画面。准备记录为 `1014ms / 61 drawn frames / mainCount=0`。

前 8 组均零失焦、零不可绘制帧。第 9 组（三层旧网格静止）在 765 个观察帧中出现 98 个不可绘制帧，起止焦点仍为 true，实际绘制仅推进 668 帧；新增检查以 `native_draw_lost_8` 拒绝整批。9 个 Main 全部释放，没有安装或拼接局部回执。

前 8 组仅供定位开销。二层第一轮的有效局部数据如下；它们不是三次重复的完整性能结论：

| 二层第一轮 | 旧网格 process scope 均值 | 当前美术 process scope 均值 |
| --- | ---: | ---: |
| 静止 | 0.288625ms | 0.520125ms |
| 跨帧移动 | 0.278125ms | 0.699250ms |

当前美术仍超过既有静止 `0.5ms`、移动 `0.6ms` 的绝对门槛，静止增量也超过 `0.1ms`。不能把此前开销问题归结为失焦，也没有放宽阈值。后续需要先针对可复现热点取得前后证据，再完成四层完整矩阵。

原生目录为 `.run/map-performance/phase558-visible-native-20260919/earth_vein_cave_visual_v1/`，`partial-diagnostic-summary.json` 是从原日志生成的失败批次诊断摘要。系统电源记录表明 Godot 运行时已持有阻止空闲显示睡眠的 assertion，现有证据不支持把自动熄屏认定为根因；没有修改电源设置。

## 验证与收尾

```sh
python3 -B -m unittest discover -s tools/test -p test_map_performance_batch.py
python3 -B -m unittest discover -s tools/test -p test_run_map_visual_performance_evidence.py
node tools/run_godot_auto_checks.mjs --parse-only
```

工具回归 `10/10 + 11/11`，隔离解析 `1/1`；解析摘要 `.run/godot_auto_checks/2026-09-18T18-32-23-759Z_summary.json`。原生正向样本验证了绘制计数边界，真实不可绘制样本验证了拒绝和清理。未修改正常运行代码，因此不将本阶段写成游戏性能优化或画面改善。

全部本轮进程结束，官方 QA lane 已清理，真实玩家目录 SHA-256 保持 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。Phase 557 的 107 项候选证据继续保留，旧性能文件未重标为当前通过；美术接受及正式发布仍未完成。
