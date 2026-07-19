# G02 普通布伊三形态身份与整体骑乘自审

状态：`self_review_passed_owner_pending`；三只宠物与三套整体骑乘均保持 `runtimeEnabled=false`。

## 联系表阅读顺序

- 行 1：红色普通布伊；行 2：黄色普通布伊 v2；行 3：厚皮布伊。
- 列 1：独立宠物 `front_3quarter_sw`；列 2：独立宠物 `back_3quarter_ne`；列 3：整体骑乘 `front_3quarter_sw`；列 4：整体骑乘 `back_3quarter_ne`。
- 原尺寸板：`bui-normal-three-form-pet-mounted-original.png`（2048×1536，SHA-256 `4a2fe5ac11cf38f8c5bdd5c7d16b2cf4639102df183d0580a494111aad2c73c8`）。
- 160px 板：`bui-normal-three-form-pet-mounted-160px.png`（640×480，SHA-256 `cfb9974064cabccf7ddbfc1f54025110866a25918b2a08db3b59018666ce1788`）。

## 160px 可读性结论

- 红色：五枚深色背纹、赤褐躯干、奶油胸吻和火种尾簇仍清楚；骑手不是微缩玩偶。
- 黄色：宽头宽耳仍读作布伊，青色四背纹/旋纹/尾刷仍能与红色区分；没有狐化。
- 厚皮：颈鬃、宽肩胯、短粗腿和五组深色毛层岩纹仍形成最厚重的剪影；没有龟壳读感。
- 三套骑乘在 160px 均能读清成人骑手、低鞍接触和前/背方向；宠物与骑乘版的主体身份一致。

## 拒收与重做记录

1. 黄色普通布伊 v1：因长尖耳、窄吻、狐/犬轮廓和细长尾破坏布伊血统而拒收。原图、精确 revised prompt 和 `REJECTION.md` 位于 `.run/art_batch_phase320/bui_normal/yellow/rejected_v1/`；正式工程资产只使用 v2。
2. 红色普通布伊骑乘 v1：成人比例和坐姿可用，但背三分之四朝屏幕左侧，违反 `back_3quarter_ne` 朝右上的方向合同；已拒收并以强化空间几何 prompt 生成 v2。拒收原图以无损 WebP 存于 `../../../mounted/novice_hunter_v1/bui_normal_red_fire10/source/mounted-keypose-v1-wrong-direction-raw.webp`，完整记录位于 `.run/art_batch_phase320/bui_normal/red/rejected_mounted_v1_direction/`。

## 本门槛不包含

- 未制作世界八向 idle/walk。
- 未制作战斗 idle、walk、attack、skill、hurt、defend、dodge、counter、stagger、knockaway、down、revive。
- 未进入 Godot 运行时、战斗验收场或地图比例验收；owner 接受本身份方向后才值得扩展动作矩阵。
