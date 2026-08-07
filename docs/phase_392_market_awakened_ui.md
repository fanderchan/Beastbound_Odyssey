# Phase 392：觉醒式交易所全屏三态与连续验收视频

## 参考意图

- 购买参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-c9ab28e4-e0fd-4d92-823f-a0e44307915d.jpg`；
- 出售参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-e3eaa49f-8604-4f7e-8d09-83756b7d1c2f.jpg`；
- 公示参考：
  `/var/folders/lt/zy6ls0f1677by0902kpxgjgc0000gn/T/codex-clipboard-7d80efd8-7b88-43c8-9d2b-a2557d42b0a6.jpg`。
- 三张参考图均为 `2622×1206`。本阶段提炼同一全屏容器内的顶部页签、左侧分类、中央
  商品／背包列表、右侧详情或上架表单，以及明确主动作的成熟层级；不复制参考图像素、
  商标、素材、角色、宠物、商品或数值。
- 参考图的“公示”只用于判断信息层级。Beastbound 没有公示期、预购、竞价或收藏合同，
  因此正式第三态是已有真实功能“我的挂单”，不把相似外观误写成另一套交易规则。

## Beastbound 真实交易合同

### 购买

- 客户端从权威 `GET /market/listings` 读取公开挂单；普通物品和装备实例统一显示名称、
  数量、单价、总价、币种及卖家，但装备详情继续经 `EquipmentEscrowClientModel` 安全投影。
- 购买只提交 `listingId` 到 `POST /market/buy`。客户端不按画面价格乐观扣款，也不在成功
  回执前改背包、钱包或挂单；服务端返回权威 profile、revision 与市场状态后才刷新页面。
- 页面只提供当前真实的“全部／装备／道具”分类及本地名称搜索、总价排序；它们只是对
  已取回的有界列表做客户端投影，不冒充服务端分页、竞价、预购或跨服搜索。

### 出售

- 普通物品上架提交 `itemId / count / unitPrice / currency`；单次数量为
  `1..min(背包持有量, 999)`。
- 装备上架固定数量 `1`，并额外携带精确 `instanceId / sourceSlotIndex`；选择、导出和服务端
  托管都不能退化为只按 `itemId` 处理。
- 只有现行非绑定石币或钻石可以计价；绑定物、不可交易物和不安全装备实例不进入可上架
  列表。价格输入继续沿用既有客户端上限，不因参考图扩张经济规则。
- 页面显示合计、服务端动态税率下的“预计税费／预计到手”，并明确成交款扣税后通过邮箱
  附件发放。没有上架费，也没有硬编码参考产品的 `15%` 手续费。

### 我的挂单

- 只显示当前账号的真实挂单及完整详情；下架仅提交 `listingId` 到
  `POST /market/cancel`，成功后按权威回执退回普通物品或原装备实例。
- 重复装备信封、旧版／未来版信封、字段损坏和身份不一致继续失败关闭，不为了让卡片可见
  而绕过托管安全门。

## 页面与资产实现

- `MarketAwakenedPanel` 是 `1280×720` 专用全屏视图，稳定提供“购买／出售／我的挂单”
  三态、分类、搜索、排序、商品详情、背包选择、上架预览、确认购买、确认上架和确认下架。
- `PanelFlowCoordinator` 继续负责把既有市场状态投影到新视图并连接原写路径；
  `PanelRegistry` 仍是唯一面板身份和输入阻断来源，没有新增平行开关或第二套市场状态。
- 普通玩家界面只显示玩家可理解的名称、数量、货币、价格、税费与操作结果，不泄露
  `itemId`、`instanceId`、schema、接口、审计号、测试标志或 agent 文案。
- 专属 `market_awakened_v1` 底板由本仓库使用 built-in ImageGen 原创生成，再本地缩放为
  `1280×720`；运行 SHA-256 为
  `d553a35b6e6b6a1cccd360a82f45fcc3cb5fa4386eeb609c923ac9987682d51b`。
  木梁、竹节、藤叶、羊皮纸、货车和货箱只提供静态材质与构图，底板不烘焙文字、按钮、
  商品或交互。来源、生成提示、替换路径和哈希记录在
  `client/godot/assets/ui/market_awakened_v1/`；没有复制三张参考图的任何像素。
- 商品卡和详情继续使用仓库正式 item icon；搜索、页签、数量、价格与主动作全部由 Godot
  真控件绘制，不用 emoji、字符画、参考截图裁片或假商品图标。

## 交互与安全边界

- 购买：选择分类／搜索／排序 → 选择挂单 → 阅读详情与合计 → 内嵌确认 → 权威购买。
- 出售：切换出售 → 选择普通堆叠或精确装备实例 → 填写数量、币种和单价 → 查看税费与
  到手预览 → 内嵌确认 → 权威上架。
