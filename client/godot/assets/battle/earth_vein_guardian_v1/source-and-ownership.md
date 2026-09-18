# 岩脉守护战地表 v1

- 2026-09-18 使用本次 Codex 会话的内置 OpenAI `image_gen` 工具独立生成，作为本项目原创候选素材；未输入或复制第三方游戏图像。
- 完整提示词保存在 `source/prompt.txt`，原始无损输出保存在 `source/raw/earth_vein_sanctum.png`。`arena-bundle.json` 记录来源文件和运行图 SHA-256。
- 只通过 `sips -z 720 1280` 统一显示尺寸，没有拼接、绘制或修改画面内容。
- 这是固定战斗场景的背景，不是探索地图。它不定义格子、碰撞、怪物数量、站位、难度或奖励；所有战斗主体由真实客户端分别渲染。
- 仅在隔离的岩脉守护战试玩入口显示。普通发布路径仍关闭，状态为 `pending / runtimeEnabled=false / releaseApproved=false`；开发验证不会代替老板的美术验收。
- 替换时保留 `earth_vein_sanctum` ID 和 1280×720 画幅，更新本目录原稿、提示词、manifest 和目录哈希，并重新检查真实 10v10 中的主体对比度与遮挡。
