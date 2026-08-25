# Phase 539：R1.09 岩脉洞穴 v1 受委托实机复审退回

## 结论

岩脉洞穴四层的玩法数据仍然完整，但当前精确视觉候选不能通过 R1.09。

项目所有者已明确委托 Codex 自行验证，并未亲自签署视觉接受。本轮以当前候选分支重新启动真实
`Main.tscn`，不复用 2026-08-16 的旧片冒充当前证据。新版硬门在一层第一张 idle 原生帧就准确拒绝：
玩家没有收敛到动态安全锚点，右侧任务 HUD 覆盖四个 blocking 地图物件；F4 独立地标录片虽然完成
真实跨帧点击移动并拍到两座共鸣台，却因音频播放未关闭而无法通过运行资源收口。因此当前决定是
**受委托退回并返工**，不是批准、延期冻结或发布。

候选继续保持 `owner_review_pending / pending / releaseApproved=false / runtimeEnabled=false`。本轮没有
生成 owner decision、可信 digest、release attestation，也没有调用地图提升工具。

## 当前精确候选

- Git：`5c8ec51ef7b4083f9e3eef93c70933188009df8d`；
- runtime identity：
  `git:5c8ec51ef7b4083f9e3eef93c70933188009df8d+beastbound-map-runtime-surface-v2:14e6df4881f7ccf6eb354f77ca4b4021594c6c595fbe107390c07fccdf572904`；
- `map-visual-bundle.json` SHA-256：
  `9c5e769c03fc33b6d09391146085341e71aff824e782f0df0c4108b26af5ea1e`，与 Phase 448 候选一致；
- 严格只读 bundle 审计：`158 files / 29 JSON / 47 PNG / errors=[]`，`status=PASS`；
- 发布就绪审计仍按预期为 `false`，精确缺少
  `lifecycle_released_and_enabled / owner_acceptance / release_attestation`。

这说明结构与来源账本没有漂移，但不代表当前 Main 构图和录片证据合格。

## 当前 Main 复现

### 一层完整录片在第一帧失败

命令使用固定 automation QA lane、1280×720、30 FPS、1×，先录每层 idle，再发送真实跨帧鼠标移动。
一层 idle 原生帧已经返回 `result=FAIL`，因此工具按 fail-closed 规则停止，没有拼出四层 MP4。

- 原生帧：
  `.run/evidence/phase539_earth_vein_delegated_review/phase539-earth-vein-current-review/segments/earth_vein_cave-idle-native.png`
  （SHA-256 `7429949ecdb2000fa7af548571418bdec1e71e59d93f98130117cf8613916225`）；
- 原生回执 SHA-256：
  `dd98996f9f6094f11180b31183ee1f69da07fb5df590bca37f05035ec8370c65`；
- 最终失败摘要 SHA-256：
  `0277d9fb911ee9a7074b82d13a0db68f134c4ebae3235c0dfe544cc81632c2a7`。

回执锁定的具体缺陷：

- 配置／生效安全锚点均为 `(640, 360)`，玩家实际屏幕点却为 `(408, 360)`；
- `f1_pillar_blocker_01/02` 与 `f1_rock_blocker_01/02` 被右侧任务 HUD 覆盖；
- 玩家正式动作 alpha 高度只有 `82.080px`，低于当前 PC 世界主体目标 `120..150px`；
- 当前帧 NPC 数为 `0`，`worldSubjectScale.passed=false`，R1.09 要求的 NPC／主体比例不能据此成立；
- 最近出口 `earth_vein_cave_exit` 仍在安全区且边缘完整，说明失败根因是相机／HUD／比例构图，
  不是入口数据丢失。

### F4 地标片资源未收口

独立 F4 控制器从 `(20,16)` 向 `(22,11)` 发送真实跨帧左键，玩家确实移动并让
`f4_guardian_plinth / f4_lineage_plinth` 同屏。原生帧 SHA-256 为
`67db3c43d0836086d6bfa92777277bf3a3e88c7102223ab18fe4c47a08fd99db`；回执 SHA-256 为
`21944f01c62235a1dc66f30f7667c72b09bd5a4508c212f67303c6fdba91e083`。

但回执同时明确 `runtimeCleanup.status=failed / reason=audio_playback_not_disabled`，所以不能把“画面已生成”
冒充正式录片通过。两次失败运行均清理 automation lane，真实玩家目录 SHA-256 保持
`d6b1961ed53be04c8b8f1c398e5f5daec4d361a3c69033aee66dbb306e1310f0`。

## 玩法与共享基线分层验证

服务端权威遭遇、正式升级路线和人工遭遇准入 `21/21 PASS`。客户端唯一目标集合中有 `13/15`
通过：展示档案、世界表现、人物／宠物转生任务、任务页、任务路线、寻路、直线、移动、切图、遭遇和
面板注册均通过。两项失败分别是：

1. `--auto-map-visual-runtime-check`：Earth Vein 四个 binding/hash 仍可准备为 review-only，但共享普通目录
   仍把已被当前 Firebud 权威 map data 淘汰的 v1 制品当作 `released`，产生碰撞/hash 和普通运行生命周期
   不一致；
2. `--auto-eight-direction-check`：右侧 canary 路线从 `(14,12)` 绕经
   `(15,11)→(14,10)→(15,9)→(16,10)`，不再满足原测试要求的平直路径，左侧仍平直。

对应摘要 SHA-256：

- 地图运行门失败：`c15ef902b613947905bb1c687d501e038b4dbae8f865046f924e264fc8256c54`；
- 八方向门失败：`2b06ff36efd85bd3c63f20a53d01d9fb2793983f6302cf488b07f1d858bc5e60`；
- 剩余移动／切图／遭遇／面板 `5/5` 通过：
  `165ce9cc387943644dd8b7d0080848bd95ab2853dc24825fd4a3b357a1f0b668`。

旧 Phase 448 的 `15/15` 是当时提交和当时门槛的历史事实，不能覆盖本轮当前分支的两项红灯。

## 受委托美术判断

F4 两座琥珀共鸣台仍是清楚的终点地标，低饱和板岩／琥珀方向也可以保留；结构审计和玩法闭环没有
理由推倒重做。需要返工的是当前 Main 的呈现与证据合同：

- 四层端点和路线镜头必须在真实 HUD 下求解可达安全锚点，关键阻挡、楼梯、共鸣台与玩家完整 alpha
  不得被任务栏、底栏或视口裁边覆盖；
- 人物与地图物件需要达到当前 Firebud 已采用的世界主体比例，不再保留 `82px` 的远景小人；
- 一至三层不能只依赖同一 kit 平铺，需要用现有原创素材建立逐层可识别的密度／地标节奏；
- “洞穴无常驻 NPC”若是产品规则，必须在下一轮把交互／守护目标作为明确 non-applicable 替代并写入
  证据；若需要 NPC，只能复用或按 NPC 正式管线生产，不能临时塞一个占位人形；
- 录片控制器必须跟随当前 AudioManager 生命周期关闭播放、清播放器，并再次证明无孤儿资源。

## 后续任务

返工拆为 R1.W021–R1.W025：先修共享地图运行目录与八方向基线，再修四层 HUD 安全相机、主体比例与
逐层层级，收口录片并重冻完整路线证据，最后由受委托美术总监复审。R1.10 改为依赖 R1.W025；在此
之前 Earth Vein 继续只允许显式 QA review，普通玩家路径不可访问。
