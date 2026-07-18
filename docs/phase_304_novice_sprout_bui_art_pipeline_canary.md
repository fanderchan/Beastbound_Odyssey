# Phase 304：芽耳布伊单宠高清资产管线试产

## 结论

本阶段没有直接批量制作晶甲乌力、月岚风狐或现有全部宠物，而是先用所有新玩家都会看到的教学宠“芽耳布伊”验证一条可重复的高清 2.5D 动画资产管线：

- 先锁定原创身份、两套正式视角、动作语言和明确禁区，再生成动作，不允许逐帧重新设计宠物；
- 保留 512×512 透明 QA 母版，Godot 使用 256×256 运行帧，在当前最大约 156px 的绘制尺寸下仍清楚，同时把单宠贴图估算从约 68MiB 降到约 17MiB；
- 完成正面三分之四、背面三分之四两套 `idle/walk/attack/hurt/defend`，共 68 帧；世界方向由两套正式视角加水平镜像映射；战场固定敌方在左、己方在右，敌方正面镜像为朝右下、己方背面镜像为朝左上，使双方真正面向对手；
- 已接入真实 `Main.tscn` 的世界跟随和战斗绘制。支持形态使用正式动画，其余宠物以及资源异常继续使用原程序占位，不会因单宠试产破坏现有内容；
- 工程门禁、实机自评、截图、MP4 和最终尺寸性能已经通过；项目所有者视觉评审仍待完成，因此不据此扩产，也不把 P1.3e、P2.2 或 P2.3 标成完成。

## StoneAge 8.0 基线与原创边界

StoneAge 8.0 只提供成熟的视觉行为基线：等距/三分之四视角、明快色彩、宠物轮廓在战斗队列中仍易辨识、动作短而直接。项目没有复制其宠物造型、纹样、像素、动作帧、数值、源码或音频。

Beastbound 的差异是 PC 1280×720 路径使用高清手绘精灵，并让教学宠保持亲切、朴素、战力较弱，不能看起来比商业宠或五转罕见强宠更华贵。芽耳布伊因此采用沙黄色四足幼兽、圆形绒耳上的双叶嫩芽、橄榄背纹和卷根尾作为原创身份锚点。这是为了建立项目自己的宠物语言，不是为了脱离玩家熟悉的石器式可读性。

## 身份与动作合同

形态 ID 为 `bui_novice_sprout_earth5_wind5`。不可漂移的身份由 `client/godot/assets/pets/novice_sprout_bui/identity/identity-lock.md` 统一维护：

- 小型四足、低重心、短腿，头身约 1:1；不得变成兔、猫、狐狸、猪或双足人形；
- 每只圆形绒耳固定一簇双叶嫩芽，背部固定橄榄叶脉纹，尾巴固定为一条带单叶的卷根尾；
- 两套正式战斗视角是 `front_3quarter_sw` 与 `back_3quarter_ne`；镜像只用于世界方向补足，不冒充第三套正式战斗视角；
- `idle` 6 帧、`walk` 8 帧、`attack` 8 帧、`hurt` 6 帧、`defend` 6 帧，每套视角 34 帧。

自评过程中实际退回并修正了四类问题：第一版身份板的耳朵过度叶片化、接近植物兔；背面行走第 6 帧丢失卷根尾；正面受击第 4 帧错误变成双足；背面待机/行走存在主体跨逻辑格。最后一类使用连通域重排工具修复，没有放宽切边门槛。

用户查看第一版实机截图时又发现一项集成错误：战场是敌左己右，但首版直接绘制了朝左下的敌方正面和朝右上的己方背面，导致双方都背对对手。根因不是缺少视角，而是战斗朝向没有应用水平镜像。现已把敌方固定为右下朝向、己方固定为左上朝向，并让 manifest、自动门禁、真实截图和 MP4 同步验证这条面对面合同；第一版战斗证据已作废并覆盖。

## 来源、目录与替换路径

- 总 manifest：`client/godot/assets/asset-manifest.json`；
- 动作合同：`client/godot/assets/pets/novice_sprout_bui/action-bundle-meta.json`；
- 来源与归属：`client/godot/assets/pets/novice_sprout_bui/identity/source-and-ownership.md`；
- 身份、提示和原稿：同一宠物目录下的 `identity/`、`prompts/`、`source/`；
- 512px QA 母版与 GIF/总览：`qa/`；
- 256px Godot 运行帧：`views/`；
- 处理工具：`tools/repack_chroma_sprite_grid.py` 与 `tools/build_pet_action_contact_sheet.py`。

身份、原稿和 QA 目录使用 `.gdignore`，不会被 Godot 当成运行纹理导入。运行时只加载 `views/`；世界进入时只预热 `idle/walk`，战斗开始或动作事件切换前预热全部五类动作。`_draw`、`_process` 和 HUD 签名中没有文件读取或纹理导入。

单宠连同可追溯原稿、512px 母版、GIF 和运行帧当前约 38MiB，作为一次性试产可以接受，但不能按同样方式直接复制到数十只宠物。用户确认美术方向后，批量生产前必须单列 Git LFS/独立资产包与母版归档策略，只让客户端取得所需运行帧，避免普通 Git 仓库膨胀到不可维护。

