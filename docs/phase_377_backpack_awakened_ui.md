# Phase 377：觉醒风格背包、装备对比与 1× 验收片

## 结论

本阶段把旧背包弹窗替换为 PC 目标分辨率 `1280×720` 的正式玩家界面：

- 左侧为完整人物与九个装备位；
- 右侧为五类筛选、五列背包和 `15` 个已开放格 + `5` 个付费扩展格；
- 点击装备实例会并排显示当前装备与候选装备，明确标出强化、耐久和四项属性的
  红绿增减；
- 装备、卸下、使用、丢弃、拆分、扩容、分类、拖放、合成、宠物目标选择和
  实际回血都沿用既有真实业务入口；
- 宠物蛋、驯宠证和骑宠证优先复用正式宠物大头照。

参考图用于确定“左装备／人物、右背包、顶部货币、木石材质、装备并排比较”的
层级和交互方向。本项目使用自己的角色、宠物、物品、文案和原创图集，没有复制
参考游戏的像素、标志或美术资产。后续开始新的玩家 UI 或大改版时，如果项目
所有者尚未给出参考图，客户端协作规则会先提醒提供参考截图。

## 玩家界面与操作

### 背包概览

- 顶栏显示石币、钻石和关闭按钮；
- 左侧九个装备位按现有权威槽位排列，空槽仍可辨认槽位名称；
- 中间保留见习猎人全身形象、角色名、等级与转数；
- 右侧五类筛选为“全部／世界／战斗／捕捉／装备”；
- 背包使用真实物品图标，不使用文字图标、emoji 或假占位图；
- 已开放格可点击、双击和拖放；锁格显示真实下一档钻石价格并进入二次确认；
- 没有可访问的真实修理入口时不显示假修理按钮，合成继续进入既有合成流程。

### 物品详情

- 堆叠物品显示名称、数量、说明和真实可用操作；
- 拆分界面使用同套暗木金边视觉，并固定在 `420×246` 的居中安全区；
- 需要宠物目标的物品会先显示宠物、当前生命和取消入口；
- 实际选择芽耳布伊后，生命从 `281/351` 恢复至 `351/351`，界面显示绿色
  `+70`；
- 宠物蛋和骑宠资格证在详情中显示对应正式宠物大头照。

### 装备详情与比较

背包行不再只按 `itemId` 猜测“拿哪一件装备”，而是保留
`equipmentInstanceId`：

1. 点击候选装备实例；
2. 按装备槽找到当前已装备实例；
3. 并排展示当前／候选的物品图、强化、耐久、要求、说明和有效属性；
4. 用绿色正数与红色负数显示逐属性差值；
5. 点击“装备”时把候选实例 ID 一并传给本地模型或服务端；
6. 同模板、不同强化的两件木棒也会精确更换被选中的一件，换下实例完整回到
   背包。

本地 `PlayerProgressModel`、客户端请求和 Node 权威 `equipItemToProfile` 均支持
这个可选实例 ID；旧调用不传实例时仍保留原有兼容行为。服务端继续验证实例属于
当前玩家、位于背包、物品类型相符、需求满足、背包可容纳换下装备，并保持经验丹
已有储存经验时禁止替换的规则。

## 原创美术包

运行包位于：

```text
client/godot/assets/ui/backpack_awakened_v1/
```

其中有 `14` 张正式运行 PNG：

- 一张 `1280×720` 背包背景；
- 一张项目自有见习猎人全身图；
- 按钮、页签、关闭、货币和物品槽公共素材；
- 装备、消耗品、材料和宠物相关物品四套原创图集。

`asset-manifest.json` 与 `source-and-ownership.md` 记录运行用途、源文件、尺寸、
格位、SHA-256、所有权和替换流程。最终审计 `38/38` 个声明哈希匹配，
`14/14` 张运行 PNG 全覆盖；Godot 生成的 `.import` 不进入产品提交。

`BackpackItemIconCatalog` 当前覆盖背包目录 `81/81` 个物品：

- `31` 个装备物品；
- `7` 个宠物物品优先使用正式独立大头照；
- `8` 个宠物物品具备原创物品图集降级图；
- 一个经验丹使用显式别名；
- `fakeSourceCount=0`。

这 `7` 个物品绑定到 `6` 张唯一大头照（芽耳布伊宠物蛋与骑宠证共用同一张）。
本阶段提交这六张画像的完整来源包，并在干净 HEAD 基线上重建 MM2 与新手老虎
两份来源证明；两张运行 PNG 的 SHA-256 与视频录制时逐字节不变，六包单体审计
均为 `status=ok / errors=[] / owner_review_pending`。这只闭合本背包的交付依赖，
不把尚待独立交付的全 36 宠共享画像系统冒充为本阶段完成。

参考图中的蓝／紫／橙底色没有被照抄，因为 Beastbound 当前物品目录没有权威
“品质”字段；本阶段不从截图臆造稀有度和掉落价值。

## 结构

聚焦的新组件：

- `BackpackAwakenedPresenter`：把档案投影成九装备位、筛选后背包行和装备对比；
- `BackpackItemIconCatalog`：缓存物品 ID 到真实纹理／AtlasTexture 的映射；
- `BackpackAwakenedVisualSkin`：统一暗木、暖金、按钮、页签和弹窗皮肤；
- `BackpackAwakenedItemCard`：背包格、装备格、选中、锁定和拖放卡片；
- `BackpackAwakenedPanel`：只负责 `1280×720` 布局、显示状态和用户事件；
- `PanelFlowCoordinator`：把新面板事件接回现有权威背包、装备与物品使用流程。

