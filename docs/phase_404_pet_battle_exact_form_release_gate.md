# Phase 404A：standalone 宠物战斗 exact-form export-aware 发布门

## 目标与边界

Phase404A 只封闭 `standalone_pet_battle` 的正式图片入口。目录中的
`in_production + runtimeEnabled` 不构成发布权；普通战斗只能命中请求 `formId` 自身的冻结
startup cache。未知 form、空 form、共享 `artSkeletonId` 的兄弟 form 以及任何不完整绑定均
返回请求角色自身的 procedural placeholder，绝不借用另一形态的图片。

本阶段不生成、批准、启用或替换资产，不接入 Phase402 战场，不改 export preset、服务端或
mounted 资产域。为继承已验收的 QA 数据隔离基础，本阶段把 project/Main/coordinator、通用
Godot runner 与固定 lane helper 纳入同一发布闭包。`integrated mounted whole-frame battle` 仍是独立 P1，
本文不声称所有玩家可见宠物战斗已经无旁路。

## 方案 A：三层、单向、无循环合同

### 1. pre-export 源树权威

`tools/audit_pet_battle_release_gate.py` 仍是源发布事实权威。它对 registry、catalog、metadata、
battleVisual、release authority、root、formId 与 digest 做 exact-form 对账，并对每个获准形态
的规范 2 视角 × 12 动作共 180 张源 PNG：

- 要求精确路径集合、256×256、非符号链接；
- 逐文件重算 SHA-256；
- 与 `source/battle/install-manifest.json.installedFileHashes` 对账；
- 重算 runtime tree SHA-256；
- 缺一张、换一张同尺寸图片或只改 metadata 字符串都会 fail closed。

同一轮审计用共享 JSON snapshot store：每个 resolved JSON path 只 `read_bytes()` 一次，并由这
一份 raw bytes 同时得到 document 与 SHA-256；两个 formal form 共用的 evolution authority
也只取一次快照。catalog、registry、runtime cache、progression、被引用地图、metadata、
authority 和 install manifest 不再存在“先 hash A、再 parse B”的混读窗口。progressions、
active zones、mapIds、被引用地图 encounterZones、命中的 wildPetPool 与 authority forms 都先
验证原数组和元素类型；`null`/junk、空/重复 authority formId 一律令报告失败。

Phase404 的语义 JSON 合同已固定为
`beastbound_sorted_compact_safe_integer_json_utf8_v2`。Python 与 GDScript 都递归接受 JSON
domain；bool 必须先于 int 判断；解析后的数值只有在 finite、integral 且位于
`±(2^53-1)` 时才规范为整数，`-0.0` 规范为 `0`。非整数、NaN/Inf、越界整数、非字符串
Dictionary key 与非 JSON 类型全部失败。于是 `6.0 == 6`、`180.0 == 180`，但
`true != 1`、`false != 0`，嵌套对象同样严格。这里约束的是 JSON parser 产出的 numeric
value，不声称能复原 IEEE-754 解析前的原始十进制词法。registry/cache/expectation/final
等发布语义文档使用 v2；地图、progression 等普通审计 JSON 仍按原始 JSON 读取，合法的
`encounterRate` 小数不会被错误拒绝。registry/cache/expectation/QA report 的文件 SHA
仍绑定原始 bytes，而不是 canonical bytes。

`tools/run_pet_battle_export_gate.py` 只有在上述审计通过后才在项目外临时目录生成
`export-expectation`。它用标准库实际解码每张 8-bit、RGBA、non-interlaced PNG，冻结：

- 源 PNG 原始文件 SHA-256；
- 源 PNG 解码后的 raw RGBA8 SHA-256 与 byte count；
- `beastbound_texture_godot47_fix_alpha_edges_raw_rgba8_sha256_v3` 精确 importer-transform
  合同：从 source copy 读取，目标 `A < 20`，在半径 4 的 clamped square 内按 `y` 后 `x`
  遍历 `A >= 20` 候选，以平方距离取最近且平距保留首个候选，只复制 RGB，alpha 原样，之后
  `premult_alpha=false`；
- oracle 输出 bytes 的裸摘要 `expectedImportedRgba8RawSha256 = sha256(output_bytes)`；
- 与裸摘要语义独立的合同摘要
  `expectedImportedPixelContractSha256 = sha256(pixelContractId + "\n" + importOracleSha256 +
  "\n" + "<width>x<height>:RGBA8\n" + output_bytes)`；
- 完整 23 项 importer 参数、exact Godot 4.7 version/source commit/binary SHA、两类像素摘要和
  `frameImportBindingSha256`；每形态 180 个规范路径按合同顺序组成的 canonical pixel tree 同时
  绑定 raw 与 contract digest。

这里没有通配忽略低 alpha RGB，也不会把 PCK 实际像素再“修一遍”后比较。Godot 4.7
`fix_alpha_edges` 会确定性改写 `A == 0` 以及 `A == 1..19` 的 RGB；v3 expectation 先对冻结源
执行同一 exact oracle，PCK QA 再逐 byte 对照已导入 raw RGBA8。alpha 改动、任意 oracle 输出 RGB
改动、错误 threshold/radius/tie、premultiply、格式/尺寸/帧集合/顺序变化都会失败。源 PNG raw SHA
与 install ledger/runtime-tree 对账继续独立存在，所以改源文件再同步 metadata 也不能变成新基线。
外层 expectation ID 为 `beastbound_pet_battle_export_expectation_v3`，QA report/final attestation
分别为 v6，并都携带同一 pixel/oracle contract与 official QA-lane lifecycle；旧
raw-RGBA/visible-RGBA 或 v5 证据不能混入新门。

