# Phase 344：月岚风狐骑乘战斗双视角候选

日期：2026-07-26

## 用户决定与范围

项目所有者验收 Phase343 世界真八方向成片后回复“认可，继续”。本阶段据此继续制作“成年见习猎人骑月岚风狐”的正式战斗美术候选、运行时加载校验和真实 1× 动态证据。

本轮没有修改战斗规则、宠物数值、骑乘资格、进化事务、服务器接口、玩家档案或普通运行路线。Phase343 世界真八方向的 `visual_only` 批准保持不变；新完成的 180 帧战斗包仍为 `owner_review_pending`、`runtimeEnabled=false`，不会因安装候选资源而自动进入普通玩家路径。

## 正式动作合同

- 人物与坐骑必须是一次生成的完整主体，不使用运行时或离线人物/宠物分层拼接。
- 两个战斗视角分别为 `front_3quarter_sw`、`back_3quarter_ne`，独立生产，不用水平镜像冒充另一视角。
- 动作集合为 `idle / walk / attack / skill / hurt / defend / dodge / counter / stagger / knockaway / down / revive`。
- 帧数为 `6+8+8+8+6+6+8+8+8+8+8+8=90` 帧/视角，共 180 帧；运行时 256×256，生产源帧 512×512。
- 月岚风狐始终保持珍珠银白主色、深青到雾青末端、额部新月纹、四足长背、长耳附着毛鳍，以及恰好两条可分别追踪的实体尾巴。
- 成人见习猎人保持正常头身比和完整双靴，低位落座于肩后长背通道；不得缩成小人、浮空、离鞍或被尾巴/毛鳍穿体。
- `dodge` 必须有清晰的后撤/侧移半步过程，不能只靠“回避”浮字表达。
- `knockaway` 末帧保持重落地，不错误回到待机。
- `down-8 == revive-1` 在 512px 源帧与 256px 运行帧分别保持完全相同的 RGBA，避免倒地/起身瞬间换模。

## 生产、返工与归档

动作使用 OpenAI 内置图像生成，输入只包含 Beastbound 自有的月岚风狐、见习猎人和已冻结骑乘身份参考。生产过程中主动淘汰：

- 技能风效过大且脱离主体；
- 受击与踉跄动作过弱、接近待机；
- 主体触边或跨格；
- 背面反击主体超出安全边；
- 回避、防御或踉跄缺少清晰重心变化。

最终 `skill` 改为由身体和双尾共同完成的受控新月风旋，不把大型独立特效烘焙进主体。起身序列由最终倒地姿势确定性反向派生。

仓库采用 lean 归档，保留全部运行帧、代表性无损源文件、逐动作原始提示词、处理/QC 元数据、账本和联系表；完整本地生产归档位于：

```text
.run/art_batch_phase344/moon_gale_mounted/
```

正式候选目录：

```text
client/godot/assets/mounted/novice_hunter_v1/driftfox_evolved_moon_gale_wind7_water3/
```

安装器最终复核为双视角、12 动作、180 帧、`owner=pending`、`runtime=false`。因为目标目录已经带有 Phase343 世界视觉批准，安装器的保守状态扫描会拒绝直接覆盖；本轮没有修改安装器代码，而是在完整影子目录中临时隔离该状态完成原样安装，再恢复世界批准字段并逐目录验证身份、世界帧和世界 QA 与原目录一致。

最终 bundle digest 为：

```text
70bcdd1eb626cfa4744fd74986902e932b4c71399d1897bd79cf4e72cc184315
```

安装清单中的 307 个文件重新计算 SHA-256 后全部吻合，`mismatches=[]`。

战斗证据：

```text
qa/battle/contact-sheet.png
  473096a570312306fa47aebb3d92025ac39f7e01d3229f0155323ce42edec0e1
qa/battle/qc-summary.json
  83f8a56d69ac25743cf41a377e029e140586431173e76c8b08d2b0b52d83b9f2
source/battle/source-ledger.json
  c9a986ef1bd1b179aefbf12648ec1b8c7cebc5275e8f812242525efec9b7cb26
```

倒地/起身接缝精确哈希：

