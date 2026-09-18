# Phase 554：后台审片连续绘制与四层录像重冻

日期：2026-09-19（本轮采集始于 9 月 18 日）。继续 R1.W024，候选生命周期与发布游标不变。

## 结果

当前真实 Main 四层静止/移动与顶层双地标已重新录制：原生截图和 MovieWriter 各 `9/9 PASS`，两轮各覆盖 1478 个完成的逻辑帧，缺少绘制的帧数均为 0。原始 AVI 为 1488 帧，符合逻辑帧范围及一个终止帧的合同；导出保持 1280×720、30 FPS、1× 动作速度。

证据目录：`.run/evidence/earth_vein_cave_visual_v1_owner_review/phase554-render-continuity-review-20260918/`。

| 产物 | 时长/帧数 | SHA-256 |
| --- | --- | --- |
| `four-floor/earth-vein-cave-v1-owner-review-1x.mp4` | 64.4 秒 / 1932 帧 | `efe3d85ff723cedb3d93078fe6c19eda373fb1e1ed50fe97928cf7c3007f3924` |
| `landmark/earth-vein-f4-landmarks-1x.mp4` | 8.333 秒 / 250 帧 | `0a09e49a73b3935c13c56af823e98a175b620e71a90b7c362a259b1151697548` |
| `summary.json` | 两轮采集、帧数和资源身份汇总 | `1b1369f10a96ee80d0f169de58fcf0216ddb52ef338f9cb083e92cad76708a4e` |

媒体、日志、原始报告和 `SHA256SUMS` 留在忽略目录，不作为产品源文件提交。四层成片的 16 个抽帧及顶层原尺寸画面已人工审看：人物、贴图、楼梯透明遮挡和地标呈现连续；这不是老板美术接受，也不代替真实鼠标操作或性能验收。

## 复现与修复

第一次录像在第一层两段完成后停止推进，AVI 仍持续增长。第 800、1200、2000 帧缩小后的像素 MD5 完全一致，窗口显示的绘制帧停在 258。仅终止已核对命令和 PID 的本轮录制子进程，失败文件保留于 `phase554-current-main-review-20260918/`，诊断在 `.run/phase554-movie-stall-diagnostic/`。

[Godot 4.7 主循环](https://github.com/godotengine/godot/blob/4.7-stable/main/main.cpp) 在窗口不可绘制且没有待处理资源时跳过渲染，而 [MovieWriter](https://github.com/godotengine/godot/blob/4.7-stable/servers/movie_writer/movie_writer.cpp) 仍从已有 viewport 纹理写帧。独立原生最小复现中，`Window.can_draw() == false` 时绘制计数和像素停住，逻辑帧继续增加。

新增小型 QA helper `scripts/qa/review_capture_render_pump.gd`，只由已授权的 Earth Vein 审片入口启动，初始化隔离完成后才连接。窗口不可绘制时，在场景处理及待处理 Canvas 更新之后调用 [RenderingServer.force_draw(false, delta)](https://docs.godotengine.org/en/stable/classes/class_renderingserver.html#class-renderingserver-method-force-draw)，更新原 viewport，不要求窗口取得焦点或展示缓冲区。正常可绘制的窗口仍使用原渲染循环。

第一次 helper 的像素回归抓到一帧滞后：`process_frame` 早于节点处理，第一次延后回调可能仍排在节点的 `queue_redraw` 前面。修复为两次延后，使实际绘制排在 Canvas 更新之后。最终最小复现的四个采样点与预期颜色一致；129 个完成帧无缺失，86 次后台补绘，`pixelErrors=[]`。

两轮正式采集各记录起止逻辑帧、后台补绘次数和未绘制帧。Python 同时校验日志及落盘报告中的连续性，拒绝缺失、截短、错误类型、缺帧或冒充性能证据的回执。helper 纳入录制授权和文件哈希范围；本轮原生/录像补绘分别为 `1475 / 1478` 次，均明确 `performanceEvidence=false`。固定帧率离线审片不能说明前台 FPS 或 CPU 表现。

## 动作截图与保留边界

本轮另已完成 20 项自动动作截图，覆盖四层各自的 pointer、movement_path、warp、collision、occlusion。入口为 `record_map_visual_action_captures.py --bundle-id earth_vein_cave_visual_v1 --replace-pending-evidence`，run ID 为 `phase554-current-main-actions-20260918`；一个真实 Main 完成全部动作。

安装事务备份原有 40 个 PNG/JSON 文件，逐一核对备份 SHA 与替换前库存一致，`40/40`。截图中玩家完整轮廓高度 `121.478–124.762px`，人物均未被 HUD 或屏幕边界裁切。运行资源指纹为 `a144e664d044d9406a683deb7cdec69d62e18f0d525040bade2ff1ff895e914f`。

自动输入不等同于 Computer Use。旧人工动作回执没有被重新标注为本轮操作；20 对候选动作截图仍属于尚未整体重冻的工作区证据，本次工具修复提交不混入它们或此前的 107 项候选证据改动。严格整体验收还需要当前人工操作、碰撞及合格前台性能记录的一致资源身份。

## 验证与剩余项

- `git diff --check`：通过。
- `python3 -B -m unittest tools/test/test_record_earth_vein_review_batch.py`：`28/28`，包括绘制缺帧和无效回执拒绝。
- `node tools/run_godot_auto_checks.mjs --parse-only`：`1/1`；随后原生像素诊断及完整 Main 录制直接加载并执行最终 helper 和入口。
- `python3 -B tools/record_earth_vein_review_batch.py --run-id phase554-render-continuity-review-20260918 --godot <本机 Godot 4.7 专用审片应用> --timeout-seconds 180`：整批 PASS，原生与录像九段状态/坐标相符，原始及导出帧数、全片解码通过。
- 成功和失败运行均确认子进程已收回、QA lane 已清理、真实用户数据未变：698 个条目库存 SHA `0f5c509b5d0b2e54513850195c838da5a578ead88252c8218963e5e1dcd37695`。

R1.W024 继续未勾选。前台 48 样本性能、当前 Computer Use 动作矩阵及路线/战斗转换复核仍待完成；二层静止开销差异不能用本次补绘录像替代测量。当前 `ownerReviewStatus=pending / runtimeEnabled=false / releaseApproved=false`；不修改发布门槛、正式地图美术或玩家运行路径。
