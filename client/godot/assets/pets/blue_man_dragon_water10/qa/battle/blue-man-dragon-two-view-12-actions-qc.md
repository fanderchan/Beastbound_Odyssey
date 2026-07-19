# 蓝人龙宠物本体双视角 12 动作静态审计

- 结论：`static_self_review_passed_owner_pending`；未启用运行时，未冒充 owner approved。
- 正式视角：`front_3quarter_sw` 与 `back_3quarter_ne`。
- 动作：12×2；运行帧 180/180；512px 源帧 180/180。
- 安全边：运行帧最小 15px；源帧最小 30px。
- 原始生成图均归档为像素无损 WebP，24/24 解码 RGBA 与原始 PNG 相等；24 个 GIF 帧数匹配。
- 背视角攻击比例跳变已用整图标准化修复；两个正式视角均保持 `down-8 == revive-1` 的逐文件、逐像素连续性。
- 攻击、技能、格挡、受击、回避、反击、负伤归位、击飞、可复活昏厥与复活语义在联系表中可区分。
- 击飞轨迹、格挡压力、命中停顿、晕眩圈、技能特效和合击仍由真实战斗导演验证，不烘焙进身体帧。
- 真实 Godot 10V10 与 owner 审美验收尚未完成，因此顶层仍为 `in_production`，`runtimeEnabled=false`。

- 双视角总览：`qa/battle/blue-man-dragon-two-view-12-actions-contact.png`
- 机器报告：`qa/battle/blue-man-dragon-two-view-12-actions-qc.json`
- 每动作：`qa/battle/<view>/<action>/{contact-sheet.png,animation.gif,qc.json}`
- 来源：`source/battle/<view>/source-meta.json`。
