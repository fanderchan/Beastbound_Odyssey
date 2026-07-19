# 赤角兽完整美术生成合同 v1

身份参考固定为 `identity/identity-board-transparent.png`。所有原始帧均由内置图像生成生成；后处理只进行纯洋红背景去除、按格切分、整体缩放、脚底对齐和边缘清理。

## 身份不可变项

- 赤褐硬毛、深褐层叠鬃、单枚黑甲分节的琥珀熔岩额角。
- 奶油色口鼻与胸腹、余烬橙踝毛、深色蹄、橙色叶片状体侧纹、短簇尾和琥珀眼。
- 四足幼年荒原角兽骨架；不得增加第二枚角、翼、装甲、骑具或漂浮特效。

## 世界动作

八个方向独立创作，目录顺序为 south、southwest、west、northwest、north、northeast、east、southeast；每方向 idle 1 帧、walk 4 帧。行走帧按接地、过渡、反侧接地、回收组织，禁止镜像和仅上下浮动。

## 战斗动作

两个正式视角为敌方 `front_3quarter_sw` 与我方 `back_3quarter_ne`。每个视角独立生成 idle、walk、attack、skill、hurt、defend、dodge、counter、stagger、knockaway、down、revive，每动作 2x2 四帧。

- 普攻以额角冲撞；技能以额角蓄热并压地释放，火光只可紧贴额角或接触点。
- dodge 是侧向闪避而非健康行走；stagger 是无外伤的疲惫蹒跚。
- down 是可复活昏迷，允许失焦或螺旋眼与松弛嘴型；禁止微笑、安睡、死亡、血液、伤口、光环或星星。
- revive 从倒地姿态逐步起身，不能直接跳回 idle。

所有表格使用纯色 `#FF00FF` 背景，无阴影、文字、边框、UI、骑手、场景或分离式大特效。
