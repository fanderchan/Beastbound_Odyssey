# Phase 597：静止相机重复重绘定位

日期：2026-09-21。继续 R1.W024 的性能调查。确认一个可复现的优化方向：正常时钟下，仅打开按需重绘仍然每帧绘制；在独立静止实验中同时暂停相机内部更新，绘制次数和进程 CPU 明显下降。**本阶段未接入正式运行，不能把实验收益报成已交付的游戏优化**。基线为 `64c02aa8a5fa4a65b96a219aed508a6296902afe`。

## 有效的原生对照

同一个原生进程依次创建并释放四个真实 Main，采用 F2 同一候选地图、正常运行时钟、30 FPS 上限、VSync 开启、Dummy 音频；没有固定 FPS、电影录制、详细性能探针或调试器。四段均开启 `OS.low_processor_usage_mode`，只改变测试相机内部更新是否启用，顺序为启用／暂停／暂停／启用。每段前台稳定准备后测量 12 秒；测量期间没有鼠标操作或请求窗口激活。

| 相机内部更新 | process 帧 | 实际绘制帧 | 进程 CPU |
| --- | ---: | ---: | ---: |
| 启用 | 361 | 361 | 5.838% |
| 暂停，仅限此静止实验 | 360 | 87 | 2.442% |
| 暂停，仅限此静止实验 | 361 | 87 | 2.917% |
| 恢复启用 | 361 | 361 | 5.335% |

四段均零失焦、零不可绘制，人物坐标与视口变换未变化，所有 Main、音频及预取资源完成清理。CPU 使用 `ps` 累计 CPU 时间差除以单调墙钟差计算，每段 12–13 个外部采样，覆盖约 11–12 秒；表中不是 Godot `TIME_PROCESS` 数值，也不是全部游戏或不同机器的性能保证。按需绘制暂停了部分无变化画面的提交，没有暂停 process 或降低其 30 FPS 上限。

完整报告为 [原生相机对照](../.run/phase597-idle-camera-ablation/report.json)，原始日志和 CPU 采样保存在同目录。该实验有意允许按需省略绘制，**不满足正式地图矩阵的逐帧绘制条件，不替代 Phase 579 的正式 FAIL**。

## 原因与唤醒原型

Godot 4.7 的 [Camera2D 实现](https://github.com/godotengine/godot/blob/4.7-stable/scene/2d/camera_2d.cpp) 在内部 process 调用 `_update_scroll()`，即使变换未变也会提交视口变换；[Viewport 实现](https://github.com/godotengine/godot/blob/4.7-stable/scene/main/viewport.cpp) 继续把它提交到渲染服务。[按需重绘](https://docs.godotengine.org/en/stable/classes/class_os.html#class-os-property-low-processor-usage-mode) 依赖渲染状态是否变化。源码路径与上述可逆对照一起支持“静止相机更新使本场景持续重绘”的判断；没有把它泛化为所有地图性能增量的唯一原因。

独立唤醒原型观察相机目标、缩放和视口大小；停稳后暂停内部更新，变化时恢复。旋转、偏移和 physics 回调等未支持模式退回引擎正常更新。原型没有写入 Main 或正常渲染设置。与普通 Camera2D 的双视口对照覆盖初始静止、移动目标、平滑尾段、缩放、视口尺寸、偏移及恢复、传送重置、旋转及恢复、physics 回调及恢复，共 **12 项／1590 帧**；镜头中心和鼠标点的世界坐标换算最大差值均为 `0`。见 [原型结果](../.run/phase597-camera-wake-check-v2/report.json)。这只是 headless 相机数学与唤醒验证，未发送真实输入，不证明移动手感、战斗切换或运行时性能。

下一步把候选策略放入独立的世界相机控制器，验证真实跨帧鼠标移动、平滑尾段、HUD 重排、切图和战斗往返，再测接入后的正常时钟 CPU。按需绘制和现有正式性能采样的关系需要明确验证；不能把窗口不可绘制、漏绘或渲染循环关闭当作节能收益，也不能暗中放宽现有门槛。

## 保留的失败与边界

- 深度层对照首次在第二段遇到 GDScript 数组类型错误；确认进程身份后结束该测试。修正类型的新测试第一段全程失焦，严格拒绝。两轮都没有产生有效的遮挡／排序消融比较，不据此归因。
- 仅切换按需重绘的四段对照中，两个有效按需样本仍为 `593/593`、`599/599` 帧绘制；最后一个持续绘制样本出现 80 个不可绘制帧，整组失败。局部 CPU 值不作为完整改善结论。
- 唤醒原型最初拼错 Camera2D 的 `limit_smoothed` 属性，发生解析错误；Godot 仍以零退出并打印零帧的 `passed`，已明确拒绝。修正版要求无运行错误且完成全部 1590 帧／12 项，避免把退出码或单个 PASS 字符串当作通过。

本机材料均保留原始版本与失败日志，入口汇总见 [验证摘要](../.run/phase597-idle-camera-findings/verification-summary.json) 和 [70 项文件哈希清单](../.run/phase597-idle-camera-findings/sha256-manifest.json)。14 次 Computer Use 调用含 8 张原图、1 次 `noWindowsAvailable` 错误、零重置；原始调用 SHA-256 为 `116431d5bee4e12c3cadbb83eead58f5d325ed29a2b3b65ba684d8184a3e413f`。画面均直接来自工具输出。

全部测试进程及官方 automation lane 已清理，真实玩家资料未变；481 个客户端脚本／数据文件、111 项保护文件与原有 107 项地图资产修改保持原字节。实验脚本位于本机忽略目录，未冒充克隆仓库自带的公共工具。

```sh
python3 .run/phase597-idle-camera-ablation/run.py
python3 .run/phase552_run_isolated.py phase597-camera-wake-check-v2 --fixed-fps 60 --script /Users/fander/projects/Beastbound_Odyssey/.run/phase597-camera-wake-prototype-v2/check.gd -- --beastbound-qa-user-data-lane=automation
python3 .run/phase597-idle-camera-findings/extract_cua.py
python3 .run/phase597-idle-camera-findings/validate.py
git diff --check
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

以上实验目录要求新建且保留旧结果，不应在已记录的目录覆盖重跑。正式运行源码没有变化，因此未重复全量 CI 或正式四层性能矩阵。P2.1a／R1.W024、正式静止增量、精确动作／截图配对及所有者美术接受继续未完成。
