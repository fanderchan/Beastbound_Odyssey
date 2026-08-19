# Phase 481：Firebud v2 生活化布局正式审片候选

日期：2026-08-19

## 结论

Phase 478 的生活化方向已经从设计预览推进到真实 `Main.tscn`、正常 HUD、真实跨帧点地、碰撞、遮挡、warp、性能和整包证据。当前画面达到“可以交给项目所有者冻结”的候选标准：村口不再像 NPC 测试队列，训练场也不再是平均撒花的空草地；但这仍不是项目所有者批准，更不代表 P2.2 全量正式美术完成。

Firebud v2 继续保持：

- `status=owner_review_pending`；
- `ownerReviewStatus=pending`；
- `releaseApproved=false`；
- `runtimeEnabled=false`；
- `releaseAttestation=null`。

没有复用 Phase 470 的旧 owner acceptance，没有打开普通玩家入口，也没有提交或推送。

## 本轮审美收口

- 训练场第二目标从容易贴住左侧取景边缘的 `[10,18]` 移到 `[13,16]`，对应 blocked footprint、草丛、局部训练平台和权威地图数据一起移动；最新真实 Main 片中目标完整入画，侧训练区、中央通道和右上主训练区形成清楚的三级空间关系。
- 地表新增道路与广场边缘过渡 tile 选择合同。中央石路、生活平台和草地之间不再只有硬直角切块；广场 base／四边 transition 仍由 binding 显式声明，不能由 renderer 猜测。
- 村口保留摊位／记录图腾、治疗／补给、亭子／古树三个服务簇和中央通行带。地图面板缩略图、正常 HUD、任务标记和世界画面保持同一结构。
- 美术判断是“候选可冻结”，不是“商业全量完成”。现阶段主要剩余视觉债是更多正式 NPC 外观、人物与宠物差异化，以及全游戏其他地图的同标准扩产，不再是 Firebud 当前构图本身。

## 真实 Main 冻结画面

最新审片证据位于：

- MP4：`.run/evidence/phase486_firebud_training_balanced_target_review/phase486-firebud-training-balanced-target-20260819-a/firebud-v2-owner-review-1x.mp4`；
- `1280×720 / 30 FPS / 1.00× / 620 frames / 20.666667s`；
- MP4 SHA-256：`aab9562718b1012483880ab4528f51d5dbcac91ef6a16c4b94209e2029ff3949`；
- 联系表：`.run/evidence/phase486_firebud_training_balanced_target_review/phase486-firebud-training-balanced-target-20260819-a/contact-sheet.png`；
- 联系表 SHA-256：`8abf088e85fdd1a5a4fd16a62b633c71a9862fb7d4863b81ed6d6927fbe12613`。

完整视频可解码，音视频时长一致；此前目标贴边的 Phase 485 画面已明确否决，不参与本次冻结请求。

## 正式动作与 Computer Use

两张地图各自覆盖 `pointer / movement_path / warp / collision / occlusion`：

- 正式 `1280×720` Main 动作 pair：`10/10 PASS`，10 张动作 PNG 像素互不相同；动作矩阵摘要 SHA-256 `2bfeac2f973993b76f492354b3338d7849ecc250b50751598ad5a9dbf3693b34`。
- `@oai/sky` 在专用本地审查壳 `com.beastbound.review.firebud` 中执行真实点击；20 张未经编辑的 `640×392` JPEG 前后图和 10 份回执已事务性安装。
- Computer Use 聚合报告 `PASS / actions=10 / blockers=[]`，SHA-256 `f26afdb5c96ddbf2dd3b2e57cfeab941fce0821bffadd7c29046917fb47340f4`。
- 旧训练场碰撞坐标只点到空地，未冒充通过；正式坐标改为木栅栏右侧 `[450,220]`，画面证明角色从栅栏下端绕行。
- 旧训练场遮挡坐标不能盖住角色，正式坐标改为陶罐左后邻格 `[401,181]`，陶罐盖住角色下半身而上半身仍可读。
- 旧村口古树遮挡坐标把角色完全吞没，正式坐标改为树冠左缘 `[390,180]`，保留局部轮廓且不遮挡任务 HUD。

## 权威合同、碰撞与性能

