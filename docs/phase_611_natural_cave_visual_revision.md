# Phase611：按所有者选项 2 重做洞穴地表与围合

日期：2026-09-22。制作授权来自所有者对「先把洞穴美术再打磨一轮」的明确选择；这不是对新旧候选画面的接受。

## 改变了什么

岩脉四层原先使用两种高度相近的地表，外围只有四个分散物件。远景会露出矩形边界，近景缺少洞壁。本轮生成十二块原创地表和两种独立朝向的玄武岩长墙，保留原稿、完整提示词、来源记录及确定性的制作脚本。

- 一层使用四种独立的干燥地表纹理；原来按三格聚集的选择改为逐格选择，并匹配基础色，减轻大块重复。
- 二层使用潮湿地表和既有菌群，三层保留更密集的琥珀晶簇。
- 四层通路使用平缓的磨损地面，石板只用于两个共鸣台周边。实机审看否决了铺满石板的试稿，避免重复图案抢占视线。
- 每层增加十六段地图外岩壁，与原有四个边界物件组成围合。两个朝向分别生成，没有镜像复用。每层新增物件均在权威可行走矩形之外，碰撞足迹为空。

正式 `80×40` 菱形网格、世界物件分层、原来 `1.52×` 候选镜头与人物比例保持。地表选择和物件准备仍走原有缓存，没有新增逐帧扫描。六块旧图集单元保留，当前四层绑定改用新材质。

石器参考仅用于既有 tile/object/warp 分离的行为意图，未复制本地参考的源码、地图或素材。本轮没有新玩法规则、经济规则、怪物、交互或传送点。

## 数据与发布边界

四份 `earth_vein_cave*_map.json` 与制作前的 SHA-256 完全一致。楼梯、出生点、阻挡、遭遇和奖励合同不变，服务端无需迁移。

候选继续 `owner_review_pending / pending / false / false`，所有者接受和发布证明为空。普通启动仍未加载候选美术；「选 2」只授权返工，不允许自动把新版投入普通模式。Phase610 关于正常地图访问与候选美术开关的区别仍有效。

原候选全部 166 个跟踪文件保存在 `.run/phase611-working/candidate-before/`，并逐文件校验。旧 Phase608/609 证据保持原运行身份；修改像素后，旧引用先从 manifest 清空；本轮只安装已经通过的新版画面、鼠标与碰撞证据。新版 `performanceReport` 保持空，旧性能报告文件仍保留原身份，不能用于当前画面。

## 已验证与当前剩余

已通过 `git diff --check`、隔离 QA 车道的 Godot 解析、四层层级与边界合同、楼梯和共鸣台镜头构图，以及正式批量 `20/20` 原生动作捕获。图集和两种岩壁可从保留原稿复现相同字节；43 个来源引用哈希一致。像素接入时的只读结构审计为 `61 files / 31 PNG / 6 JSON / errors=[]`；有效证据安装后的正式目录审计为 `164 files / 51 PNG / 28 JSON / errors=[]`，剩余门为完整性能、所有者接受、发布证明及发布开关。

真实鼠标已经完成四层 `20/20` 项点击、寻路、楼梯、矿柱阻挡和遮挡。第一会话由一层到达顶层，记录前三层十五项；电脑工具期间六次返回 `noWindowsAvailable`，原始失败保留且不计入通过。第二会话从顶层默认出生点继续五项，实际到达两座共鸣台、从 `(17,12)` 点击矿柱验证无法进入阻挡格、经楼梯进入三层 `(21,7)`。后续移动均用真实鼠标，没有直接改位置。

两次会话分别为 `48 calls / 33 images` 与 `19 calls / 17 images`，原始记录在 `.run/phase611-manual-actions/` 和 `.run/phase611-manual-f4/`。二者渲染连续性报告均为 PASS，游戏正常退出，QA 车道已清理，真实玩家目录 SHA-256 均保持 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。这是两次明确分开的会话，不能描述为一次不中断的四层往返。

## 当前可看成果与性能缺口

[四层前后对比页](../.run/phase611-working/review/index.html) 提供四个楼层切换、拖动分界线、两侧原图和两支正常速度影片。对比使用旧 Phase609 与本轮原生 PNG，均为 `1280×720 / 1.52×`；角色朝向为实际捕获状态，没有修图。