expectation 还用这 180 个源文件的 raw SHA 重算与 startup cache 相同的 runtime-tree 合同；
因此 source audit 后、RGBA 解码前发生的同尺寸 PNG 漂移也不能被收成新基线。后续 export
若读到更晚版本，PCK 中的实际像素仍会与 expectation 不同并在 QA 失败。

因此 expectation 不是 metadata 互信，也不会把 raw PNG/manifest 强塞进 PCK。

### 2. registry 与内部 startup cache

registry 的 canonical release subject 明确删除顶层 `runtimeCache` 后再计算 SHA-256。内部
`pet_battle_release_runtime_cache_v1.json` 保存该 `releaseSubjectSha256` 以及每个获准 exact
form 的模式、root、skeleton、tree SHA、180 帧事实和普通战斗动作集合；registry 只保存
cache 的合同 ID、固定路径与原始文件 SHA-256。方向为：

```text
registry release subject（排除 runtimeCache）
  -> runtime cache.releaseSubjectSha256
  -> registry.runtimeCache.rawSha256
```

源 registry 为首次 promotion 可省略 `runtimeCache`；一旦该字段存在，就必须是对象且键集合精确
为 `contractId/path/sha256`，合同、固定路径与小写 SHA-256 形状也必须匹配。即使 promotion 为重建
cache 而关闭旧 cache 内容校验，也不能把额外 provenance 键静默归一成三键 pin。

没有 cache 反向钉 registry 原始文件的循环，也没有 expectation/final attestation 写回
registry。`tools/promote_pet_battle_release_cache.py` 只提供显式 `--check` / `--apply`，先要求
源审计通过，再确定性重建 cache 并只更新内部 pin；它断言 release subject 在 promotion 前后
完全不变，不能借 promotion 扩大正式条目或 legacy 例外。promotion 从 registry 原始 bytes 的
单一快照完成 JSON parse、源审计和 candidate 生成；审计结束、cache 写入前以及 registry pin
写入前都会复核原始 bytes/release subject，审计中或两次写入之间的并发漂移均停止在旧 pin，
不会用 A 版审计结论覆盖 B 版 registry。CLI 从取 snapshot、审计、cache-first 写入、pin 写入
到最终逐字节 check 全程持有 `.run` 中的 promotion 专用 `flock`；独立 `apply_candidate()` 也
在同一临界区内执行。跨文件写入若中断，旧 pin 与新 cache 不匹配，只会让启动门 fail closed。

当前冻结事实：

- release subject SHA-256：
  `5b06a88d6444941f8b281d1792245c83870c03971df040f58e64e1868b767dd1`
- runtime cache raw SHA-256：
  `b08ed4acb483fe233455edd51c0b45b4b552d6c927d5dae0f09854cf61f23307`
- runtime cache entry：3，且 registry pin 与实际文件一致。

### 3. PCK QA 与 final release attestation

PCK QA 同时要求环境变量 `BEASTBOUND_PET_BATTLE_EXPORT_EXPECTATION` 指向项目外绝对路径，
以及 `BEASTBOUND_PET_BATTLE_EXPORT_EXPECTATION_SHA256` 提供 64 位小写 SHA-256；relative、
`res://`、`user://`、项目根内或 Godot user 根内路径全部拒绝。GDScript 只打开外部文件一次，
同一份 `PackedByteArray` 先与 env SHA 对账再解析 JSON，不存在 path/hash 双读 TOCTOU。
QA 不开启 preview，也不调用源目录 metadata/manifest 校验；它按 `FORMAL_VIEWS` →
`FORMAL_ACTIONS` → `frameIndex` 的合同顺序枚举每形态规范 180 个路径，另行对排序副本做路径
集合校验，再通过 `ResourceLoader` 加载实际导出 `Texture2D`，读取并在必要时解压；实际格式必须
已经是 `Image.FORMAT_RGBA8`，byte count 必须等于 `width × height × 4`，禁止用
`Image.convert()` 掩盖格式漂移。QA 对 `get_data()` 同时重算裸 RGBA8 SHA 与带 oracle 前缀的合同
SHA，并与 expectation 两字段分别逐帧精确相等，最后按同一合同顺序重算 pixel tree。实际 PCK
bytes 绝不传入 oracle。GDScript 运行时另执行与 Python 相同的五组固定向量，覆盖 A0/1/19/20/255、
row-major tie、radius4 square、距离 5 无候选、source-copy 非级联，并拒绝错误 threshold、radius、
tie、premultiply 与 alpha 变异。
export expectation 在 source audit 前先冻结 registry/cache 两份完整 raw snapshot，并将同一
snapshot 原样贯穿 report、forms、release subject 与 expectation SHA；audit 后和 expectation
构建后只做 raw bytes 等值复核，不会重新打开另一版 JSON 生成基线。source audit report 由这次
`build_report()` 的同一内存文档一次性渲染为 raw bytes；完整 expectation validator 必须同时对账
report document、raw bytes、byte count、raw SHA、36/13/2/1/3 覆盖事实和 runtime-cache binding，
随后 runner 将同一 raw bytes 写入持久 evidence 与 expectation sibling 临时文件。PCK 通过独立
path+expected-SHA 环境绑定单次读取该 report，逐项复核后把 raw SHA 回显到三份 QA result；QA
report 与 final attestation 再绑定同一 SHA，不能用任意 64hex 冒充 source provenance。runner 也在
expectation 前冻结 20-path patch SHA，防止审计期间把 allowlist 内漂移收成新的未审基线。

