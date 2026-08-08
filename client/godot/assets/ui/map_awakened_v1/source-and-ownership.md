# 觉醒式地图界面资产：来源、授权与替换说明

## 包状态

- 包 ID：`map_awakened_v1`
- 用途：Beastbound Odyssey PC 端 `1280×720` 当前地图／世界地图界面
- 生成日期：2026-08-08
- 来源类型：OpenAI 内置 ImageGen 为本项目原创生成
- 使用范围：Beastbound Odyssey 项目运行时及在适用 OpenAI 条款下的派生制作
- 外部第三方像素：无
- 运行时状态：`runtimeEnabled=true`
- 所有者视觉状态：`ownerReviewStatus=owner_review_pending`
- 机器清单：`asset-manifest.json`
- 逐字提示词：`source/prompts/world-atlas-background-v1.txt`

`runtimeEnabled=true` 只表示 Godot 可以在正式运行路径中加载该资产，不表示项目所有者
已经接受最终画面。当前截图和视频只属于待审证据；在项目所有者明确验收前，视觉状态必须
保持 `owner_review_pending`，不得把自动检查结果冒充为所有者的主观结论。

## 原创与参考边界

世界图底板由 OpenAI 内置 ImageGen 根据包内逐字提示词直接生成，未复制、裁切、描摹、
重绘或嵌入《石器时代：觉醒》或其他第三方游戏的地图像素、岛屿轮廓、地名、角色、图标、
标志、商标或 UI。外部截图只用于理解“当前地图—区域地图—世界地图”的成熟信息层级与
彩色手绘地图的阅读密度；Beastbound 的九区地理、美术和运行时热区均为项目原创设计。

## 生产链与不可变事实

1. `source/prompts/world-atlas-background-v1.txt` 保存本次生成使用的逐字提示词；
2. ImageGen 直接产出无文字、无图钉、无 UI 框的 RGB PNG；
3. `runtime/world_atlas_background_v1.png` 是 Godot 运行时加载的无损成品；
4. 当前文件固定为 `1568×1003`、8-bit RGB、无 Alpha、`2777702` 字节；
5. 当前 SHA-256 为
   `ebae9a0e3fe14f104062080f39788278c53b87b38e1932be25b49724ca3e3470`；
6. `asset-manifest.json` 中的九个标准化热区必须与
   `client/godot/data/map_regions.json` 的九个非 GM 权威区域 ID 完全一致；GM 测试区域不得
   出现在玩家世界图中。

包根 `.gitignore` 只排除 Godot 可重建的 `*.import` 与 `*.uid` sidecar。它们不属于资产
来源或运行时成品，不得进入版本库。

## 替换流程

替换世界图时必须保持可复算链路：

1. 先保存新的合法原创提示词和生成来源说明；
2. 生成新的版本化 RGB 世界图，不覆盖后假装仍是旧文件；
3. 保持九个权威区域 ID，或先完成地图数据、热区和运行时路由的同步迁移；
4. 更新清单中的尺寸、字节数、SHA-256、授权和替换说明；
5. 执行 `tools/audit_map_awakened_assets.py`、单元测试、Godot parse、地图专项和真实
   `1280×720` 左键流程录像；
6. 项目所有者未明确接受冻结证据前，继续保持 `owner_review_pending`。

本资产可由更新后的原创 ImageGen 底板替换；外部参考游戏截图永远不是允许的替换源。
