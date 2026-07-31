# 来源与权属

- `characterId`: `novice_hunter_v1`；角色身份、UI 头像、全身展示、世界帧与战斗动作均为 Beastbound Odyssey 项目原创 AI 辅助制作。
- 唯一创意图像生成器为 OpenAI 内置图像生成。没有输入、拼接、描摹或复制任何外部商业角色资产；石器时代参考只用于理解成熟的视角、可读性与动作语义，不作为图像输入，也不复制人物、数字、贴图或动画。
- 固定身份依据为 `identity/identity-lock.md` 与 `source/identity-board-raw.png`。正式战斗动作均锁定同一脸型、发型、左侧骨叶饰品、赭黄皮衣、奶白毛领/毛边、砖红腰带、深青斜挎带与棕色腰包；正、背三分之四视角分别独立生成，禁止镜像代替。
- Phase379 正式战斗矩阵为 `front_3quarter_sw`、`back_3quarter_ne` 两视角 × 十二动作，共 180 张运行帧；动作是 `idle/walk/attack/skill/hurt/defend/dodge/counter/stagger_return/knockaway/down/revive`。每张正式源帧为 512×512，运行帧由其确定性派生为 256×256。
- `down-8` 与 `revive-1` 在两个视角的 512 源帧和 256 运行帧均保持解码 RGBA 完全一致；该连续性覆写及前后哈希记录在各 `revive/continuity-override.json`。
- 世界步行人物保持 `independent_8`：南、西南、西、西北、北、东北、东、东南各有独立源图，每方向 `idle 1 + walk 4`，共 40 帧；运行时禁止水平镜像代替方向图。
- 历史 `ride_idle/ride_walk` 双视角文件仅作为兼容证据保留，不属于正式十二动作矩阵，也不参与当前运行时骑乘拼接；整图骑乘由各自 mounted bundle 管理。
- 独立 UI 美术为 `ui/portrait.png` 与 `ui/showcase.png`，对应原图、处理元数据和联系表保存在 `source/ui/` 与 `qa/ui/`；它们不是从战斗帧粗裁得到。
- 原始生成图、提示词契约、重排元数据、处理元数据、512 源帧、256 运行帧、逐动作 QA、总联系表与来源台账全部随包保存。可按 `prompts/battle-formal-v1.txt`、`source/battle/rebuild_phase379_evidence.py` 和 `action-bundle-meta.json` 的 replacement path 重建。
- 当前自动门与代理视觉自审通过，素材已接入本阶段真实运行时供视频验收；项目所有者视觉验收仍为 `owner_review_pending`，不得据此宣称用户已批准。
