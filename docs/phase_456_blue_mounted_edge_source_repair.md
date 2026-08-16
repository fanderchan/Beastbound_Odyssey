# Phase 456：蓝人龙整体骑乘边缘与倒地／复起来源修复

## 当前结论

项目所有者此前连续指出战斗双方朝向错误、人物像单腿走路、动作存在但不流畅。本阶段不再通过运行时翻转
猜测或后处理掩盖素材问题，而是把蓝人龙整体骑乘候选的剩余严格素材阻断收口：重新生成五组完整人骑宠
动作，清除两处洋红边风险，并在两个正式视角同时建立倒地末帧到复起首帧的硬连续性。

本轮安装范围：

| 视角 | 动作 | 帧数 |
|---|---|---:|
| `front_3quarter_sw` | stagger、down、revive | 24 |
| `back_3quarter_ne` | down、revive | 16 |

40 张修复运行帧已经并入原 180 帧整体骑乘包，统一 digest 为
`b644f3bd7b5fe20c00b855ad937bdd8587147ae99858ac27c74f4b186fb67045`。候选达到技术审片门槛，
但没有获得项目所有者的明确视觉批准，继续保持
`ownerReviewStatus=pending / runtimeEnabled=false`，不生成 owner decision，也不开放普通玩家运行路径。

## 正式来源与连续性

历史 `.run/art_batch_phase322/blue_mounted_battle/` 工作档在本次恢复搜索中已不可用。为了不把现有
256px 运行图放大后冒充高清源图，也不把重写文本伪装成历史 prompt，本轮直接按同一蓝人龙、见习猎人、
低鞍和缰绳身份锁重新生成五组动作，并跟踪：

- exact `prompt-used.txt`；
- ImageGen 原始 PNG、实际色键输入和预处理 metadata；
- 512×512 透明源帧和 256×256 运行帧；
- 逐帧文件、RGBA、alpha 哈希；
- 规范 `build_pet_art_bundle.py` 重放及安装结果比对；
- 生成缓存与仓库原始归档的逐字节同一性。

五组 canonical replay 均逐文件、逐 RGBA 精确相等。前／背两视角均满足：

```text
source down-8 == source revive-1   (512px, bytes + RGBA exact)
runtime down-8 == runtime revive-1 (256px, bytes + RGBA exact)
```

正式证明目录：
`client/godot/assets/mounted/novice_hunter_v1/blue_man_dragon_water10/source/battle/repairs/phase456-blue-mounted-edge-source-repair-v1/`。

## 边缘处理边界

旧候选的两处严格洋红边不能用全局“去紫”滤镜处理，因为蓝人龙自身存在合法蓝紫高光。新动作只在具备
明确生成底色和精确色键操作资格的来源流水线上重新去背；没有对成品整图做启发式 despill，也没有改写
遮罩外 RGBA。

40 张修复运行帧结果：

- 宽松洋红疑似边：`0`；
- 强洋红边：`0`；
- 全透明 RGB 泄漏：`0`；
- 最小运行安全边：`8px`；
- 人物与坐骑始终为一个完整画面，不存在运行时／离线人物层与宠物层拼接。

## 实机朝向、动作与审美判断

真实 `Main.tscn` 逐段片覆盖行进、攻击、技能、防御、受击、反击、致死反击、三骑合击、回避、回避反击、
直飞、弹飞、倒地和复起。运行时合同与画面一致：

- 敌方使用 `front_3quarter_sw + flipH=true`；
- 我方使用 `back_3quarter_ne + flipH=true`；
- 两侧都朝向战场中心，未再出现同边角色背对目标；
- 运行时只有一个完整 body layer，不做分层合成或镜像补另一视角。

美术总监自评：蓝人龙的高饱和晶蓝身份稳定，骑手、鞍具和背甲的体块关系清楚；新倒地从直立、失重、
伏地到完全接地有明确重量，复起从同一伏地帧开始，不跳位、不换朝向、不掉鞍。前视 stagger 的后坐节奏
比旧候选更容易读懂。当前的短板不是技术断帧，而是早期蓝色角色群在满阵型时色相过于统一、视觉密度偏高；
这属于后续全局阵容配色与战场层级问题，不应靠破坏本形态身份色来修复。就本候选而言，动作连贯性、接地、
朝向和身份一致性已经达到可交给项目所有者审片的质量。

## 精确审片证据

- 视频：`.run/evidence/phase456_blue_mounted_battle_owner_review/phase456-blue-actions-v1-main-20260816-a/Beastbound_Phase456_Blue_Actions_v1_Main_1x.mp4`；
- 规格：1280×720、60 FPS、2372 帧、39.533333 秒、H.264 `yuv420p` limited range + 48 kHz 双声道 AAC、全程 `1.00×`；
- SHA-256：`43a8a7e10a2381f48b38fddf72db50cfa8c2f85ca7aff1d64c58d7ce4e10dcc6`；
- FFmpeg 全音视频解码：0 error；
- 仓库内五组返工联系表：`qa/battle/repairs/phase456-blue-mounted-edge-source-repair-v1-contact.png`。

录像使用隔离 `automation` 用户数据通道，结束后验证真实玩家目录清单 SHA-256 保持
`c08e583b461dd622743bf3f27ee47167c7ac8310cc920c42f4a8ad63d95a0dab`，并清理隔离目录。

## 验证

```text
Phase456 formal replay
5/5 action bundles exact
40/40 repaired runtime frames exact
180 total runtime frames inventoried
front/back 512px + 256px down/revive continuity exact
possible magenta=0 / strong magenta=0 / transparent RGB leak=0

tools/pet_art_batch_audit.py (isolated candidate)
mounted expected/validated PNG=220/220
mounted errors=[] / pending=[] / warnings=[]
mounted sourceReadiness=verified
24/24 exact prompts
180/180 validated source-frame hashes
332 installed files / 546 validated source entries

godot --headless --path client/godot --quit
PASS

run_godot_auto_checks.mjs --only=--auto-mounted-action-asset-check
2/2 PASS (parse + standard mounted action asset check)

explicit blue_man_dragon_water10 mounted action asset check
12 actions / 180 frames / 2 views / errors=[]
enemy front_3quarter_sw + flipH=true
ally back_3quarter_ne + flipH=true
both matchesBattlePet=true

QA user-data lane
attestation=passed / real player inventory unchanged / cleanup=passed

real Main MovieWriter + FFmpeg full decode
PASS
```

全库宠物审计仍会显示同名 standalone pet 的历史洋红提示；其路径位于
`assets/pets/blue_man_dragon_water10/`，不属于本次
`assets/mounted/novice_hunter_v1/blue_man_dragon_water10/` 整体骑乘候选。本 mounted 包自身无
pending、warning 或 error。

## 发布边界

本轮可以作为技术闭环的 owner-review 候选提交和推送，以保证来源与代码仓库可恢复；这不等于视觉批准或
玩家发布。项目所有者观看上述精确视频并明确批准后，才可写独立 owner decision／release attestation，
重新验证绑定 SHA，并决定是否把 `runtimeEnabled` 打开。P2.2 在此之前继续保持未完成。
