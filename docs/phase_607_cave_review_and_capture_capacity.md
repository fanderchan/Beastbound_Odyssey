# Phase 607：洞窟复审与捕捉容量提示修复

日期：2026-09-21。基线 `8b1f1671636ace4a2ff8d61fde310d9f8fe031e3`。继续 R1.W025，完成本轮四层／地标展示片和长返程的视觉检查，修复实际画面暴露的战斗容量提示问题。

## 捕捉提示的问题与修复

长返程中，自动战斗的“随身 1/5、兽栏 0/20”浮在战场中间。旧宿主按人物／捕捉菜单重设 `visible`，没有排除自动模式；正式指令视图复用布局缓存时，已经隐藏的文字因此被重新打开。原生独立复现的 45 个实际绘制帧全部出现误显示。

首次排除自动模式后，实机复核又确认两个同源布局遗漏：人物菜单没有安排容量行的位置，取消自动后仍留在指令容器原点；捕捉子菜单背景的绘制顺序晚于容量文字，导致文字被盖暗。本阶段一起关闭这三处问题。

- `Main` 继续依据既有容量模型与可捕捉目标决定是否需要显示，通过窄接口交给 `BattleCommandAwakenedView`。自动模式不显示容量行。
- 正式视图保留显示请求，并在菜单／尺寸变化后恢复布局；人物容量行紧邻底部指令上方，捕捉子菜单仍放在面板底部，文字绘制在背景之上。取消自动、进入捕捉、返回人物和切到宠物指令均覆盖。
- 文字不接收鼠标输入；原有按钮、容量数字、满位禁用、捕捉消耗、自动策略与服务端结算规则不变。没有新增轮询、逐帧扫描、玩法字段、素材或协议。

参考意图来自已经核实并实施的 [Phase287 容量合同](phase_287_capture_capacity_and_background_reconciliation.md) 与 [Phase397 正式战斗指令](phase_397_battle_command_awakened_host.md)：玩家在手动捕捉时看清剩余空间，自动状态保留“宠／主／取消”。本次恢复既有行为，不推断 StoneAge 客户端未核实的布局，也不引入新的捕捉规则。

## 当前四层与地标画面

修改前在 `b6ff8fda…` 运行内容上重新采集原生及 MovieWriter 两条路径，九个片段逐像素配对通过。只启动两个原生窗口；四层是编排的展示片段，不是连续点击上下楼的证明。

| 影片 | 时长／帧数 | 实际查看范围 |
| --- | --- | --- |
| 四层展示 | 64.4 秒／1932 帧 | 全部解码后按完整 RGB 像素去除完全重复帧，896 个不同画面组成 56 页，逐页查看 |
| F4 双地标 | 8.333 秒／250 帧 | 213 个不同画面组成 14 页，逐页查看 |

审片页中的画面是 320×180 缩图；另实际查看 F3 静止、F2 移动、F4 地标三张 1280×720 原生图。这个覆盖口径不能写成每一帧都做了全分辨率人工播放。四层片含 960 个离线停格帧，地标片含 120 个采集期停格帧，均保留原始时间线说明。

本轮展示路线未见新增人物比例突变、网格回退、名称挡住主控人物或地标名称截断。近台遮挡透明和名称避让均可见。内部判断是可继续试玩与补齐最终证据；地面纹理重复、场景细节偏稀仍限制成品观感，不能据此签收商业美术。路线边缘有远处队友／环境触及画面边界，未宣称整张地图所有物件始终完整可见。

## 长返程如实保留失败

同一修改前运行内容完成了一轮五账号流程：守护战胜利、F3 三场普通遭遇胜利、F2 第四场普通遭遇战败，随后关闭失败提示，沿 F2→F1→村口正常返回。最终主控人物为 1 HP。原始严格检查要求途中全部胜利，因此退出码为 1，错误为 `Cave journey includes an escaped, lost or timed-out battle`；没有把走到终点等同于全胜通过，也没有改规则或提高生命值来改写本轮结果。

