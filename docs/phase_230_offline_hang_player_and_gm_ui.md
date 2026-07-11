# Phase 230：离线挂机玩家入口、登录提示与 GM 参数面板

日期：2026-07-11

## 玩家流程

离线修行接入现有“内挂 → 挂机”页，不新增平行菜单：

- 页面最上方优先显示离线修行状态；
- 未开始时显示“开始离线”，服务器只接受当前正式等级练级区；
- 进行中显示“刷新累计 / 领取收益 / 取消离线”，在线挂机按钮同步禁用；
- 刷新后显示有效累计时长、是否已封顶、本服收益比例、封顶和场次基准；
- 登录或拉取档案时若发现 active 离线会话，只提示一次“内挂 → 挂机”领取入口；
- 成功开始会停止客户端本地自动走动，成功领取/取消统一应用服务器档案和 revision；
- 所有失败文字经 `ServerAuthClientModel` 中文错误映射，不显示原始 JSON 或错误码。

## GM 流程

具有 GM 插件和服务器 GM 身份的账号在同一页看到“本服 GM 参数”：

- 收益比例 0–100%；
- 累计封顶 60–1440 分钟；
- 在线场次基准 10–300 秒；
- 最短领取 1–60 分钟。

保存使用 `PUT /gm/hang/offline/config`，最终仍由服务端 `gm_offline_hang_config` 授权、校验和审计。普通玩家不会看到这一组控件。

## 客户端结构

- `offline_hang_client_model.gd` 只负责从档案/状态响应生成显示模型与登录提示；
- `server_sync_coordinator.gd` 集中 status/start/claim/cancel/GM config 请求、响应解析和权威档案应用；
- `panel_flow_coordinator.gd` 只构建控件并转发用户意图；
- `main.gd` 只保留窄 wiring，不承载离线规则。

## 验证

- Godot parse + 挂机 UI + auth client + client version + server auth contract 5/5；
- 挂机检查覆盖未开始按钮、active 领取/取消、登录提示文案、95 分钟格式、本服 GM 参数控件；
- 真实 Metal 1280×720 截图：`.run/evidence/phase230/offline_hang_panel.png`；
- 截图复核后把离线区移到页首，active 时在线挂机入口禁用；
- idle `process_total` 稳定约 0.23–0.47ms；moving 60 FPS、约 0.18–0.35ms；
- 317 次跨帧移动点击 `avg/max_input_us=14/314`，`coalesced=true`、`settled=true`；
- 新逻辑只在档案应用、显式网络操作或打开/刷新面板时运行，没有进入 `_process`、HUD signature 或绘制热路径。

## 后续

P0.3c-3 仍需用隔离本地后端完成真实 start → 断开客户端 → 重登录 → claim 的 HTTP/客户端闭环；在这项完成前不勾选整个 P0.3c。