```text
front source down-8/revive-1 = c54ecd51... / c54ecd51...
front runtime down-8/revive-1 = b3870279... / b3870279...
back  source down-8/revive-1 = 18d5ca8a... / 18d5ca8a...
back  runtime down-8/revive-1 = 285813e8... / 285813e8...
```

## Godot 加载、比例与连续性校验

第一遍显式 Godot 门禁正确发现新 PNG 尚未导入：磁盘存在候选帧，但运行时资源尚不可读。使用 Godot 编辑器导入 180 张新 PNG 后，重跑同一显式门禁通过：

```text
formId=driftfox_evolved_moon_gale_wind7_water3
battleActions=12
battleViews=2
battleFrameCount=180
worldDirections=8
worldFrameCount=40
runtimeBodyLayerCount=1
runtimeLayeredComposition=false
worldUsesRuntimeMirroring=false
errors=[]
ok=true
```

定向回归包括：

- `godot --headless --path client/godot --quit`；
- 月岚风狐显式 `--auto-mounted-action-asset-check`；
- `--auto-character-mount-art-check`；
- `--auto-pet-battle-review-lab-check`；
- `battle_action_catalog_check.mjs`；
- 宠物设计 Inspector 与设计规格校验；
- 战斗 bundle builder / installer Python 测试 48 项。

Godot 合并检查为 `3/3` 通过：

```text
.run/auto-checks-phase344-moon-gale-mounted/2026-07-25T20-09-06-966Z.log
```

10V10 审片场中，月岚风狐两个 idle 视角的源高度为 `187px / 162px`，平均 `174.5px`；比例归一化到 `196px` 后，估算观战显示高度为 `91.897344px`，与晶甲乌力、橙色乌力和新手老虎同档。画面中不再出现骑乘模型小得离谱的问题。

## 真实 1× Metal 动态证据

录像来自真实 `Main.tscn`、Apple M5 Metal、1280×720、60 FPS，同一 Godot 进程连续执行骑乘人物进攻、防御承压、反击、回避、回避反击和三人合击：

```text
.run/evidence/phase344_moon_gale_mounted/
  Beastbound_Phase344_Moon_Gale_Mounted_1x.mp4
  contact-sheet-4x3.png
  action-contact-3x2.png
  godot-movie.log
  mounted-action-check.log
```

- 前 2 秒展开工具，明确显示“速度 x1”；随后收起为右侧小型“GM工具”按钮。
- `speed_scale` 从开始到结束均为 `1.00x`；转码命令没有使用 `setpts`、`atempo` 或其他变速滤镜。
- 17.600 秒、1,056 帧、H.264、AAC 48kHz 双声道、8,935,588 bytes。
- MP4 SHA-256：`dc6eac7415bb98dba17093e35c9a65b3902cb3b33e69cc78d0ebc71366cf48d8`。
- `ffprobe` 帧数/时长一致，`ffmpeg -v error ... -f null -` 全片解码零错误。
- 音轨非静音：`mean_volume=-28.1dB`、`max_volume=-4.0dB`。
- Movie Maker 报告平均 CPU render `0.06ms/frame`；这是本机离线审片开销，不代表 200 人同图容量。

## 自审与未完成项

当前自审未发现骑手缩成小人、双尾合并/增生、尾巴穿身、骑手离鞍、正背视角串换、分层错位、击飞回待机或倒地/起身换模。真实 10V10 中，进攻、防御承压、反击、回避、回避后反击与合击均命中新的 mounted action 目录。

但 P1.3e 仍不能勾选：

- 本轮短片沿用现有验收场的 6 个真实骑乘事件；`skill / hurt / stagger / knockaway / down / revive` 虽已完成文件、逐动作 GIF、联系表和 Godot 加载门禁，仍需后续专属导演或最终战斗实录逐段动态验收。
- 月岚风狐的独立宠物战斗语义复核尚未完成。
- 月岚风狐进化变身演出和成功路径接入尚未完成。
- 项目所有者尚未确认本轮 1× 成片的比例、双尾连贯性、重量和动作爽感。
- 两条进化路线 asset gate 与全局运行开关继续关闭。

因此本阶段只能记为“月岚风狐骑乘战斗候选完成、owner review pending”，不能记作正式进化路线开放。
