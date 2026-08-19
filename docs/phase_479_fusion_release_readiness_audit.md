# Phase 479：首批融合宠正式开放就绪复核

日期：2026-08-18

## 2026-08-19 当前复核

以最新远端 `main=d9c6374473e1932af3d3a9f39997e110a4e64d19` 和当前工作树重新执行只读门禁，P1.4 产品文件没有本地未发布差异，两张运行头像 SHA-256 仍分别为 `94f268b5…` 与 `0d4aba0c…`。Phase 480 已关闭下文记录的三只历史宠、六条旧画像重放债；本轮完整目录重新得到 `mode=catalog-only / audited=36 / status=ok / errors=[]`，两只融合目标各比较 `521` 张关联图，均保持 `owner_review_pending`，没有借审计通过提升 owner 状态。

当前 Pet Design Inspector 仍为 `36 forms / 2 fusion targets / errors=0 / warnings=0`，关闭态 verifier 仍为 `PASS / 2 forms / 1350 copied / 22 portrait / 2 QA controls`，战斗动作目录为 `34 actions / 10 passives / 36 forms / status=ok`。原子 promoter 默认检查仍只返回三个预期阻断：缺少明确 owner approval input，以及曜冠／苔垒两份可信画像 owner digest 尚未固定；`releaseApproved/runtimeEnabled/playerEntryOpened/portraitReleaseGate` 继续全部为 `false`。

Phase 406 所列六个 walk 报警已经由主体支撑中心共识门证明不是整宠滑移，当前不再是发布缺口；Phase 409 的正常玩家入口也已经存在并在生产关闭时零请求。因而剩余顺序已经收敛为“项目所有者接受当前两张头像与首批不可骑运行范围 → 生成 hash-bound 决定与 attestation → 原子 promoter 打开入口 → 重跑正常 Main、真实事务、性能与发布检查”。未收到明确接受前仍不得生成前三类 owner 产物。

## 结论

当前远端 `main` 为 `fb07e6baa8304f79e05da47e39c494bf9598ab3a`，两只首批融合宠的关闭态产品文件与既有 Phase 445 权威片均未漂移。本轮只读复核没有发现新的配方、成长、技能遗传、三宠原子事务、画像、面板或客户端发布门缺口。

美术总监建议接受当前专用大头照与首批不可骑运行范围：

- 曜冠角兽的紫金冠鬃、前倾独角和高饱和暖橙形成清楚的攻击型终局轮廓；
- 苔垒角兽 V4E 的低重心岩甲、三枚琥珀菱纹和克制暖锈色形成防御型身份；
- 两者脸型和独角语法相同，能读成同一炽角血系，但鬃毛／岩甲、色相、体块和功能气质足以区分，不是简单换色；
- 1280×720 融合页文字均在边框内，木、石、金边语言统一；中央规则区信息密度较高，但不可逆高价值操作需要完整规则，当前不构成视觉阻断。

这仍不能代替项目所有者决定。生产继续保持失败关闭；本阶段没有创建 approval input、画像 owner decision、release attestation，也没有执行 promoter `--apply`。

## 当前候选与证据

| 对象 | 当前运行头像 SHA-256 | 判断 |
| --- | --- | --- |
| 曜冠角兽 | `94f268b58859fff9ff89dee21de7f611c01e279a0dd2d3c2c1c22321d60d8b59` | 建议接受 |
| 苔垒角兽 V4E | `0d4aba0c27e449dc77a161720c7c553d630e0eb0f69af8d9c19ee52738a9f124` | 建议接受 |

当前权威 Main 证据仍是：

```text
.run/evidence/phase445_moss_portrait_owner_review/
  phase445-moss-v4e-owner-review-20260815-a/
```

- MP4 SHA-256：`6cd6f70922e1cbd26c6a86fa1d054b0329b6ab220bc6eb54d485285067796771`；
- contact sheet SHA-256：`13203bde3c2e3ef54d8c210594c4e1386f19535dee1518833e140a0a7751d128`；
- 当前复验：H.264、1280×720、30 FPS、918 帧、30.600 秒，全片解码零错误。

