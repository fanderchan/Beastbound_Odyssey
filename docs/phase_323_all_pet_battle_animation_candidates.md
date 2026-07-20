# Phase 323：全 34 宠物独立战斗动画候选包

日期：2026-07-20

## 本阶段结论

现有宠物目录中的 34 个形态均已具备可由 Godot 读取的独立战斗动画候选包：每只 2 个正式斜向视角、12 个动作、180 帧，合计 6120 帧。动作覆盖 `idle / walk / attack / skill / hurt / defend / dodge / counter / stagger / knockaway / down / revive`，双方最终绘制继续遵守敌方与我方朝向战场中心的统一合同。

这里的“完成”只指 standalone pet battle 候选资产已经齐套并通过结构、解码、运行时加载和连续性门禁；不代表用户已经认可每只宠物的审美，也不代表世界真八向、人物骑宠整图、音频或正式启用已经完成。34 个动作包继续保持 `runtimeEnabled=false` 与 `ownerReviewStatus=pending`。

## StoneAge 参考与 Beastbound 取舍

石器时代 8.0 仍是战斗语言基线：普通攻击、技能、防御承压、回避、反击、击飞、可复活昏厥和复起必须让玩家一眼看懂因果。Beastbound 的差异是采用高清 2.5D 双斜向资产和可重复的 GM 动作验收场，因此需要更严格的朝向、透明底、比例、倒地/复活接缝和来源留档门禁；本阶段没有新增玩家玩法或暴露新的调试 UI。

## 收口内容

- 补齐并统一了 34 个形态的 12 动作/双视角/180 帧运行目录和 QA 联系表。
- 修复了会直接破坏战斗可读性的确定性问题，包括反向或缺失身体、攻击/反击比例跳变、击飞尾帧收缩、倒地与复活跳变、幼兽死亡叉眼/睡眠笑脸语义、部分动作裁切。
- 火灵转生兽正面技能 8 帧与背面防御 6 帧曾残留绿色/灰暗矩形。最终仅在历史原始洋红键控可证明传播出的精确遮罩内清除错误背景，14 帧共清除 337460 个背景像素，遮罩外 RGBA 变化为 0，透明区域 RGB 为 0。
- MM2 当前运行时 180 帧可用且通过本阶段门禁；后来生成但不能由当前统一 canonical 管线精确复现运行帧的 512px source handoff 没有提交，避免用错误来源记录覆盖已验证运行资产。

## 自动验证

以下验证均在提交后的 `2a756c19e` 上完成：

- `python3 tools/audit_pet_battle_catalog.py --require-complete`：`34/34`，`6120/6120` 帧通过；验证 RGBA/256px、动作数量、双视角映射和 `down-8 == revive-1` 连续性。
- 单进程 Godot battle-only 运行门禁：`checkedForms=34`、`checkedFrames=6120`、`errors=[]`；34 个包均能被实际资源目录预热和抽帧，双方 inward-facing flip 合同通过。
- `godot --headless --path client/godot --quit`：解析通过。
- `node .agents/skills/design-beastbound-pets/scripts/inspect_pet_design.mjs --check`：`errors=0`，保留既有的公开宠物投影统一化警告，与本阶段美术无关。
- 34 宠运动启发式复扫确认帧目录稳定、`34/34` 无运行中漂移；它仍把 13 个形态列为错误候选、21 个形态列为警告候选。该工具会把合法的倒地、击飞缩放、VFX 包围盒和贴边姿势误报，因此只作为逐帧审片索引，不能冒充美术通过结论。

没有运行全量 local CI，也没有重跑服务器测试：本阶段只改变图片、动作元数据和 QA 证据，窄门禁已覆盖实际风险。

## 可视化证据

- 全 34 宠关键动作四页总览：`.run/evidence/phase323_all_pet_battle_candidates/all34_battle_keyframes_01.png` 至 `all34_battle_keyframes_04.png`。
- 火灵转生兽真实 `Main.tscn` 动作导演：`.run/evidence/phase323_all_pet_battle_candidates/fire_rebirth_beast_director.mp4`，1280×720、60 FPS、874 帧、14.57 秒；Godot Movie Maker 平均 CPU render `0.08 ms/frame`。
- 火兽影片抽帧：`.run/evidence/phase323_all_pet_battle_candidates/fire_rebirth_beast_director_contact.png`。
- 每只宠物自己的完整双视角 12 动作联系表：`client/godot/assets/pets/<formId>/qa/battle/contact-sheet.png`；逐动作 GIF 位于同目录 `actions/<view>/`。

## 提交记录

本阶段以窄宠物目录提交，始终排除 Godot `.import/.uid` 和其他并发的 mounted/world 改动：

- `41c9ae555`、`f8eb74bf5`：潮纹幼兽、厚皮布伊。
- `d92316670`、`7bb275a95`、`1a655c935`：地纹/焰纹/四灵幼兽昏厥链。
- `abafaae23`：蓝人龙、高地风狐、月岚风狐。
- `08c9ea1d6`、`95e7a3c39`、`f23343773`、`9a66ca006`：角兽与雾潮鳍兽。
- `079e4007d`：雾风狐与晒甲苔背兽。
- `dabe77cde`、`8e61323c0`、`e11dabc4c`、`2a756c19e`：地/水/风/火四灵转生兽。

## 仍未完成与人工验收

P2.2/P2.3 继续保持未完成，原因如下：

1. 34 个候选包仍需项目所有者按关键动作总览和逐动作 GIF/实机导演判断轮廓、比例、打击感、动作重量和昏厥语义。
2. 多数宠物仍缺世界真八向 `idle 1 + walk 4` 共 40 帧；多数宠物也没有人物骑宠世界/战斗整图。
3. 骑宠人物专属攻击、受击、防御、回避、反击与合击整图尚未全量生产。
4. BGM、环境音、普通攻击/技能/防御/击飞/昏厥音效尚未生产。
5. 部分历史包仍有 canonical 512px 来源重建债务；在重新生成、逐哈希验证并经用户审片前，不因此启用运行时。

建议人工验收先看四页总览，圈出明显不对的宠物；再只打开这些宠物的 `qa/battle/contact-sheet.png` 与 GIF。这样无需先在游戏里逐只等待随机事件。对最终候选，再进 `GM/QA → 宠物动作验收场`，用动作必现模式检查攻击接触、防御受击、回避反击、击飞、昏厥和复活。
