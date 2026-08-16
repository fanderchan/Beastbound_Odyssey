# 来源与权属

- 资产：见习猎人骑赤角兽前/背三分之四整图关键姿势。
- 生成日期：2026-07-19。
- 生成方式：OpenAI 内置图像生成；两张输入仅作为 Beastbound 自有的赤角兽与见习猎人身份参考。
- 赤角兽参考：`../../../pets/emberhorn_red_fire8_earth2/identity/identity-board-transparent.png`，SHA-256 `fccc3d100508f8c5b06e9b399a55943d67fa6362a789623c6829935cb52ceaf4`。
- 见习猎人参考：`../../../characters/novice_hunter/identity/processed/sheet-transparent.png`，SHA-256 `7223ed3f753929e35d1960766da589e49b22bc3188866ab5b3ca87493fdff0f2`。
- 每个骑乘姿势均为一次生成的完整人宠主体，没有离线或运行时人物/宠物分层拼接。
- 原始 PNG SHA-256：`57e891e2ce3b9809f920ebeb8cbcd513ae78def4d575bf6978d0c6d82dbe9512`；解码 RGB 像素 SHA-256 `112728727a9ff47d155764eee4b2b9c6b295e761169bb6b756592404e3b43a1d`。
- 原始 PNG 已转存像素无损 WebP：`source/mounted-keypose-raw.webp`；WebP 文件 SHA-256 `7f019144826ed08917679ec1fcc154de1fa15aee3523db6b6dca15f73667461f`，解码像素哈希与原图一致。
- 去色键采用 `remove_chroma_key.py --auto-key border --soft-matte --transparent-threshold 12 --opaque-threshold 220 --despill`，随后由 `tools/build_pet_art_bundle.py` 共同比例、feet 基线和 512px 透明关键姿势。
- 透明关键姿势板 SHA-256：`cdc4d8b6dfb9f30b73975f514d9a11d7cb4cf6f5542efec5b6f55fbf8d662b3d`。
- 生成合同、原图 SHA、无损归档、处理参数和联系表证据均在本目录或 `.run/art_batch_phase320/emberhorn/` 留痕。
- 双视角正式战斗候选完整覆盖 `idle / walk / attack / skill / hurt / defend / dodge / counter / stagger / knockaway / down / revive`，共 180 张 256px 运行帧；人物与赤角兽始终是单一整图主体，不做运行时镜像或人物／宠物分层拼合。
- 2026-08-16 的 Phase449 比例返工重制了正面 `attack / skill / hurt / defend` 与背面 `attack / skill / counter / hurt / defend`，共 9 组、64 帧。每组都保留 exact prompt、ImageGen generation ID、原始生成表无损 WebP、实际 pipeline input 无损 WebP、完整切帧参数、逐帧 SHA-256 和 QA 记录。
- Phase449 来源证明位于 `source/battle/repairs/phase449-mounted-action-scale-source-repair-v1/`；9/9 组从仓库内 pipeline input 重放后，512px 源帧和 256px 运行帧同时与验收构建逐文件、逐 RGBA 一致。当前 180 帧统一 digest 为 `86a400fa0629c7d75a9a1e258c1fa1ceea724fe29d855232ae1413a2dd162136`。
- `tools/pet_art_batch_audit.py` 对本 mounted 包给出 `errors=[] / pending=[] / sourceReadiness=verified`，并核对 24/24 exact prompt、180/180 来源帧哈希、300 个已安装文件和 506 个完整验证条目。报告中的同名 standalone pet 洋红提示不属于本 mounted 目录。
- StoneAge 8.0 只作为成熟骑乘构图质量参考，不复制其人物、宠物、鞍具、贴图或动画。
- 当前完整骑乘战斗动作与来源工程门禁均已通过，但项目所有者视觉验收仍为 `pending`、`runtimeEnabled=false`；不得宣称正式批准、生成 owner decision 或开放普通玩家运行路径。
