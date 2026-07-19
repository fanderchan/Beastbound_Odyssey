# 2转小MM身份资产来源与归属

- 资产 ID：`pet_identity_pet_rebirth_mm_stage2_v1`
- 资产范围：2×2 原始/透明身份板，以及 `front_3quarter_sw`、`back_3quarter_ne`、`south`、`west` 四个 512×512 透明关键姿势。
- 制作日期：2026-07-19。
- 来源类型：项目内原创、AI 辅助生成；创意图仅使用 OpenAI 内置图像生成能力，后处理只做无损归档、色键转透明、多连通部件保留、统一缩放、脚底锚定与安全边检查。
- 输入参考：同项目原创 1转小MM 只用于血统身份与渲染语言；提示明确要求结构进化而非金色换皮。未使用、描摹或切取 StoneAge 8.0、私服、第三方游戏、图库或网络宠物素材。
- 原始 PNG SHA-256：`86d1e9c20fcd9dd14b2c7aa58d0b745e10571a1f29e685b6f3e44ba8960b4937`；解码 RGB 像素 SHA-256：`aaf610cc493a40f746b7c57588652a95a794731445ec8e90b84d3c270291fe07`。
- 像素无损 WebP：`../source/identity-board-raw.webp`，文件 SHA-256 `a63d763523c4ec43ec1c48a48b9d12919abf4aed717325969a3752bfbe553441`，解码像素哈希与原始 PNG 一致。
- 透明身份板：`identity-board-transparent.png`，SHA-256 `d3826592ed46573cd4c7e1b67c4ec1f61e5092aefe4c3a051aee1194114434d7`。
- 生成证据：`../prompts/identity-board-v1.txt`；原图、参考与逐输出哈希位于 `../source/identity-board-source-meta.json`，处理参数位于 `../source/identity-board-pipeline-meta.json`。
- 处理工具：`imagegen/remove_chroma_key.py`、`tools/build_pet_art_bundle.py`；为保留两组三段环明确使用 `--component-mode all`，共享缩放、feet 基线、4px 安全边，洋红残边为 0。
- 项目归属：这是在项目所有者发起的 Beastbound Odyssey 开发任务中为本仓库专门制作的原创输出，按项目资产管理；实际使用仍遵守生成服务适用条款。
- 可替换路径：从身份锁、阶段一参考和完整 prompt 重建，保持木面具三尖冠、三指手和两组三段环，再按同一确定性管线处理并重新通过后续门禁。
- 发布状态：`self_review_passed_owner_pending`。没有登记为运行时素材，也不代表世界、战斗或骑乘美术完成。
