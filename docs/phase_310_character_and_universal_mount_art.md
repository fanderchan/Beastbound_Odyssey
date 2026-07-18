# Phase 310：正式人物与通用分层骑乘美术

日期：2026-07-18

## 本阶段结论

首套正式人物“见习猎人”和芽耳布伊骑乘样板已经接入真实 Godot 世界/战斗绘制链。骑乘不采用“每个人物与每只宠物重新画一套合成图”，而是运行时依次绘制：贴地阴影、坐骑原动作帧、可复用骑手姿态帧、坐骑近侧遮挡区域。芽耳布伊只增加逐帧座位挂点、比例和遮挡配置，原有宠物 `idle/walk` 动作帧原样复用。

当前完成的是四足跨坐类别的第一个正式样板，不代表所有宠物已经有可骑资产。双足高肩、飞行背带和蛇形背台已保留合同类别，但在各自第一只代表宠通过视觉验收前保持 `contract_reserved`，不能用错误姿态强行开放。

## StoneAge 8.0 参考与 Beastbound 取舍

稳定本地 StoneAge 参考的 `tagRidePetTable` 直接记录 `rideNo/charNo/petNo/petId`，并在 `char_base.c` 中维护 296 项人物与骑宠组合映射。这对有限人物、有限骑宠的旧式预烘焙资源有效，但 Beastbound 的目标是所有宠物最终可骑；继续按人物×宠物组合扩张，会让人物、服装和宠物数量相乘。

Beastbound 保留石器式“人物确实坐在宠物上、近侧身体遮住骑手腿部”的视觉结果，但把资源结构改成挂点与分层组合。这是针对“全部宠物可骑”产品差异的必要改造，不改变原骑宠术、宠物状态、战斗属性或伤害分摊规则。

本地参考：

- `/Users/fander/projects/_local_references/StoneAge/gmsv/src/include/char_base.h`：`tagRidePetTable`。
- `/Users/fander/projects/_local_references/StoneAge/gmsv/src/char/char_base.c`：`ridePetTable[296]`。

## 通用方法

### 1. 把组合数量从相乘改为相加

- 旧做法：`人物数 × 宠物数 × 动作数 × 方向数` 张合成帧。
- 当前做法：`人物外观数 × 骑乘体型类别数` 套骑手姿态，加上每只宠物本来就需要的世界动作帧和一份小型挂点配置。
- 同类四足宠新增时，不再重画见习猎人与该宠物的组合；只测量每帧座位位置、整体比例、落地点和近侧遮挡区。
- 只有骑法本质变化时才新增骑手姿态包，例如四足跨坐与飞行背带不能共用同一姿态。

首个样板的数字证据：人物共 56 张运行帧，其中普通 `idle/walk` 28 张、四足骑乘 `ride_idle/ride_walk` 28 张；芽耳布伊复用现有正背 `idle/walk` 28 张；人物×芽耳布伊烘焙组合图为 0 张。以后增加一只同类四足宠，不新增人物帧。

### 2. 每帧挂点而不是固定偏移

坐骑走路时背部会上下和前后变化，单一固定坐标会产生人物漂浮或滑鞍。`mount_visual_profiles.json` 因此为每个视角、每个动作、每一帧记录 `seatAnchors`。骑手动作使用自身 `riderAnchor` 对齐该点，坐骑与骑手各自仍保持独立原图。

这个结构采用了成熟 2D 动画工具的通用思想：插槽负责绘制顺序，点附件负责保存位置/旋转；当前项目继续使用高清逐帧手绘资源，不引入 Spine 运行时，也不为了骨骼复用而扭曲已确认的手绘轮廓。

### 3. 用前景遮挡解决“粘合感”

只把人物放到宠物上方会像贴纸叠贴。当前绘制顺序为：

1. 贴地软阴影；
2. 完整坐骑；
3. 对齐座位挂点后的骑手；
4. 从同一张坐骑帧重绘一个或多个 `frontOccluderRegions`。

最后一步让芽耳布伊近侧头、背毛或身体自然遮住骑手腿部。遮挡区域来自同一坐骑帧，不是额外重画的组合素材；复杂宠物以后可配置多个区域，仍不需要人物×宠物合成图。

### 4. 体型类别

- `quadruped_straddle`：四足跨坐，已完成运行时和芽耳布伊样板。
- `biped_shoulder`：双足/高肩宠，合同预留。
- `flying_harness`：飞行宠背带骑姿，合同预留。
- `serpentine_platform`：蛇形或无明显背部宠的背台/悬浮承载，合同预留。

新增宠物时先归类；现有类别能成立就只校准配置，不能成立才新增类别。禁止为了“全部可骑”把明显不合适的宠物强行套四足姿势。

## 美术资产

见习猎人为项目原创年轻成年猎人：暖棕肤色、深栗短发、骨片嫩叶发饰、赭黄兽皮短衣、米白毛边、暗砖红腰巾和深青斜挎带。正背两个三分之四视角完成：

- 普通 `idle`：正背各 6 帧；
- 普通 `walk`：正背各 8 帧；
- 四足 `ride_idle`：正背各 6 帧；
- 四足 `ride_walk`：正背各 8 帧。

母版和 QA 帧为 512×512，运行帧为 256×256；全部运行帧完成透明边去紫、孤立像素清理和单一主体连通检查。原图、提示词、身份锁、规范化过程和来源权属均保存在 `client/godot/assets/characters/novice_hunter/`。用户尚未视觉拍板，因此 manifest 明确保持 `self_review_passed_owner_review_pending`，不会误标为正式发行验收通过。

芽耳布伊原世界动作帧也同步完成透明边去紫，不改轮廓、动作节奏或玩法数据。