## 工程复核

### 生产关闭与原子 promoter

`python3 tools/promote_pet_fusion_runtime_release.py --check` 按预期返回 `blocked`，同时证明：

- `productionClosed=true`；
- `2` 个融合形态、`1350` 个复制文件、`22` 个画像文件通过关闭态验证；
- macOS／Windows 导出合同能携带画像决定文件；
- 精确阻断只有：缺少明确 owner approval input，以及曜冠／苔垒画像的可信 owner digest 尚未固定。

这三个阻断都属于同一次所有者正式批准的后续产物，不是工程缺陷。未收到明确批准前不得生成或猜测。

### 宠物与服务端

- Pet Design Inspector：`36 forms / 2 fusion targets / errors=0 / warnings=0`；
- 战斗动作目录：`34 actions / 10 passives / 36 pet forms / status=ok`；
- 服务端融合、目录、发布证明和技能策略：`80/80 PASS`；
- promoter 与关闭态 verifier 单元：`34` 项完成，`33 PASS / 1` 个真实外部环境按设计跳过；
- 关闭态 verifier：`PASS / 2 forms / 1350 copied / 22 portrait / 2 QA controls`；
- 两只融合目标仍为终局、不可付费重置、不可骑，数值只来自目标成长档，不读取三只材料的个体强弱。

### 客户端与 1280×720

- Godot parse、画像目录、共享画像消费者、融合技能策略：`4/4 PASS`；
- `pet_fusion_client_domain_check.gd`：`PASS`，关闭态零请求、陈旧报价拒绝、双确认、发布证明门和服务端最终权威均成立；
- `pet_fusion_contract_check.gd`：`PASS`，目录、商业规则、血脉反应、持久化和关闭态合同成立；
- `pet_fusion_panel_check.gd`：`PASS`，曜冠／苔垒两路线均 `layoutWithinViewport=true / candidateFormalPortraitCount=5 / placeholders=0`。

一次按旧文档误写到 `scripts/qa/pet_fusion_client_domain_check.gd` 的人工命令因文件不存在失败；现行真实路径 `scripts/progression/pet_fusion_client_domain_check.gd` 已立即复跑 PASS。这是调用路径错误，不是产品回归。

## 全画像目录的诚实边界

完整 36 形态画像审计本轮结果为 `audited=36 / status=failed`，错误共 `6` 条：

- `blue_man_dragon_water10` 两条 identityEvidence 重放不一致；
- `rebirth_beast_earth_lv50` 两条；
- `novice_tiger_mount` 两条。

这些是 Phase 451／472 已记录的历史来源重放债，不属于融合目标，不能把全目录结果称为 PASS。针对本次两个精确目标分别运行 single-target 严格审计后：

- 曜冠：`audited=1 / status=ok / errors=[] / compared=521`；
- 苔垒：`audited=1 / status=ok / errors=[] / compared=521`。

因此本次融合候选自身没有画像哈希、来源、色键掩码、独立头肩构图或重复复用错误；全目录的三只历史宠来源债继续单独处理。

## 需要项目所有者明确决定的范围

建议一次明确批准以下精确范围：

1. 当前曜冠角兽专用大头照；
2. 当前苔垒角兽 V4E 专用大头照；
3. 首批两条现有正式配方的不可骑运行开放；
4. 允许生成 hash-bound owner approval input、两份画像 owner decision 和 release attestation，并由唯一原子 promoter 打开 `releaseApproved/runtimeEnabled/playerEntryOpened`。

该批准不会扩大到骑乘美术、修改配方概率、修改成长、改变绑定／交易规则或自动消耗真实玩家宠物。正式开放后，玩家仍需在界面完成服务器报价与两段确认，三宠消耗才会在权威原子事务中发生。
