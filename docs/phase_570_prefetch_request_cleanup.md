# Phase 570：战斗贴图请求的退出回收

日期：2026-09-19。继续 R1.W024 的实机验证时，复现了关闭守护战客户端残留四个 ObjectDB 对象的问题。本阶段修复后台贴图加载请求的生命周期；玩法、人物比例、地图画面和资产开放范围保持既有合同。

## 原因与修复

普通试玩与带 `--verbose` 的独立复现均在完成现有音频清理后报告四个 `RefCounted` 残留。详细日志显示，客户端退出时仍有战斗贴图加载完成，但预取节点已不再领取结果。

当前 Godot `5b4e0cb0f` 的 [ResourceLoader 源码](https://github.com/godotengine/godot/blob/5b4e0cb0f/core/io/resource_loader.cpp#L661-L665) 为每个成功提交的线程请求保留所有权；[领取结果](https://github.com/godotengine/godot/blob/5b4e0cb0f/core/io/resource_loader.cpp#L860-L923) 才释放这份所有权，失败请求也需要领取。此前预取器只领取成功结果，并缺少节点退出处理。

`BattleTexturePrefetcher` 现在先取消未提交队列，再在离开场景树时领取已提交的最多四个请求并释放引用。正常切图的 `cancel()` 仍由后续帧异步排空；运行中的 `pump()` 继续跳过尚未完成的读取，失败读取则领取后计入失败数。只有节点退出会等待剩余本地文件请求。单帧预算、并发上限、纹理缓存和素材权限不变。

## 验证

- 新增回归先在旧实现上复现失败：失败请求未回收、退出遗留请求以及重复退出检查均报错；原日志保留在 `.run/godot_auto_checks/phase570-prefetch-red/`。
- 修复后解析、战斗阵形／预取、四套人物和地图运行检查 `4/4` 通过，目录 `.run/godot_auto_checks/phase570-prefetch-green/`。覆盖正常取消不等待、退出只领取自己的已提交请求、重复退出不重复领取。
- 原生 Metal 检查实际请求十二张纹理，再创建四个尚未领取的引擎请求并销毁节点；四个请求均变为未持有状态，日志无退出泄漏，官方隔离目录正常清理。证据 `.run/phase570-prefetch-native/evidence-drained/`。
- 相同的 60 秒启动器超时配置，在修复前报告四个泄漏，修复后干净退出。原件分别为 `.run/guardian-review/20260919T044154.613938Z/` 与 `.run/guardian-review/20260919T044556.018901Z/`；汇总和日志 SHA-256 保存在 `.run/phase570-before/shutdown-results.json`。
- 当前普通时钟的完整原生守护战通过：一个 Main 加四个 HTTP 队友，14 次自动跨帧输入，覆盖人物倒下后宠物继续指令、权威胜利、地面及四套人物恢复；五个账号均 `revision 102→103`、地之戒 `+1`、石币 `+204`。首次准备 `16.060ms`，1620 张纹理就绪、加载失败为 0；退出无泄漏，后端及隔离目录清理。证据与 13 个运行前后相同的源码哈希见 [本轮汇总](../.run/guardian-review/20260919T044840.325580Z/evidence-summary.json)，最终画面见 [战后地图](../.run/guardian-review/20260919T044840.325580Z/autoplay-final.png)。这是自动实机输入，没有冒充人工鼠标或五真人联机。

原生检查首次直接使用原有自动阵形退出入口时，预取断言通过，但退出仍报八个对象／四个资源残留，整次判为失败并保留在 `.run/phase570-prefetch-native/evidence/`。该入口没有执行审片音频清理；最终专用诊断复用现有 `RuntimeExitCleanup.drain_audio()` 后再释放 Main，没有忽略资源警告或放宽检查。

可重跑的定向命令：

```sh
git diff --check
node tools/run_godot_auto_checks.mjs --only=--auto-battle-formation-check,--auto-character-runtime-appearance-check,--auto-map-visual-runtime-check --fail-fast
python3 -B tools/play_guardian_review.py --timeout-seconds 60
python3 -B tools/play_guardian_review.py --autoplay --timeout-seconds 600
```

## 仍待完成的实机验收

本轮前台矩阵在第二组出现 87 个失焦帧后按原门槛失败，两个 Main 均释放；失败目录 `.run/map-performance/phase570-current-foreground-20260919/`，没有安装部分结果。人工操作工具能读到测试壳的窗口与画面，但坐标点击连续返回 `noWindowsAvailable`；官方 Godot 入口则被工具绑定到另一个已打开的项目管理器。读取画面与自动 viewport 输入均不算当前鼠标验收通过。

地图运行指纹仍为 `beastbound-map-runtime-surface-v2:683e128d4d357784b0d7aaaad3938ce8d02b66f0624fffe1c8a05b21e42df740`；战斗预取源码的变更另由本轮源文件哈希记录。Phase 569 的地图预览保留，完整动作／鼠标配对、四层前台性能和所有者视觉接受继续待完成，R1.W024／P2.1a 不勾选。

111 项候选／历史保护文件逐项 SHA-256 不变，真实玩家目录摘要保持 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。本轮改动集中于加载失败与退出路径，未修改正常帧循环、输入或绘制；完整试玩覆盖静止、移动和战斗衔接，但没有取得新的有效前台性能矩阵，也不声称稳态 CPU 或 FPS 改善。未运行全量 CI、生产导出或共享数据库检查。