expectation 在 cold import 前只冻结一次，不把运行后 sidecar 事实回写为新基线。cold import 后、
export-pack 后和 cleanup 前，runner 分别按三个形态的规范 540 帧审计实际 `<png>.import`，要求
A/B/C 三份 canonical 文档逐值相同。parser 拒绝重复 section/key、缺失或额外 params、非 UTF-8、
symlink、路径越界，并精确锁定 importer/type、单一 `.ctex` destination、source path、metadata 与
全部 23 项参数，特别是 `process/fix_alpha_border=true`、`process/premult_alpha=false`。Bui 已跟踪
的 100 份 sidecar 与本轮生成的其余 440 份都按规范路径覆盖，不能用只统计 `git ??` 的 aggregate
代替。三份 evidence raw SHA、共同 frame-binding aggregate 与 540 count 都进入 QA report/final。
源 PNG 和 sidecar 的读取从已打开的 repo-root fd 开始，逐路径组件用 `O_DIRECTORY|O_NOFOLLOW`
和 `dir_fd` 打开，leaf 用 `O_NOFOLLOW` 并在读取前后复核 descriptor/namespace identity；祖先替换
或任意 symlink 都 fail closed。

PCK 的 expectation root 与 launch root 由两个独立 `mkdtemp` 创建，必须互为 sibling 且不存在
祖先/子目录关系；PCK 的进程 cwd 固定为 launch root，expectation 位于另一 root。Phase404
runner 不传、不依赖不存在的 `--user-data-dir` 参数，也不再声称临时 Godot.app clone 加 `_sc_`
能为 editor binary 的 `--main-pack` 项目切换 `user://`。Godot 4.7 本机实证中该 marker 没有生效，
因此第三版合同删除 clone/self-contained 路径，四次 PCK 进程都使用 export 前已冻结 SHA-256 的
原 Godot executable。

运行门继承 official `automation` lane，而不是创建 Phase404 私有目录协议。任何 artifact
unlink/mkdir、静态审计或 expectation 构建前，runner 必须先让固定
`tools/godot_qa_user_data_lane.py source-check` 对 project/Main/coordinator、通用 Node runner 与 helper
自身执行 exact source contract；静态 scope/expectation 全部通过后才生成一次 32-hex owner 并调用
`prepare`，随后立即 `verify`。`HOME` 原样保留，只追加唯一
`GODOT_EDITOR_CUSTOM_FEATURES=beastbound_qa_automation`、lane ID 与 expected root 环境。静态
audit/promote 永远不 prepare lane；production gate 永远不调用 `recover`。

initial version、editor help、cold import、export、PCK preflight、default/Bui、Wuli、Driftfox 与
final version 共 9 个 Godot phase。每一条现有 process-group settlement 完成后都必须再调用 helper
`verify`，且首错停止。任何 timeout、observed residual、PGID 收口不可信、helper verify 失败，或
PCK Main attestation 缺失/重复/漂移，都保留 lane 与外部 owner lock，禁止自动 cleanup/recover；即使
后代最终被杀净，timeout/residual 事实本身仍属于 preserve。只有 exact attestation 与 lane verify
都可信的普通产品失败才允许 cleanup，但仍不得形成 QA/final pass。

每轮 PCK preflight 和三次 action QA 都从 `DirAccess.open(".").get_current_dir()` 回报绝对
`workingDir`，并必须与 runner 权威的 launch root 精确一致。Godot 4.7 editor `--main-pack`
在本路径回报的 globalized `resourceRoot` 是空字符串；第三版把这个空值作为必须精确相等的运行
事实，不再用 `res://` globalize 结果做目录边界。expectation 目录必须同时与 workingDir、official
QA lane root、真实玩家 root 和 repo root 不重叠。repo root 由
`BEASTBOUND_PET_BATTLE_REPO_ROOT` 与
`BEASTBOUND_PET_BATTLE_REPO_ROOT_SHA256` 成对传入；SHA 是合同 ID、换行和规范绝对路径的
单一 UTF-8 绑定。preflight 与每次 QA 都回报并复核 path/SHA，路径或 SHA 任一漂移都会停止。

在任何 Godot 子进程之前，runner 独立对真实 Beastbound 玩家 root 做 no-follow
path/type/size/file-SHA 全树 baseline inventory；根内存在 symlink 时因无法证明目标 bytes 而停止。
9 次 Godot invocation 都在前后各取一份真实玩家 inventory，并要求与同一 baseline
逐字节相同；末次版本门结束后再取最终 inventory。runner 从不自动恢复或删除真实玩家档案。

