# 世界 HUD 原创图标包：来源、授权与替换说明

## 包状态

- 包 ID：`world_hud_awakened_v1`
- 用途：Beastbound Odyssey PC 端 `1280×720` 世界主界面 HUD
- 生成日期：2026-08-01
- 来源类型：`OpenAI ImageGen original for Beastbound`
- 使用授权：项目可在适用的 OpenAI 条款下使用、修改和派生本包素材；本记录不对条款以外
  的排他版权或第三方权利作额外法律结论
- 外部第三方资产：无
- 运行时启用：`runtimeEnabled=true`
- 所有者视觉状态：`ownerReviewStatus=owner_review_pending`
- 机器可读清单：`asset-manifest.json`
- 可复现生成意图：`generation-prompts.md`

`runtimeEnabled=true` 只说明 Godot 正常运行时可以加载这些图标，不代表项目所有者已经
接受最终画面。只有项目所有者观看冻结的 1× 实机视频并明确通过后，才能把视觉状态改为
`owner_review_accepted`。

## 参考边界

项目所有者提供的外部主界面截图只用于理解地图、顶部入口、角色／战宠、任务／队伍、
聊天和底部菜单的画面层级，以及暗木暖金的整体材质方向。

本包没有复制、裁切、描摹、重绘或嵌入参考图中的任何像素、图标、角色、标志、商标、
文字、红点或数值。三十三个图标均为本项目单独请求 OpenAI ImageGen 生成的原创位图；
外部截图没有作为运行时资源或派生源写入本包。精确的历史逐字提示词／调用 ID 没有对
全部并行生成任务完整保留，因此 `generation-prompts.md` 明确记录的是依据最终图与用途
整理的规范化重建提示词，而不是伪造的原始调用日志。

## 生产链

每个图标均保持同一条可替换链路：

1. `source/generated/<id>_raw_chroma.png`：OpenAI ImageGen 原创绿色色键源，
   `1254×1254 RGB8`；
2. 使用当次 ImageGen 工具包提供的色键去除流程移除绿色背景并处理边缘残色；
3. 按 Alpha 内容边界整理、等比缩放、透明画布居中；
4. `runtime/icons/<id>.png`：Godot 加载的 `128×128 RGBA8` 成品；
5. 同步复核文件尺寸、Alpha、字节数、SHA-256、用途和运行时引用。

运行时只加载 `runtime/icons/`。色键源不得删除，也不得把 runtime 成品反向冒充为未处理
的生成源。

## 资产台账