- 我的挂单：切换页签 → 选择本人挂单 → 阅读详情 → 内嵌确认 → 权威下架。
- 三条主流程均可只用左键完成；确认层仍在同一交易所页面内，不退回通用系统弹窗。
- 验收录像使用新鲜隔离 user-data、没有启动后端、没有访问 MySQL，也没有提交购买、上架
  或下架等资产写入；录像只证明真实 `Main.tscn` 的页面、控件和状态切换，不能冒充生产
  成交证据。

## Design QA 证据

- 三参考／三实机状态同屏：
  `.run/evidence/phase392_market_design_qa/reference-vs-real-main-3state.png`；
- 同屏图 SHA-256：
  `8484d1cceb633a3097d2011397ec003623b67b75547acabd2e0b0804b041c3f7`；
- 下排实机画面来自真实 `Main.tscn`，依次覆盖购买、出售和我的挂单，不是聚焦脚本的
  独立面板截图。
- 最终比较没有 P0、P1 或 P2。保留的 P3 差异是有依据的产品合同取舍：Beastbound 使用
  三种真实状态和三项真实分类，出售页显式呈现数量、币种、动态税费与预计到手；不复刻
  参考图不存在于本项目的宠物交易、公示、竞价、预购、收藏、固定 15% 或三种货币。
- `design-qa.md` 的 Phase 392 最终结果为 `passed`。

## 连续视频证据

- 视频：
  `.run/evidence/phase392_market_awakened_owner_review/phase392-market-awakened-final/market-awakened-owner-review-1x.mp4`；
- 联系表：
  `.run/evidence/phase392_market_awakened_owner_review/phase392-market-awakened-final/contact-sheet.png`；
- 元数据：
  `.run/evidence/phase392_market_awakened_owner_review/phase392-market-awakened-final/metadata.json`；
- 摘要：
  `.run/evidence/phase392_market_awakened_owner_review/phase392-market-awakened-final/summary.json`。
- 成片来自真实 `res://scenes/Main.tscn` 与 Metal Forward Mobile，共九章：世界、购买概览、
  普通物详情、装备详情、普通物上架、装备上架、我的挂单、空状态引导和返回世界。
- 最终规格为 `23.133333s / 694` 帧、`1280×720 / 30 FPS / 1.00×`、H.264
  `yuv420p`、AAC 48kHz 双声道；音视频双流完整解码通过。MP4 SHA-256：
  `8e670e9d3f0777ad74c57c000ade0efd5ecad9a817a1eb19d7c9410b6d586654`。

## 验证

- `market_awakened_panel_check.gd`：`PASS`；覆盖三态、正式物品图标、分类／搜索／排序、
  上架表单、动态税费、确认层、空状态、全视口边界和左键事件。
- Godot 最终定向组合 `4/4`：解析、`--auto-equipment-instance-check`、
  `--auto-market-panel-check`、`--auto-panel-registry-check` 全部通过；市场检查继续覆盖普通物
  与精确装备上架、公开装备投影、重复／旧版信封拦截和 buy/cancel 仅发 `listingId`。
- 市场相关 Node 定向测试通过，覆盖市场状态与经济结算的既有服务端规则；本阶段没有修改
  市场服务合同或数据库结构。
- 另行运行的 `auth-durable-commit.test.js` 在当前混合工作树出现非本项 websocket
  handshake 断言 `0 != 1`；该失败未被记作本阶段通过，也不被用来证明交易所 UI。相关
  websocket 代码和测试均不在 Phase 392 修改范围，保留为独立工作树残余风险。
- 录像包装器 Python 测试、`py_compile`、H.264/AAC 转码、全片解码、十二帧截图、联系表和
  SHA 清单均通过；录制结束没有遗留 Godot 或录像进程。
- 同一九章流程开启 `--perf-probe` 后取得 22 个跨世界／购买／出售／我的挂单／返回世界
  样本，`process_total=0.06..0.11ms`；独立真实跨帧移动检查为 `status=ok`、热身后
  `60 FPS`、`process_total=0.22..0.48ms`，37 次鼠标连点压力检查也为 `status=ok`，没有
  UI 穿透、坐标往返误差或未收敛目标。

## 明确非目标与后续

- 本阶段没有新增宠物交易、公示期、预购、竞价、收藏、跨服市场、拍卖、服务端分页、
  上架费、固定税率、第三种货币、商品、掉落、价格、钱包字段、协议或数据库表。
- 项目所有者观看最终视频后反馈“勉强还可以吧”，因此本阶段记录为
  `ownerReviewStatus=owner_accepted_with_reservation`；工程 Design QA 已通过，后续仍可按
  实际长期操作反馈微调材质、密度与阅读舒适度。
