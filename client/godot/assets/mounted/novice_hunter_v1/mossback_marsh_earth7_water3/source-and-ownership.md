# 来源与权属

- 资产：见习猎人骑湿地苔背兽前/背三分之四整图关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；两张输入仅作为 Beastbound 自有的湿地苔背兽与见习猎人身份参考。
- 宠物参考：`../../../pets/mossback_marsh_earth7_water3/identity/identity-board-transparent.png`；SHA-256 为 `cb4bd3eda7ea43eb928b65605c6c74ec0467dfdb44c574953b50fab1ed915ed8`。
- 人物参考：`../../../characters/novice_hunter/identity/processed/sheet-transparent.png`；SHA-256 为 `7223ed3f753929e35d1960766da589e49b22bc3188866ab5b3ca87493fdff0f2`。
- 每个骑乘姿势均为一次生成的完整人宠主体，没有离线或运行时人物/宠物分层拼接。
- 首轮背视共同朝向错误已退回；归档只保存通过方向门槛的再生成版本。
- 原始 PNG SHA-256：`f54b6571a023e8757873931c4450e4a76f6a34c462d04d640978b985eb5a4029`。
- 原始 PNG 已转存像素无损 WebP：`source/mounted-keypose-raw.webp`；WebP 文件 SHA-256 为 `30a5d30854b16245a3c1e63124838195374318c3460b324f6f7a67b7108afdf8`。
- 去色键采用 `remove_chroma_key.py --auto-key border --soft-matte --despill`，随后由 `tools/build_pet_art_bundle.py` 统一比例、feet 基线和 512px 透明关键姿势。
- 透明关键姿势板 SHA-256：`36ea9b929b7881003574893d14e6eb0849be341c0d86e25980d918cbf8cb5ab5`。
- 生成合同、原图 SHA、无损归档、处理参数和联系表证据均在本目录或 `.run/art_batch_phase320/mossback/wetland/` 留痕。
- 石器时代 8.0 只作为成熟骑乘构图质量参考，不复制其人物、宠物、鞍具、贴图或动画。
- 关键姿势工程自评通过；后续已安装独立真八方向世界 `idle 1 + walk 4`，共 40 张人物骑宠整图运行帧。骑乘战斗动作仍未制作，因此不得宣称完整骑乘发布包。
- Phase 324 对世界包的旧“疑似洋红残边”报告做了来源审计：8 张原始步行图与构建记录的输入 SHA-256 全部一致，32 个同次 chroma-key 记录的源图/运行图残留计数均为 0；512px 源帧严格近键像素为 0，256px 缩放后只有 4 个颜色阈值候选，强洋红边占比最高 `0.004`，低于严格门槛 `0.02`。最终坐标没有保留同次键控资格遮罩，故按 fail-closed 规则不猜色、不改任何源帧或运行帧；详细证据见 `qa/world/world-qc.json`。
- `runtimeEnabled=false`，项目所有者视觉验收继续为 `pending`。