| ID / 职责 | 色键源（1254×1254 RGB8）/ SHA-256 | 运行图（128×128 RGBA8）/ SHA-256 |
| --- | --- | --- |
| `account` 角色／账号 | `source/generated/account_raw_chroma.png` / `f6b497901d696d0bdfa09ae8aee2edf3fa389e3ae20cc3ab90d700593c64262a` | `runtime/icons/account.png` / `d50b72f6bfe0ec98629996e42583fc04b1a66ff24b6918ae7aadb4db7d20de73` |
| `auto` 自动设置 | `source/generated/auto_raw_chroma.png` / `e605ad12a7d26d81921a39702ef8293900b2f9ab7b6ba0230d73ebe4e29aadcb` | `runtime/icons/auto.png` / `92031e7970a0ff86c79a2d4c8a2d58ce8f3fd88aa7a2113fc879b62f8005d18e` |
| `backpack` 背包 | `source/generated/backpack_raw_chroma.png` / `2950f46703bb06e7dafaca085d31b5f8ab903dcd9458b9166c4031584373a561` | `runtime/icons/backpack.png` / `0518dab7bd59645282d6574ec5d83da60e9530b7ef0a166774fef4d2d99a6f7d` |
| `chat` 聊天 | `source/generated/chat_raw_chroma.png` / `da86a49480c637008eec39ba8ef26f5fd8266313fac06ea974d19077faf52e96` | `runtime/icons/chat.png` / `300d81f188a310dd74b33095abedfdf69429420598b7fe6d112b067fbd743b20` |
| `collapse` 收起 | `source/generated/collapse_raw_chroma.png` / `9a865813fdc7b279718c81f32344bd2bdc7801bc068a7dd41cb6f9de20f8314f` | `runtime/icons/collapse.png` / `353d9eafb1babc281a868ad915e01d2f872ee8f449cf0adf32caf10e44411b9b` |
| `equipment` 装备 | `source/generated/equipment_raw_chroma.png` / `92162661d58b3d1309b8ad64e4dfa49085f8455f2cf7ee03a5ebfba7b26fc813` | `runtime/icons/equipment.png` / `02e40bb415f17de5dd15490788412aebb8d45dbb7e867f904440dbd2718bd1bc` |
| `family` 家族 | `source/generated/family_raw_chroma.png` / `81ace0b55b7ffc8920ba4c968d2ce634b909bc911f91a801e300a41fb19267d7` | `runtime/icons/family.png` / `a78556cc8db12e2007e33413c93d66c231c8ff12b95411fc8dc643a4d8a77e2d` |
| `hang` 挂机 | `source/generated/hang_raw_chroma.png` / `502fe291f0e2cf9312fc87d479a7ad052081ac32ab8e5180d2a4614ddaa0866b` | `runtime/icons/hang.png` / `73a3fc3e892e6fbca0e223a6e40c3137684eca04fb7b6b1121e70e3c1dd6ad55` |
| `mailbox` 邮箱 | `source/generated/mailbox_raw_chroma.png` / `eaf9b35dc153dccfc2f6890dc423f14f79b3f280d40cc3b3a9fdb48582e11c1b` | `runtime/icons/mailbox.png` / `15adbf94d368c7c3f2839bf888799e9f91047573e45e1a1b62aa557120b50e20` |
| `map` 地图 | `source/generated/map_raw_chroma.png` / `2012bfaa6d2d293898f88387accce9c02b9ce8536f8d4ae65d720ab16d58517e` | `runtime/icons/map.png` / `fdd24408da740f30d6a9eb712e932935bc46321a82dbc3b4d76a5769f72b9f78` |
| `market` 交易所 | `source/generated/market_raw_chroma.png` / `134edcb67f3579dc7eead2cf1a21ad5dd389ff66f6b4ca9079bff25f676ef02e` | `runtime/icons/market.png` / `65fb7283fb38722f34fd271d2742ee380c5abc725587865c308f0c9f5a67cd73` |
| `more` 更多 | `source/generated/more_raw_chroma.png` / `21a7975e864c5fa83618f0abb3fad51122da645398ef1549499fac2a305557be` | `runtime/icons/more.png` / `6f91bc46b815399d687f4a42836c6e337a96ed5cf6e9e9b1818c56c338fbcb4f` |
| `party` 队伍 | `source/generated/party_raw_chroma.png` / `86cfb591472d8e00461a9e285e25310ad90f1cf8ec21d933a9aa14c0e8c6e9f3` | `runtime/icons/party.png` / `5ab9ed9f519b0198ddcd1207a9982177459bff9a86a57c59e690fb3579cd4f96` |
| `quest` 任务 | `source/generated/quest_raw_chroma.png` / `7b489c66929f8c4b98a487991b348918d0ac23e866d5f699280f1114e692250b` | `runtime/icons/quest.png` / `c5f5d8c2b0218bf96a670b9bcbf97d6bde3659843f46a1898338c19fde67e832` |

### 顶部快捷与活动抽屉补录

下列十九对素材与基础十四对遵循完全相同的原创、授权、色键和替换合同。历史逐字提示词
没有完整保留；`generation-prompts.md` 中对应条目均明确是
`normalized_reconstruction_not_verbatim`，不是补写的原始调用日志。