## 运行时与安全边界

- `CharacterActionAssetCatalog` 只在首次使用时预热人物纹理，之后按动作/时间从缓存取帧。
- `MountVisualProfileCatalog` 首次读取配置后缓存；绘制热路径不读文件、不解析 JSON、不扫描宠物目录。
- 主循环每帧只比较原始 `ridePetInstanceId` 字符串；只有该 ID 真正变化时才扫描一次当前宠物实例并切换坐骑形态。
- 正常世界中的 `Player.tscn` 已使用正式人物图；有效骑乘芽耳布伊时切换到分层组合。战斗人物骑芽耳布伊也走同一挂点合同，旧老虎/雷龙仍保留原占位回退。
- 芽耳布伊只复用项目既有骑宠资格、骑宠术、状态轮转、Lv200 技能上限和战斗公式。没有新增充值、属性、伤害、等级门槛或服务器协议。
- 普通玩家界面没有出现 QA 文案、挂点、遮挡区或调试信息。

## 验证与性能

- `godot --headless --path client/godot --quit`：通过。
- `node tools/run_godot_auto_checks.mjs --only=--auto-character-mount-art-check,--auto-pet-action-asset-check,--auto-riding-system-check,--auto-animation-state-check,--auto-movement-check --fail-fast`：Godot parse 加 5 个定向门禁，`6/6` 通过；日志 `.run/godot_auto_checks/2026-07-18T12-23-30-521Z.log`。
- `node --test server/node/test/auth-profile-actions.test.js`：`38/38` 通过，包含芽耳布伊使用共享骑乘资格合同；内存存储测试，没有连接或改动共享 MySQL。
- 当前分支 1280×720 真实跨帧移动稳定 60 FPS、`process_total=0.30..0.36ms`；从提交前 HEAD 导出的独立基线用同机同命令为 `0.28..0.38ms`，区间重叠，没有可测持续退化。
- Apple M5 Metal 录制 301 帧、1280×720、30 FPS 骑乘预览，Godot 报告 CPU 渲染平均 `0.03ms/frame`。这只证明本机两组骑乘样板的客户端余量，不代表 200 人同图或服务器容量。

## 评审证据

- 最终 1280×720 实机截图：`.run/art_evidence/character_mount_preview.png`
- 10 秒正背人物与正背骑乘循环：`.run/art_evidence/character_mount_preview.mp4`
- 视频抽帧总览：`.run/art_evidence/character_mount_preview_contact.png`

### 八方向补充复核

用户要求补看不骑宠与骑宠的八方向后，新增可重复使用的八方向总览/逐项录像场。它严格调用正式运行时的 `world_view_for_direction` 与 `world_flip_h_for_direction`，没有为了录像伪造额外角度。

复核结果是：逻辑方向为 8 个，但当前只有正背 2 套独立母版，经水平镜像后只有 4 种视觉朝向。南/西南/西复用同一正面未镜像画面，北/东北/东复用同一背面未镜像画面；西北和东南分别使用背面/正面镜像。因此当前只能称为“八方向输入映射”，不能称为“八套独立视觉视角”。

- 八方向同屏总览：`.run/art_evidence/character_mount_eight_directions.png`
- 14.4 秒八方向逐项 Metal MP4：`.run/art_evidence/character_mount_eight_directions.mp4`
- 八方向录像抽帧：`.run/art_evidence/character_mount_eight_directions_contact.png`

如果正式标准要求八个几何上可区分的朝向，后续应为人物普通/骑姿和每只坐骑补充正南、正北、正东三套基准视角，正西由正东镜像；现有东北/西南及镜像继续覆盖四个斜向。这样仍然不产生人物×宠物组合图，但每只可骑宠都需要自己的五向世界动作母版，不能靠挂点系统凭空制造缺失的观察角度。

## 可选人工验收

1. 先看截图，确认见习猎人的风格、体型和色彩是否适合作为首版人物基线；通过标准是 1280×720 下轮廓清楚、与芽耳布伊不突兀，也不像复制石器人物。
2. 看 10 秒视频，分别观察正面和背面行走；通过标准是臀部不离开背部、人物不横向滑动、腿与宠物近侧身体有自然遮挡、阴影贴地。
3. 在真实客户端给测试号设置芽耳布伊为骑乘状态，连续向八方向移动；通过标准是镜像方向不反转发饰/挎带的主要阅读、上下骑不残留双人物或旧色块、移动速度和碰撞不变。
4. 当前最值得用户判断的是“人物风格是否可作为后续服装基线”和“芽耳布伊作为小体型坐骑是否显得过大/过小”。挂点微调不需要推翻资产管线。

## 仍未完成

- 只有四足跨坐类别和芽耳布伊完成；其他宠物仍需归类、挂点/遮挡校准和逐只视觉验收。
- 见习猎人尚缺战斗攻击、受击、防御、昏厥、武器差异与装备换装资产。
- 骑宠战斗受击、倒下、被击落和骑手分离演出仍沿用既有系统结果，尚未生产专属正式动作。
- 八方向实机复核确认现有两个斜向母版及镜像只能形成 4 种视觉朝向；若要求真正八方向，需要补充人物和宠物的正南、正北、正东母版，而不只是继续复用斜向图。
- 人物与芽耳布伊都保持用户视觉验收待定；未据此开放全部宠物骑乘美术门禁。

## 外部方法参考

- Godot `Skeleton2D` 文档：https://docs.godotengine.org/en/stable/tutorials/animation/2d_skeletons.html
- Spine slots：https://us.esotericsoftware.com/spine-slots
- Spine point attachments：https://en.esotericsoftware.com/spine-points
