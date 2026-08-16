# Phase 458：见习猎人骑地灵转生兽战斗整图来源收口

## 结论

见习猎人骑地灵转生兽的正式战斗候选已从历史来源不完整、朝向与行进观感反复的半成品，收口为可重复审计的完整来源包：两个独立创作的正式源视角、十二个动作、180 张 256px 运行帧。人物、鞍具、缰绳与坐骑始终是一张整体插画。安装器复验为 `changed=false`，当前 bundle digest 为 `bec92dff03c6c279d5e9ef33df85542918a7cf53fa32390d4ae6eca22449e1a7`。

本阶段只登记工程与美术自审通过，不替代项目所有者验收。`ownerReviewStatus=pending`、`runtimeEnabled=false` 保持不变，普通玩家不会因本阶段自动获得该候选。

## 本阶段范围

- 重新生成并冻结 `front_3quarter_sw` 与 `back_3quarter_ne` 两个战斗源视角。
- 每个视角覆盖 `idle / walk / attack / skill / hurt / defend / dodge / counter / stagger / knockaway / down / revive` 十二个动作。
- 跟踪 180 张运行帧、24 份 exact prompt、逐动作流水线与 QC、来源哈希账本、生成 attestation、安装清单、联系表与 GIF。
- 用真实 `Main.tscn` 连续回放骑乘行进、攻击、技能、防御承压、受击、反击、致死反击、三骑合击、回避、回避后反击、直线击飞、弹边击飞、倒地与复起。
- 修复安装器替换战斗包后仍可能保留旧 `qa/battle` 或旧工作档路径的元数据缺陷，并增加回归用例。

不在本阶段内：

- 不修改既有真八向世界帧、同名独立宠物包、战斗规则、数值、服务器或玩家档案。
- 不登记项目所有者视觉批准，不开放正常玩家入口，不修改协议版本。

## 来源与可重放性

- 内置图像生成会话：`019fe7c8-2fd7-7972-94a7-98382ddfe591`。
- 24 个动作／视角组合分别绑定 generation ID、最终无损母表 SHA-256 与 exact prompt。
- 正式工作档：`.run/art_repair_phase458_rebirth_mounted/formal-production-v1/`。
- 标准构建清单 SHA-256：`999f31e5f5c54b4ffc7f615a8a020a45b4eb777aaec1ce7c11a79a9f687ec089`。
- prompt 生成清单 SHA-256：`fb2fe65162156df4a22194ec5276425503cfb170335456bb7f7b407d00593427`。
- staging 清单 SHA-256：`95ca902a757bf51d68949e44322c0180014b3c6ed1243a2f9e0d1e7814c9353e`。
- 安装来源账本 SHA-256：`388816c45ebcd839d97ee17ec92198d81b7b38d89aed9929818bb30fe1b4236d`。
- 安装清单 SHA-256：`2411b22a97c8e036bb315eb7ffaf7c225e6162338fe12faf353d60400a0f3cfa`。
- 生成 attestation SHA-256：`d7192e4a3b0f16be28adf3fd860e8940e9d7b48deeeff4d11c3982ac7922dbc9`。
- 两个源视角分别生成，未用运行时或离线镜像伪造另一侧，也未把人物与宠物分层拼装。

仓库采用 lean 归档：完整 24 张原始母表和 512px 来源帧保存在忽略工作档；仓库跟踪 24 份 prompt、逐动作流水线/QC、两个代表性无损母表、180 个来源帧 RGBA 哈希、180 个运行帧 RGBA 哈希及全部 256px 运行帧。attestation 保守保留 `semanticIndependenceVerified=false`，因为生成链与工程自审不能冒充版权证明或项目所有者批准。

## 行进与朝向复核

战斗映射继续遵守战场中心合同：

- 敌方左上：`front_3quarter_sw + flipH=true`，最终朝右下。
- 我方右下：`back_3quarter_ne + flipH=true`，最终朝左上。

正面行进母表经历多轮候选淘汰；单腿感、帧 5→6 上下突跳、接触脚漂移或 feet-anchor 缩放失真的候选均未进入正式包。最终八帧结果：

- 全主体相邻帧最大质心位移为 `4.886985px × 3.776559px`，最小 IoU 为 `0.765512`。
- 上半身相邻帧最大质心位移为 `6.574743px × 1.708007px`，最小 IoU 为 `0.907261`。
- 原问题最明显的帧 5→6 上半身垂直质心差为 `-0.045px`，最佳垂直对齐量为 `0px`。
- 八帧中前后肢交替支撑，躯干与骑手同步做小幅起伏；真实 Main 抽样未见单腿钉住、突然跳格、滑步或骑手脱离。