| 影片 | 实际规格 | SHA-256 |
| --- | --- | --- |
| [四层静止与移动](../.run/evidence/earth_vein_cave_visual_v1_owner_review/phase611-natural-cave-review-20260922/four-floor/earth-vein-cave-v1-owner-review-1x.mp4) | 64.400 秒，1932 帧，1280×720，30 FPS，H.264/AAC | `90b7a293d4d6e3dd025f179a4635e5ee948e7f0aa7979fef922c33afcd64a6f1` |
| [顶层双共鸣台](../.run/evidence/earth_vein_cave_visual_v1_owner_review/phase611-natural-cave-review-20260922/landmark/earth-vein-f4-landmarks-1x.mp4) | 8.333 秒，250 帧，同上 | `109bd7e0261236a7d7402c9deebc2fb490106b1dc1a7e39048f60b7fdf2bee61` |

影片使用一个原生窗口和一个 MovieWriter 窗口，九段确定性对应通过，104 个文件哈希全部复核。四层片含 972 个源帧与 960 个明示停留帧；地标片含控制器内 120 个停留帧，并使用专用地标视点。影片不是实际走完楼梯的证明，该行为由前述鼠标会话验证。

本轮看过正式矩阵二十张原生 PNG，另查看影片八张选定画面的联系表与五张原生全尺寸画面（四层移动、顶层地标）。主控角色、楼梯、遮挡淡化和两个名称均可辨认；这是明确选帧审看，不是逐帧所有者验收。**长围壁轮廓仍有重复，大面积地面仍能看出纹理块，普通启动也仍未启用候选。**

三次性能尝试全部保留，均不能计作新版性能通过：

| 本地 run ID | 结果 |
| --- | --- |
| `phase611-natural-cave-performance` | 未点击原生开始按钮，零样本，`foreground_unavailable`。这是操作遗漏。 |
| `phase611-natural-cave-performance-started` | 已点击开始，在第 22 个样本报告 `native_draw_lost_21` 而失败。 |
| `phase611-natural-cave-performance-awake` | 临时 `caffeinate -d -i -s` 后仍在第 32 个样本报告 `native_draw_lost_31`，失绘 454 帧，焦点仍为 true。 |

没有把残缺轮次拼成 48 组，没有降低前台／可绘制门槛或使用补绘冒充性能样本，也没有改写旧报告。临时唤醒断言已随进程退出，系统偏好未改，三轮 QA 车道均已清理。窗口失绘的根因尚未确认；不能仅凭现象认定为锁屏，也不能将它解释成已证明的地图帧耗时回归。最终样本前的一次 `ps` 为 17.1%（候选移动批次），与脚本过程计时不是同一测量口径；本轮不据不完整数据声称达到普通客户端低个位数 CPU 目标。

**剩余项是稳定可绘制前台窗口下的完整 48 组性能配对。** W026–W028 因这项仍不勾选，所有者外观验收 W029 和普通模式启用也未执行。已完成的图像、代码、鼠标与影片独立保存，下一次从性能补测接续，不再重做素材或盲目重录已有有效动作。

## 当前证据身份

本轮采集基线为 `699dc9ac3a9067b2c5b388d177fe1bd5101f8bcb`，运行内容摘要为 `beastbound-map-runtime-surface-v2:28dbd813cd8e1c24165fcefc1f299970dedd02a6715253b9b4446e057f54a43d`。二十组自动画面、两次鼠标会话、碰撞和影片均属于这一内容。临时 staging 目录曾因找不到所属 Godot 项目而拒绝校验；实际安装后使用未修改的审计器检查正式项目目录通过，没有把 staging 失败记为 PASS。正式 PNG 按字节复制；原始 capture JSON 另存 `evidence/runtime-actions/original-reports/`，安装报告只调整两个截图路径字段并记录原报告 SHA-256，未重写实际输入、测量或构建身份。

## 重现入口

```sh
node tools/run_godot_auto_checks.mjs --parse-only
python3 .agents/skills/design-beastbound-maps/scripts/audit_map_bundle.py client/godot/assets/maps/earth_vein_cave_visual_v1
python3 tools/record_map_visual_action_captures.py --bundle-id earth_vein_cave_visual_v1 --run-id phase611-natural-cave-actions --scratch-only
python3 tools/record_earth_vein_review_batch.py --run-id phase611-natural-cave-review-20260922
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
git diff --check
```

制作命令在 bundle 的 `source/provenance.json`；地表归一化程序为 `source/tools/build_natural_ground_atlas.py`。上列为本轮命令入口，复跑应换新的 run ID；实际 Godot 可执行文件使用本地 QA app，原样 argv 在各次报告中。本机工作记录、各次实际命令、QA 车道收尾与失败日志在 `.run/phase611-working/`。本阶段只做地图表现的定向验证，未重跑全量本地 CI、生产容量或高生命 QA 战斗，也不据此声称可收费上线。