四次 PCK 进程均经固定 `/usr/bin/sandbox-exec` 启动。runner 生成并冻结 sandbox profile，默认
允许其他行为，但用同一个 resolved Godot `app_userdata` parent 的 `literal` 与 `subpath` 两条
规则拒绝全部 `file-write*`；sandbox executable、测试用 `/usr/bin/touch`、Godot executable 与
profile 原始 bytes 均钉 SHA-256。PCK 前的 canary 必须同时证明 sandbox 内向被保护目录写入失败、
目标没有创建，以及向 launch root 写入成功；任何逃逸都会清理精确 canary 文件后 fail-stop，
不会继续 preflight。每个 Godot 进程用 `--log-file` 将 engine log 明确定向 launch root，避免
默认 `user://logs` 写入；stdout 与 engine log 均严格扫描 parse/error/leak/orphan、sandbox denial
与 `Operation not permitted`，原始 engine log 复制到 `.run` 并冻结 SHA。每次 action QA 还锁定
同一 working/QA-lane/repo root、空 resourceRoot、`profile_save_enabled=false`、非 server account
session、`auth_auto_bypass=true`。最终 expectation root 与 launch root 必须全部删除，才允许
lane cleanup；cleanup 后还必须用只读 `inspect` 证明 lane root、pending/published lock、owner/pending
canary 全部 absent。QA report 与 final builder 只能在这份 post-cleanup absent evidence 之后运行。
四个 PCK 命令各携带恰好一个 `--beastbound-qa-user-data-lane=automation`；Main 必须在 stdout 列零
输出唯一 canonical attestation，且其中 `userDataRoot` 精确等于 lane root。stdout 只接受 raw LF/CRLF
分行，拒绝 lone CR、C0/C1、VT/FF/NEL 与 Unicode line/paragraph separator 伪造列零。

Godot executable 在 cold import 前先执行严格单行 `--version` 门，只接受
`4.7.stable.official.5b4e0cb0f`，并要求 binary SHA-256 为
`445c6f95030e2ca767dd921be1e91bd99e50c3703f91d22a22cd31216c93a80f`；所有 QA
和临时目录 cleanup 结束后再次读取版本并要求文本与首次完全相同，同时前后复核 executable
SHA-256。初次 version 后另有严格 `--help` 门：只有 ASCII option 行精确出现 `--editor` 与
`--project-manager` 才证明是 tools-enabled editor binary。version/help 都包含在上述 9 组真实玩家
root 门内，所以 final inventory 之后不再启动任何
Godot。final builder 自身也拒绝空 preset、非精确 build、source commit/binary/oracle 漂移或
source/PCK-QA executable SHA 不一致，
不能只依赖 runner 调用者先验。

同一轮还必须证明普通 gate 放行、preview 前后均关闭、normal warm 成功、normal texture
真实取帧成功。芽耳布伊的普通路径仍保持 legacy 七动作，但 export QA 会核验其底层完整
180 帧包。PCK 在全部 QA 前后重算 SHA-256，任一字节变化立即失败。

只有 default/芽耳布伊、晶甲乌力、月岚风狐三次 PCK QA 全部通过，工具才会在忽略的
`.run` 目录生成 final release attestation，并同时冻结：

- export expectation SHA-256；
- v3 exact importer-transform pixel/oracle contract ID 与 oracle SHA-256；
- 540 canonical `.png.import` 的 A/B/C raw evidence、共同 frame-binding aggregate 与稳定标记；
- registry 与 runtime cache SHA-256；
- PCK 前后相同的 SHA-256；
- 精确 20-path git patch SHA-256；
- export preset 名称与文件 SHA-256；
- Godot 版本与可执行文件 SHA-256；
- sandbox executable、touch executable、profile、canary report、四条 sandboxed PCK command 与
  全部 9 条 Godot command 的 aggregate SHA-256；
- official lane source/prepare、初始 verify、9 次 phase verify、cleanup 与 post-cleanup inspect 的
  canonical aggregate，且显式区分 `qaLaneRoot` 与 `realRoot`；
- repo-root path binding、PCK workingDir 以及 initial-version/editor-help/import/export/preflight/
  default/Wuli/Driftfox/final-version 九组真实玩家 root 前后 inventory/report SHA-256；
- 四份独立 PCK engine log aggregate SHA-256 与两个临时 roots cleanup 证明；
- QA report SHA-256；runner 写入后另行打印 final attestation 原始文件 SHA-256。

