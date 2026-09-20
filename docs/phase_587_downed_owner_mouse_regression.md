# Phase 587：双倒地鼠标复验与长片结束边界

日期：2026-09-20。继续 R1.W024。当前源码的主控双倒地后结算通过真实鼠标复验；连续出洞只到二层，另发现战斗中背景退回灰底，需要继续定位，不能宣布视觉验收完成。

## 主控双倒地后的联机结算

基于 `0028338608744d0cf02bda41ae42ad02cf1de32d` 运行 `play_guardian_review.py --downed-owner-check --record --timeout-seconds 600`，未使用 `--autoplay`。原始记录位于 `.run/guardian-review/20260920T081537.513187Z/`，独立核对摘要位于 [.run/phase587-downed-owner-review/](../.run/phase587-downed-owner-review/verification-summary.json)。

- Computer Use **8 次调用／7 张图片／零工具错误**，实际左键打开地图、选择守护兽、挑战、启用正常自动战斗、返回后打开背包。原始调用 SHA-256：`c16fc0d5b0b5264272ddc91e579c869877c10adbe3e3006a6d64282706085989`。
- 34 次 Main 状态采样观察到主控人物和战宠都 `hp=0` 且未击飞，包含第 2 与第 9 回合；对应录像帧 `12801` 与 `13329` 已提取检查。服务器完整结算 **10 回合胜利**，客户端收到并返回四层。
- 五账号各获地之戒 `+1`、石币 `+205`；主控 revision `103→104`，其他四人 `102→103`。背包中戒指及石币已由鼠标打开核对。
- 一次事件连接，零拒绝／重试；19568 个逻辑观察帧零缺画。原生游戏源码在运行前后保持一致，后续仅修改转码结束边界。
- MP4 **19630 帧／654.333333 秒／1280×720／30 FPS**，严格解码与源时间线通过。SHA-256：`a40072bdc309007d75a590d2e0678460d6626fa96c4258700ed26fc1d8c459ab`。录片固定步长与真实操作耗时不同，不作性能证据。

但第 9 回合的录像中战场背景曾变为灰底；当时 Main 的 `arenaEvidence` 仍返回岩脉圣所待审素材。下一步必须检查实际绘制状态，不能仅凭配置或结算通过接受画面。相关帧保留于上述摘要目录的 `both-downed-late.png`。

## 连续下楼的实际范围

另起同版本 `--cave-journey --record --timeout-seconds 600`，记录 `.run/guardian-review/20260920T082331.741337Z/`，摘要见 [.run/phase587-cave-journey-review/](../.run/phase587-cave-journey-review/verification-summary.json)。

真实左键完成 **F4→F3→F2**，地图美术与人物比例保持。向一层行走时先出现“队伍或位置已经变化，请继续移动后重新触发遇敌”，重新选择路线后进入二层普通遭遇；使用逃跑指令，服务器以 `escape` 关闭，客户端显示“已逃离战斗”，正常关闭结算。

测试随后达到预设时限并正常回收。最后一次点击在客户端退出后遭到工具拒绝，原始记录为 **14 次调用／12 张图片／第 14 次错误**；不能写成全程零错误。调用原始 SHA-256：`b4092f61157178ddd601181b14e9f12f8b8823050c6668dd61176239395339e9`。**尚未完成一层和洞口**，不把部分路线当作全通关。

## 录片结束边界修复

这份长片有 28798 个逐一连续的 Theora 视频包，末尾 61 个包明确重复前一帧。FFmpeg 在最后一个有图像数据的帧恰好是关键帧时，可能按关键帧间隔推断片尾时长；旧转换再展开末尾重复包，得到 **28861 帧，多出 63 帧**。Phase 586 的帧数门正确拒绝，没有误报通过。

转换现以已经验证的视频包数裁定结束位置，仅裁去推断出的片尾延长，不改变任何有效源帧、输入时间戳或录像速度。原失败目录与 `.partial.mp4` 保留；用同一原 OGV 在 `media-eof-recheck/` 独立复证，**28798 帧／959.933333 秒**，全音视频解码和帧数检查通过，MP4 SHA-256：`bc12744dbc8b95d6facbba030c9bb0ef7ddd917a5d62a1db2eb8d0c740301ffc`。

```sh
python3 -B -m unittest tools/test/test_guardian_review_media.py tools/test/test_play_guardian_review.py
git diff --check
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

Python **11/11**；真实长片保留修改前失败与修改后通过的对照。两次客户端／后端／QA lane 均清理，真实玩家资料和 111 项保护文件保持不变。未修改正式玩法、GDScript 或美术资产，未运行无关全量 CI。R1.W024、P2.1a、正式静止性能及美术接受继续未完成；优先定位灰底，再继续完整出洞。
