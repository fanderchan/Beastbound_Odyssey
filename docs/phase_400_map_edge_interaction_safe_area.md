# Phase 400：地图边缘交互安全视口与真实传送回归

## 参考意图与问题边界

- 本阶段收口 Phase 396 多图路线之后暴露的地图边缘交互问题：玩家走到地图下缘、右缘或正式
  HUD 附近时，玩家和下一处传送点仍应同时处在可见、可点击的世界区域；正式顶栏、右栏、消息
  区和底栏继续拥有自己的点击，不靠隐藏 HUD、点击穿透或瞬移绕过问题。
- StoneAge 参考只用于确认成熟世界界面的行为意图：镜头会为地图边缘的玩家和邻近目标保留操作
  空间，常驻 HUD 不因为移动而消失。本阶段没有复制参考游戏地图、美术、坐标、数值或代码。
- 不改变地图 JSON、warp 合同、寻路规则、碰撞、交互距离、服务端移动权威或传送结算；修复只
  覆盖相机安全视口、世界／屏幕坐标统一及真实输入回归。

## 精确根因

- 基线 `--auto-map-transfer-check` 从训练场 `(14,12)` 直接把远端 warp 的屏幕投影交给
  `_set_click_move_target`。这既不是玩家产生的 `InputEventMouseButton`，也没有保证投影点在当前
  可见世界区；默认 headless 视口为 `1280x1280` 时，训练场边缘 warp 投影进入正式底栏，
  `_is_ui_point` 正确拒绝输入，于是玩家保持在 `(14,12)`、`arrived_village=false`。
- `IsoMapModel.find_path` 对该路线能返回完整可行路径，warp 也明确为可重叠；故原始稳定失败不
  是碰撞或寻路断路。旧夹具确实无效，但继续只修夹具会掩盖真实产品问题：旧相机边界按完整
  viewport 夹紧，方形／受限视口到地图边缘后无法再滚动，玩家附近的 warp 仍可能长期压在
  常驻 HUD 下。
- 另一个只在真实跨帧输入中可见的竞态来自 Camera2D smoothing：若用目标相机位置计算屏幕点，
  却在显示中心尚未发布时发送点击，下一帧该屏幕点会映射到相邻格。夹具现在等待
  `get_screen_center_position()` 与目标位置稳定后再发送按下事件；正式运行仍按玩家当帧点击位置
  处理，没有关闭 smoothing。

## 玩家可见设计

- 新增独立纯模型 `WorldCameraSafeAreaModel`。布局完成时，host 只收集当前可见且会拦截鼠标的
  顶栏、右栏、消息区和底栏矩形，模型据此计算带交互命中余量的安全世界矩形。该计算不进入
  每帧 HUD 扫描；相机热路径只消费缓存几何。
- 正常 `1280x720` 中心本来安全时，玩家锚点仍保持 `(640,360)`，正常画面不无故偏移。到地图
  边缘时只扩展足够的相机边界，使玩家和其附近约两格内的交互点落回安全世界矩形；不会强制把
  地图边缘居中，也不会展示过量地图外背景。
- 上、右、下 HUD 同时存在或视口比例改变时使用同一模型。世界／屏幕换算、相机目标、相机
  边界与边界断言共享同一 zoom 约定，避免“画面已滚动但点击仍用旧中心”的两套坐标。
- 正式 HUD 始终可见、仍由 `_is_ui_point` 拦截；点击底栏中心仍被判定为 UI。任何被 HUD 覆盖的
  屏幕点都不会被改成世界点击。

## 真实输入与自动回归合同

- 地图传送检查不再直接调用移动 helper。每段先从玩家当前格重新取得正式 path，选择当前画面
  内最远、未被 UI 覆盖的可点击格；到达边缘后再以同样方式点击真实 warp。
- 每次点击都通过 `Input.parse_input_event` 发送鼠标移动和左键按下，跨 process／physics frame
  后才发送左键释放。检查记录真实点击数、跨帧释放数、host 输入接受数、UI 拒绝数和每次
  世界／屏幕 roundtrip；任一不相等即失败。
- 出村与回程都必须点击真实 interaction 并换图，不能直接调用 `_load_map`、传送 helper 或
  complete；最终同时断言玩家／目标可见、两者都不在 UI、相机中心合法、正式 HUD mount 存在、
  底栏可见且仍归 UI 所有。
- 独立模型检查覆盖 `1280x720`、`1280x1280`、同时受顶／右／下 HUD 约束的视口、正常中心不
  偏移、地图下缘玩家及 96px 邻近交互同时可点，以及世界／屏幕坐标可逆。