| ID / 职责 | 色键源（1254×1254 RGB8）/ SHA-256 | 运行图（128×128 RGBA8）/ SHA-256 |
| --- | --- | --- |
| `event_account` 活动列角色／账号 | `source/generated/event_account_raw_chroma.png` / `f9ea3d6727edcc493834b07095b113b2a03faf4ab939095c521afe3b456cae34` | `runtime/icons/event_account.png` / `de74d64c07c1a36f99556ff604c812d65b95526da29328b09a3731a96cd6f3e3` |
| `event_auto` 活动列自动设置 | `source/generated/event_auto_raw_chroma.png` / `1217057942c3fd90f1d9e82baae84901f7f5a00eb72df87ce932e61515cc2756` | `runtime/icons/event_auto.png` / `548775477c528da304fcf179640c5c30da16a7d48890a2d83f4c75812a8f1513` |
| `event_backpack` 活动列背包 | `source/generated/event_backpack_raw_chroma.png` / `99451e0ecd90501159385e77151a017ee0747c527bd37c5a5bbafd9ff874d0fd` | `runtime/icons/event_backpack.png` / `d8a764ec190e923d62b19758ff8ec243006d7a5c568a2c85f1b99fd4851a57b7` |
| `event_character` 活动列角色 | `source/generated/event_character_raw_chroma.png` / `a9c6c36639bf7d4dcd13a4a8e832ef004773335e0b8dc85423a2a8b0ade3c6b9` | `runtime/icons/event_character.png` / `59a6845a0ec3d611010a39ebf69e6ebff15263a8440082cbede132401fa81eb5` |
| `event_codex` 活动列图鉴／攻略 | `source/generated/event_codex_raw_chroma.png` / `248e558448fe0ab5a24c3fd4f6e4bcc1915a39b4d07facee82190fe20b48d40f` | `runtime/icons/event_codex.png` / `71501d106728c6222b5f66ebd51da6200d4820acdcc1c0eef98ddc9ed904040c` |
| `event_equipment` 活动列装备／锻造 | `source/generated/event_equipment_raw_chroma.png` / `54f30349a6dd80c924743280087c5de2f0d5cb3bed74d74e7fcfa6c014826b98` | `runtime/icons/event_equipment.png` / `5e05016270d7b4e33b2031fa67a543bcdccc9a2c9af9e1775b87a350c4f2b535` |
| `event_family` 活动列家族 | `source/generated/event_family_raw_chroma.png` / `9e3a2ea1cee7985aacaa3831fb690dca5eb8edebf36bb7cc106a75773511128e` | `runtime/icons/event_family.png` / `e6aeb32cd01c67c5bebf1a0c088790225b4f6daacf6557d622bdac1ce14a9ced` |
| `event_mailbox` 活动列邮箱 | `source/generated/event_mailbox_raw_chroma.png` / `25c4be221fe1d36c69adccebdde83430afe0d856a404fa9a64fb38aa1db08978` | `runtime/icons/event_mailbox.png` / `3ec894d39d69d497fa7dde9de17b24c208f9478f83a745b4227c6003079ed7be` |
| `event_market` 活动列交易所 | `source/generated/event_market_raw_chroma.png` / `20d254c0479c8d5625ba86c1bf97efced8aa2527ccf30d2bc76d7d83e5ed23e1` | `runtime/icons/event_market.png` / `e40f127cd5f44b56b15d6ed90b8b8910307fd6d3c0e7574b051503d852d75833` |
| `event_party` 活动列队伍 | `source/generated/event_party_raw_chroma.png` / `15102e0de5150159e801c604596c7d5b051c4566baf406fa90830a5dd2e65d76` | `runtime/icons/event_party.png` / `9965af48e977d07344f863936698494370a3ad9ae55bfba1cc3188fe90e33ae3` |
| `event_pet` 活动列宠物 | `source/generated/event_pet_raw_chroma.png` / `28d8196ff28ff0b9e490f51ff278d8042d638f84526167f0d119725cdc8c11ba` | `runtime/icons/event_pet.png` / `407a9222653666c5ac7b0dcf0f14f8b03a04f6fa794a515ee532873bb5d25208` |
| `event_quest` 活动列任务 | `source/generated/event_quest_raw_chroma.png` / `764f69cfb4b9d5d22d70f60a47598aaba86b09c1caa8e605f274edbba24b09c0` | `runtime/icons/event_quest.png` / `d66f9deb9443f674b67853c4ad4cbbbfaea5dbecfe78530a146aa7fc2e70ecc8` |
| `top_classic` 顶部经典任务 | `source/generated/top_classic_raw_chroma.png` / `16683646b6142baa2d592db0e2a40cf474d820efccf706ca7436bac2d94db878` | `runtime/icons/top_classic.png` / `ae9f500f175053d6810265cc60b11aa1a06815d97b7c328b7df65f2d2a1b6df1` |
| `top_guide` 顶部攻略 | `source/generated/top_guide_raw_chroma.png` / `4ac847984dfc76916c5a1a955cce834cba1157c7f85befe3ec9484535d616ab9` | `runtime/icons/top_guide.png` / `11d79cc1ce01e1d7c4d2e274e39a427cefd12365dd1ca4ccd5d8d654536149bd` |
| `top_hang` 顶部挂机 | `source/generated/top_hang_raw_chroma.png` / `7363d6671e2fd600f184ca217c74bf47380ec6e4a0f75a0d876a6bc7cb9a5e0e` | `runtime/icons/top_hang.png` / `24ec214cee95c33fbee18a7877f0c14abd5b8b01074e2eec970323460550e55f` |
| `top_more` 顶部更多 | `source/generated/top_more_raw_chroma.png` / `2b6e3d6e904702c44bd2b5468ac1e15af9fa60c9266b7e8d4ed688f70ee81ead` | `runtime/icons/top_more.png` / `4ab58ef03a7bc0a4ca54dfd7e113640c36262847f71778cf4dcbfa441f14a4d2` |
| `top_pet` 顶部抓宠 | `source/generated/top_pet_raw_chroma.png` / `dd5aca9be1c3243dc54fb81eb0f5011dc893e1ccc5f22f6bcf576585c9515b02` | `runtime/icons/top_pet.png` / `7d6dcdabe40947a4abfa24f7112a16f33330dadf280f81254f0afd42fdf49145` |
| `top_quest` 顶部活动／任务 | `source/generated/top_quest_raw_chroma.png` / `c01d769a6afc5916b44e3cca91363589d319f2df7aabbe5c89e81c37062f6b83` | `runtime/icons/top_quest.png` / `30f0f12042d2d245abefedf906e190aa14c66033cd31f3ea2482322870ce9443` |
| `top_strengthen` 顶部变强 | `source/generated/top_strengthen_raw_chroma.png` / `1fe90aaae0c9798c7af9ec5e57f9db5438dd34a835131907ea8a4f340f2eefe4` | `runtime/icons/top_strengthen.png` / `42ee806e82852ca2adc1ca897e485c71c3e89dd46006457a148fb1cc85025a8b` |

