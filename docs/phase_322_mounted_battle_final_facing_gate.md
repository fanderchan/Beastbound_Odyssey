# Phase 322：骑宠战斗最终朝向统一与失败门槛

日期：2026-07-19

## 问题与复现

蓝人龙 10 骑乘人物＋10 战宠实机验收中，战宠能正确面对战场中心，但双方整体骑乘人物都朝向场外。错误不是原画缺少正背视角，而是两个运行目录采用了不同的最终呈现规则：

- 战宠使用 `PetActionAssetCatalog` 的共享映射，敌方 `front_3quarter_sw + flipH=true`、我方 `back_3quarter_ne + flipH=true`；
- 整体骑乘目录把新包假定为“已经是最终朝向”，缺少 metadata 覆盖时默认 `flipH=false`；
- 原自动检查只验证十二动作、两个视角和 180 帧，没有验证应用 view/flip 后双方是否面对面。

修复前对蓝人龙运行 `--auto-mounted-action-asset-check` 仍错误返回 `ok=true`，且结果中没有最终朝向事实。这说明它是验收门槛缺失，不是单张素材偶发画反。

## 统一合同

整体骑乘不再拥有独立的阵营朝向算法，也不允许每个 bundle 用私有规则改变方向。`MountedCharacterAssetCatalog` 直接复用战宠权威映射：

| 阵营 | 源视角 | 应用翻转 | 最终要求 |
| --- | --- | --- | --- |
| `enemy` | `front_3quarter_sw` | `true` | 朝向战场中心 |
| `ally` | `back_3quarter_ne` | `true` | 朝向战场中心 |

源视角仍是独立生成的正、背三分之四图；`flipH` 是固定战场呈现合同，不等于用一张图伪造另一张源视角。若素材必须靠 `flipH=false` 才成立，应规范化或重制素材，而不是制造 bundle 特例。

## 自动失败门槛

整体骑乘资产检查现同时输出敌我 `view`、`flipH` 和 `matchesBattlePet`，并要求：

- 两侧 view/flip 与同队战宠完全一致；
- 两侧 canonical `flipH` 都为 `true`；
- 完整动作包仍须精确为 12 动作、2 视角、180 帧；
- 任何朝外或宠物/骑乘不一致均使检查失败。

运行目录自身的 `validation_errors(..., require_battle=true)` 也执行相同门槛，避免只有单个 QA 入口知道这条规则。

正式战斗包安装器也把同一映射写入顶层 metadata 和 `battleVisual`，并确定性纠正旧 `flipH=false` 或只写 view 字符串的历史描述。metadata 只是可审计事实，不能覆盖共享运行算法。安装器同时保留完整逐动作 QA 图/GIF 路径和哈希校验；新安装、重复安装及旧 metadata 修复均有回归测试。

## 技能纠正

项目 `$design-beastbound-pets` 及其正式美术合同、全局 `$stoneage9-art-director` 都新增“按最终实机几何验收，不按文件名猜朝向”的硬规则。原美术导演中“把方向完全当作素材、镜像仅为缺图降级”的泛化表述与 Beastbound 的真实运行合同冲突，现已改为项目明确的 source-view＋presentation-view 规则。

此后正式验收必须让双方同时出现在同一张真实客户端画面中，并至少检查待机、接触、归位/倒地和反击/击飞；单侧联系表、正背源图齐全或单纯帧数通过均不能证明最终朝向正确。

## 验证与证据

- Godot parse：通过；
- 蓝人龙整体骑乘资产门槛：`12 actions / 2 views / 180 frames`，两侧 `flipH=true`、`matchesBattlePet=true`、`errors=[]`；
- 真实 `Main.tscn` Metal 定向录像：1280×720、60 FPS、171 帧、2.85 秒，H.264 转码后全片解码零错误；
- 修正截图：`.run/evidence/phase322_blue_man_dragon_full_art/facing-correction/facing-idle.png`；
- 修正短片：`.run/evidence/phase322_blue_man_dragon_full_art/facing-correction/blue-mounted-facing-corrected.mp4`；
- 两项 skill 经官方 `quick_validate.py` 验证通过；
- 战斗包安装器单文件回归：`15/15` 通过；
- `git diff --check`：通过。

录像使用 Movie Maker 离线确定性录制，其编码速度不是实时游戏 FPS。此前完整 10V10 整体骑乘绘制成本偏高的问题仍单独保留，不能用本次朝向修复宣称性能已通过。

## 状态

方向 bug 已修复并形成自动防回归门槛；现有蓝人龙素材像素没有因此重抽或重制。P2.2 仍保持未完成：修正后的整体风格、比例、动作和后续全宠物批次继续等待项目所有者视觉验收，owner 状态不得自动改为 approved。