## Godot 接入与失败保护

`Pet.tscn` 增加正式精灵节点，但保留原程序造型作为回退。`pet.gd` 按当前跟随宠物 form、方向和移动状态取帧；未支持的 form 或取帧失败时自动显示原占位。

战斗渲染只对芽耳布伊启用正式精灵：己方取背面视角并朝左上，敌方取正面视角并朝右下，以适配现有敌左己右阵型；攻击、合击和技能暂映射到 `attack`，受击/倒地/状态反馈映射到 `hurt`，防御映射到 `defend`，闪避/换位映射到 `walk`。这只是本次五动作试产的兼容映射，不表示技能、倒地或进化动作已经生产。

独立开发预览 `--pet-action-art-preview` 使用临时默认档案和本地战斗状态，不连接后端、共享 MySQL、`auth1373` 或真实玩家数据。界面只显示玩家可理解的中文，不把 QA 标志、磁盘路径或技术状态泄露给正常玩家。

## 自动验证与性能

最终运行资源完成后执行：

- `git diff --check`：通过；
- `godot --headless --path client/godot --quit`：通过；
- `node tools/run_godot_auto_checks.mjs --only --auto-pet-action-asset-check --fail-fast`：`2/2` 通过，验证 manifest、动作合同、来源/归属、用户待验收状态、两视角五动作共 68 张运行帧均可加载且为 256×256，并验证世界/战斗预热与动作映射；
- Pillow 只读栅格门禁：`runtime_png=68`、`gif=10`、`errors=0`，逐张确认运行帧为 RGBA 256×256，十个循环 GIF 的帧数分别与动作合同一致；
- `godot --headless --path client/godot --scene res://scenes/Main.tscn --fixed-fps 60 --quit-after 900 -- --pet-action-art-preview --perf-probe --qa-viewport=1280x720`：修正朝向后仍稳定 60 FPS；世界稳定段 `process_total=0.03..0.08ms`、`draw_world=0.07..0.09ms`、`pet_follow=0.00ms`，战斗稳定段 `process_total=0.02..0.05ms`、`draw_battle=0.05..0.09ms`；首次世界绘制的 `0.95ms` 为启动/预热采样，随后回落，不进入持续热路径。真实 Metal 录制 243 帧的 CPU 渲染平均 `0.31ms/frame`。

没有运行完整本地 CI，因为本次改动有独立资产门禁、Godot parse、真实客户端录制和热路径证据；也没有启动或修改服务端、数据库和玩家档案。

## 实机证据

以下证据由真实 Godot 4.7 `Main.tscn` 在 Metal 4 / Apple M5、1280×720 下输出，不是说明图或重新绘制的效果图：

- `.run/evidence/pet_action_novice_sprout_bui/world_follow.png`：真实地图中的跟随比例、正面世界视角和清晰度；
- `.run/evidence/pet_action_novice_sprout_bui/battle_face_to_face.png`：真实战斗待机态，明确显示左侧敌方朝右下、右侧己方朝左上；
- `.run/evidence/pet_action_novice_sprout_bui/battle_attack_peak.png`：真实战斗渲染中的己方背面、敌方正面及攻击峰值；
- `.run/evidence/pet_action_novice_sprout_bui/novice_sprout_bui_godot_1280x720.mp4`：H.264、1280×720、20 FPS、约 12.15 秒；前半段展示世界待机、行走和转向，后半段展示战斗待机、防御、攻击和受击；
- `client/godot/assets/pets/novice_sprout_bui/qa/qa-contact-sheet.png`：两视角五动作的静态总览；同目录 GIF 供逐动作循环检查。

## 用户验收步骤

这一次不要求用户登录 GM 号或手工操作游戏，先看现成证据即可：

1. 先看 MP4 前约 5.5 秒：确认世界中的体型是否像一只新手教学宠，移动时四足没有滑步，转向不突兀；
2. 再看后约 6.5 秒：确认战斗中己方背面和敌方正面容易分辨，待机、防御、攻击、受击的意图不看文字也能理解；
3. 放大两张截图：确认当前 1280×720 实际尺寸没有明显糊边、锯齿、切边或颜色脏边；
4. 最后看动作总览：确认每帧仍是同一只宠物，嫩芽、背纹、四足和卷根尾没有丢失或增生。

通过标准：原创身份符合教学宠定位；比例与石器式 2.5D 世界/战斗可读性协调；两视角没有身份漂移；动作循环无明显滑步、跳帧、肢体闪烁或尾巴消失；256px 运行帧在实际尺寸下仍清楚。任何一项不通过，都先重做芽耳布伊和管线规则，不扩产其他宠物。

## 后续边界

芽耳布伊当前只是单宠试产，五动作也不是正式发行的完整动作集。用户确认美术方向后，先补足该宠的 `run/skill/down/celebrate` 等正式动作并固化模板，再生产晶甲乌力、月岚风狐的八类进化资产；如果用户否定造型、比例或动作语言，则回到身份锁和节拍重做，不把问题复制到 34 个形态。
