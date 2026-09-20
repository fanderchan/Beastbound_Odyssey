# Phase 594：真实鼠标战斗与部分返程核对

日期：2026-09-21。继续 R1.W024。真实 Computer Use 已完成守护战、两场普通遭遇胜利、超时返回及三次正常逃跑，并依次走到四层、三层、二层、一层。最终停在一层 `(15,11)`，**没有到达火芽村，完整鼠标返程仍未通过**。本阶段代码仅改专用 QA 入口，不修改玩法、素材、正常客户端热路径或性能阈值。

## 实际操作和权威结果

运行基线为 `af8df431e9b5a29273c9f6b0f2d54e90776ef0a2` 加本阶段手动试玩启动时的一次激活请求。没有使用 `--autoplay`。使用既有的一次性内存后端、一个真实 Main、四个 HTTP 测试队友及 10400 HP 路线人物；战斗中照常受伤，未补血或直接结算。该配置不代表五真人联机、正常难度或正式美术接受。

通过小地图中的守护兽目标打开挑战，两轮分别点击人物／战宠防御，再点击游戏内自动战斗。守护战胜利后，用小地图出口逐层寻路，途中遭遇按实际结果记录：

| 地图 | 实际结果 | 权威已结算回合数 |
| --- | --- | ---: |
| 四层 | 守护战胜利 | 11 |
| 三层 | 第一场普通遭遇胜利 | 16 |
| 三层 | 第二场普通遭遇胜利 | 27 |
| 三层 | 取消自动后等待指令超时 | 2 |
| 二层 | 第一场正常逃跑 | 1 |
| 二层 | 第二场正常逃跑 | 1 |
| 一层 | 正常逃跑，未继续到村口 | 1 |

房间的下一回合编号不是已完成回合数。7 个关闭房间共 59 次服务端结算，Main 的 59 次开始和 59 次动画完整结束逐项匹配，无漏播或重复。超时关闭及逃跑没有冒充胜利，也没有套用要求全胜的 Phase 592 自动返程验证器。

五份最终权威档案均有地之戒 `+1`，石币 `120 → 1871`；档案版本依账号为 `102 → 108 / 108 / 107 / 109 / 108`，未强求不同账号的版本相同。6782 次 ready 采样保持一条健康事件连接、零重试；2192 次战斗采样包含 98 次关闭房间后的播放观察，均保留正确战场及准备好的纹理。4591 次世界采样均保留四层候选贴图和 `1.52×` 相机。

原始输出见 [本轮目录](../.run/guardian-review/20260920T162509.146004Z/)、[逐回合记录](../.run/guardian-review/20260920T162509.146004Z/turn-playback.ndjson) 与 [独立核对摘要](../.run/phase594-cave-mouse/verification-summary.json)。录制期间冻结的 567 个客户端／服务端／工具源码文件逐字节不变。

## 保留误操作与窗口失败

原始 Computer Use 共 65 次调用、55 张图片，包含两次 `js_reset` 和两个错误调用：三层出口点击返回 `noWindowsAvailable`；随后尝试的可选 `launch_app` API 在本机不存在。重新绑定同一客户端后，操作一度恢复，未重启游戏或替换本轮记录。

第一次寻找守护台时点到重叠队友菜单，随后通过既有地图目标进入挑战。二层先误把人物指令区的帮助按钮当作逃跑，两次点击未提交逃跑；核对指令布局后点击正确的脚印按钮，服务端确认 `escape`。这属于本轮操作错误，不作为已复现的按钮故障。

最后一层逃跑点击生效，服务端和 Main 均回到世界；但原生窗口图像停在 MovieWriter Frame `64358`。重新绑定、Raise 和窗口菜单均没有恢复新画面，故未继续盲点，也未把内部截图当成可操作窗口证据。正常停止本轮后，最后 Main 状态仍是一层 `(15,11)` 和“已逃离战斗”。

