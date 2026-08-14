# Phase 427：芽耳布伊整体骑乘战斗完整来源闭环

## 当前结论

见习猎人骑乘芽耳布伊的正式战斗候选已从 Phase 417 的“运行帧存在、原始来源缺失”重建为可恢复的
full source archive。双斜向 12 动作、180 张 512px 源帧和 180 张 256px 运行帧已经安装到正式资产目录，
来源 ledger、逐动作 prompt、无损生成表、确定性处理记录、QC 和安装清单齐全。bundle digest 为：

```text
ae0951e4f12eacef50e521746b8d36a3ae32c5da6471212936b47a98c48d1547
```

新像素已通过静态美术审计、Godot 动作与最终朝向门、19 步导演场、真实 `Main.tscn` 14 段连续审片
和原生 Metal 稳态性能检查。因此 Phase 417 的“缺源不可提交”工程阻断已经关闭，这组候选可以作为
owner-pending 资产提交和推送。

这不等于美术发布批准。项目所有者尚未接受最终像素，故继续保持：

- `ownerReviewStatus=pending`；
- `runtimeEnabled=false`；
- 普通玩家路径不解析候选 `battleRoot`；
- 不写 owner decision 或 release attestation；
- 不勾选 P2.2b。

## 重建范围与来源合同

正式包包含两个独立绘制视角：敌方使用 `front_3quarter_sw`，我方使用 `back_3quarter_ne`；最终绘制
分别经 `flipH=true` 朝向战场中心，与同队战宠一致。每个视角都有以下动作：

| 动作 | 每视角帧数 | 运行 FPS | 循环 |
| --- | ---: | ---: | --- |
| idle | 6 | 8 | 是 |
| walk | 8 | 10 | 是 |
| attack | 8 | 12 | 否 |
| skill | 8 | 12 | 否 |
| hurt | 6 | 12 | 否 |
| defend | 6 | 10 | 否 |
| dodge | 8 | 12 | 否 |
| counter | 8 | 12 | 否 |
| stagger | 8 | 10 | 否 |
| knockaway | 8 | 12 | 否 |
| down | 8 | 10 | 否 |
| revive | 8 | 10 | 否 |

24 个视角动作目录各自归档 exact prompt、`raw-sheet-lossless.png`、`pipeline-input-lossless.png`、处理参数、
QC 和 512px 源帧。共有 22 张唯一生成母板：每个视角的正式 `revive` 按物理连续性合同精确倒序使用
同视角 `down` 八个完整创作姿势，因此 `down-8` 与 `revive-1` 精确一致；没有从 256px 运行图反向
放大、没有镜像、插值或拆分人物／坐骑图层。生成过但不满足连续性的 revive 草稿只保留在本地重建证据
中并明确标为 rejected，没有混入正式包。

权威归档位置：

```text
client/godot/assets/mounted/novice_hunter_v1/bui_novice_sprout_earth5_wind5/
  source/battle/source-ledger.json
  source/battle/install-manifest.json
  qa/battle/qc-summary.json
  qa/battle/contact-sheet.png
  views/<view>/<action>/*.png
```

安装清单绑定 578 个已验证来源文件和 579 个安装文件；实际安装后再次 dry-run 得到 `changed=false`。
安装前旧目录已逐文件保存到可恢复快照：

```text
.run/recovery/sprout-mounted-pre-phase427-full-source-install-20260815/
```

旧树为 485 文件、25,856,331 bytes，SHA-256
`f9f3e92f0c0e9f50cbd843f5d3add2ad943f09516c58602a33a5ed6446eda8c5`；本阶段没有删除历史候选。

## 静态美术与动作判断

静态门检查 180 张正式运行帧得到 164 个唯一 RGBA；其余仅为两个视角各八对预期的
`down/revive` 倒序对应。额外重复、跨视角镜像、残留洋红和脱离主体组件均为 0，最大主体尺寸漂移为
`0.181970`。

美术总监自审结论为“达到冻结审看标准，未达到 owner 批准状态”：

- 人物、芽耳布伊和鞍具始终是同一完整主体，攻击、受击、击飞、倒地时没有掉骑手或运行时拼层；
- 两侧轮廓方向正确，敌方能看到正面信息，我方保留背面作战信息，且都朝场心；
- `walk` 八帧为自然斜向四足交替，前后肢接触与回收跨帧连续，身体有受控起伏，没有此前被指出的
  单腿跳、整块平移或脚底打滑感；