`main.gd` 只增加验收入口 wiring；正常玩家仍从原背包按钮打开同一个正式流程。

## 最终 1× 验收视频

最终视频：

```text
.run/evidence/phase377_backpack_awakened_owner_review/phase377-backpack-final-v5/backpack-awakened-owner-review-1x.mp4
```

| 项目 | 结果 |
| --- | --- |
| 场景 | 真实 `res://scenes/Main.tscn` |
| 画面 | `1280×720`、30 FPS、H.264 `yuv420p` |
| 音频 | AAC，完整解码通过 |
| 时长／帧数 | `50.166667` 秒／`1505` 帧 |
| 播放速度 | `1.00x` |
| SHA-256 | `c949fa3880714d4fd453fde86fded3a7dc2caf1647758db0e8476c8a8f21c58a` |
| 连续章节 | `22` |
| 隔离 | 未启动后端、未访问 MySQL、独立 `user://` 为零文件 |
| owner 状态 | `pending`，等待项目所有者观看本片 |

连续章节覆盖：世界、背包概览、`15+5` 容量、付费扩容确认、堆叠详情、拆分、
目标物品、宠物选择、真实回血、五类筛选、同模板精确实例比较与装备、红绿增减
比较、已装备详情、卸下、宠物蛋大头照、骑宠证大头照和返回世界。

联系表：

```text
.run/evidence/phase377_backpack_awakened_owner_review/phase377-backpack-final-v5/contact-sheet.png
```

最终参考／实机同屏对照：

```text
.run/evidence/phase377_backpack_awakened_owner_review/design-qa-final-v5/overview-reference-vs-runtime.png
.run/evidence/phase377_backpack_awakened_owner_review/design-qa-final-v5/compare-reference-vs-runtime.png
```

工程视觉自审没有剩余 P0／P1／P2 阻断；这是“觉醒风格的 Beastbound 原创适配
通过”，不是像素级复制，也不代替项目所有者的审美验收。

## 验证

### Godot 与业务回归

- Godot 4.7 headless parse：通过；
- Presenter check：`equipmentSlotCount=9`、`inventoryRowCount=5`、
  `errors=[]`；
- Icon catalog check：`81/81`、`fakeSourceCount=0`；
- exact-instance client check：通过；
- Panel check：`9` 装备位、`20` 可见卡、`15+5` 容量、五筛选、拆分、拖放、
  精确实例、宠物目标和三种关闭路径全部通过；
- 三种 pending-use 关闭路径均只取消一次，并连续两帧保持关闭；
- Owner-review fixture：`exact_instances=2`、`slots=15+5`、
  `split=true`、`pet_target=true`、`pet_heal=true`；
- 旧背包／世界使用／筛选自动回归：`4/4`；
- 录像工具单测：`4/4`。

### 服务端

- exact-instance：`3/3`；
- profile actions：`41/41`；
- HTTP server：沙箱内因不能监听 `127.0.0.1` 得到 `EPERM`，在允许本地临时
  端口的隔离环境重跑后 `30/30` 通过。

### 性能

- idle：60 FPS，`process_total=0.04ms`；
- 真实跨帧移动：60 FPS，`process_total=0.04..0.05ms`，
  `status=ok / path_len=11`；
- 112 次真实鼠标移动压力：`status=ok`，`112/112` 屏幕坐标匹配，
  合并为 `33` 次实际寻路，最终目标一致，`process_total=0.06..0.07ms`；
- 22 章背包面板探针：全程 60 FPS，`process_total=0.03..0.05ms`，
  世界重绘采样 `0.03..0.08ms`。

这些数据低于项目 idle `5/15ms`、moving `10/30ms` 的
median/p95 正式门槛。现有 `perf-probe` 不单列 Godot Control/GPU 绘制与单帧
面板重建峰值，因此本阶段只声明通过现有 CPU 热路径和真实交互门槛，不把它冒充
完整 GPU 分析或 200 人同图容量证明。

性能收口时发现两个早于最终复跑的 Phase377 headless QA 进程；核对命令行后只
终止 PID `19447` 与 `30511`，保留用户可见 Godot App。清理后鼠标压力和 22 章
面板探针均正常完成，最终没有遗留新的 headless 或 Node 服务进程。

最终 MovieWriter 退出阶段报告 `4` 个 ObjectDB 实例和 `2` 个资源仍待释放；
这不影响已完成的 1505 帧音视频写入、完整解码或上述交互结果，但属于非阻断
teardown 警告，不能据此宣称 Godot 退出阶段零告警。

本阶段没有运行完整 `tools/run_local_ci.mjs`；定向客户端、服务端、媒体、视觉和
性能门禁覆盖了本次背包 UI 与精确装备实例范围。

## 非目标与后续边界

- 不增加不存在的物品品质／稀有度字段；
- 不改装备数值、掉落率、扩容价格或消耗品效果；
- 不把装备卡拖动排序作为本阶段主交互，避免丢失精确实例语义；
- 全屏界面不依赖“拖到面板外丢弃”，详情和右键仍提供真实丢弃；
- 不把工程自审记成项目所有者验收；本片得到明确反馈前保持
  `owner_review_pending`。
