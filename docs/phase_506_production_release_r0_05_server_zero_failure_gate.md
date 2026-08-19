# Phase 506：生产发布 R0.05 服务端零失败门禁

## 目标与结论

本阶段只执行 `R0.05 GATE｜服务端零失败门禁`：在所有 R0.F001–R0.F013 完成后，独立复核完整服务端测试入口、实际 skip 与收尾状态，并重新证明当前候选没有服务端失败。

结论：**R0.05 通过**。完整服务端套件连续两次独立运行均得到：

```text
1978 tests / 1977 pass / 0 fail / 1 skip
```

两份 TAP 均没有 `not ok`。唯一 skip 是显式依赖隔离 Valkey 端口的真实流集成测试，符合本门禁允许“明确、已有理由的 skip”这一合同；它不替代后续生产相似 Valkey、跨节点、故障恢复与 SOAK 证据。

## 仓库与依赖复核

- 候选工作树：`/Users/fander/projects/Beastbound_Odyssey_release_candidate`；
- 分支：`codex/production-release-candidate`；
- 门禁前 HEAD 与远端候选均为 `38da5f442df7a403898fa0334800e71233512631`；
- 最新 `origin/main` 为 `ddcb4ff770093d0ae1533631f6371b11e1ce4f30`，候选相对它 `behind 0 / ahead 18`；
- 门禁开始前候选工作树干净；原始脏工作树未被用于运行或修改候选代码；
- `production_release_loop_plan.md` 中 R0.F001–R0.F013 全部已勾选，R0.05 的全部依赖成立；
- Node `v25.8.1` 满足 `server/node/package.json` 的 `>=22` 约束。

## 完整测试入口与发现范围

`server/node/package.json` 的完整服务端入口为：

```json
"test": "node --test"
```

当前 `server/node/test/` 下共有 215 个顶层 `*.test.js` 文件，没有更深层的测试文件。因此从 `server/node` 执行 `npm test` 使用 Node 默认测试发现覆盖当前完整服务端集合，而不是挑选过的子集。

测试源码中存在两个 skip 分支：

1. `valkey-stream-event-bridge-live.test.js` 在没有合法 `BEASTBOUND_TEST_VALKEY_PORT` 时显式跳过真实 Valkey 流测试；本轮该变量未配置，因此这是实际发生的唯一 skip。
2. `mysql-backup-health.test.js` 的符号链接权限用例只在 Windows 调用 `t.skip`；本轮平台是 macOS，该分支没有触发，对应测试实际执行。

## 独立门禁验证

从候选工作树运行：

```bash
cd server/node
npm test -- \
  --test-reporter=tap \
  --test-reporter-destination=../../.run/server_test_classification/r0_05_gate_full_1.tap
npm test -- \
  --test-reporter=tap \
  --test-reporter-destination=../../.run/server_test_classification/r0_05_gate_full_2.tap
```

结果：

| 运行 | tests | pass | fail | skip | `not ok` | TAP duration |
|---|---:|---:|---:|---:|---:|---:|
| full 1 | 1978 | 1977 | 0 | 1 | 0 | 55889.726 ms |
| full 2 | 1978 | 1977 | 0 | 1 | 0 | 57579.233 ms |

两轮唯一 skip 文本完全一致：

```text
real Valkey stream relays across clients, rejects duplicate node leases,
and replays pending delivery
# SKIP BEASTBOUND_TEST_VALKEY_PORT is not configured
```

## Valkey skip 的边界

该测试不是把失败吞成通过。源码仅在提供 `1..65535` 的显式隔离端口时启用，并连接 `127.0.0.1`；未提供端口时由 `node:test` 记录具名 skip。测试覆盖真实流跨客户端转发、重复节点租约拒绝与 pending delivery 重放，需要一个可安全清理的真实 Valkey 实例。

R0.05 的目标是证明当前完整服务端代码集合为零失败，因此接受这个已登记的环境 skip。生产相似 Valkey、真实跨 Node、外部故障域、分区恢复与持续运行仍属于后续 R7/R9 的 EXTERNAL/SOAK 门禁，不能引用本阶段结果代替。

## 收尾与安全边界

- 两轮测试退出码均为 0；
- 测试后候选工作树保持干净；
- 未发现候选路径相关的 `node --test`、临时 backend 或启动器进程；
- 未发现 `beastbound-launcher-test-*` 临时目录残留；
- TAP 输出位于已忽略的 `.run/server_test_classification/`，不进入提交；
- 本阶段没有配置或启动 Valkey，没有执行数据库运维，没有修改 MySQL 全局设置或真实玩家数据；
- 本阶段不改代码、数据、协议或玩家界面，因此不需要 `Main.tscn`、客户端性能或视觉证据。

## 非目标与剩余风险

- 本阶段没有运行 Godot 或 `tools/run_local_ci.mjs`。R0.05 是服务端专项门禁，完整客户端解析和目标自动检查由下一项 R0.06 独立负责；
- 本阶段不提前完成 R0.06–R0.09，也不更新 `stoneage_gap_plan.md`；
- 当前发布结论仍为 `BLOCKED`，因为客户端门禁、真实客户端性能和候选卫生尚未完成。

下一任务：`R0.06 AUTO｜恢复并跑通客户端目标自动检查`。