- 攻击、技能、防御、受击、回避、反击、硬直、击飞、倒地和复活具有独立重心与轮廓，不依赖 QA
  文字才能辨认动作语义；
- 224px 的双视角可见高度一致，导演场使用 `scaleMultiplier=1.0`，画面有主角分量但没有压过前排战宠、
  血条和战场纵深。

自审只负责排除明显生产缺陷；风格、体量和动作气质是否成为最终商业画面仍由项目所有者决定。

## Godot 与真实 Main 证据

新 PNG 首次加入时本地 Godot import index 尚未建立，第一次动作门因此按预期 fail closed。随后只在隔离
QA user-data lane 执行 editor import，再运行精确门禁；没有把 `.import` 当产品源提交。

| 门禁 | 结果 |
| --- | --- |
| Godot parse + mounted action | `2/2`；12 动作、180 帧、2 视角，双方 `flipH=true` 且与战宠朝向一致，`errors=[]` |
| battle review lab | `2/2`；19 步、1936 director frames、双方 10 骑手 + 10 战宠、10 个完整骑乘 actor，`errors=[]` |
| QA 数据隔离 | 每轮真实目录 SHA 均为 `b663f0b466e3a66dee49798576c58d3f2f6c46c070b47b4ce5a9087f79abbff9`；隔离 lane 已清理 |

真实 Main 最终录像：

```text
.run/evidence/phase427_sprout_mounted_full_source_owner_review/
  Beastbound_Phase427_Sprout_Mounted_Full_Source_1x.mp4
  action-contact-sheet.png
  walk-focus-ally-8f.png
  godot-movie.log
  godot-perf.log
```

| 证据 | 规格／SHA-256 |
| --- | --- |
| 1× 连续 MP4 | 1280×720、60 FPS、2372 帧、39.533333 秒、H.264/yuv420p + AAC 48 kHz 双声道；`3eedcb462dc2b474ae25004d168a90b926e36555e48ebf6585c6afcb875c2d4f` |
| 14 段动作联系表 | 1280×2520；`40bf22a1f2b525138d691a4766d8b24842d237eb84923f7ddabf34cd34718330` |
| 我方八帧步态条 | `b983564c62d19163662fa267964801912f22fa25b9f37e63cb804667210e831f` |
| 正式包双视角联系表 | `761d61365a1164f235f72eff4ee44362454750611f4c1e4ad25cb698377b49c3` |

录像按真实事件连续覆盖：行走、骑乘攻击、骑乘技能、防御承压、受击、反击、致死反击／硬直、三骑
合击、回避、回避反击、直线击飞、弹跳击飞、倒地和复活。全片音视频解码通过；综合响度
`-24.6 LUFS`、LRA `6.6 LU`、真峰值 `-3.7 dBFS`。临时 harness 只驱动正式 `Main.tscn` 语义展示，
禁用后端，不触碰 MySQL 或真实玩家档案。

## 性能与残余风险

原生 Metal 以相同 14 段真实 Main harness 采样。首样本包含加载，最低 34.8 FPS；排除首个加载样本后的
36 个稳态样本结果为：

| 指标 | min | median | p95 | max |
| --- | ---: | ---: | ---: | ---: |
| FPS | 57.6 | 60.0 | 60.0 | 60.5 |
| `battle_process` ms | 0.03 | 0.05 | 0.08 | 0.15 |
| `draw_battle` ms | 4.86 | 5.51 | 5.72 | 5.87 |
| `process_total` ms | 0.05 | 0.07 | 0.10 | 0.17 |

MovieWriter 的 2372 帧平均 CPU 渲染为 `0.09 ms/frame`。所有测试结束后没有残留 Godot 或 ffmpeg
进程。以上证明本机 1280×720 这组候选没有明显性能回归，不代表 200 人同地图容量证据。

剩余唯一美术门是项目所有者观看 Phase 427 精确 1× 视频并明确接受或指出返工动作。只有 owner 接受
最终像素后，才能另行生成 owner decision／release attestation，并单独决定普通运行是否开放。
