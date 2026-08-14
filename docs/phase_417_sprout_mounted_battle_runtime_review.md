# Phase 417：芽耳布伊整体骑乘战斗实机语义复核

> 历史状态说明（2026-08-15）：本文记录的缺源结论与“不提交、不推送”边界在 Phase 417 当时成立。
> Phase 427 已重新生成、安装并验证 full source archive；当前来源与最终像素证据请以
> `docs/phase_427_sprout_mounted_full_source_closure.md` 为准。项目所有者视觉验收与普通运行开放仍未发生。

## 当前结论

见习猎人骑乘芽耳布伊的 AI 整体骑乘候选现已完成双斜向、12 动作、180 帧的真实
`Main.tscn` 语义复核。双方最终绘制均朝向战场中心；人物与坐骑始终是单一整图主体，没有恢复
人物／宠物运行时分层拼接、镜像或挂点组合。14 段连续审片覆盖行走、攻击、技能、防御承压、受击、
反击、致死反击、三骑合击、回避、回避反击、两类击飞、倒地和复活。

自动检查与美术总监自审均通过，但项目所有者尚未观看并接受精确画面。因此本阶段只把候选推进到
`passed_real_main_owner_pending`；`ownerReviewStatus=pending` 与 `runtimeEnabled=false` 保持不变，
不勾选 P2.2b、不提交、不推送，也不让普通玩家路径读取这 180 帧战斗候选。

此外，本轮确认这 180 张运行帧缺少可恢复的正式来源包。现有视频可用于判断造型、比例和动作方向，
但即使 owner 视觉接受，也必须重新生成并归档完整源稿后重录最终片，不能直接发布当前像素。

## 根因与授权边界修复

芽耳布伊组合此前已经登记了可用的世界骑乘根，但新绘制的战斗矩阵仍待 owner review。旧 QA 检查只在
“整个组合不存在”时开启显式候选预览，因此命中了世界白名单，却拿不到被正确隐藏的战斗根，表现为
`battleActions=0 / battleFrameCount=0`；这不是动作 PNG 缺失。

现把世界与战斗权限分开处理：

- 普通玩家路径继续读取既有世界组合，但 `battleRoot` 为空；
- 只有显式隔离 QA 或未来同时满足元数据运行批准时，才解析候选战斗根；
- QA 开启／关闭都会清除登记战斗根缓存；关闭后自动断言战斗组合再次不可见；
- 绘制热路径只读取缓存结果，不在每帧重复扫描元数据或目录。

因此修复没有通过登记世界资产暗开战斗候选，也没有改变其他整体骑乘组合、战斗规则或服务端合同。

## 美术与动作判断

当前画面达到交项目所有者冻结审看的标准：

- 敌方左上使用正面三分之四视图并朝右下，我方右下使用背面三分之四视图并朝左上；两边均与同队战宠
  朝向一致；
- 骑手与芽耳布伊在攻击、后坐、防御、倒地和复活中保持完整单体，没有掉骑手、断层或明显穿插；
- 攻击、技能、受击、击飞、倒地与复活的轮廓差异足够，动作因果无需依赖 QA 文字才能辨认；
- 独立战宠本体比整骑中的坐骑部分更敦实，但整骑总高度、骑手占比和战场层级仍协调，当前不判定为返工缺陷。

自审不能替代项目所有者的审美决定。本轮没有写 `owner-decision.json` 或 release attestation。

## 来源闭环核查

`qa/battle-v2/processing-summary.json` 为 12 个动作各记录了一张原始母板 SHA-256，但当前包没有
`source/`、512px 源帧或 source ledger。为排除只是路径丢失，本轮执行了两层只读逐文件哈希核对：

| 检索范围 | 图片数量 | 12 个母板 SHA 命中 |
| --- | ---: | ---: |
| 当前 `.run` 证据库 | 47,011 | 0 |
| 当前 `client/godot/assets` | 19,709 | 0 |

