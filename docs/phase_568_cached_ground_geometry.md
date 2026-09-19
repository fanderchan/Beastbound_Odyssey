# Phase 568：保留有序地面几何，减少渲染命令开销

日期：2026-09-19。承接 Phase 565 的静态地面图层，继续缩小岩脉洞穴的绘制开销。沿用现有原创图集、坐标、叠放顺序和地图修订，不增加美术资产或改变玩法规则。

## 原因与实现

Phase 565 已避免路径变化时重新执行整图地面脚本，但 Godot 渲染器仍须逐帧处理保留的地块命令。二层当前场景有 3627 条地面区域绘制命令；脚本不重画，并不代表渲染器没有工作。

新增 `MapGroundMesh` 将这些矩形依原顺序写入一个二维 `ArrayMesh`：边缘、基础、覆盖层先后不变，每块仍取同一图集区域、使用原目的矩形。普通模式继续使用边缘加 `groundDraws`。几何仅在地图修订变化时生成，由 `WorldGroundLayer` 保留；调整背景范围只刷新绘制，不重建网格。路径、人物深度、交互反馈和战斗切换沿用已有层级。

正尺寸、有限坐标且源区域完全位于图集内才走网格。翻转、越界裁切及 `AtlasTexture` 子区域全部交回原来的 `draw_texture_rect_region` 路径，保留其特殊语义。无效类型与原绘制器一致跳过，未启用地图清空缓存。顶点明确使用二维格式，不启用属性压缩。接口依据 Godot 官方 [ArrayMesh](https://docs.godotengine.org/en/stable/classes/class_arraymesh.html)、[Mesh](https://docs.godotengine.org/en/stable/classes/class_mesh.html) 和 [CanvasItem](https://docs.godotengine.org/en/stable/classes/class_canvasitem.html) 文档。

新几何源已加入地图运行指纹。未扩大 `main.gd`，未新增逐帧地图扫描、网络请求或存储写入；没有改变候选的 owner / runtime / release 状态。

## 画面与行为验证

正式接入后的十对原生 Main 截图均为 **PNG 字节相同、RGBA 差异 0**，未使用遮罩：沼泽、训练场、村口、洞穴四层，以及二层路径反馈、全屏地图、关闭地图后恢复。原地面版本保存在忽略目录的独立脚本中；最终侧运行实际 `res://scenes/Main.tscn`，每图验证加载成功、当前地图正确、美术启用和网格存在。七组原型对照也逐像素相同。

```sh
git diff --check
node tools/run_godot_auto_checks.mjs --only=--auto-map-visual-runtime-check,--auto-map-transfer-check,--auto-camera-click-check,--auto-battle-check --fail-fast --output-dir .run/godot_auto_checks/phase568-ground-mesh
node tools/run_godot_auto_checks.mjs --only=--auto-map-visual-runtime-check --fail-fast --output-dir .run/godot_auto_checks/phase568-ground-mesh-final
python3 -B -m unittest discover -s tools/test -p test_map_visual_evidence_builder.py
python3 -B tools/play_guardian_review.py --record --autoplay --timeout-seconds 360
```

客户端含解析 `5/5`；补上子图集和有限端点保护后，最终地图检查含解析 `2/2`。对应摘要为 `2026-09-18T23-48-02-676Z_summary.json`、`2026-09-18T23-49-38-127Z_summary.json`。检查覆盖四层单网格、同修订复用、背景变化不重建、关闭候选清空、叠放顺序、非正方形 UV、普通模式与特殊矩形回退。证据工具 `53/53`；新增源指纹用例先在未登记 helper 时复现红灯，再补齐登记通过。

当前五账号守护战也完成：一个实际 Main 加四个 HTTP 测试账号，四套人物、20 个 actor，14 次跨帧左键操作，五账号均 `revision 102→103`、地之戒 `+1`、石币 `+234`。静止在线刷新、战前／回放后人物外观、战斗隐藏地面及返回 F4 恢复均通过。首次切战准备 `9.637ms`，1620 张纹理已保留、加载失败为 0。本轮人物未倒地，因此不新增倒地宠物操作覆盖声明；该情形的既有证据仍见 Phase 566/567。

## 性能对照与适用范围

真实 macOS Metal、Apple M5、1280×720，二层同配置，预热 180 帧后取八个 60 帧样本。三轮交替静止原型对照的渲染器平均值均从 `0.08ms` 降到 `0.04–0.05ms`，脚本处理基本不变。最终实现另取静止和 60 次真实跨帧点击移动对照：

| 范围 | 修改前静止 | 修改后静止 | 修改前移动 | 修改后移动 |
| --- | ---: | ---: | ---: | ---: |
| 节点处理区段均值 | 0.071875ms | 0.070750ms | 0.128875ms | 0.123375ms |
| Main 处理区段均值 | 0.049375ms | 0.049000ms | 0.089250ms | 0.084625ms |
| 整段录像渲染器 CPU 均值 | 0.08ms | 0.04ms | 0.08ms | 0.05ms |
| 渲染对象计数中位数 | 3947 | 321 | 3947 | 321 |
| draw calls 中位数 | 127 | 127 | 127 | 127 |

3627 条地面命令变成一份几何，渲染对象计数相差 3626；draw calls 没有下降。两侧移动均收到 120 个鼠标事件、接受 60 次点击、零屏幕坐标不符且终点一致；采样内地面重建均为 0，Main 动态重绘均为 18。移动观察器为等待检查完成额外保留两帧渲染记录，八个处理区段样本仍严格为 480 帧。

渲染器均值来自 MovieWriter 的整段汇总，包含启动与清理且四舍五入到 `0.01ms`；不能与 480 帧的节点处理区段直接相加。录像固定步长且桌面保持锁定，实际可绘制但不在前台；片源帧率不是正常运行 FPS，也不是稳态 OS CPU 证据。当前结果支持减少地面命令开销，**不代表解决 Phase 559 的静止增量失败**，不代替四层正式前台矩阵和人工操作验收。

## 证据与后续

- `.run/phase568-ground-diagnostic/performance-summary.json`：十二次原型／最终静止移动记录、日志哈希、局部运行脚本哈希和适用范围。
- `.run/phase568-ground-diagnostic/pixel-comparison-final-v1.json`：十对逐像素比较；原图在相邻 `capture-baseline-final-v1/` 与 `capture-final-final-v1/`。
- `.run/phase568-before/`：修改前源码与 111 项保护文件清单。
- `.run/guardian-review/20260918T235306.356031Z/`：当前完整战斗、五账号前后档案、进程及用户数据生命周期。`phase568-validation-summary.json` 为精简复核结果；`review-sources.json` 在运行后固定未再修改且修改时间早于本次启动的相关源码。

当前运行内容指纹为 `beastbound-map-runtime-surface-v2:683e128d4d357784b0d7aaaad3938ce8d02b66f0624fffe1c8a05b21e42df740`。守护战原速 MP4 为 1280×720、30 FPS、4558 帧、151.933333 秒，完整解码通过，SHA-256 `2a028456f778e511a7ec832a194819e77eb601f9b4c1c94bcb8bd77128bc5a54`。

测试客户端、隔离内存后端和本次防休眠进程均结束，QA lane 清理，真实用户数据哈希不变；107 项候选及四项历史文件逐文件未变。R1.W024、P2.1a、P2.2b 继续未勾选；当前完整前台性能、精确鼠标／画面配对与所有者接受仍待完成。