- catalog contract：`PASS / errors=[]`；报告文件 SHA-256 `c76e6159ca60f89ff8bf3bde61aaa04bafd77909534568fc443d0713a17dcbc8`。
- 训练场 binding／map data：`bcbc1f9d… / 37279c76…`；村口 binding／map data：`7370af64… / 19bbdcbb…`。
- 碰撞 runner 回执 SHA-256 `41e889b2f058a16d0fe8d3fee036f398f56e77a4945128c066f7af00945ac5a1`；碰撞报告 `PASS`，SHA-256 `419e3ac33e913811b2bffe555244a6c1dcb830bfb958c35fc8e174f0cf2dcf0a`。
- 性能报告 `PASS`，SHA-256 `44e900afa9fe9592383dc77c93ae3b74ffa995d1042e3f89b05241e17f50cf19`；8 个 baseline／candidate × idle／moving 单元全部 60 FPS，移动通过真实跨帧 `Input.parse_input_event`。原始回执先验证真实 QA lane，再把本机 user-data 绝对路径统一脱敏为 `<QA_USER_DATA_ROOT>`，不保存用户名或用户目录。
- 训练场 baseline/candidate `process_total` 平均值：idle `0.351/0.348ms`，moving `0.245/0.540ms`。
- 村口 baseline/candidate 平均值：idle `0.324/0.364ms`，moving `0.325/0.540ms`。村口 candidate moving 本轮最大样本为 `0.600ms`，仍不宣称有充裕余量；发布后扩物件前必须继续盯住。

地图 bundle 只读审计最终为 `PASS / filesChecked=116 / jsonsChecked=17 / pngsChecked=50 / errors=[]`，唯一未闭合项精确为：

1. `owner_acceptance`；
2. `release_attestation`；
3. `lifecycle_released_and_enabled`。

## 回归结果与失败关闭

- Python Firebud 构建／证据／安装器／性能 runner：`39/39 PASS`；
- 地图 Skill auditor：`17/17 PASS`；
- Godot 4.7 headless parse：PASS；
- `--auto-firebud-village-service-layout-check`：PASS；
- `--auto-map-visual-review-showcase-profile-check`：PASS；
- `--auto-pathfinding-check`、`--auto-movement-check`：PASS。

严格普通运行时检查和地图面板检查当前仍按设计 fail closed：普通运行仍绑定已发布 v1，而权威 Firebud map data 已随待审 v2 更新，所以 v1 的 frozen hash 过期、`prepared_visual=false`。这不是把候选错误藏起来；相反，它证明未批准 v2 没有偷跑给普通玩家。项目所有者批准并执行 promotion 后，必须重新跑严格 runtime、map panel、碰撞和最终发布审计，届时才允许要求这两项转绿。

## 本地数据与隐私边界

本阶段没有向外部服务上传源码、配置、凭据、用户截图或个人目录内容。Computer Use、录像、截图、哈希和审计全部在本机完成。

一次最初的 Godot 启动漏带完整 QA 环境标记，安全门在 Main 初始化时立即退出；另一次直接 parse 初始化了真实 `user://`。按文件路径与时间核对，真实目录只出现 Godot 日志轮转和本地 `beastbound_audio_settings.json` 初始化写入，没有账号、角色、背包、宠物、任务或数据库文件变化。没有猜测性回滚用户设置。对应 QA lane 与 owner lock 已在确认无相关进程后移到本机可恢复临时隔离目录（不纳入提交），活动 lane 和锁均为 absent。

待发布候选相对远端基线当前为 `106` 个精确路径（`64` 个文本／`42` 张图片），不包含 `.run`、Godot `.import`、`__pycache__`、本机 QA 隔离目录、私有 NPC 生产归档或其他工作区改动。新增文本行扫描未发现真实 `/Users`／`/home` 用户目录、用户名、邮箱、私钥或常见 token；Firebud bundle 的 `80` 张图片经嵌入文本／EXIF 扫描无敏感命中，候选中的 `20` 张 Computer Use 原始前后截图另经联系表目检，未见系统通知、账号或个人信息。这里的结论是“当前扫描未发现”，不把它表述成无法证明的绝对零风险。

## 批准后的唯一发布顺序

项目所有者明确批准本页 Phase 486 冻结画面后，才允许：

1. 生成只接受本次精确文件哈希的 owner acceptance；
2. 生成 release attestation 并把 v2 promotion 到 `released/enabled`；
3. 重跑严格普通 runtime、map panel、碰撞、性能边界与 bundle 审计；
4. 把精确 Firebud 路径复制到基于远端 `main` 的干净发布克隆；
5. 做凭据、个人路径、生成状态和 staged diff 审计；
6. 只提交这一批并推送，复核本地、upstream 与远端 SHA。

在项目所有者没有批准前，本页只证明“候选已具备人工验收条件”，不证明“已发布”。
