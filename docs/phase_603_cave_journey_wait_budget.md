# Phase 603：当前渲染路径完整返村与自动检查等待修复

日期：2026-09-21。基线 `138bc7c7de330a2ec54f7a0bdd36139c5ab17e13` 加本阶段 QA 改动。当前 Compatibility 路径完成守护战、两场普通遭遇全胜、逐层返村；与 Phase601／602 的地图、动作和性能证据具有相同运行指纹。R1.W024 收口，进入 R1.W025 受委托复审；P2.1a 和所有者接受仍未完成。

## 等待误判与修复范围

第一轮在三层第三场普通遭遇被固定的 240 秒等待中止。第 28 回合刚完整播完，第 29 回合已开始，十只敌人剩两只；最后两个服务端结算仍有正常攻击、回避和扣血。这是检查时限中断，不能据此判定游戏卡死，也不能推断该场最终会获胜。另一个相关问题是每层 420 秒导航时限把所有战斗耗时也计入。

新增专用 `CaveJourneyWaitBudget`，仅接入洞穴 QA 自动操作：

- 各层导航累计最多 420 秒；战斗不消耗导航额度。
- 只有客户端显示回合前进才刷新进展时间；连续 90 秒无进展仍失败。重复房间数据、阶段切换、HP 动画或绘制帧不能延长等待。
- 使用原启动器从录制开始计算的整轮绝对截止时间，战斗进展不能延长它。取消请求、非权威房间、未结束即换房间、回合或时钟倒退仍失败。
- 报告分别记录每段导航和战斗实际毫秒数。严格返村验证器保持原样，仍拒绝逃跑、失败、超时和跳层。

没有修改正常玩家代码、战斗数值、随机种子、奖励、物品或队伍预置生命。本阶段也修正地图 schema 示例和宠物美术合同残留的 Metal 要求，使其引用 Phase601 已确立的当前默认后端；历史回执保持原字节。

## 当前原生结果

Godot 4.7，实际引擎日志为 OpenGL Compatibility。一个真实 `Main.tscn`、四个经 HTTP 操作的测试账号、一次性内存后端。沿用此前五个人物初始 `10400 HP`、自然成长 Lv100 战宠的路线夹具，全程没有补血或注入结算；结束时五只战宠均已倒下。因此这是完整显示／权威流程验证，不是正常难度或五真人联机验收。

| 项目 | 实际结果 |
| --- | --- |
| 连续路线 | F4 → F3 → F2 → F1 → 火芽村入口 |
| 战斗 | 守护战 10 回合；三层普通遭遇 15、27 回合；三场均胜利 |
| 播放 | 52 个服务端结算；Main 52 次开始／52 次完整结束，零漏播或重复 |
| 操作 | 26 次真实跨帧 viewport 点击，明确 `computerUse=false` |
| 洞穴画面 | 四层均为候选贴图、1.52× 镜头，人物完整轮廓高 122.573–124.762px |
| 战场 | 943 个战斗采样，含 23 个房间已关闭但仍播放的采样，纹理与背景均正确 |
| 连接 | 1076 个 ready 观察，单连接，零重连、拒绝或心跳失败 |
| 五份档案 | revision 均 102 → 105，各地之戒 +1、石币 +1376 |
| 绘制连续性 | 17,232 个检查范围内帧，零缺画；不是性能测量 |

三层这段实际包含 `384890 ms` 战斗和 `15852 ms` 导航。新一轮自然随机遭遇与首轮不同，不能把本次胜利冒充对首轮未完成房间的重放。超过旧 240／420 秒仍推进、卡住和整轮截止等边界由虚拟时钟回归直接覆盖；本次实机负责验证真实输入、战斗、换层和清理接线。

实际查看了二层、一层、村口的原生截图，未出现洞穴换层退回网格或人物缩小。村口继续使用既有 Firebud v2 候选与自身 1.82× 镜头，不代表村口美术已接受。Computer Use 另外观察守护战和普通遭遇：4 次调用／2 张原始图片、零工具错误；只有窗口 Raise，不将这些观察记成人工通关。

