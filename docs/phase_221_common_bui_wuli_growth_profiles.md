# Phase 221：普通布伊/乌力物种成长接档

日期：2026-07-11

## 目标

P0.2d 的第一小段先处理玩家最早接触、最适合反复捕捉和练级观察的六个普通形态：三只布伊与三只乌力。目标不是整体重做宠物平衡，而是让这些宠物从仅有等级/经验的 legacy 路径进入完整的服务端权威养成闭环：

1. 捕捉或 GM 创建时一次性决定 Lv1 可见四维和隐藏成长。
2. Lv1 候选在遇敌时冻结，捕捉成功后原样转移。
3. 普通 EXP、挂机、道具和 GM 升级统一逐级结算四维。
4. 玩家继续通过实际升级观察、评级和实测外推 Lv140 判断去留。
5. 旧的同形态宠物不补种子、不重抽、不改属性，继续 `legacy_existing`。

临时完整设计合同位于 `.run/pet-design/p0_2d_common_bui_wuli_growth_backfill.json`，已通过项目宠物 Skill 校验；它不进入版本库。

## 数值与定位

本阶段保留现有 Lv1 基础、元素、捕捉难度、技能和世界位置，只为每个形态增加独立的物种成长档。三类定位仍为火攻、风速、地防；稀有度不直接换成无条件数值碾压。

| 形态 | 新成长档 | 平均每级生命/攻/防/敏 | 万人 Lv140 平均战力 | 定位与弱点 |
| --- | --- | --- | ---: | --- |
| 红色普通布伊 | `bui_normal_red_fire10_v1` | 7.8 / 2.25 / 1.05 / 1.25 | 1036.73 | 攻击较高，防御普通 |
| 黄色普通布伊 | `bui_normal_yellow_wind10_v1` | 7.2 / 1.40 / 1.00 / 2.30 | 1068.22 | 高速，血防较低 |
| 厚皮布伊 | `bui_normal_thick_earth10_v1` | 9.2 / 1.25 / 2.05 / 0.95 | 1034.63 | 血防较高，速度低 |
| 普通乌力 | `wuli_normal_orange_fire10_v1` | 8.4 / 2.15 / 1.15 / 1.15 | 1035.34 | 常见均衡偏攻击 |
| 高速乌力 | `wuli_normal_fast_wind10_v1` | 7.7 / 1.45 / 1.00 / 2.25 | 1102.69 | 高速，血防较低 |
| 高防乌力 | `wuli_normal_tough_earth10_v1` | 10.2 / 1.25 / 2.05 / 0.90 | 1083.26 | 高血防，进攻和速度低 |

所有档案使用 `weighted_center + 2% extreme`。每个形态的 Lv1 浮动和隐藏成长范围不同；Lv1 四维有抓极品反馈，但不会单独决定最终品质。

## 权威万人审计

新增 `tools/pet_growth_population_audit.mjs`，直接调用 Node 正式 `pet_growth_authority_v1` 的私有 roll、逐级 noise、六位连续累加和公开取整规则，而不是复制一份近似公式。工具支持：

- `--profiles id,id` 或 `--all`；
- 每档自定义样本数；
- 输出 Lv1、每级成长、Lv140 与 2–140 级观察分位表；
- 校验三维成长、生命成长、Lv140 平均战力目标；
- 仅在全部通过时用 `--write-observations` 回写离线观察表。

六个新档各 10,000 只、Lv1→Lv140 审计通过，并写入 139 个等级的观察阈值。随后对当前全部 13 个 linked 成长档进行 130,000 只全量复核，通过后报告位于：

- `.run/godot/p0_2d_common_bui_wuli_10000.json`
- `.run/godot/p0_2d_all_linked_13x10000.json`

全量复核还发现蓝人龙旧 `targetAudit` 小于其已经上线的随机理论范围；本阶段只把三维目标从 `4.1–5.2` 校正为 `3.9–5.3`、生命目标从 `7.2–9.4` 校正为 `7.1–9.5`，不修改实际成长数值。审计允许 `0.01` 的公开取整容差，避免把 `7.403` 对 `7.400` 这类合法量化误差当成平衡失败。

## 兼容与安全

- 模板新增 `growthSpeciesProfileId` 只决定新宠选择的 active profile。
- 旧乌力/布伊只有 `formId`、没有 authority envelope 时，严格目录返回 `legacy_existing`，不会按新档案补种子或重算属性。
- 新乌力/布伊由统一 factory 直接创建 canonical authority-v1，不会先 legacy 再升级。
- 捕捉候选的 `petGrowth.private.privateSeed`、candidate secret 和实例 ID 独立生成；玩家响应不公开种子或隐藏 roll。
- 剩余 18 个未接档形态继续 legacy，本阶段不伪装成全部完成。

## 验证

通过：

- Pet Design Contract 校验。
- `inspect_pet_design.mjs --check`：`13/31` 形态接档，`errors=0`，未接档警告由 26 降至 20（另有 2 条非接档提醒）。
- `battle_action_catalog_check.mjs`。
- 六档各 10,000 与全部 13 档各 10,000 的 authority 人口模拟。
- Node 成长、factory、GM、捕捉、EXP、转生定向 45/45。
- Node 战斗捕捉/任务挂机定向 71/71。
- Godot parse、balance catalog、pet template catalog、growth observation、growth authority 5/5。
- 完整 Node 套件 274/274。

本切片未改变可见 UI、移动、绘制或每帧逻辑，不增加运行时人口模拟和文件 I/O，因此不触碰客户端热路径。观察表仍为离线静态查询。

## 后续

P0.2d 继续处理剩余 18 个未接档形态；全部 31 个形态完成后，再做真实旧档案只读迁移报告和玩家可见预测区间/证据收敛设计。普通乌力本轮可通过 GM 获取 Lv1 后升至 Lv5/Lv10/Lv20 验收，但不要求用户在此切片提交手感结论。