每次 source-check 成功后生成唯一 32-hex `attemptId`；随后必须先证明同目录旧 final、QA report 与
failure marker 全部 absent，才允许静态审计或 prepare。任一步失败时不会生成本次 final
attestation，并原子发布 `pet-battle-export-gate-failure.json`；该 v6 marker 以同一 attemptId 明确
`qaLaneDisposition=not_created|preserved|cleaned|unknown`、`cleanupTrusted`、
`preservationRequired` 与 pass artifact 是否成功失效；只有未尝试 cleanup 的 containment/
attestation/verify preserve 路径才声明 `preserved`，cleanup 已执行但 post-inspect 失信必须声明
`unknown`，不能虚报仍被保留。marker 作为该目录最新 attempt authority 覆盖任何因权限
错误无法删除的旧 pass 文件。CLI 错误文本保留 primary error 在前，同时显式输出 cleanup/stale
secondary 与 marker 路径，不能让失信 cleanup 被表面产品错误掩盖。
final builder 在 sidecar/temp cleanup、QA report 单快照与全部 evidence 复核完成后才写入同目录
0600 `O_EXCL` 临时文件，flush+fsync+close 后在 commit 前最后复核 temp bytes、QA bytes/SHA 与空
final target，再用 `os.replace` 原子替换。replace 成功是不可回滚 committed boundary；其后不再做
可能失败的 QA/final 读取或 unlink。若调用层在 replace 已实际提交后注入异常，只有“temp 已消费且
final 精确等于冻结 bytes”才能识别为已提交成功并返回冻结 SHA；不会出现进程报失败却把同一份
有效新 final 当作可回滚文件删除的冲突。
runner 要求启动前 `client/godot/.godot` 不存在，并用 guard 冻结全部现有 `.import`/`.uid`
sidecar；成功或失败退出时都会删除本轮 `.godot`、移除新 sidecar、逐字节恢复既有 sidecar，
使持久临时产物只留在 `.run`，外部 expectation 只存在于 `mktemp` 生命周期。
冷导入进行期间的 scope audit 仅豁免状态严格为 `??`、路径位于 `client/godot/` 且后缀为
`.import`/`.uid` 的再生 sidecar；已 stage sidecar、普通未跟踪文件、既有 sidecar 漂移及任何
其他产品路径一律失败。runner 在 import 后和 cleanup 前输出精确 sidecar 路径、文件 SHA、
大小、数量及 canonical aggregate SHA，cleanup report 必须证明残留数量为 0。
cleanup report 同样只读一个 raw snapshot，字段与写入 QA report 的 cleanup SHA 来自同一份
bytes；内容随后漂移会在 final builder 前失败。

所有外部命令（包括 git scope/patch、helper、canary 与 9 次 Godot）都通过统一 bounded runner，在新的
process session 中执行并使用显式 timeout。超时先向整个 process group 发送 `SIGTERM`、等待固定
grace，再独立探测 PGID；即使 group leader 已回收，只要同组后代仍存活就发送 `SIGKILL`。随后
`communicate()` 回收直接子进程并二次确认整个 process group 消失；Godot/canary 的 stdout、前后 user inventory 与
failure JSON 仍会落到 `.run`，随后正常展开 context guard 清理 `.godot`、sidecar 和临时 roots。
正常 rc0、非零退出和调用方异常也共用同一 PGID 收口；父进程正常返回却留下关闭 stdio 的
后台后代时，runner 会终止并确认该组消失，同时仍把该命令判为泄漏失败。重复 `SIGKILL` 后
仍不消失的进程组会明确标记未回收并 fail-stop，不生成 final。

## 运行时状态与热路径

`PetBattleReleaseGate` 只有三个状态：`UNINITIALIZED`、`READY`、`FAILED`。`main.gd` 在
`_ready()` 最早期只调用一次 `initialize()`：

- startup 读取 registry/cache，验证 raw cache pin、release-subject canonical SHA、Python/
  GDScript canonical parity vectors、entry 与 registry 精确绑定以及 catalog form/root/skeleton/
  status/runtimeEnabled；
- 两份 startup 文件各自只 `get_buffer()` 一次，同一 PackedByteArray 同时产生 raw SHA、JSON 与
  v2 normalized document；raw SHA 保存在 gate summary，PCK QA 直接复用，不再 reopen
  registry/cache 形成 TOCTOU；
- registry/cache 的每个数组在进入 typed/filter helper 前先验证原始类型、元素类型和长度，
  任意 `null`/junk 都会令启动进入 `FAILED`，不能被 `_dictionary_array` 静默丢弃后进入 READY；
- 任一错误都令状态黏在 `FAILED`，本进程不自动重试；
- 成功后只保存 3 个已验证 decision Dictionary；
- `is_battle_runtime_allowed(formId)` 只检查 `READY` 并做一次 Dictionary lookup；miss/空 ID
  直接 false，不读文件、不 hash、不扫 catalog、不分配 placeholder。

这移除了旧实现首次开战同步读取 180 PNG 的 77–113 ms 风险，但本阶段没有做新的性能改造
或宣称启动成本已达发布线；PCK 后仍需独立 preflight/启动耗时与真实战斗帧时间证据。

## 当前覆盖

机器报告读取全部 36 个美术目录形态，并从激活 `progression_zones` 中选择
`wild_training`，按地图 `encounterGroupId` 精确匹配 `encounterZones`，再汇总
`wildPetPool.formId`。13 个目标不是工具硬编码；registry 只冻结预期数量与派生集合 SHA，
数据漂移会失败。

- catalog form：36
- 动态正式野外训练 form：13
- formal exact-form：2
  - `wuli_evolved_crystal_earth8_water2`
  - `driftfox_evolved_moon_gale_wind7_water3`
- 唯一非正式 legacy 兼容例外：
  `bui_novice_sprout_earth5_wind5`
- procedural placeholder：33
- wild-training 集合 SHA-256：
  `bd451a022f755b31126ea2f121ca29811091c97e3ab08c9f76e2692de601867e`
- 当前 report canonical SHA-256：
  `eb57d1d08c404d329c9a133a9b79e577ee5f6ea3672f221d30bafde26536dfe1`