原始工具记录 SHA-256：`fc155aabf9f7f0c55b3ba3d444c45978eb45f64a2425332caa187e5602940221`，见 [调用与图片索引](../.run/phase594-cave-mouse/computer-use-index.json)。包括错误、重置、误点击及停画图像，未裁掉失败过程。

本轮发生 `44645` 次不可绘制窗口的后台补绘，完整绘制核对没有缺帧。补绘明确不呈现到原生窗口，因此**录像连续不等于窗口可操作**。旧记录没有每次采样的焦点状态，不能据此精确归因于锁屏、系统窗口管理或工具缓存。

## 专用试玩入口的诊断补充

手动入口在准备完成时仅请求一次窗口激活，自动入口不请求，游玩期间不抢回焦点。该行为与性能准备页已有做法一致；实际长流程仍出现停画，不能称为已修复窗口问题。

随后给 `state.json`、`states.ndjson` 和结束状态增加 `nativeWindow`：`focused`、`canDraw`、`renderLoopEnabled`、`drawnFrames`。只在现有低频 QA 采样中读取，不进入玩家 HUD 或运行热路径。`drawnFrames` 包含后台补绘，不能单独证明原生呈现或 Computer Use 图像新鲜。

新增字段之后单独运行 60 秒超时的短原生检查：68 个状态样本中，启动一帧未聚焦但可绘制，后续 67 帧聚焦且可绘制；渲染循环一直开启，绘制计数从 1 增到 1049。该检查没有战斗或鼠标操作，仅验证字段及生命周期，见 [窗口状态短测](../.run/phase594-cave-mouse/window-state-probe.json)。不能把这份短测的窗口字段补进前一份长流程原始证据。

## 验证与后续

```sh
node tools/run_godot_auto_checks.mjs --parse-only
python3 -m unittest tools/test/test_play_guardian_review.py tools/test/test_guardian_review_journey.py tools/test/test_guardian_review_media.py
python3 tools/play_guardian_review.py --godot '.run/phase584-native-review/Beastbound QA.app/Contents/MacOS/Godot' --cave-journey --record --timeout-seconds 1800
python3 .run/phase594-cave-mouse/validate.py
python3 tools/play_guardian_review.py --godot '.run/phase584-native-review/Beastbound QA.app/Contents/MacOS/Godot' --cave-journey --timeout-seconds 60
git diff --check
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

解析 `1/1`、Python `14/14` 通过。临时离线脚本初次错误地要求战斗时也采用世界 `1.52×` 镜头，2192 个正常战斗 `1.0×` 样本使断言失败；改为只核对世界镜头、独立核对战场后，对同一份原始记录通过，失败原因另存，产品与原始证据未改。

两个原生客户端、测试后端及官方 QA lane 均正常清理，真实玩家资料哈希不变；原有 107 项地图候选修改与 111 项保护文件保持原字节，用户原先的 Godot 进程保留。[完整录像](../.run/guardian-review/20260920T162509.146004Z/guardian-1x.mp4) 与原始 Theora 包时间线一致，`108590 frames / 3619.666667s / 1280×720 / 30 FPS`，全片音视频严格解码通过，SHA-256 为 `cf5523f731215199b154f3f9031b6be8f0a8e2c597f74dd5bb090b9db335699f`。这里的时长是固定 30 FPS 引擎录制时间线；不可绘制期间进程可能加速推进，不等于约 30 分钟实际墙钟操作时长，也不能用于 FPS 或操作延迟评估。录制与编码进程均已退出。

这轮增加了当前真实鼠标的胜利／超时／逃跑覆盖，没有运行时性能修改。Phase 579 正式静止增量 FAIL 仍有效，未重跑无运行时代码变化的昂贵矩阵。下一步结合窗口状态定位原生停画，补完整鼠标返村和精确动作证据；正式性能、精确重冻及所有者美术接受仍未完成，P2.1a／R1.W024 不勾选。