## 验证与性能证据

- 基线复现：`.run/godot_auto_checks/2026-08-08T06-44-12-821Z.log`，
  `status=failed / final_cell=(14,12) / arrived_village=false`。
- focused 模型最终回执为
  `.run/evidence/phase400_map_transfer/final-safe-area-model.log`：`errors=[] / ok=true`；
  `1280x720` 安全矩形为 `[P:(8,206), S:(955,288)]`、中心锚点仍为 `(640,360)`，方形
  QA 视口安全矩形为 `[P:(8,338.2222), S:(955,568)]`。
- 最终相机与点击坐标串行为
  `.run/godot_auto_checks/2026-08-08T07-24-17-724Z.log`，parse、
  `--auto-camera-check`、`--auto-camera-click-check` 为 `3/3`；显示中心稳定后
  `expected_cell=(27,26) / target_cell=(27,26)`。
- 最终三轮连续地图往返分别为
  `.run/godot_auto_checks/2026-08-08T07-24-41-309Z.log`、
  `.run/godot_auto_checks/2026-08-08T07-24-52-469Z.log`、
  `.run/godot_auto_checks/2026-08-08T07-25-03-154Z.log`，每轮均为 parse + transfer
  `2/2`。每轮真实左键 `4` 次、跨帧释放 `4` 次、坐标 roundtrip `4` 次、host 接受 `4` 次、
  UI 拒绝 `0`；出村与回程都到达，正式 HUD 可见、底栏归 UI 所有、两次点击 warp 时玩家／
  目标同时可见，相机边界为 `true/true`。
- 真实 Metal `1280x720` 往返为
  `.run/evidence/phase400_map_transfer/final-map-transfer-1280x720.log`：`status=ok`，真实左键／
  跨帧释放／坐标 roundtrip／host 接受均为 `5`、UI 拒绝 `0`，两端 warp 均为玩家与目标同时
  可见，相机边界 `true/true`，正式 HUD 可见且底栏仍归 UI。边缘点击前画面为
  `.run/evidence/phase400_map_transfer/edge-warp-safe-1280x720.png`，实际尺寸 `1280x720`、
  SHA-256 `a0bf237047da8fb202967654dc465aaa81317dbaeed01ee00ca8ddbcfef2a40a`。
- 同一基线 `5302406ab` 与修复后的串行 headless moving 对照分别为
  `.run/evidence/phase400_map_transfer/baseline-movement-perf.log` 和
  `.run/evidence/phase400_map_transfer/final-movement-perf.log`：两者均
  `status=ok / path_len=11`；基线 `9` 组 `process_total avg=0.800ms / camera avg=0.017ms`，
  修复后 `8` 组 `process_total avg=0.743ms / camera avg=0.028ms`。
- 真实跨帧连续点击对照分别为 `baseline-movement-spam.log` 与
  `final-movement-spam.log`：两者均 `37` 次 host 输入、`screen_mismatch=0`、UI 拒绝 `0`、
  coalesced／settled／final target 全真；平均输入均 `1us`，最大输入由 `4us` 到 `8us`，远低于
  `12ms` 门槛。两组短窗 `process_total avg` 为 `0.435ms` 与 `0.540ms`，未出现帧级阻塞；安全
  区 HUD 扫描只发生在布局，不进入点击或每帧相机热路径。
- 最终 scoped `git diff --check` 通过；Godot 运行产生的未跟踪 `.uid`／`.import` 已移入废纸篓，
  worktree 只保留本阶段两处修改和三个新增源码／文档文件，结束时无本阶段 Godot／Node／
  ffmpeg 残留。
- 不引用并发 import 或 Camera2D 尚未稳定时产生的中间失败回执。
- 当前阶段不运行完整 local CI；只声明地图边缘相机、鼠标移动、传送往返和正式 HUD 边界。

## 非目标与验收状态

- 不隐藏正式底栏／任务栏，不允许世界点击穿透 UI，不直接传送，不新增玩家可见安全区边框、
  QA 文案、调试坐标、GM 开关或路线菜单。
- 不改变战斗相机布局、地图素材、minimap、碰撞图、warp 数据、移动速度、服务端 ACK 或移动
  权威；这些若有独立问题需另开窄阶段。
- `ownerReviewStatus=pending`。工程门禁与截图只能证明交互和布局合同，不能替代项目所有者对
  正式画面的审美验收。
