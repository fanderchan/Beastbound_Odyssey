# 角色入口原创美术包：来源、所有权与替换说明

## 包状态

- 包 ID：`character_entry_awakened_v1`
- 用途：万兽纪元 PC 端 1280×720 登录后角色创建 / 角色选择入口
- 所有权：`OpenAI ImageGen original for Beastbound`
- 运行时启用：`runtimeEnabled=true`
- 所有者验收：`ownerReviewStatus=owner_review_pending`
- 机器可读清单：`manifest.json`

`runtimeEnabled=true` 只表示当前运行时可加载这些原创资产，不等于项目所有者已经通过视觉验收。只有项目所有者明确验收冻结画面后，才能把 `ownerReviewStatus` 改为 `owner_review_accepted`。

## 参考边界

用户提供的外部截图只用于理解以下高层方向：

- 热带海岸营地的明亮氛围；
- 左侧大角色、右侧四个纵向角色槽的构图关系；
- 角色选择页应有的清晰层级、返回入口与进入游戏焦点。

本包没有复制参考图的像素、UI 贴图、角色造型或其 IP 角色。背景、新手猎人全身图、新手猎人独立大头照、两种角色槽框和返回图标均为 Beastbound 专用的原创 ImageGen 输出；大头照不是从全身图裁切。

## 资产台账

| 角色 | 相对路径 | 尺寸 | 像素格式 / 透明通道 | SHA256 |
| --- | --- | ---: | --- | --- |
| 背景生成源 | `source/generated/tropical_camp_background_original.png` | 1672×941 | RGB8 / 无 Alpha | `bf6b4289f488262039bd948ec0597da9c943eebceb24488a2d7b197dad899bc8` |
| 新手猎人全身色键源 | `source/generated/novice_hunter_hammer_chroma.png` | 1254×1254 | RGB8 / 无 Alpha | `afaf678a8bdf167321d5c10eacaccf2906500117a01993daed15a677e9fcc00a` |
| 新手猎人独立头像色键源 | `source/generated/novice_hunter_portrait_chroma.png` | 1254×1254 | RGB8 / 无 Alpha | `326e2aa63c3cddef5ce28a86e7d70982588db88cd4d7ad37952e6e996e8dd99f` |
| 选中角色槽框色键源 | `source/generated/selected_character_card_chroma.png` | 1787×880 | RGB8 / 无 Alpha | `fe680afbc3ec72a59c867cde9775df352573cac27888cf7b646f3dbf32983aea` |
| 空角色槽框色键源 | `source/generated/empty_character_card_chroma.png` | 1870×841 | RGB8 / 无 Alpha | `c483982bc805797f7f9f198a9db1f02dbf6698773885b1f3e37cb3ba521d0cc3` |
| 返回双箭头色键源 | `source/generated/back_chevrons_chroma.png` | 1254×1254 | RGB8 / 无 Alpha | `18b7aeb8d58a593917bbcc2104b3f2d9d83853aced8fd7c56288dd650509ec55` |
| 1280×720 运行时背景 | `runtime/backgrounds/tropical_camp.png` | 1280×720 | RGB8 / 无 Alpha | `fd47cb7502eefba4d9843aac3f8991d3f3d4a204c6d654979eaee85735399acc` |
| 新手猎人运行时全身图 | `runtime/characters/novice_hunter_hammer.png` | 1254×1254 | RGBA8 / 有 Alpha | `7c93fba5929e27d49d341d3b5b997759bd6e562c6cb70d3fcfac9a2d9e3ac609` |
| 新手猎人运行时独立头像 | `runtime/portraits/novice_hunter.png` | 1254×1254 | RGBA8 / 有 Alpha | `0caf7a8fb09a3e51613c83037f531c5d50dcb3ef567ad9c78b9c5d4cdb206364` |
| 运行时选中角色槽框 | `runtime/cards/selected.png` | 420×132 | RGBA8 / 有 Alpha | `4fdf0d423ddb0767a04c1c873c7e67359a9960d644c33726978c0c0493e6160e` |
| 运行时空角色槽框 | `runtime/cards/empty.png` | 420×132 | RGBA8 / 有 Alpha | `7651a1d2b9696b904ccdabd0a2c8592189535338716b813e56bb1a447ed0e157` |
| 运行时返回双箭头 | `runtime/icons/back_chevrons.png` | 78×78 | RGBA8 / 有 Alpha | `117564edd4470d8b163be84e51de70422717aa7426cf8b0a97f91dcc6de4f4de` |