- 五个房间共 100 次实际回合播放开始／完成，全部对应；不能把服务端关闭房间的回合游标相加当作播放回合数。
- 33 次跨帧输入，28,720 个连续绘制帧，零缺失帧；一次 WS 建连、1794 次就绪观察，无 429 或重试。
- 五账号各获得地之戒 1 枚、石币 2227，revision 从 102 到 107；失败房间没有伪造胜利奖励。
- 原始录像完整保留。由于严格返程门失败，正常工具没有继续产出成功影片；另在独立诊断目录转码为 959.4 秒、28,782 帧的 MP4，完整音视频解码和时间戳核验通过。影片帧数包含 Theora 显式重复包与尾帧，不等于上面的 Main 绘制帧数。
- 依据 0.5 秒状态抽样，选取路线各格首次出现、切图边界和战斗首／中／尾，共 119 个画面、30 页，全部实际查看。这是长片的定点审查，不是声称逐帧看完约 16 分钟影片。下一场战斗的已查看入口帧没有残留旧奖励层；失败结算和继续行走画面正常。

这轮仍是既有高生命 QA 夹具：人物 10,400 HP、Lv100 自然成长战宠、一个真实 Main 与四个 HTTP 队友。它验证联机播放、结算与路线恢复，不能代表正常难度、五真人操作或 200 人容量。没有把这次失败直接归因于游戏平衡错误。

采集期间 4063 个跟踪源文件未变；隔离内存后端已停止，官方 QA lane 已清理，真实玩家目录指纹未变，未操作真实 MySQL。运行结束状态 `cleaned_after_trusted_product_failure` 保留原意。

## 修复验证

最初新增的自动模式回归在旧代码上出现六项错误（人物／捕捉上下文各连续同步三次）；这些是同步调用，不冒充六帧输入。最终定向套件 **5/5 PASS**：解析、正式指令 UI、捕捉工具、实际捕捉、自动攻击。新 UI 检查还通过跨帧点击打开／返回捕捉菜单，核对容量行位置、背景遮挡、输入穿透、切换宠物后隐藏，以及布局缓存不重复重建。

捕捉工具检查同时修正一条过时断言：Phase397 已将 `help` 槽改为“援助”，旧检查仍要求旧“精灵／捕捉”帮助说明；现在核对既有“当前编队没有可触发的援助技。”及人物指令状态。未改变产品行为，首轮旧断言失败日志保留。

原生正常 1280×720 Main 的最终复核使用四次跨帧左键：开启自动、取消、进入捕捉、返回。自动模式 45 个绘制帧误显示由 **45→0**；人物菜单容量行在底部指令上方，子菜单文字清楚地位于面板之上，返回后位置恢复。四张最终截图均实际查看。该小场景沿用既有三演员占位 UI 夹具，锁住自动提交等待，只验证控件；不把它冒充完整洞窟战斗或宠物美术验收。

前后 headless 性能套件包含静止、跨帧移动、移动连点、商店选择和属性连点。最终数据见下表；这些分段耗时不代表正常前台整进程 CPU、完整 48 组地图门或多人容量。

| Main `process_total` | 修改前中位数／P95 | 最终修改后中位数／P95 |
| --- | --- | --- |
| 静止 | 0.5185／0.543 ms（52 次采样） | 0.471／0.529 ms（51 次采样） |
| 移动 | 0.524／0.565 ms（8 次采样） | 0.339／0.384 ms（9 次采样） |

前后性能各 **5/5 PASS**。修改后静止仍有一次 `1.170ms` 峰值，修改前最大 `0.569ms`；不以中位数较低宣称本修复提升性能。移动压力前后分别产生 37／35 次实际接受的点击、74／70 个鼠标事件，最终位置匹配、点击合并与停步通过，最大输入耗时 `5→2µs`。样本数量与负载不同，不宣称速度提升百分比。

没有运行无关服务端测试或全量 CI。所有本阶段测试进程、原生 Main、音频、后台请求和 QA lane 均按归属清理，真实资料未变。

