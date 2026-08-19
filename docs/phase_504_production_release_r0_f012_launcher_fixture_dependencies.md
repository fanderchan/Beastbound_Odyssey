# Phase 504：生产发布 R0.F012 启动器夹具依赖闭包

日期：2026-08-20
任务：`R0.F012 AUTO｜补齐启动器隔离夹具的新运维模块依赖`

## 结论

R0.F012 已完成。`start-backend-launcher.test.js` 的隔离临时仓现在会复制
`server-ops.js` 加载所需的最小运维模块依赖：`mysql-backup-artifact.js` 与
`mysql-backup-health.js`。六项启动器测试由修复前 `0/6` 恢复为 `6/6`，生产
`start-backend.command`、`server-ops.js`、备份模块和真实后端逻辑均未修改。

完整服务端套件为：

```text
tests       1978
pass        1977
fail        0
cancelled   0
skipped     1
todo        0
duration    55317.405375 ms
```

这次完整运行没有出现 R0.F013 的间歇性失败，但其确定性权威随机夹具尚未补齐，不能用
一次绿色结果替代稳定性修复。因此服务端 R0.05 门禁仍为 `BLOCKED`，下一游标是 R0.F013。

## 根因

启动器测试会建立一个只含启动器、运维脚本、假 HTTP server 与本地环境文件的临时仓，
用于证明进程所有权和清理行为。夹具仍只复制 `scripts/server-ops.js`，但当前运维脚本在
模块加载阶段直接引用：

```text
server-ops.js
├── ../src/mysql-backup-artifact.js
└── ../src/mysql-backup-health.js
    └── ./mysql-backup-artifact.js
```

其中两个 `src` 模块除上述关系外只使用 Node 内建模块，所以它们正好构成这个临时仓需要
的最小传递依赖闭包。修复前 Node 首先报
`Cannot find module '../src/mysql-backup-artifact'`；非交互用例直接失败，其余五项在运维
进程提前退出后等待控制器状态或 backend PID 超时。

## 实施

测试夹具增加显式、冻结的 `SOURCE_OPS_DEPENDENCIES` 清单，并在创建临时仓时将两项依赖
复制到临时 `server/node/src/`。没有复制整个源码目录，也没有为测试伪造空模块，因此：

- 启动器仍加载真实的当前运维模块图；
- 新的直接依赖需要在夹具清单中明确登记，避免隐式掩盖漂移；
- 备份、恢复和健康检查实现没有被测试替身替换；
- 变更仅限测试基础设施，不改变玩家、运维命令或生产进程行为。

## 验证

执行的核心命令：

```sh
git diff --check
node --check server/node/test/start-backend-launcher.test.js
node --test --test-reporter=tap \
  --test-reporter-destination=.run/server_test_classification/r0_f012_after_target.tap \
  server/node/test/start-backend-launcher.test.js
node --test --test-reporter=tap \
  --test-reporter-destination=.run/server_test_classification/r0_f012_adjacent.tap \
  server/node/test/start-backend-launcher.test.js \
  server/node/test/server-ops-lifecycle.test.js \
  server/node/test/mysql-backup-artifact.test.js \
  server/node/test/mysql-backup-health.test.js \
  server/node/test/mysql-backup-restore-drill.test.js
cd server/node && node --test --test-reporter=tap \
  --test-reporter-destination=../../.run/server_test_classification/r0_f012_full.tap
```

结果：

- 修复前目标文件稳定复现 `6 tests / 0 pass / 6 fail`，其中五项超时，一项直接显示缺失
  `mysql-backup-artifact`；
- JavaScript 语法与 `git diff --check` 通过；
- 目标文件 `6/6 pass`；相邻组合再次覆盖这六项并总计 `29/29 pass`；
- 相邻组合同时覆盖运维生命周期、备份产物、备份健康与恢复演练合同；
- 完整服务端 `1978 tests / 1977 pass / 0 fail / 1 skip`，相对 R0.F011 精确移除六项稳定
  失败且没有新增失败；
- 唯一 skip 仍是未配置 `BEASTBOUND_TEST_VALKEY_PORT` 的真实 Valkey 流测试，有既定理由；
- 启动器用例使用随机回环端口、假 HTTP server 与无效 MySQL 端口，没有连接共享或玩家数据库。

本机原始 TAP 输出保存在忽略目录：

```text
.run/server_test_classification/r0_f012_before_target.tap
.run/server_test_classification/r0_f012_after_target.tap
.run/server_test_classification/r0_f012_adjacent.tap
.run/server_test_classification/r0_f012_full.tap
```

## 收尾证据

六项测试覆盖并断言了正常终止、串行控制器替换、启动中断、外部 backend 替换与非交互
重启路径。对应断言确认：

- 旧 backend 和旧控制器退出，替换期间没有两个监听者重叠；
- 启动中断后 backend、PID 文件、控制器状态和锁全部清除；
- 外部替换出的新 backend 不会被旧控制器误杀，并由夹具最终清理；
- 非交互重启后没有控制器状态或锁，随后通过真实 `ops stop` 停止假 backend；
- 目标、相邻与完整套件结束后的进程扫描和临时目录扫描均为空。

## 非目标与剩余风险

- 本阶段不处理 R0.F013，不改变生产战斗随机性或宠物经验测试；
- 一次完整套件绿色不证明间歇性夹具稳定，R0.F013 完成并重复验证前不勾选 R0.05；
- 没有客户端、玩家可见行为或热路径变化，因此不需要 Godot、`Main.tscn` 或性能探针；
- TAP 和其他 `.run` 内容是忽略的本地生成物，不进入提交。

下一任务：`R0.F013 AUTO｜固定宠物经验战斗测试的随机权威夹具`。
