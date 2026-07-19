# 晶甲乌力身份关键姿势自审

## v1 退回原因

- v1 原图 1254×1254、严格 2×2，造型本身满足进化差异。
- 确定性切分报告把右下格 `[1,1]` 标为 `edge_touch=true`；源组件 bbox 为 `[0,86,573,469]`，说明侧视图贴到自己的单元左边缘，无法安全扩动作。
- v1 只保留为失败证据，没有作为最终透明身份板。

## v2 确定性检查

- v2 只缩小并重新居中四个视图，原图仍为 1254×1254 严格 2×2。
- 处理参数为 512px 单姿势、`fit_scale=0.84`、`align=center`、`shared_scale=true`、`component_mode=largest`、6px component padding、4px edge-touch margin。
- 四格 `edge_touch=false`；透明输出角落透明，未发现洋红背景残块。
- 四格保留同一张脸、两耳、两獠牙、四腿、每足三爪、额晶盾、成对肩堡、背部烟晶层次、水蓝脉络和卷尾晶芽。
- `front_3quarter_sw`、`back_3quarter_ne`、`south`、`west` 朝向正确，正背侧视没有读成不同进化个体。

## 视觉结论

- 通过身份/关键姿势自审：晶盾额冠、巨大肩堡、半透明烟晶内部水蓝脉络和成熟宽肩改变了轮廓与材质，明确不是高防乌力换色。
- 仍保留猪鼻、两小獠牙、低重心四足、卷尾和层叠背甲，血统可追溯；进化稀有度读感成立。
- 晶体数量多，后续真八向、动作连续与 mounted whole-frame 的身份稳定风险高，必须单独过门；本轮无实机截图或 MP4，状态只能到 `identity_locked_self_review_passed_owner_review_pending`。