- 当前 report rendered raw SHA-256（expectation/PCK/QA/final provenance）：
  `4d9527c79dfc353b982d2d49947c6a1df4697f78ff6e38baa91001743ff082a7`

当前 pre-export expectation 静态重算得到：

- registry raw SHA-256：
  `0b307073d84a071de5182b769c5f05a0e2a2b6d1a7d56a171f1e67fe744c9ec4`
- expectation canonical SHA-256：
  `954aeee857b647b9da04db6d9c2943677b3c5f8f5bf4b3f87fd13f1efd5ce435`
- 当前缩进 JSON rendered raw SHA-256：
  `5282e2840e7654177bb35c88843452734848ae08f54e184e1e3a6887d785435d`
- import oracle canonical SHA-256：
  `ae5fc15c454fb0916a51dc81c4954eb9b29c5f8b94def59c7412d66669e9eb0d`

| formId | 帧 | source runtime tree SHA-256 | expected imported raw+contract pixel tree SHA-256 |
|---|---:|---|---|
| `wuli_evolved_crystal_earth8_water2` | 180 | `7a66a2dbcef76c59bfbd53f724c581162153a0ff2a4c250f3a1c1d8e6fd5a87d` | `f3d4bcd41f1a355d19d7388b89d54370370852b075741134d2eabc58deb9e088` |
| `driftfox_evolved_moon_gale_wind7_water3` | 180 | `b101df796f910ec159946c45084ddf3b38c65ac20389344916ec09a5d794c431` | `620a408a113c60eff4e3ef8fa79606151a5197a7414a95e1b1709ae3ffac1665` |
| `bui_novice_sprout_earth5_wind5` | 180 | `080b6726dfab7b35c7447055ba3bde0bd56e7422e566dd25c4977a17a7098911` | `88ad64e7be261da4b3508d59d6793fc7dcfd1aeab2e3bf0f58d59394f3161713` |

## 精确 20-path 闭包

1. `client/godot/data/pet_battle_release_registry_v1.json`
2. `client/godot/data/pet_battle_release_runtime_cache_v1.json`
3. `client/godot/project.godot`
4. `client/godot/scripts/main.gd`
5. `client/godot/scripts/pet/pet_action_asset_catalog.gd`
6. `client/godot/scripts/pet/pet_battle_release_gate.gd`
7. `client/godot/scripts/qa/auto_check_coordinator.gd`
8. `client/godot/scripts/qa/battle_layout_owner_review_capture.gd`
9. `client/godot/scripts/qa/pet_action_asset_check.gd`
10. `client/godot/scripts/qa/pet_codex_awakened_owner_review_capture.gd`
11. `docs/phase_404_pet_battle_exact_form_release_gate.md`
12. `tools/audit_pet_battle_release_gate.py`
13. `tools/godot_qa_user_data_lane.py`
14. `tools/promote_pet_battle_release_cache.py`
15. `tools/run_pet_battle_export_gate.py`
16. `tools/run_godot_auto_checks.mjs`
17. `tools/test/test_audit_pet_battle_release_gate.py`
18. `tools/test/test_godot_qa_user_data_lane.py`
19. `tools/test/test_pet_battle_export_gate.py`
20. `tools/test/run_godot_auto_checks.test.mjs`

白名单测试要求当前 worktree 的所有 tracked/untracked 改动精确等于上述集合，并对 tracked diff
和每个 untracked binary diff 生成确定性 patch digest。没有改动 assets、export preset、server
或 Phase402 文件；通用 runner/helper 的变化只用于 official lane 基础。

## 原候选静态验证与 2026-08-12 主线恢复

原 Phase404 候选当时没有启动 Godot、PCK 或 ffmpeg，其静态验证为：

```text
python3 -B -m unittest \
  tools.test.test_godot_qa_user_data_lane \
  tools.test.test_audit_pet_battle_release_gate \
  tools.test.test_pet_battle_export_gate
# Python 3.9: 150 tests, OK
# Python 3.14: 150 tests, OK

node --test tools/test/run_godot_auto_checks.test.mjs
# 43 tests, OK

python3 -B tools/promote_pet_battle_release_cache.py --check
# passed, entries=3

python3 -B tools/audit_pet_battle_release_gate.py --require-valid
# passed, forms=36, formal=2, legacy=1, wild_training=13

git diff --check
```

2026-08-12 从当前 `main` 恢复该候选时，重新完成了 150 项 Python 测试、43 项 Node runner
测试、source contract、cache promotion check、release audit、Godot 4.7 cold import 与真实
`godot --headless --path client/godot --quit` 解析。主线新增的 5 个 auto-check 均绑定唯一完成标记；
cold import 暴露的两个正式录制器共 7 处 Variant 类型推断错误已改为显式 `SceneTree`、`Window`、
`Rect2`、`Control` 类型，因此精确闭包从 18 项扩大为 20 项。正常解析只保留既有 HUD anchor
warning，没有脚本解析或编译错误。

