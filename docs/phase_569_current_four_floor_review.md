# Phase 569：刷新当前四层洞穴与地标审片

日期：2026-09-19。在 Phase 568 地面几何优化提交 `bfca1965e8ab893ddbc174a24b703f622ab13f9e` 上重新取证，不修改运行代码、地图、素材或玩法。当前可直接查看的内容如下；文件位于本机忽略目录，未作为产品源码提交。

| 预览 | 当前证据 | 适用范围 |
| --- | --- | --- |
| [四层洞穴连续审片](../.run/evidence/earth_vein_cave_visual_v1_owner_review/phase569-current-ground-review-20260919/four-floor/earth-vein-cave-v1-owner-review-1x.mp4) | 1280×720、30 FPS、原速、1932 帧、64.4 秒 | 四层各自静止与移动，共八段；不是跨楼层真实鼠标通关 |
| [顶层双地标审片](../.run/evidence/earth_vein_cave_visual_v1_owner_review/phase569-current-ground-review-20260919/landmark/earth-vein-f4-landmarks-1x.mp4) | 1280×720、30 FPS、原速、250 帧、8.333333 秒 | 双共鸣台、人物与遮挡关系 |
| [当前五账号守护战](../.run/guardian-review/20260918T235306.356031Z/guardian-1x.mp4) | Phase 568 实录，4558 帧、151.933333 秒；13 个相关源码文件重新逐项核对，与当前完全相同 | 一个 Main 加四个 HTTP 测试队友；五账号奖励已核实，不代表五真人或平衡验收 |

需要实际操作守护战时，在唯一主目录运行 `python3 -B tools/play_guardian_review.py --timeout-seconds 600`。此命令使用独立临时后端与 QA 角色，四个测试队友自动参与；主控由鼠标操作。不要添加 `--autoplay` 冒充人工试玩，也不要指向日常玩家后端。

## 本轮验证

复用已有两进程录制入口，先取原生截图，再取 MovieWriter 原速片；全程保持系统锁定。本轮用 `tools/play_guardian_review.py` 中现有 `_keep_review_awake()` 上下文包裹以下入口，防止系统休眠中断，退出后释放断言，不唤醒或解锁屏幕：

```sh
python3 -B tools/record_earth_vein_review_batch.py --run-id phase569-current-ground-review-20260919 --timeout-seconds 360
```

原生与录像各 `9/9`，段落顺序、移动起止格、帧数和内容合同一致。两次都由既有离线 render pump 在遮挡窗口中推进真实 viewport：各观察 1478 个完整处理帧，缺少绘制帧为 0；记录明确 `performanceEvidence=false`。这项机制只用于生成画面，不能满足正式性能要求的前台／可见窗口合同。

四层片与地标片完整解码通过，104 项清单文件重新逐一校验 SHA-256 全部相符；启动前、原生结束、录像结束三次运行内容与 harness 身份保持不变。已查看四层代表画面、移动终点、顶层双地标及八格联系表；当前人物比例、地面、遮挡透明与 HUD 延续 Phase 568 的像素一致性结果，未据此替所有者批准美术。

运行内容指纹：`beastbound-map-runtime-surface-v2:683e128d4d357784b0d7aaaad3938ce8d02b66f0624fffe1c8a05b21e42df740`。与 Phase 568 守护战内容相同；该片保留原始提交与源码回执，没有重标日期或改写哈希。

| 文件 | SHA-256 |
| --- | --- |
| 四层 MP4 | `aa1e124501f6cfbc63110c8d8e20d1daa74bf80f0639d41dd61ffcebf5fc8c9a` |
| 顶层地标 MP4 | `88c993b86c6c78148c742176d3822d3c8d7a3e7d2d30733b4b134b22d08be0ad` |
| 本轮 `SHA256SUMS` | `121864217459cd2bbfaa883ba8e08d023ca22fe906c1b23949133683f0127aa9` |

完整输出在 `.run/evidence/earth_vein_cave_visual_v1_owner_review/phase569-current-ground-review-20260919/`，独立复核汇总在 `.run/phase569-before/validation-summary.json`。两个 Godot 进程均 exit 0、进程组关闭、QA lane 清理；真实玩家目录仍为 `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。107 项候选文件和四项历史文件逐项原字节不变。

## 尚未完成的验收

本轮重新核对了 Phase 559 的区段数据，结论与 Phase 562 一致：候选连相同的定时检查区段也整体变慢，现有材料不足以把所有增量归因于某个地图函数或硬件机制。没有再做缺乏新证据的微小优化，也没有放宽计时门槛。

当前完整 20 项动作截图／真实鼠标配对、正常运行的稳态 CPU 和四层前台性能矩阵仍需完成；Phase 559 的正式总评继续 FAIL。旧 Phase 557 人工证据保留为当时观察，本轮九段录制不替代它的操作范围。R1.W024、P2.1a、P2.2b 未勾选，候选继续 `owner_review_pending / pending / runtimeEnabled=false / releaseApproved=false`。
