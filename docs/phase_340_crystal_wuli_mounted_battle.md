# Phase 340：晶甲乌力骑乘战斗双视角候选

日期：2026-07-25

## 用户决定与范围

项目所有者确认现有晶甲乌力外形适合做坐骑。本阶段据此只完成“成年见习猎人骑晶甲乌力”的战斗美术候选、运行时加载校验和 1× 动态证据，不改变宠物数值、骑乘资格、战斗规则、进化事务或玩家档案。

这次确认代表可以进入骑乘美术生产，不代表 180 帧成片已获项目所有者终审。组合继续保持 `ownerReviewStatus=pending`、`runtimeEnabled=false`，不会出现在普通玩家运行路径。

## 正式动作合同

- 人物与坐骑必须是一次生成的完整主体，不使用运行时或离线人物/宠物分层拼接。
- 两个战斗视角分别为 `front_3quarter_sw`、`back_3quarter_ne`，独立生产，不用水平镜像冒充另一视角。
- 动作集合为 `idle / walk / attack / skill / hurt / defend / dodge / counter / stagger / knockaway / down / revive`。
- 帧数为 `6+8+8+8+6+6+8+8+8+8+8+8=90` 帧/视角，共 180 帧；运行时 256×256，生产源帧 512×512。
- 人物维持成人比例，坐点位于肩部晶堡之后；晶体不得穿入人物躯干。
- `knockaway` 末帧必须是倒伏，不允许错误回到待机。
- `down-8 == revive-1` 必须在 512px 源帧与 256px 运行帧分别保持完全相同的 RGBA，避免倒地/起身瞬间换模。

## 生产、返工与归档

动作使用 OpenAI 内置图像生成，输入只包含 Beastbound 自有的晶甲乌力、见习猎人和已冻结骑乘身份参考。生产过程中主动淘汰：

- 背面视角退化为正面；
- 白色网格残留；
- 主体跨格或触边；
- 背面反击错误退化为橙色乌力；
- 击飞最后错误站回待机。

起身序列由最终倒地姿势确定性反向派生，保持身份、光照、晶体和骑手关系连续。仓库采用 lean 归档，保留全部运行帧、代表性无损源文件、逐动作提示词/管线/QC 元数据、账本和联系表；完整本地生产归档位于：

```text
.run/art_batch_phase340/crystal_wuli_mounted/
```

正式目录：

```text
client/godot/assets/mounted/novice_hunter_v1/wuli_evolved_crystal_earth8_water2/
```

安装器复核结果为双视角、12 动作、180 帧、`owner=pending`、`runtime=false`。战斗联系表 SHA-256 为 `aed3935da5ccfa636c4222c59b015f9b86eb87d4eace4b3aacc834eee98272f9`。

## Godot 加载与连续性校验

第一遍显式 Godot 门禁正确发现新 PNG 尚未导入：磁盘存在 180 帧，但运行时可读帧为 0。使用 Godot 编辑器完成 180 张资源导入后，重跑同一门禁通过：

```text
formId=wuli_evolved_crystal_earth8_water2
battleActions=12
battleViews=2
battleFrameCount=180
errors=[]
ok=true
runtimeLayeredComposition=false
```

源帧与运行帧的倒地/起身接缝分别复核：

```text
front source down-8/revive-1 = b95ad685... / b95ad685...
front runtime down-8/revive-1 = 9050712d... / 9050712d...
back  source down-8/revive-1 = b1482887... / b1482887...
back  runtime down-8/revive-1 = ac71b9fb... / ac71b9fb...
```

定向回归包括：

- `godot --headless --path client/godot --quit`；
- 晶甲乌力显式 mounted action asset check；
- `--auto-character-mount-art-check`；
- `--auto-pet-battle-review-lab-check`。

最终观战门禁识别 6 种可审骑宠，晶甲乌力正背 idle 高度均为 192px，归一化后的 10V10 估算显示高度为 91.90px，与橙色乌力/新手老虎同档；不再出现骑乘模型小得离谱。合并日志为：

```text
.run/godot_auto_checks/2026-07-25T16-10-33-044Z.log
```

## 真实 1× Metal 动态证据

录像来自真实 `Main.tscn`、Apple M5 Metal、1280×720、60 FPS，同一个 Godot 进程连续执行骑乘人物进攻、防御承压、反击、回避、回避反击和三人合击：

```text
.run/evidence/phase340_crystal_wuli_mounted/
  Beastbound_Phase340_Crystal_Wuli_Mounted_1x.mp4
  contact-sheet-4x3.png
  action-contact-3x2.png
  godot-movie.log
```

- 前 2 秒展开工具，明确显示“速度 x1”；随后收起为右侧小型“GM工具”按钮。
- `speed_scale` 从开始到结束均为 `1.00x`，转码未使用 `setpts`、`atempo` 或其他变速滤镜。
- 17.600 秒、1,056 帧、H.264、AAC 48kHz 双声道、8,495,478 bytes。
- MP4 SHA-256：`1eae905e5fd429be27134183515ba5b9e2a3ce16154fb8a49cb2711960cfbd0e`。
- `ffprobe` 帧数/时长一致，`ffmpeg -v error ... -f null -` 全片解码零错误。
- 音轨非静音：`mean_volume=-28.1dB`、`max_volume=-4.0dB`。
- Movie Maker 报告平均 CPU render `0.19ms/frame`；这是本机离线审片开销，不代表 200 人同图容量。

## 自审与未完成项

当前自审未发现骑手缩成小人、晶体穿身、正背视角串换、击飞回待机或倒地/起身换模。实机 10V10 中，攻击、承压、防御、反击和回避均能命中新的 mounted action 目录。

但 P1.3e 仍不能勾选：

- 本轮短片只覆盖现有验收场已经具备真实骑乘事件的 6 个段落；`skill / hurt / stagger / knockaway / down / revive` 虽已完成文件、联系表和 Godot 加载门禁，仍需后续骑乘专属导演或最终战斗实录逐段动态验收。
- 进化变身演出只冻结了生产合同，尚未制作和接入。
- 月岚风狐的正式进化资产仍未完成。
- 项目所有者尚未确认本轮 1× 成片的比例、重量和动作爽感。
- 两条进化路线资产门禁和全局运行开关继续关闭。

因此本阶段只能记为“晶甲乌力骑乘战斗候选完成、owner review pending”，不能记作正式进化资产开放。