每个文件的精确字节数、Alpha 标记、授权对象、派生关系和替换字段以
`asset-manifest.json` 为机器可读真值。

## 替换路径

替换任一图标 `<id>` 时必须按以下顺序执行：

1. 将新的、已确认可用于本项目的原创生成源放入
   `source/generated/<id>_raw_chroma.png`；
2. 按 `generation-prompts.md` 的后处理合同重新生成
   `runtime/icons/<id>.png`；
3. 保持运行时路径和入口职责不变，除非同时修改并验证
   `world_hud_awakened_visual_skin.gd` 的映射；
4. 更新 `asset-manifest.json` 中 source/runtime 两条记录的字节数、SHA-256 和生成记录；
5. 重新执行图标 Alpha／边缘、Godot parse、HUD View、1280×720 实机和 1× 视频检查；
6. 项目所有者未明确接受新画面前，将相关运行图保持
   `ownerReviewStatus=owner_review_pending`。

不能直接覆盖 `runtime/icons/<id>.png` 而遗漏 source、提示词和清单，也不能为了贴近
外部参考把外部游戏图标导入 source。

## 当前审计结论（2026-08-08）

- `33/33` 张 source PNG 存在，均为 `1254×1254`、非交错、8-bit RGB；
- `33/33` 张 runtime PNG 存在，均为 `128×128`、非交错、8-bit RGBA；
- `66/66` 个文件均有真实字节数、SHA-256、派生关系与替换链记录；
- `world_hud_awakened_visual_skin.gd` 当前直接声明 `30` 个运行图引用；全部 `7/7`
  个 `top_*` 和当前界面使用的 `9/9` 个 `event_*` 都在清单内；
- `event_equipment`、`event_mailbox`、`event_market` 三张图为包内预留，当前没有运行脚本引用，
  本审计如实标注而不冒充已接线；
- runtime 文件全部由对应同名 source 派生，不依赖外部游戏资产；
- 运行时启用状态为 `true`，项目所有者视觉状态仍为 `owner_review_pending`。

机器报告由 `tools/audit_world_hud_awakened_assets.py` 生成并冻结在 `audit-report.json`。
包根 `.gitignore` 明确排除 Godot 可重建的 `.import` 与 `.uid`，这些生成态 sidecar 不属于
资产台账，也不得随本包提交。
来源／结构审计结论：`passed`。本次只补台账与校验，不改变任何 PNG 像素；最终主观视觉
结论仍由 Phase382 的 1× 实机视频验收决定。