负测覆盖 cache pin/entry/root/mode/form/tree/frame/action/扩张及数组 null/junk 篡改、release subject
hash 环隔离、Python/GDScript v2 canonical vectors 与 GDScript source mutation、safe-int/±0/NaN/Inf/
非字符串 key、bool↔int 严格区分、普通地图小数不受影响、hot lookup 禁止 lazy I/O、promotion
审计中/写前/cache 与 pin 两次写入间并发漂移及临界区锁、整轮 JSON path 单快照/同源
document+SHA、五层 progression 与 authority 数组 junk、PNG 删除/替换/错误尺寸。v3 像素负门
分别锁 raw SHA 与带前缀 contract SHA、expectation root/form/frame exact key set、三形态合同顺序
pixel tree，以及 A0/1/19/20/255、row-major tie、radius4 square、no-neighbor、source-copy、错误
threshold/radius/tie/premultiply/alpha；PCK 实际 bytes 不能调用 oracle。import sidecar 负门覆盖
540 精确路径、23 项 params、重复/额外/缺失字段、非 UTF-8、leaf/ancestor symlink 与 open 期间祖先
替换。source-audit report document/raw/size/SHA 同快照、有效 64hex 但非真实 report、report facts、
runtime-cache binding、PCK 独立 path/SHA 回显与 final provenance 均有负门。expectation path/SHA
单快照、缺帧/逆序/兄弟 root、normal/no-preview/180 PCK result、空
resourceRoot、绝对 working/user/repo root、profile/auth、PCK 前后 SHA 与 QA 失败禁止 final 也保持。
完整 runner mock 还证明 source-check 是任何 artifact unlink/mkdir 前的首个动作，静态 audit/promote
不会 prepare lane；成功 cleanup 与 post-cleanup inspect 证明 lane/lock absent 后才可构建 QA/final，
cleanup 或 inspect 失信不会生成 QA/final，并用本次 attempt failure marker 取代陈旧 pass authority。
preflight 1 次 + QA 3 次均用不同 `--log-file` 且全部经 sandbox profile 启动，expectation/launch
sibling roots 最终清零，全部 9 组 Godot invocation 真实 user tree inventory 不漂移。sandbox fixture
覆盖 executable/touch/Godot/profile bytes
篡改、deny canary 逃逸/timeout、launch write 失败、engine ERROR 与玩家档案漂移；preflight
mutation 覆盖 working/user/repo/executable/resourceRoot/path-SHA 与三类 expectation 目录重叠。
process mock 证明每个子进程都 `start_new_session`，timeout 会按 `SIGTERM`→grace→PGID 独立复查，
并对 leader 已退出但后代仍存活的 group 继续 `SIGKILL`、回收和二次确认；真实 fork 测试
证明 rc0 父进程关闭 stdio 后的存活后代也会被清理并拒绝，调用方取消注入也会先收口进程组；
任何 timeout/residual 即使最终回收干净仍要求保留 lane。PCK nonzero/log 失败也必须先从 raw output
独立取得唯一 exact Main attestation，并在每次 PG settlement 后完成 helper verify；attestation 缺失、
重复或漂移都直接 preserve，只有 attestation 与 verify 可信才可把产品失败送入 cleanup。
本次 attestation 只接受 settled process exception 直接携带的当前 stdout；证据文件写失败时不得回读
同名旧日志。产品失败 cleanup 的 precheck verify 也必须先通过，之后才记录 cleanupAttempted；precheck
失信时 cleanup 调用数必须为 0，并以 preserved/preservationRequired=true 封存 lane 与外部锁。
atomic-final mutation 证明全部 QA/final 校验在 commit 前完成；`os.replace()` 是不可回滚边界，调用已
实际提交后再抛异常时只有 temp 已消费且 final bytes 精确匹配才算成功，不会删除已提交的新 final。
failure marker mutation 另覆盖 stale artifact 失效失败、cleanup 成功但 inspect 失败的
`qaLaneDisposition=unknown`，以及 hostile exception `__str__`/`args` 不能掩盖 primary error。
no-follow inventory 证明 symlink 目标不会被遍历，literal Dictionary AST 也禁止重复 key；help/Main
attestation 的 raw LF/CRLF parser 会拒绝 lone CR、VT/FF/NEL、C0/C1 与 Unicode separator 行首伪造。
权威 preflight/PCK JSON 数值先以 Decimal 保留十进制语义，只允许数学上恰为 safe integer 的值；
指数下溢、二进制舍入伪整数、非整数、超范围整数与巨型指数均 fail-closed，同时 import sidecar 的
`0.7`/`0.0` 仍由独立 exact-literal 合同验证。
上述 150/43 项测试本身不执行 PCK；主线恢复另外执行了 Godot cold import 与解析。

## 历史失败证据与当前发布门

本阶段已有五次都不能冒充发布通过的诊断证据：

1. 早期 cold import/export 后的 PCK
   `039c5d7ddd6c589f3fd6ed4ef8ac6451c3bc52be02fdc690450c1639f181c885`
   在 default/Bui QA 暴露 Godot JSON integral float 与 Python int 结构不一致，以及 expectation 与
   PCK cwd 共根；Wuli/Driftfox 和 final 均未运行。
2. 后续冻结候选因 `main.gd` 一行缩进回归在 cold import 即失败，永久记为 invalid-before-export；
   只修复该精确缩进并加入源结构负门后才形成下一冻结。
