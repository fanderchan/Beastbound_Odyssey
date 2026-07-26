# Phase 360：剩余三项进化宠视觉集中验收片

日期：2026-07-26

## 用户授权与边界

项目所有者同意制作一条集中验收片，补看此前仍未获得 owner visual approval 的三项：

1. 晶甲乌力独立宠物世界真八向；
2. 成年见习猎人骑晶甲乌力世界真八向整图；
3. 月岚风狐独立宠物战斗包。

本阶段只录制、合并和审核现有正式候选资产，不修改任何 PNG、动作像素、比例参数、玩法代码、宠物数值、技能、服务端、协议、数据库或玩家档案。项目所有者尚未对本片给出验收结论，因此本阶段不写 owner decision、不把 pending 改为 approved，也不开放整包或生产进化路线。

## 最终成片

真实 `Main.tscn` 最终成片：

```text
.run/evidence/phase360_remaining_evolution_visual_review/
  Beastbound_Phase360_Remaining_Evolution_Visuals_1x.mp4
```

- SHA-256：`cec2b87bf6e0baf5b47d81d5032e893bb06b5648192945d4c9f0834d1d64673a`；
- H.264、1280×720、60 FPS、3486 帧、58.100000 秒；
- AAC 48 kHz 双声道，平均音量 `-26.7 dB`、峰值 `-4.0 dB`；
- 全片完整音视频解码通过；
- 两段原始录像分别为 `1009` 帧和 `2477` 帧，合并后严格等于 `3486` 帧；
- 拼接只重置各段起始时间戳，没有使用 `setpts` 倍速系数、`atempo`、抽帧或其他变速滤镜。

### 第一、二项：晶甲乌力世界真八向

独立宠物与完整人骑宠使用左右同尺寸展示框，同步播放：

```text
南 → 西南 → 西 → 西北 → 北 → 东北 → 东 → 东南
```

每个方向保留 `0.6` 秒待机和 `1.2` 秒行走，全程 `1.00x`。同屏设计便于直接比较：

- 晶甲乌力八向身份与体量；
- 成年见习猎人比例；
- 肩堡后坐点与人物/坐骑共同起伏；
- 是否出现异常小人、人物漂移、晶体穿人、裁切或运行时镜像。

八方向联系表自审未见上述异常，骑手没有缩小到离谱程度，坐点在八向间保持一致。该结论仍只是自审，不代替 owner approval。

### 第三项：月岚风狐独立战斗

GM 验收工具在画面揭示前已收起，全程只保留小型章节/动作标题。真实战斗舞台以 `1.00x` 连续覆盖 14 段：

```text
普通攻击 / 防御承伤 / 受击恢复 / 反击 / 致死反击 / 反击击飞
技能攻击 / 合击 / 直线击飞 / 场边弹飞 / 后撤回避 / 回避反击
倒地 / 复起
```

自审确认双尾身份、动作因果、回避后撤、直飞与弹飞区分、倒地与复起连续性均可读，未见新增裁切或异常缩放。该结论仍只是自审，不代替 owner approval。

## 成片清洁度修正

两次非最终录制结果已主动淘汰：

1. 首次世界脚本的带返回值异步函数使八个方向并发推进，成片只有 117 帧；修正为顺序等待后重录为 1009 帧。
2. 第一版有效世界录像的前 `0.2` 秒会闪出普通地图；把黑场建立提前到主场景预热之前，再次完整重录。

最终文件第一帧为黑场，章节切换和结尾也都经过黑场；淘汰录像未作为验收证据或提交内容。

## 视觉与技术证据

本地证据目录还包含：

- `visual-review.json`：成片参数、章节、14 动作、帧数守恒、视觉自审与门禁边界；
- `world-contact-8.png`：晶甲独立/骑乘八方向；
- `battle-contact-a-8.png`、`battle-contact-b-6.png`：月岚 14 段战斗；
- `transition-contact-final-7.png`：片头、章节切换和片尾；
- 两段 Godot Movie Maker 日志、FFmpeg 拼接日志、媒体探测、完整解码、音量与 SHA-256 记录。

联系表 SHA-256 分别为：

```text
world-contact-8.png             3bbf12191711e5c544b55d20c55d67ad7badd8e09499203cc4a2c7bc773d7bda
battle-contact-a-8.png          764c85bd85a31b7a14445aeed8992ee7fae7f54223c521e327686c2a603e4fc7
battle-contact-b-6.png          ab2df4b5c6b4d1d9ddb16bfef20cbdfcaaaacff73ce647fa282005b5ac5879f6
transition-contact-final-7.png   faf386401d2c585ff36d144ae40652071b1350ffb26b2bc662a3b4b236657c3b
```

## 定向验证

执行并通过：

- 晶甲乌力 `--auto-pet-action-asset-check`：
  - 世界 `8` 向、`40` 帧；
  - 战斗 `2` 视角、`12` 动作、`180` 帧；
  - `runtimeMirroring=false`、`errors=[]`；
- 晶甲乌力 `--auto-mounted-action-asset-check --auto-mounted-action-asset-world-only`：
  - 世界 `8` 向、`40` 帧；
  - `runtimeBodyLayerCount=1`、`runtimeLayeredComposition=false`；
  - `requireBattle=false`、`errors=[]`；
- 月岚风狐 `--auto-pet-action-asset-check`：
  - 世界 `8` 向、`40` 帧；
  - 战斗 `2` 视角、`12` 动作、`180` 帧；
  - `runtimeMirroring=false`、`errors=[]`；
- Godot parse、Character Mount Art 与 Pet Battle Review Lab：`3/3`；
- 月岚单形态 Battle Catalog：
  - 运行帧 `180`；
  - 追踪 512px 母版 `180`；
  - 规范派生运行帧 `180/180`；
  - `errors=[]`；
- Pet Design Inspector：`errors=0 warnings=0`；
- 最终 MP4 媒体探测、帧数守恒、音量检查、完整音视频解码、JSON parse 与 `git diff --check`。

未运行全量本地 CI：本阶段没有产品代码、资产像素、网络、服务端、数据库、UI 或热路径变更；三项定向资产门禁、真实主场景录像、全动作/八方向联系表与完整媒体解码覆盖本轮风险。

## 当前门禁与下一步

本阶段结束时保持：

```text
crystalStandaloneWorld.ownerReview=pending
crystalMountedWorld.ownerReview=pending
moonGaleStandaloneBattle.ownerReview=pending
targetBundle.ownerReviewStatus=pending
targetRuntimeEnabled=false
evolutionRoute.assetGate.status=deferred
globalEvolutionRuntimeEnabled=false
P1.3e=not_complete
```

下一步先由项目所有者观看本片并分别决定这三项视觉是否通过。即使三项都通过，也只先登记精确范围的 visual-only owner decisions；整宠 bundle、两条生产进化路线和全局运行门禁是否开放，仍须另行讨论，不能从视觉批准自动推导。
