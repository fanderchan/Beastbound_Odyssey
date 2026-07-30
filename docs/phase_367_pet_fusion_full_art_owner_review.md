# Phase 367：首批融合宠完整非骑乘美术包与项目所有者验收

## 结论

曜冠角兽与苔垒角兽已经各自完成一套隔离的完整非骑乘宠物包，并完成机器检查、运行时实载、自审和真实 `Main.tscn` 的 `1.00x` 动态证据。

本阶段停在“完整包项目所有者验收”门前：

- 两套包都保持 `ownerReviewStatus=pending`、`runtimeEnabled=false`；
- `rideableTarget=false`、`supportedMountedCharacterIds=[]`，没有人物、骑乘或 mounted 目录；
- 没有修改生产 `pet_art_catalog.json`；
- 没有向生产 `pet_fusion_recipes.json` 写入配方，目录仍为关闭零配方；
- 没有开放玩家融合入口，也没有连接共享 MySQL 或修改真实玩家数据。

因此本阶段交付的是可完整观看和审核的冻结候选，不是发布批准，也不是融合功能开放。

## 两套完整包

| 目标 | formId | 身份 | 世界 | 战斗运行帧 | 战斗 512px 源帧 | 完整安装文件 | 战斗包 digest |
| --- | --- | ---: | ---: | ---: | ---: | ---: | --- |
| 曜冠角兽 | `emberhorn_fusion_solar_crown_fire7_wind3` | 四张独立 512px + 1024px 身份板 | 真八向 `idle 1 + walk 4`，共 40 帧 | 双视角 12 动作，共 180 帧 | 180 | 579 | `5661bcfbccf02121200d1ae3bec79fd8c015380d87ab4e3c449eaf960a3c6636` |
| 苔垒角兽 | `emberhorn_fusion_moss_rampart_fire4_earth6` | 四张独立 512px + 1024px 身份板 | 真八向 `idle 1 + walk 4`，共 40 帧 | 双视角 12 动作，共 180 帧 | 180 | 579 | `525223069f3d340d19ee76b006538d0ed47b96654e5df4519a00da602be8d629` |

两套战斗动作都严格为：

```text
idle 6
walk 8
attack 8
skill 8
hurt 6
defend 6
dodge 8
counter 8
stagger 8
knockaway 8
down 8
revive 8
```

两个视角分别为 `front_3quarter_sw` 与 `back_3quarter_ne`，没有运行时镜像。两只宠、两个视角的 `down-8 == revive-1` 在 512px 源帧和 256px 运行帧上都逐字节相等，保证昏厥到复起连续；普通攻击场景没有触发击飞，回避有独立姿势和运行时位移，击飞、倒地、复活是不同语义。

## 来源与可追溯性

身份、世界和战斗都保留原始生成与确定性处理链：

- 身份包保存原始生成 PNG、无损 WebP、四张独立 512px 姿势、1024px 精确构图、逐字提示词、流水线元数据和自审指纹；
- 世界包保存两组原始生成动作表、逐字提示词、构建器流水线元数据、40 张 512px 源帧和 40 张 256px 运行帧；原始动作表和构建目录仍位于同一隔离生产工作区，项目所有者批准前不冒充生产归档；
- 战斗包保存每动作原始生成图、必要的确定性重排输入、重排元数据、逐字提示词、流水线元数据、QC、180 张 512px 源帧和 180 张规范派生运行帧；
- 来源账本显式记录 `original raw → repacked pipeline input → split source frame → derived runtime frame` 各层哈希；full 安装模式每包安装 579 个文件，并验证 578 个输入来源文件；
- 苔垒受击错误视角、苔垒技能地裂粘连和曜冠受击错误网格等淘汰候选保留在隔离工作区，未混入冻结包。

`install_pet_battle_bundle.py` 还修复了一个容易制造误解的元数据问题：安装完整战斗矩阵后，不再保留身份阶段“只有四姿、尚未制作世界和战斗动画”的旧说明。若目标根已有完整真八向，工具现在会明确写出身份、真八向和双视角战斗矩阵都已安装，但仍不授予 owner、runtime 或 release 批准；该行为已有独立回归。

## 隔离运行门禁

为让未登记生产目录的完整包进入真实 `Main.tscn` 审片，而不绕开生产权威，本阶段新增 debug/test-only 隔离 overlay：

- 只接受仓库 `.run/` 或 `user://` 内的绝对根；
- 拒绝 `res://` 正式资产、目录越界、软链接、mounted/character 目录、错误 formId、任何运行/发布真值；
- 精确要求不可骑、两个战斗视角、12 动作、180 战斗帧、真八向 40 世界帧和四张身份姿势；
- 战斗审片只能使用固定 14 场 director，不允许裁剪步骤、切换自动模式或传入骑乘 form；
- 底层仍是 20 actor 的 10V10 状态，但项目所有者审片只显示两边战宠，隐藏无关的蓝色人物占位，mounted 始终为 0；
- 全程锁定真实 `1.00x`；工具收起后只保留右侧小按钮 `1× · 工具`，不遮挡观战；
- single-loop 录制结束会停止音频、等待录制排空并释放动态纹理，最终日志没有 ObjectDB 或资源泄漏警告。

隔离 overlay 不改变普通 GM 模拟战、正常运行目录、服务端融合事务或玩家档案。

## 世界真八向证据