## 生成与派生链

1. `tropical_camp_background_original.png`
   - 方法：OpenAI ImageGen 原创位图生成。
   - 生成记录：`call_PGCPRnSu4kQ08qcmoGfg7Eiz`。
   - 运行时派生：高质量离线缩放到 `runtime/backgrounds/tropical_camp.png`，固定为 PC 首发画布 1280×720。
2. `novice_hunter_hammer_chroma.png`
   - 方法：OpenAI ImageGen 在色键背景上生成原创全身角色。
   - 生成记录：`call_p2rsnrfkkvvyS10W6X4TzJqR`。
   - 运行时派生：使用 ImageGen 工具包的 `remove_chroma_key.py` 离线移除色键，尺寸保持 1254×1254，输出到 `runtime/characters/novice_hunter_hammer.png`。
3. `novice_hunter_portrait_chroma.png`
   - 方法：OpenAI ImageGen 独立生成原创角色大头照，不从全身图裁切。
   - 生成记录：`call_VtgfqlChU8b3O5uXNbtSkyF7`。
   - 运行时派生：使用 ImageGen 工具包的 `remove_chroma_key.py` 离线移除色键，尺寸保持 1254×1254，输出到 `runtime/portraits/novice_hunter.png`。
4. `selected_character_card_chroma.png`
   - 方法：OpenAI ImageGen 在色键背景上生成原创选中角色槽框。
   - 生成记录：`call_alXDBJ8L80Wea2QAJp1gSGJw`。
   - 运行时派生：使用 `remove_chroma_key.py` 移除色键，裁切透明边界，再高质量缩放到 420×132，输出到 `runtime/cards/selected.png`。
5. `empty_character_card_chroma.png`
   - 方法：OpenAI ImageGen 在色键背景上生成原创空角色槽框。
   - 生成记录：`call_bK8X4dG7t7g63AxAPxubwAcA`。
   - 运行时派生：使用 `remove_chroma_key.py` 移除色键，裁切透明边界，再高质量缩放到 420×132，输出到 `runtime/cards/empty.png`。
6. `back_chevrons_chroma.png`
   - 方法：OpenAI ImageGen 在色键背景上生成原创返回双箭头图标。
   - 生成记录：`call_RFfoh3Ymo3HMVJ6yCdi1FT87`。
   - 运行时派生：使用 `remove_chroma_key.py` 移除色键，裁切透明边界，再高质量缩放到 78×78，输出到 `runtime/icons/back_chevrons.png`。

## 替换路径

替换任何资产时必须保留原有运行时相对路径和用途契约：

- 背景：先替换 `source/generated/tropical_camp_background_original.png`，再派生 `runtime/backgrounds/tropical_camp.png`；
- 全身角色：先替换 `source/generated/novice_hunter_hammer_chroma.png`，再派生 `runtime/characters/novice_hunter_hammer.png`；
- 独立头像：先替换 `source/generated/novice_hunter_portrait_chroma.png`，再派生 `runtime/portraits/novice_hunter.png`；
- 选中角色槽框：先替换 `source/generated/selected_character_card_chroma.png`，再派生 `runtime/cards/selected.png`；
- 空角色槽框：先替换 `source/generated/empty_character_card_chroma.png`，再派生 `runtime/cards/empty.png`；
- 返回双箭头：先替换 `source/generated/back_chevrons_chroma.png`，再派生 `runtime/icons/back_chevrons.png`。

每次替换后都要重新核对 PNG 编码、尺寸、透明通道和 SHA256，并同步更新 `manifest.json` 与本文件。不能直接覆盖 runtime 后遗漏 source 和来源记录。

## 审计结果（2026-07-31）

- 6 个 source 与 6 个 runtime 文件全部存在；
- 12 个文件的尺寸和 SHA256 已逐一核对；
- 所有文件均为非交错 8-bit PNG；
- 6 个生成源和 runtime 背景为 RGB；
- runtime 全身角色、独立头像、两种角色槽框和返回图标为 RGBA，实测 Alpha 范围均为 0..255，既有完全透明像素也有完全不透明像素；
- 清单中的派生关系、所有权、替换路径、启用状态和待验收状态齐全。

审计结论：`passed`。