因此旧 `pending_parent_dedup_archive` 不再准确，现已改为 `missing_rebuild_required`。不得从 256px 运行图
反向放大或复制来冒充 512px／原始生成源。正式发布前要重新生成 12 个动作母板，按 full archive 合同安装
双视角 180 张 512px 源帧与逐动作 ledger，再重新执行像素 parity、真实 Main 审片和 owner 门禁。

## 真实 Main 审片证据

```text
.run/evidence/phase417_sprout_mounted_battle_owner_review/
  Beastbound_Phase417_Sprout_Mounted_Semantic_1x.mp4
  action-contact-sheet.png
  keyframes/01-walk.png ... 14-revive.png
```

| 证据 | 规格／SHA-256 |
| --- | --- |
| 连续 MP4 | 1280×720、60 FPS、2372 帧、39.533333 秒、H.264/AAC 48 kHz 双声道、1.00×；`1f17cbf07a8e7ff5978a1e730bc6a7ca937910cc73b48a2c0698b5f272da959e` |
| 14 段动作联系表 | 1320×760；`b363e423820271714e293c21eeb945eaff88333b8263d2cc50fd2701d64e126d` |
| 已有双视角 12 动作表 | `3d1982202c2f15f2f99336ee4d556f1ca93d3e38e5c674a22999cb4e5b74b67e` |

MP4 已完成全片音视频解码，响度为 `-24.6 LUFS`、真峰值 `-3.8 dBFS`。录像只用临时 QA 控制器驱动
正式战斗事件展示，不连接后端／MySQL，也不提交玩家写入。

## 验证与性能

- JSON 解析与 `git diff --check`：通过；
- 显式隔离 `--auto-mounted-action-asset-check`：12 动作、180 帧、双方 `flipH=true`，敌方
  `front_3quarter_sw`、我方 `back_3quarter_ne`，与对应战宠朝向一致，`errors=[]`；
- `--auto-pet-battle-review-lab-check`：19 个步骤、1948 个导演帧、10 个整体骑乘 actor，完整覆盖预期动作，
  包括独立复活，`errors=[]`；
- 实际跨帧移动探针：60 FPS，`process_total=0.03–0.04 ms`、`draw_world=0.02–0.05 ms`、
  `path_len=11`、`status=ok`；
- 真实 Main MovieWriter：2372 帧，平均 CPU 渲染 `0.09 ms/frame`；录像结束后无 Godot 残留进程。

以上性能只证明本地 1280×720 候选审片没有可见回归，不冒充 200 人同地图容量。

## QA 数据隔离事件与收口

本轮早期有一次裸 `godot --headless --path client/godot --quit` 解析未传 QA `feature/root/lane`，Godot 因而
触碰真实 `user://`：写入两份各 71 字节的启动日志，并把 83 字节音频设置写为音乐 `0.48`、音效 `0.92`、
未静音。只读核查确认 `accounts.json`、`player_profile.json` 与 `player_profile.last_good.json` 在 03:00 后均
未修改；inventory 项数仍为 696，SHA 变化来自日志轮替／替换，而不是账号或角色档案写入。

没有覆盖、删除或回滚真实目录，也没有绕过基线锁。旧 `client2` QA 通道连同 canonical 外部锁已整体移动到
可恢复目录：

```text
.run/recovery/qa-lane-client2-baseline-drift-20260813-o9eLih/
```

其 `RECOVERY.md` 记录旧／新真实目录 SHA 与只读核查结论。随后用当前真实基线重新准备隔离通道，所有上述
检查均显式传入 QA 参数；基线复核与清理通过，隔离通道和外部锁均已清除。后续 Godot 解析也必须继续走
隔离通道，不能再裸启动。

## 仍待完成

1. 项目所有者观看精确 1× MP4，决定通过或退回具体动作／比例；
2. 若视觉方向通过，仍需重新生成 12 个动作的完整源稿、安装 full source archive 并重录最终像素审片；
3. 只有新源包再次通过且 owner 接受最终像素，才能补 owner decision／发布证明并单独讨论普通运行开放；
4. 其余骑乘候选必须各自完成同样的来源、真实 Main 语义与 owner 门禁，不能借用芽耳布伊结论批量放行。