真实 Main 审片同时确认：

- 敌我人物、兽头和躯干朝向一致，均面向战场中心，没有双方同向或背离目标。
- `attack / skill / counter` 的预备、发力、命中和回位可区分，`hurt / stagger / defend / dodge` 不互相冒充。
- 直线与弹边击飞保持人骑宠整帧一体，飞行姿态与普通踉跄可区分。
- 两个视角的 `down-8 == revive-1` 在来源与运行 RGBA 层均精确成立；复起时骑手没有消失、换向或从兽身漂离。

审片联系表：

- `.run/evidence/phase458_rebirth_mounted_full_source/phase458-rebirth-v1-main-20260816-a/visual-review/contact-sheet.png`
- 同目录的 `walk-cycle-ally-back-contact.png`、`walk-cycle-enemy-front-contact.png`、`knockaway-*-sequence.png`、`down-sequence.png` 与 `revive-sequence.png`。

## 真实 Main 证据

最终有声视频：

`.run/evidence/phase458_rebirth_mounted_full_source/phase458-rebirth-v1-main-20260816-a/Beastbound_Phase458_Rebirth_Mounted_Actions_v1_Main_1x.mp4`

- `1280×720`、`60 FPS`、`39.533333s`、全程 `1.00×`。
- H.264 `yuv420p` limited range；AAC 双声道；文件大小 `17,035,047` bytes。
- MovieWriter 记录 2372 帧；内容结束标记为 2369 帧、十四个动作段全部结束。
- Godot 日志无 `SCRIPT ERROR / ERROR / WARNING`。
- MP4 SHA-256：`4d4dc0d16c911517274a81851084be8052d188134f64683653dfddc32a2a138a`。
- `ffmpeg -v error -i <video> -f null -` 全片解码通过，零输出、退出码 0。
- MovieWriter 平均 CPU 渲染 `0.09ms/frame`，编码 `4.08ms/frame`；本阶段没有修改运行时代码，因此不把该数据冒充完整性能回归。

录像使用固定 QA 用户数据通道与隔离 worktree，不连接后端或 MySQL。最终 MP4 同哈希复制到主项目后，隔离 worktree 与 348MB 原始 AVI 中间件已删除；最终 MP4、日志、审片帧和审计报告均保留在主项目 `.run/evidence`。

## 安装器元数据修复

原安装器会原样继承旧 `sourceArchive` 和 `evidence` 字段，即使原 `qa/battle` 已被原子替换，元数据仍可能指向已不存在的旧预览或 `.run` 工作档。本阶段改为：

- 保留身份与世界证据。
- 移除被替换战斗包下的旧 `qa/battle/*` 链接及对应哈希。
- 写入当前 `source/battle/source-ledger.json`、`source/battle/install-manifest.json`、联系表与 QC 的实际哈希。
- 重复安装仍保持 `changed=false`。

## 验证

- `godot --headless --path client/godot --quit`：隔离 worktree 与主仓各通过一次，日志无错误或警告。
- `python3 tools/install_pet_battle_bundle.py ... --archive-mode lean --dry-run --json`：`status=ok`、`changed=false`、2 views、12 actions、180 frames、307 installed files。
- `python3 -m unittest tools.test.test_stage_pet_battle_bundle tools.test.test_install_pet_battle_bundle`：28/28 通过，`106.145s`。
- 隔离全量 `pet_art_batch_audit.py`：36 forms、3 runtime-enabled、`errors=0`、`warnings=0`。本次 mounted 项 220/220 PNG、来源状态 `verified`，其 `errors / pending / warnings` 均为空；全局 `status=pending` 来自三十个既有未开放形态，不是本阶段回归。
- 最终 MP4 `ffprobe`、全片解码、SHA-256 与逐段截图复核：通过。
- `git diff --check`：提交前执行。

尝试重跑 `--auto-mounted-action-asset-check` 时，启动前即被仍受旧所有者锁保护的 QA automation 通道拒绝；它没有进入资产断言，也不是资产检查失败。为保护已变化的用户数据，本阶段没有绕过锁或强制清理。安装器、来源重放、全量审计与真实 Main 十四段回放构成本阶段交付证据；专用 auto check 的新鲜回执保留为通道可安全恢复后的残余复验项。

## 发布边界

当前只允许登记：`engineering_self_review_passed_owner_pending`。

项目所有者观看上述 1× 视频并明确批准前，不得把 `ownerReviewStatus` 改为 approved，不得把 `runtimeEnabled` 改为 true，也不得把本阶段表述为正式上线。