一次新增菜单往返检查误用旧 `run` 槽作为返回按钮而失败，已改为真实可见的“返回”按钮并验证跨帧送达；最终 5/5 结果来自修正后的检查，失败原件未覆盖。

## 身份、边界与下一步

展示片和长返程采自基线 `8b1f167…`，运行指纹 `beastbound-map-runtime-surface-v2:b6ff8fda20d63c6397c731e26d272df0808c1d0742a5448d1798c42390a21ca8`。本次修复后的运行指纹为 `beastbound-map-runtime-surface-v2:e9d93013ecd418761ee177751fc727bd109c3ced8d7b81f36e5c52fc2f1a74c8`；原生控件复核绑定后者，不能把前面的影片改标成修复后录片。

本轮修复前严格 bundle 审计仍为 FAIL，20 份历史动作的五类绑定共 100 项过期。源码随后变化，该数量不是最终源码的新一次审计结果。176 个候选文件保持原字节，未安装正式证据、未提升资源、未改变所有者接受状态。

下一步按稳定源码重新采集并配对必要的画面、动作和性能证据，补齐成功返程；本次四胜一败原件继续作为失败恢复记录。R1.W025、P2.1a 仍未勾选，候选保持 `owner_review_pending / pending / releaseApproved=false / runtimeEnabled=false`，全局发布仍为 BLOCKED。

## 复跑与本地证据

```sh
node tools/run_godot_auto_checks.mjs --only=--auto-battle-command-awakened-ui-check,--auto-capture-tools-check,--auto-battle-capture-check,--auto-battle-auto-attack-check --fail-fast --timeout-ms 180000 --output-dir .run/godot_auto_checks/phase607-capacity-layout-verified
node tools/run_godot_auto_checks.mjs --performance-suite --timeout-ms 180000 --output-dir .run/godot_auto_checks/phase607-layout-after-performance
python3 -B .run/phase607-working/capacity_native.py phase607-capacity-layout-native-after
python3 -B tools/record_earth_vein_review_batch.py --run-id phase607-cave-review-20260921 --godot '.run/phase584-native-review/Beastbound QA.app/Contents/MacOS/Godot'
python3 -B tools/play_guardian_review.py --godot '.run/phase584-native-review/Beastbound QA.app/Contents/MacOS/Godot' --autoplay --cave-journey --record --timeout-seconds 1800
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
git diff --check
```

复跑需换新的唯一输出目录；`.run/` 脚本是本机诊断辅助，不作为可移植产品工具提交。

- [审片观察](../.run/phase607-working/visual-observations.json)、[地图配对核验](../.run/phase607-working/visual-verification.json)、[长返程诊断](../.run/phase607-working/journey-diagnostic.json)。
- [最终原生回执](../.run/phase607-capacity-layout-native-after/summary.json)、[自动模式](../.run/phase607-capacity-layout-native-after/automatic.png)、[捕捉菜单](../.run/phase607-capacity-layout-native-after/manual-capture.png)、[返回人物](../.run/phase607-capacity-layout-native-after/returned.png)。
- [最终定向日志](../.run/godot_auto_checks/phase607-capacity-layout-verified/2026-09-20T23-39-13-728Z.log)、[性能对照](../.run/phase607-working/performance-comparison-final.json)、[本阶段验证汇总](../.run/phase607-working/verification-summary.json)。
- 四层 MP4 SHA-256：`ca7b41f60035e8753bf2c28e05afc7236ab4decd3c67c125c8bb65d125071a35`；地标 MP4：`65c18b624c497072b05e9e866d407bed0f9a6fb663e67dfc95c3204c588b8445`。
- 长返程原始 OGV SHA-256：`85e120ae74fc23f13ee3fda6dc47128c98dcba560f3a01409e5ec48351773747`；独立诊断 MP4：`434a009cd5c3fe6d3e0a44d8985599c6ed516af78fb65dedb7b23a33e4ca2db1`。
