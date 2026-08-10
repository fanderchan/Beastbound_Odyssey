# Phase 385：觉醒风格家族页

## 目标

把原有通用纵向“家族与庄园”面板改为 PC `1280×720` 全屏家族页。视觉层级参考
《石器时代：觉醒》的成熟家族界面，但运行时资产、数据与交互仍属于 Beastbound：

- 未加入时展示家族大厅、家族详情、加入入口和创建家族内嵌页；
- 已加入时使用左侧家徽资料、中央内容区和右侧纵向页签；
- `信息 / 成员 / 活动 / 庄园` 只展示当前服务端能权威提供的数据；
- 从庄园管事打开时，即使访客尚未加入家族，也直接聚焦指定庄园。

## 参考意图与原创边界

- 参考只用于信息层级、主区域比例、纵向页签、创建弹层和状态切换；
- 底板、家族图腾、按钮、页签、关闭图标和中文字体均复用项目现有原创觉醒资产；
- 不复制参考产品的美术、货币数值、家族等级、捐献、科技、工资或福利规则；
- 当前成员 payload 没有外观标识，因此中央成员舞台使用原创家族图腾和真实姓名牌，
  不猜测玩家形象。

## 客户端结构

- `family_awakened_presenter.gd`：把服务端家族、成员、庄园和庄园战快照转换为只读
  View State，并集中计算可见状态和操作权限；
- `family_awakened_panel.gd`：负责全屏布局、创建内嵌页、页签、列表和动作信号；
- `panel_flow_coordinator.gd`：只保留宿主接线、HTTP 请求和现有权威操作回调；
- `family_awakened_panel_check.gd`：以 `1280×720` 隔离画布和跨帧真实左键验证主流程。

## 数据与权限合同

- 家族资料：`name / leaderDisplayName / memberCount / maxMembers / fame / notice`；
- 成员资料：`displayName / role / online / connectionState`；
- 庄园资料：归属、休战、守备、商店和当前庄园战；
- 宣战只在当前用户为族长、目标非己方、没有进行中战争且不在休战期时启用；
- 参战、退出、入场、结算和道具场继续使用服务端返回的 viewer 权限字段；
- 玩家界面不显示内部 `familyId`、账号 ID、接口名、测试开关或原始错误码。

## 非目标

- 本阶段不新增家族银行、公告编辑、职位权限、捐献、科技、工资或福利结算；
- 不修改家族与庄园的服务端 schema、协议版本和持久化规则；
- 不把移动端、竖屏或触屏布局列为 PC 版本完成条件；
- 不勾选 `stoneage_gap_plan.md` 的完整 P2.4，因为该路线项仍包含本阶段之外的家族
  银行、权限与更多社会功能。

## 验证

- `godot --headless --path client/godot --quit`：通过；
- `godot --headless --path client/godot --script res://scripts/ui/family_awakened_panel_check.gd`：
  `PASS`，覆盖大厅、创建内嵌页、加入、信息、成员、活动、庄园与道具场事件；
- `node tools/run_godot_auto_checks.mjs --only=--auto-panel-registry-check,--auto-manor-map-shop-check --fail-fast`：
  3/3 通过；
- `node --test server/node/test/auth-family-manor.test.js`：3/3 通过；
- 正常 Metal 客户端 `Main.tscn` 启动并退出：成功，无脚本错误；
- Design QA：参考和实机归一化同屏复核，见项目根目录 `design-qa.md` 的 Phase 385。

## 性能证据

- 世界静置 `--perf-probe`：稳定 `process_total` 约 `0.30–0.61ms`；
- 真实跨帧移动 `--movement-perf-check --perf-probe`：`status=ok`，稳定
  `process_total` 约 `0.36–0.49ms`；
- 庄园管事打开家族庄园页并保持 90 帧 `--auto-manor-map-shop-check --perf-probe`：
  稳定 `process_total` 约 `0.51–0.54ms`，没有把家族数据扫描放入每帧热路径。

## 视觉证据

- `.run/screenshots/phase385_family_awakened/family-lobby-1280x720.png`；
- `.run/screenshots/phase385_family_awakened/family-create-1280x720.png`；
- `.run/screenshots/phase385_family_awakened/family-info-1280x720.png`；
- `.run/screenshots/phase385_family_awakened/family-manors-1280x720.png`。