原速影片为 **576.466667 秒、17,294 帧、1280×720、30 FPS、H.264／AAC**，严格全片音视频解码、源包时间线和输出帧数一致。648 个 Theora 空包按其真实时间戳恢复重复帧，其中末尾 12 帧；没有凭空补缺失捕获。影片覆盖启动和清理，因此总帧数大于绘制检查范围。

- [完整影片](../.run/guardian-review/20260920T213926.701360Z/guardian-1x.mp4)，SHA-256 `05c4ef50bca98e729e83764761c228dd9217abbccb4bdbd320ea12f2b87d478e`。
- [返村原生截图](../.run/guardian-review/20260920T213926.701360Z/journey-firebud_village_gate.png)、[独立核对摘要](../.run/phase603-recheck/verification-summary.json)、[每场战斗摘要](../.run/phase603-recheck/battle-summary.json)。
- 成功轮次原始 Computer Use 转录 SHA-256 `80b7361a1778d6262240253b6dba003fffc01dc2d17f3f2c5a29b01dbc1f10f4`；它是观察证据，完整操作由自动脚本完成。

## 精确来源、失败保留和清理

地图运行指纹为 `beastbound-map-runtime-surface-v2:cbef22faa06579f683a8a9778395442b61057f0f0744584f86da44a55cf5cf09`，与 Phase601 的 48 组性能、四层／F4 影片及 Phase602 正式动作矩阵相同。841 个客户端、服务端和工具源文件在复测期间逐字节不变；候选发布字段与所有者接受未修改。

首次失败原件完整保留在 `.run/guardian-review/20260920T211937.771206Z/`，分析见 `.run/phase603-working/failure-analysis.json`。首轮结束的实际位置是 F3 `(10,16)`；旧报告继承的 `endMap=F4` 属于先前守护战字段，不能当作最后位置。失败轮次的 4 次 Computer Use 调用／3 张图片和原始 OGV 也保留，转录 SHA-256 为 `6b01358262b9bb43d9844c657b8a609b0432084c6ca9674f46b699f55c851be1`。

两轮客户端、HTTP／WebSocket 后端和隔离目录均已清理；复测后测试端口关闭。真实玩家目录摘要保持 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`，没有改动真实 MySQL 或原有用户编辑器。

## 定向验证与后续

```sh
node tools/run_godot_auto_checks.mjs --parse-only --output-dir .run/godot_auto_checks/phase603-parse --timeout-ms 120000
node tools/run_godot_auto_checks.mjs --only=--auto-rebirth-cave-guardian-check --fail-fast --output-dir .run/godot_auto_checks/phase603-budget --timeout-ms 180000
python3 -B -m unittest tools/test/test_guardian_review_journey.py tools/test/test_play_guardian_review.py
python3 -B tools/play_guardian_review.py --godot '.run/phase584-native-review/Beastbound QA.app/Contents/MacOS/Godot' --autoplay --cave-journey --record --timeout-seconds 1800
python3 -B .run/phase603-recheck/verify.py
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
git diff --check
```

独立解析 1/1，守护战定向检查 2/2（含解析），Python 9/9 通过。新增时钟检查覆盖长战斗、跨战斗累计导航、无进展、整轮截止和身份／时间倒退。游戏热路径与玩法没有改变，不重复已通过的 48 组地图性能或全量 CI；Windows、多人容量与正常难度未在本轮验证。

R1.W024 的当前渲染完整流程现已与 Phase601／602 精确配对。下一步进入 R1.W025；预复查发现连续遇敌时前一场掉落浮字短暂留在新战斗中央，需按 UI 生命周期根因单独处理。已经查看的关键帧不能冒充全片逐帧美术通过，候选仍是 `owner_review_pending / pending / false / false`，不生成所有者批准或发布证明。
