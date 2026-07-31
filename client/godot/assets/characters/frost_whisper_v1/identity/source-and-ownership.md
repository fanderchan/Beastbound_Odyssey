# 来源与权属

- `characterId`: `frost_whisper_v1`；角色身份、独立 UI 头像、独立全身展示、世界八方向与双视角战斗动作均为 Beastbound Odyssey 项目原创 AI 辅助制作。
- 唯一创意图像生成器为 OpenAI 内置图像生成。没有输入、拼接、描摹或复制任何外部商业人物、界面或动画资产；成熟石器题材作品只用于理解可读性与动作语义，不作为图像输入。
- 身份依据为 `identity/identity-lock.md` 与 `identity/identity-lock.png`。独立 UI 图为 `ui/portrait.png` 和 `ui/showcase.png`，不是从世界帧或战斗帧裁剪得到。
- 世界移动采用 `independent_8`：南、西南、西、西北、北、东北、东、东南各自独立生成 `idle 1 + walk 4`，共 40 帧，禁止水平镜像代替。
- 正式战斗矩阵为 `front_3quarter_sw`、`back_3quarter_ne` 两个独立视角 × 十二动作，共 180 张运行帧；动作是 `idle/walk/attack/skill/hurt/defend/dodge/counter/stagger_return/knockaway/down/revive`。
- 每张归档源帧为 512×512，运行帧通过 `source/process_frost_whisper_assets.py` 的确定性透明底、共用比例与预乘 Alpha 缩放派生为 256×256；后处理不镜像、旋转、重画或补造姿势。
- 两个视角的 `down-8` 与 `revive-1` 解码 RGBA 完全一致，作为倒地状态进入起身状态的明确连续缝。
- 原始生成图、提示词契约、输入哈希台账、归一化源帧、运行帧、QA 摘要与联系表均随包保存；`identity/source/qa/prompts` 使用 `.gdignore`，避免 Godot 导入非运行时高清证据。
- 自动运行时合同已通过；原始网格存在若干贴近单元边界的源图警告，已记录在 `qa/qc-summary.json`。项目所有者视觉验收仍为 `owner_review_pending`，不得宣称已被用户批准。
