# Phase 564：静止玩家定时刷新后保持同屏可见

日期：2026-09-19。承接 Phase 563 同屏人物外观，在五人试玩收口中复现并修复静止角色消失。R1.W024 继续进行。

## 问题与行为依据

普通客户端每 10 秒调用一次在线位置刷新，默认构建器却发送 `scope=map`。服务端按既定合同把它转换成地图级公开状态，向附近观看者发送 `remove`。因此人物刚移动时能看见，静止刷新后会消失，实际权威格子并没有变化。

这不是素材丢失，也不是服务端坐标被清空。隔离服务复现记录为 `beforeVisible=true / afterHeartbeatVisible=false / deltaChange=remove / actualPositionUnchanged=true / persistentWrites=0`，见 `.run/phase564-before/reproduction.json`。

本地 StoneAge 行为参考仍为 `gmsv/src/char/char.c` 的角色对象投影：地图中的角色以位置、朝向和外观一起展示。只采用同屏角色应持续可见的行为意图，没有复制代码、数值或资产。Phase 254 和 Phase 316 的显式地图级隐私与本人精确位置合同继续有效；此次纠正普通世界刷新误用该模式。

## 修改范围

- `_current_online_map_payload()` 的普通世界刷新范围改为 `aoi`，继续使用原有坐标、朝向、移动状态和范围。初次同步、定时同步、切图与其他复用该构建器的正常游戏操作保持精确的附近可见性。
- 保留原有 10 秒间隔、请求合并、权威格子选择、服务端位置校验和 AOI 边界。没有新增逐帧请求、持久化操作、协议字段或服务器规则。
- 显式 `scope=map` 仍隐藏他人坐标。服务端本人响应继续返回精确位置；没有增加玩家可操作的隐身功能。
- 扩展现有 `--auto-online-position-live-check`，由独立 `online_presence_refresh_check.gd` 维护第二条真实 WebSocket 和旁观缓存，验证实际 HTTP 刷新、增量、隐藏与恢复。协调器只负责接线。
- 联机夹具改用当前正式注册、创建角色、选角流程，避免依赖早期注册即有角色的旧假设。首次连接可能早于初次位置响应，检查等待权威 rebase/delta，不再把短暂空 snapshot 判成最终失败。
- 往返切图检查同步验证新的默认范围，原有真实跨帧点击与到达格断言保留。

没有修改地图、人物像素、比例、相机、候选开放开关或真实玩家档案。

## 回归结果

修改生产代码前，`.run/godot_auto_checks/phase564-red-live-v5/2026-09-18T21-09-55-287Z.log` 中原有检查全部通过；新增旁观检查在第一次定时回调后失败，`visibleAfterRefresh=[false]`。早先 v1/v2 的启动配置错误、v3 的测试批量事件名错误和 v4 的初始快照竞态均保留为诊断记录，不混作最终基线。

修复后 `.run/godot_auto_checks/phase564-green-live/2026-09-18T21-10-30-634Z_summary.json` 为 `5/5`：解析、联机位置、地图往返、相机点击、地图运行表现全部通过。旁观结果为：

```json
{
  "visibleAfterRefresh": [true, true, true],
  "timerCallbacks": 3,
  "timerIntervalSeconds": 10.0,
  "mapOnlyHidden": true,
  "restored": true,
  "httpVisible": true,
  "errors": []
}
```

此处直接调用真实 Timer 回调以加速回归，并不是等待三个完整的 10 秒周期。第二个账号通过真实 WS 收取并应用服务器增量，HTTP AOI 名册同时验证格子和外观字段。两个账号使用独立 loopback 内存后端，任意测试格只在该后端显式允许；正常服务校验未放宽。

执行命令：

```sh
git diff --check
node --test server/node/test/auth-social-world.test.js server/node/test/online-presence.test.js server/node/test/online-player-appearance.test.js
python3 -B .run/phase564-run-client-check.py phase564-green-live --only=--auto-online-position-live-check,--auto-map-transfer-check,--auto-camera-click-check,--auto-map-visual-runtime-check --fail-fast
```

本机忽略目录中的包装器仅负责建立临时内存后端，设置 `BEASTBOUND_AUTH_SERVER_URL`，调用正式 `tools/run_godot_auto_checks.mjs` 并排空关闭后端；不属于玩家启动入口。服务端 `48/48`，日志 `.run/phase564-server-tests.log`。

后端记录恰好七次位置请求：两个初始位置、三次定时回调、一次显式隐藏、一次恢复。七次均 HTTP 200、各次持久化写入均为 0；四次正常 AOI 刷新约 `1.019–1.226ms`，仅为本轮 loopback 小样本，不是容量承诺。总计六次 store save 来自注册和角色准备。记录见 `.run/phase564-green-live/metrics.json`，关闭状态 `drained`。

## 性能与剩余验收

前后使用相同 Main、二层候选、四个远端样本、180 帧预热及 480 帧测量；移动检查各包含 60 次跨帧点击、120 个真实输入事件，全部接纳且最终目标一致。

| 场景 | 修改前 process_scope 均值 ms | 修改后均值 ms |
| --- | ---: | ---: |
| 四个远端样本，静止 | 0.043125 | 0.042250 |
| 四个远端样本，移动 | 0.114000 | 0.115750 |

结果近似原水平，不声称加速。完整记录 `.run/phase564-performance.json`；这些是 headless 固定步长脚本诊断，不代表原生 FPS、真实联网负载或 200 人容量。未改动的渲染素材仍参考 Phase 563 原生展示；锁屏下未补做当前客户端的人工点击、上下骑和切图视觉验收。

所有本轮测试进程与临时后端均退出，QA lane 清理且真实用户目录哈希保持 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。107 项既有地图候选文件和四项历史证据逐文件校验不变。四层原生性能、当前版本精确画面及老板视觉验收仍待完成；R1.W024、R1.W025 和 P2.2b 不勾选。
