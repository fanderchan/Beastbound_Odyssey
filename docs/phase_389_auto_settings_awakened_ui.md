# Phase 389：觉醒式自动战斗设置与默认一键挂机

## 参考意图

- 视觉层级参考用户提供的《石器时代：觉醒》设置／自动战斗截图：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-5e5f160c-7118-4a00-9619-d15b19d6a8cc.jpg`。
- 参考重点是全屏木质游戏页、左侧设置目录、人物与宠物动作卡、明确的开／关状态和恢复
  阈值；不是复制参考产品的像素、商标、角色或不存在的功能。
- 产品行为按用户决定收敛：战斗内“自动”是主要入口，默认值可以直接挂机；设置页不是
  开始挂机的前置流程。

## Beastbound 规则

- 战斗右下角“自动”继续一键启用人物与宠物自动战斗；自动期间“取消”始终可见并可接管。
- 默认人物攻击、宠物技能 1、首个存活目标、生命恢复开启和人物／宠物 45% 血线保持不变。
- 设置页只调整现有首回合／一般回合动作、宠物技能、目标、恢复开关、血线和五级恢复
  来源顺序，不新增服务器字段、战斗公式或协议版本。
- 世界“挂机”继续直接开始／停止在线挂机；玩家不需要进入设置页再点一次开始。

## 实现合同

- `AutoSettingsAwakenedPresenter` 把规范化档案、人物／宠物身份和现有自动战斗配置投影成
  稳定视图状态。
- `AutoSettingsAwakenedPanel` 提供 `1280×720` 全屏设置页、木牌导航、回合页签、双单位
  动作卡、恢复阈值和恢复顺序内嵌页。
- `PanelFlowCoordinator` 只负责接线、保存现有设置和复用挂机／自动捕捉旧合同；没有把新
  页面逻辑继续堆入 `main.gd`。
- 旧 `auto_settings_controls` 语义键继续存在，既有自动战斗、挂机和捕捉检查不需要遍历
  视觉节点。

## 明确非目标

- 不伪造参考中的百人道场、逆境迷宫、录像大厅、攻略或当前项目没有的其他设置页。
- 不新增“保存后才能生效”的流程；现有设置继续即时写入档案。
- 不修改自动战斗决策、自动捕捉规则、离线挂机收益、经济数值或服务端权威边界。

## 验证证据

- 最终实机默认页：
  `.run/evidence/phase389_auto_settings_awakened_ui/implementation/final/auto-settings.png`；
- 恢复顺序内嵌页：
  `.run/evidence/phase389_auto_settings_awakened_ui/interaction/auto-settings-heal-priority-1280x720.png`；
- 参考／实机全视口比较：
  `.run/evidence/phase389_auto_settings_awakened_ui/comparison/reference-vs-implementation-final.jpg`；
- 主设置区聚焦比较：
  `.run/evidence/phase389_auto_settings_awakened_ui/comparison/content-focus-final.jpg`；
- `godot --headless --path client/godot --quit`：解析通过；
- `godot --headless --path client/godot --script res://scripts/ui/auto_settings_awakened_panel_check.gd`：
  `result=PASS`，真实左键覆盖回合、导航、恢复开关、内嵌页完成和关闭；
- 设置页保持打开 900 帧：按项目静置目标稳定约 `30 FPS`，`process_total=0.38–0.51ms`
  （单次采样峰值 `0.59ms`）；日志为
  `.run/evidence/phase389_auto_settings_awakened_ui/perf/panel-idle.log`；
- 真实跨帧移动 1600 帧：`status=ok`，稳定约 `59–60 FPS`、
  `process_total=0.42–0.56ms`；日志为
  `.run/evidence/phase389_auto_settings_awakened_ui/perf/moving.log`；
- `--auto-battle-command-awakened-ui-check` 通过，证明战斗内觉醒式“自动／取消”入口仍可用；
- 既有 `--auto-battle-auto-attack-check` 中按钮启用、取消按钮、人物提交、关闭后不再提交均
  为真，但整项仍因默认夹具没有宠物提交（`pet_submitted=false`）退出 1；
- 既有 `--auto-battle-settings-check` 的 UI 部分为 `panel=true`，但整项仍受当前工作树既有
  战斗策略回归影响：`first_spirit=false`、`first_once=false`。本阶段没有把该非 UI 失败
  误报为通过。
