# 普通乌力身份关键姿势自审

## v1 退回原因

- 原图 1254×1254、严格 2×2。
- 确定性切分报告把右下格 `[1,1]` 标为 `edge_touch=true`；源组件 bbox 为 `[4,133,550,480]`，单元左侧只有 4px。
- 身份本身一致、身体没有肉眼缺失，但这个留白不符合后续动作生成的安全边要求，因此 v1 只保留为失败证据。

## v2 确定性检查

- v2 原图 1254×1254，使用 v1 作为唯一身份参考，只修正间距。
- 处理参数：2×2、512px 单姿势画布、`fit_scale=0.84`、`align=center`、`shared_scale=true`、`component_mode=largest`、6px component padding、4px edge-touch margin。
- 四格 `edge_touch=false`；透明输出角落透明，未发现洋红背景残块。
- 四格头、两耳、两獠牙、四腿、每足三爪、额甲、背甲主带、卷尾余烬和橙红/玄武岩/米白配色一致。
- `front_3quarter_sw` 面向左下，`back_3quarter_ne` 面向右上；正面和侧面没有读成不同动物。

## 视觉结论

- 通过身份/关键姿势自审：剪影在缩至约 128–160px 后仍能读成低重心冲锋甲兽，区别于芽耳布伊和普通写实野猪。
- 火元素表达克制，普通野外宠身份成立；没有把普通形态画成商业宠或进化终端。
- 本轮没有动作、真八向、mounted 整图、实机截图或 MP4，因此状态只能到 `identity_locked_self_review_passed_owner_review_pending`。