| 目标 | 视频 | 规格 | SHA-256 | 八向总览 SHA-256 |
| --- | --- | --- | --- | --- |
| 曜冠角兽 | `.run/evidence/p1_4e_fusion_full_pack/world-review/p1-4e-solar-world-final/emberhorn_fusion_solar_crown_fire7_wind3/review.mp4` | 1280×720、30 FPS、433 帧、14.433333 秒 | `45c76be52aca879250234077313b2f6ab4547617713022185f6c8f8fd48c37be` | `eb7abe18636cfafd3d314d69dbcdaab91673cb2fa8a3e0c58662f609c7a467f8` |
| 苔垒角兽 | `.run/evidence/p1_4e_fusion_full_pack/world-review/p1-4e-moss-world-final/emberhorn_fusion_moss_rampart_fire4_earth6/review.mp4` | 1280×720、30 FPS、433 帧、14.433333 秒 | `3176373cc46421be550ecf40da014536a215c7e6d6af3e3eacccaabb9a8de022` | `fc1d9c67c5cad4007f0f1916cbe87165df8d0736d2bbea673918cbb71f52fe66` |

两份证据都在预检、录制和总览阶段对 40/40 实际加载帧做 canonical RGBA 一致性检查。八个方向均为独立源，不做水平镜像。

旧的隔离批审计尝试曾把一个故意不具备正式 v1 header、正式配方和生产字段的临时 catalog 交给生产审计器，因此按设计失败关闭；该报告不能被表述为通过。它仍确认每只宠的 40 个世界帧和 180 个战斗运行帧全部存在并可解码，同时把 6 个方向的外接框中心变化列为 pending。逐四相复核表明这些变化来自尾巴和前后肢张合：两只宠全部方向的脚底基线漂移均为 0px，真实 `1.00x` 动态中主体锚点稳定。当前不通过强移整帧去“压数值”，避免反向制造身体左右抖动；最终 owner 决定和运行开放前的正式目录审计仍保留这一检查点。

## 战斗证据

| 目标 | 视频 | 规格 | SHA-256 | 接触表 SHA-256 |
| --- | --- | --- | --- | --- |
| 曜冠角兽 | `.run/evidence/p1_4e_fusion_full_pack/battle-review/solar-crown-owner-review-v2/review.mp4` | 1280×720、H.264、30 FPS、1223 帧、40.766667 秒、有声、全程 `1.00x` | `09b1b088aa9180be414c405433c6744832c6bf0a601b2240bd57b8c65a636ccb` | `19341e927c0864862638f5fc62d36b5b07a9e39931a59850789fb7f67afccb31` |
| 苔垒角兽 | `.run/evidence/p1_4e_fusion_full_pack/battle-review/moss-rampart-owner-review-v2/review.mp4` | 1280×720、H.264、30 FPS、1223 帧、40.766667 秒、有声、全程 `1.00x` | `7ff4df9930dc09215eb75a6ef400239756a6b8f609b6c97c5b1be300847b25eb` | `236033ff4d843d54d34ef0e97afecc87d06dcf1b3ddf649549cfd781f7517182` |

两条视频都完整覆盖：

```text
普通攻击
防御承压
普通受击
反击
致死反击
击飞反击
技能
合击
直线击飞
弹飞
回避
回避反击
倒地
复活
```

视频没有加速滤镜，时间线和战斗速度都锁在 `1.00x`。两条音轨均为 48kHz 双声道，整合响度约 `-23.4 LUFS-I`、LRA `5.3 LU`、真峰值 `-3.8 dBFS`；完整解码零错误。

## 验证

- `python3 -m unittest tools.test.test_install_pet_battle_bundle tools.test.test_stage_pet_battle_bundle`：`26/26`；
- `python3 -m unittest tools.test.test_pet_art_batch_audit tools.test.test_record_world_direction_review tools.test.test_world_semantic_approval`：`73/73`；
- `node tools/run_godot_auto_checks.mjs --only=--auto-standalone-pet-art-overlay-check --fail-fast`：`2/2`；
- 战斗相邻回归 `--auto-pet-battle-review-lab-check`、`--auto-battle-auto-10v10-check`、`--auto-battle-visual-timing-check`、`--auto-battle-reaction-check`：`5/5`；
- `godot --headless --path client/godot --quit`：通过；
- 两只宠、两个视角的 `down-8 == revive-1` 在 512px/256px 共 8 次逐字节比较全部通过；
- standalone director 性能探针稳定为 60 FPS，`process_total` 多数约 `0.04–0.24ms`，战斗绘制约 `5.10–6.14ms`；
- 两套世界视频和两套战斗视频均重新 `ffprobe` 并核对 SHA；
- `git diff --exit-code -- client/godot/data/pet_art_catalog.json client/godot/data/pet_fusion_recipes.json`：通过；
- `git diff --check`：通过。

没有运行完整本地 CI；本阶段的风险集中在项目所有者尚未确认两只宠的整体审美、世界步态和 14 段战斗表现，而不是缺帧、加速、骑乘混入或生产误开放。

## 后续唯一顺序

1. 项目所有者观看本阶段四条最终视频，批准或指出返工项；
2. 若批准，生成逐文件绑定的完整包 owner release 证明；
3. 同一受控切片内把两只 art form 与两条 formal fusion recipe 同步登记，但继续保持 `runtimeEnabled=false`；
4. 使用关闭态正式目录完成三宠选择、报价、二次确认、三消一生、遗传结果展示和断线重放 E2E，并交付真实 `1.00x` 视频；
5. 项目所有者另行决定是否开放 runtime；
6. 只有获得第 5 步的独立决定后，才开放玩家入口与运行开关。

P1.4 父项继续未完成。本阶段也不提前把项目所有者尚未看过的完整包标为批准。