3. 再下一版 cold import/export 通过，PCK 514,216,032 bytes、SHA-256
   `c1349eee72a02c6413257ba699c11b83c2593dda0a06f16086421e5d52c0fb76`，但 clone `_sc_`
   preflight 实际回报 `resourceRoot=""` 且 `userRoot` 仍是真实 Beastbound user 目录，因此按
   fail-closed 停在 preflight；default/Bui、Wuli、Driftfox 与 final 均未运行。真实 user tree
   前后相同，cleanup report 残留 sidecar 0。
4. 第三版 sandbox/workingDir/repo binding 冻结通过 cold import、export、sandbox canary 与 preflight，
   生成 PCK 514,217,328 bytes、SHA-256
   `1eda360ec161444af90c0201116c91c0ad5c8b39b0c71578ed1154c830ccd95f`；default/Bui 普通 gate、
   warm、texture、180-frame runtime tree 与 no-preview 都通过，但旧 raw-RGBA 合同对 180 张
   `Texture2D` 全部报像素漂移，因而按 fail-closed 停止，Wuli/Driftfox/final 均未运行。源包采用
   lossless import、`fix_alpha_border=true`。随后只读首帧 sandbox probe 同时用 `Image.load` 读源 PNG
   与 `ResourceLoader Texture2D.get_image()` 读同一 PCK，证明实际 imported bytes 与 Godot 4.7
   exact `fix_alpha_edges` 模拟 raw/contract 两项完全一致；2932 个差异像素中 A0 为 2843，A1..19
   仍有 89，A>=20 为 0，alpha 通道零差异。identity/flip/BGRA/premultiply 候选均不匹配。真实 user
   tree、sandbox、PGID、临时 roots、sidecar 与证据权限全部闭合。该 probe 是 v3 oracle 的根因证据，
   不是完整三形态发布通过证据。
5. 2026-08-12 主线恢复候选通过 cold import、PCK export、sandbox canary、preflight，并在默认
   Bui 的 180 帧、imported pixel tree、普通 exact-form gate、warm/texture、no-preview 全部通过；
   唯一错误是 `Engine.get_version_info().string` 返回 `4.7-stable (official)`，旧实现却把它直接与
   CLI 的 `4.7.stable.official.5b4e0cb0f` 比较。该次运行可信清理 QA lane，真实玩家目录前后
   inventory 相同。修复改为从 runtime 的 major/minor/patch/status/build/hash 重建 CLI 规范版本，
   同时继续独立校验完整 source commit 与二进制 SHA；该失败本身仍不是发布证据。

当前 exact importer-transform v3 已在主线恢复候选上重新完成 Godot cold import 与脚本解析；
完整 PCK/三形态 QA/final attestation 仍必须以同一 20-path patch digest 重新执行，因此在该外部门
真正通过前仍是 `BLOCK`。旧 source-tree Godot 绿灯、首帧 probe 和上述四次失败诊断都不能代替
v3 的完整跨运行时验证。

独立审计静态 GO 且唯一 Godot 窗释放后的下一扇门才是：cold import → 使用现有 macOS preset
导出隔离 PCK → sandbox canary → 从 sibling expectation 运行 pinned-Godot preflight → default/Bui、
Wuli、Driftfox 三次 exact-form check → 每次真实 user tree 前后门 → stdout/engine 错误泄漏全扫
→ PCK 前后 SHA 相同 → cleanup → final attestation。命令入口为：

```text
/usr/bin/python3 -B tools/run_pet_battle_export_gate.py --godot <absolute-godot-path>
```

PCK 通过后仍需停止并等待性能与最终发布授权；mounted whole-frame exact-form gate 继续保留为
后续 P1。

## Phase398／403 最终整合状态

当前候选已迁入 `codex/phase404-final-integrated`，不再是仅基于 `38ce776a8` 的独立 Phase404
开发树。Phase398 图鉴／地图／HUD、Phase403 battle-layout safe-area、共享 recorder containment
与 official feature lane 已先形成整合 foundation；Phase404 主线恢复后的精确 20-path 改动继续
保持为该 foundation 之上的发布候选。七个共享路径和两个由冷导入暴露出类型错误的正式录制器
路径保留在 exact-20 集合中，另外十一项为 Phase404 registry/cache/release-gate/audit/export
专属路径，因此 changed-path 合同仍是完整且非伪造的 20 项。

最终 `Main.gd` 的顺序现为：解析参数 → official lane attestation → 图鉴／战斗布局参数拒绝 →
Phase404 user-root preflight → sticky release-gate 初始化 → runtime/auth/audio/HUD → 两类 deferred
capture。图鉴与战斗布局 capture 各自禁用 generic GM bypass；Phase404 action QA 仍经 automation
lane，并保持 `pckProfileSaveEnabled=false`、`pckServerAccountSession=false`、
`pckAuthAutoBypass=true` 的独立合同。helper 同时钉住 pet-codex、battle-layout 与 Phase404
preflight/PCK 三组 wiring，runner 则使用 exit-zero `ERROR/FATAL` 也 fail-closed 的 43-test 版本。

整合后的旧 patch、PCK 与 final SHA 全部失效。本节只记录静态合并事实；在唯一用户 Godot 窗口
释放前不会运行 Godot、PCK、ffmpeg 或真实 lane。之后仍必须在本整合候选上从 cold import 开始，
完整重跑三形态 PCK gate、真实玩家 root 不漂移、cleanup 与 final attestation，才能成为发布证据。
