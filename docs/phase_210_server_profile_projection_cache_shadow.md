# Phase 210 — Godot 档案级公开投影与双缓存安全清洗影子边界

## 目标

Phase 208 已证明单只服务器宠物可以在不读取成长目录、不调用随机算法的前提下擦除秘密并保留当前属性，但还不能直接用于真实登录：服务器档案包含多种宠物容器，旧 active cache 与 `.last_good.json` 也可能同时保存 seed、roll 和精确品质。

Phase 210 先建立两项尚未接入真实登录的影子能力：

1. 只投影明确登记的档案宠物路径，严格区分 marker 缺失、marker 损坏与 marker 合法但公开 envelope 损坏。
2. 分别清洗 active 与 `.last_good`，任何一份损坏都原样保留，同时继续尝试另一份；清洗结果永不进入运行态。

## 调查事实

当前服务器登录顺序仍是：

```text
set_active_save_path
→ load_profile
→ normalize_profile
→ 缺 seed/roll 时本地成长算法补抽
→ 再请求服务器 profile
```

因此旧缓存会在首个服务器响应前进入玩家状态。首次成功 pull 后，现有 `PlayerProgressModel.save_profile()` 还会先把旧 active 原文复制到 `.last_good`，再写 active；只清洗一份文件不能关闭泄漏边界。

`.last_good` 当前只写不读，但它仍是未来恢复与人工排障会接触的数据，不能继续保存私密成长状态。

## 档案级公开投影

新增 `server_pet_profile_projection_model.gd`，只处理以下路径：

- `petInstances[]`
- legacy `pets[]`
- `groundPetDrops[].pet`
- `trainingPartners[].pet`

它不会递归猜测其他对象是否“长得像宠物”，也不会改写战斗回执、EXP 摘要、未来功能中的 `.pet` 或非宠 `qualityScore/growthBonus`。输入先 `duplicate(true)`，数组顺序、wrapper 元数据和所有非宠字段保持不变。

严格入口 `project_server_profile()` 要求每只宠物都有可运行的服务器 marker；任何结构、marker、公开 envelope 或当前属性错误都会返回 `ok=false/refreshNeeded=true`，但仍提供已经擦除秘密、保留当前属性的安全快照，供正式同步层决定是否拒绝落地。

缓存入口 `sanitize_cached_server_profile()` 容忍旧缓存缺 marker 或 marker 损坏，仍擦除 seed/roll/quality/continuous；同时返回 `requiresFreshServerProfile=true`。如果宠物容器不是数组、元素结构错误，或无法证明投影前后 `level/hp/maxHp/attack/defense/quick` 的值与数值类型完全相同，则返回 `ok=false`，磁盘层不得覆盖原文件。

单宠投影现在直接返回：

- `markerStatus=valid|missing|invalid`
- 独立的 `markerErrors`
- `has_server_authority_marker()` 原始路由判断

合法 marker 但 `petGrowth.public.stats` 矛盾时只报告 envelope 错误，不误归类成 missing/invalid marker。以后正式接入时，即使 marker 本身损坏，只要原始 `source=server`，也不得退回本地 RNG。

## 双缓存文件安全

新增 `server_profile_cache_model.gd`：

- 只接受 `user://server_accounts/*/player_profile.json`，拒绝本地单机档案和路径穿越；
- 按现有规则推导 `player_profile.last_good.json`；
- active 与 last-good 各自读取、各自投影、各自写入，绝不把 active 复制给 backup；
- 缺文件视为正常；坏 JSON、非 Dictionary 根、结构不安全宠物或写入失败均保留原文件；
- 只返回状态、计数和 `requiresFreshServerProfile`，绝不返回解析后的档案，防止调用方误把旧缓存装入运行态；
- 二次执行结构幂等，已经清洗的文件状态为 `unchanged`。

每个文件的替换流程是：

```text
同目录唯一 temp
→ store + flush + close
→ 重新读取、JSON 解析、与目标 Dictionary 深比较
→ rename_absolute(temp, target)
```

不会先删除 target；rename 失败只删除本次 temp，原文件仍在。Godot 官方说明 `DirAccess.rename_absolute()` 在目标未受保护时会覆盖已有文件，`FileAccess.flush()` 会把缓冲写到磁盘：

- [Godot `DirAccess` 官方文档](https://docs.godotengine.org/en/stable/classes/class_diraccess.html)
- [Godot `FileAccess` 官方文档](https://docs.godotengine.org/en/stable/classes/class_fileaccess.html)

这只能保证 active 和 last-good **各自**通过同目录替换发布，不是双文件联合事务，也不宣称具备目录 `fsync` 或断电级双文件原子性。

## 影子自检

现有 `--auto-server-pet-growth-boundary-check` 现在组合：

- 单宠投影：12 个场景；
- 档案级投影：8 个场景；
- 双缓存清洗：8 个场景。

档案场景覆盖四条登记路径、输入不变、非宠同名字段、未登记 `.pet` 不变、幂等、缺 marker、坏 marker、合法 marker + 坏 envelope、旧宠缺 Lv1 和结构损坏。

缓存场景在唯一 `user://server_accounts/__cache_sanitizer_check_*` 目录中覆盖：

- active/last-good 各含不同秘密并分别清洗；
- 当前属性、货币、背包和非宠同名字段不变；
- 二次执行 unchanged；
- active 损坏时 backup 仍清洗，反向同样成立；
- 非 Dictionary 根和无法证明属性不变的宠物原样保留；
- 双文件缺失正常、路径推导正确、无 temp 残留。
- 本地 `user://player_profile.json` 被路径白名单拒绝。

测试结束会删除隔离文件，不读取或修改任何真实账号缓存。

## 为什么还不能接真实登录

本阶段没有修改 `_apply_authenticated_session()`、`PlayerProgressModel.normalize_profile()`、`ServerSyncCoordinator` 或任何 profile 落地点，因此正式行为仍未改变：

- 旧服务器缓存仍可能在首拉取前被加载并本地重滚；
- 24 个服务端 profile 响应和人物转生 `starterPet` 仍未启用公开投影；
- 服务端宠物升级仍只涨等级/经验，不涨四维；
- 成长面板仍可能显示隐藏品质或精确 Lv140；
- 协议仍是 v1。

正式切换必须在服务端逐级成长结算可用后，同一部署组完成响应投影、唯一 profile replacement、禁止首拉取前加载缓存、双文件清洗、非精确 UI 和严格协议 v2。

## 涉及文件

- `client/godot/scripts/progression/pet_growth_public_projection_model.gd`
- `client/godot/scripts/progression/server_pet_profile_projection_model.gd`
- `client/godot/scripts/progression/server_profile_cache_model.gd`
- `client/godot/scripts/qa/auto_check_coordinator.gd`
- `.agents/skills/design-beastbound-pets/references/repository-contracts.md`
- `stoneage_gap_plan.md`

## 验证

```text
godot --headless --path client/godot --quit

node tools/run_godot_auto_checks.mjs \
  --only=--auto-server-pet-growth-boundary-check,--auto-pet-growth-authority-check \
  --fail-fast --timeout-ms 180000
  godot parse + focused checks 3/3 passed
  pet_cases=12 profile_cases=8 cache_cases=8
  log has no ERROR

git diff --check
  passed
```

本阶段没有 UI、绘制、输入、移动或运行时 profile 变化，因此不需要截图、视频或性能探针；这不是玩家可见功能验收。
