
# 见习猎人骑新手老虎整体战斗生成合同

- 两个独立绘制源视角：`front_3quarter_sw`、`back_3quarter_ne`；不以镜像生成另一源视角。
- 十二动作：idle、walk、attack、skill、hurt、defend、dodge、counter、stagger、knockaway、down、revive。
- 帧数和时序以 `action-bundle-meta.json` 为准；每个动作使用按时间顺序排列的 3×2 或 4×2 母表。
- down 表示暂时倒地，不表现睡眠、死亡或血腥；revive 首帧必须与 down 末帧保持 512px 与 256px 精确连续。
- 光环、眩晕、命中闪光等效果只在运行时独立渲染；母表不烘焙特效、地面、阴影、文字、伤口或运动线。
- 每帧骑手、老虎、鞍具和缰绳均为同一张整体插画，不允许运行时或离线分层粘合。
- 正式展示合同：敌方=`front_3quarter_sw + flipH=true`；我方=`back_3quarter_ne + flipH=true`；两侧均面向战场中心。
