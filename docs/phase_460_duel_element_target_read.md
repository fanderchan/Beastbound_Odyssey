# Phase 460：切磋元素目标读牌

## 玩家承诺与边界

本阶段把已经由服务端权威生效、却在正常战斗画面中不可读的元素克制变成一次真实的 PvP 选择：玩家在
切磋中手动选择攻击目标时，目标足下会显示当前实际出手者对它的 `克制 +N%`、`受制 -N%` 或 `均势`。
人物回合读取人物元素，宠物攻击／技能回合读取当前出战宠元素；换宠后提示自然改用新宠快照。

普通挂机、自动战斗、Boss 机制、捕捉、物品、精灵、伤害公式和元素配点规则均不改变。提示只在正式
`duel` 房间的攻击选敌态出现，不把普通练级变成需要逐目标读牌的高频操作，也不新增另一组战斗按钮。

## 权威、数据与实例合同

| 项目 | 合同 |
| --- | --- |
| 权威数据 | 服务端 `publicBattleActor.elements`；客户端不从形态、颜色或名称猜元素 |
| 公式来源 | 客户端与 Node 共读 `data/balance/combat_formulas.json.elementMatchup` |
| 实例影响 | 只读当前人物或当前出战宠；不创建、不修改、不持久化宠物实例 |
| 计算 | 与 Node 相同的四元素十点两两权重；纯地打纯水为 `1.35`，反向为 `0.75` |
| 事件形态 | 不新增 battle event；房间 actor 快照已有 `elements`，伤害事件仍保留权威倍率与双方元素 |
| 失败回退 | actor 元素、总点数、元素键、克制环或倍率任一异常即隐藏提示，不显示猜测值 |
| 协议 | 没有新增 HTTP／WS 字段，不提升协议版本 |

## 视觉与动作合同

- 复用现有选敌环，不新增图片资源或动作资产；人物／宠物仍使用既有攻击、防御、换宠与受击动作。
- 克制使用克制绿金，受制使用珊瑚红，均势使用原有骨金；只有当前悬停目标出现一个短足下胶囊标签。
- 标签不进入血条、姓名和状态徽章区域，不常驻显示十个单位的元素，不用闪烁、粒子或大面积色罩制造噪音。
- 玩家文案只出现 `克制`、`受制`、`均势` 和整数百分比，不暴露 schema、倍率字段名、actor ID 或 QA 文本。

## 实机与性能证据

隔离 `automation` QA lane 的真实 `Main.tscn`、Metal Mobile、1280×720 实机已生成目标读牌静帧：

```text
.run/evidence/phase460_duel_element_target_read/
  duel-element-target-read-1280x720.png
```

静帧 SHA-256 为 `f5140e1b8cbc74d2bce7595d307228b1e58ebf07911baa838c987ba66bfa88ff`。最小战斗夹具
没有加载正式地图背景，但画面证明足下标签不遮人物／宠物、血条、姓名、回合栏、消息框或右下指令区；
克制态为绿金短胶囊，未把 actor ID、schema 或测试结论暴露给玩家。QA lane 随后清理，工具确认真实玩家
目录 inventory SHA-256 前后不变。

最新已发布同机战斗基线为 Phase 453；本阶段候选再以同一个正式 20 actor 真实输入性能门采样。第一次候选
运行因结束快照 `windowFocused=false` 被门禁正确拒绝，不作为证据；最终 v2 起止均聚焦，报告
`status=passed / finalStatusAuthority=true / 21/21 gates`：

| 状态 | 最低／raw FPS | 帧间隔 P95 | `process_total` P95 | `draw_battle` P95 |
| --- | ---: | ---: | ---: | ---: |
| idle | 53.6／58.072 | 17.187 ms | 0.09 ms | 4.06 ms |
| command selection | 59.5／59.733 | 17.225 ms | 0.08 ms | 4.13 ms |
| target switch | 56.1／58.888 | 18.651 ms | 0.07 ms | 4.15 ms |

其中完成 25 次真实跨帧左键、8/8 相邻目标精确命中、HUD passthrough `0`。Phase 453 最近发布基线的
三段 `process_total` P95 为 `0.06/0.06/0.05 ms`，`draw_battle` P95 为 `4.00/3.93/4.07 ms`；本阶段
绝对增量仍远低于 60 FPS 帧预算和既有门槛。提示绘制只对一个当前悬停目标执行有界 4×4 纯计算，不读
文件、不扫描档案、不发网络请求。最终报告及 SHA-256：

```text
.run/evidence/phase460_duel_element_target_read/performance/
  phase460-duel-element-target-read-after-v2/summary.json
```

`1f7c12ed9f3a35329ade2b1a62d93f74c468178be8af8e42b160da28a6ab9a6c`。

## 验证结果

- `git diff --check` 与 `godot --headless --path client/godot --quit`：通过；
- `node tools/run_godot_auto_checks.mjs --only --auto-server-battle-target-mapping-check --fail-fast
  --timeout-ms 180000`：Godot parse 与定向检查 `2/2` 通过，最终状态包含
  `elements=true / tactics=true / ui_gate=true`；
- `node --test server/node/test/battle-element-rules.test.js
  server/node/test/auth-character-element-battle-integration.test.js`：`11/11` 通过，证明客户端读取的公开元素
  与服务端实际权威伤害共用同一元素合同；
- 正常窗口真实 Main 目标映射检查：`capture=true`，1280×720 静帧已人工复核；
- 正式 20 actor 性能门：`21/21`，起止环境均为 macOS／Metal Mobile／VSync／60 FPS／前台窗口。

## 非目标

本阶段不开放完整属性面板、不公开隐藏成长、不预测闪避／暴击／最终伤害，不展示对手未出战宠，也不把
对方已提交的命令、换宠选择或私有随机数泄露给客户端。P1.5 父项继续保持未完成：本切片补上了切磋
目标读牌，但还不能单凭一个提示标签证明完整 PvP 阵容、换宠与长期对局深度已经达到发布目标。
