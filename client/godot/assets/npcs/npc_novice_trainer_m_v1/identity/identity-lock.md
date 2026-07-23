# 新手训练师·男 identity lock

- `appearanceId`: `npc_novice_trainer_m_v1`
- `roleId`: `novice_trainer`
- 冻结身份板：`identity/identity-board.png`
- 身份板 SHA-256：`a42b819fe2cdb5a93e9bc14ba5c08c65163ae6ea9a78ed683ad79ce0466099a0`

## 冻结视觉身份

约 43 岁、结实但亲和的成年男性新手训练师。暖棕肤色、宽和的成熟脸、深棕眼、短卷深棕发与后颈铜色布结，整齐短胡。赭橙无袖短背心、灰青长袖内衫、深色皮带、炭灰短裤、缠腿和棕靴形成稳定轮廓。

身份板实图冻结的物理非对称为：人物自身右髋固定两道赭橙束带的乳白卷轴式新手手册；人物自身左腰固定纵向三枚圆木训练筹码；胸前保留骨木太阳形新手徽记。八方向按真实近远遮挡呈现，不能镜像换侧。

他负责最初的对话、补给、首战和捕宠引导，不是守卫、骑宠导师或宠技训练师；禁止武器、盾、盔甲、坐骑器具、七槽训练牌、技能石和哨子。

## 冻结生产源

- 身份板：`source/raw/identity-board-v1.png`
- 世界八向：`source/raw/world-idle-2x4-v3-accepted.png`
- 对话人像：`source/raw/portrait-2x2-v1.png`
- 八向顺序：南、西南、西、西北 / 北、东北、东、东南；西向为额外独立 `image_gen` 原稿，经统一等比缩放装入单元格，无镜像。
- 人像顺序：中性、说话 / 微笑、担忧。

## 审查状态

正式 bundle、真实 Godot 八方向录制、`Main.tscn` 实装截图、独立 Stage A/B 盲审和 schema-v2 合并审计均已通过。当前冻结为 `owner_review_pending`；在项目所有者明确接受前不得标记 approved 或启用正常运行时。
