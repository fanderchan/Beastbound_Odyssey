# Phase 271：本地后端单窗口安全替换与事务排空

## 目标与既定体验

本阶段保留原有产品开发体验：macOS 上再次双击 `start-backend.command` 时，新的控制台会关闭旧的 Beastbound 后端控制台，安全停止旧后端，再启动唯一的新后端。这里的“安全”不是取消自动关闭，而是把自动关闭限定为可证明归属于 Beastbound 的旧实例，并禁止新旧后端在事务排空期间重叠。

关闭当前控制台同样会停服。非交互 `BEASTBOUND_NO_PAUSE=1` 模式则只执行一次安全重启，命令退出后保留后端运行，不创建控制器状态。

## 修复前复现与风险

原启动器和运维脚本存在以下生命周期缺口：

- 控制台关闭时读取当下 PID 文件并直接发信号，没有绑定自己启动的后端；陈旧 PID、PID 复用或外部重启可能导致误杀。
- 运维重启会向端口监听者发信号，并在服务端 15 秒 durable drain 结束前强制终止；旧后端可能仍在完成已接受的事务，新后端却已开始启动。
- 启动和健康等待完成后才安装退出清理，启动途中关闭窗口可能遗留 detached 后端。
- 连续双击没有互斥锁，多个启动器可能并发判断和重启。
- 旧控制器只依赖日志跟随进程存活，后端退出或被外部替换后仍可能显示绿色。
- 真实验收还复现过一次误杀：普通 zsh 命令只是参数中出现了启动器路径，也被模糊命令匹配当作旧启动器终止。

## 进程所有权合同

后端只有同时满足以下事实才允许收到停止信号：

1. PID 是有效的活动进程；
2. 启动时间指纹与控制器或运维脚本捕获的快照一致；
3. 工作目录是当前仓库的 `server/node`；
4. 命令是该目录下的 `node src/http-server.js`。

强杀前会重新验证同一组身份，避免等待期间 PID 被复用。陈旧 PID、无关端口监听者、无法证明身份的进程和外部替换的新后端一律不发送信号；端口被无关进程占用时重启失败关闭。

控制器状态记录控制器 PID、随机所有权 token、TTY、精确后端 PID 和启动时间指纹，采用同目录临时文件覆盖并设置为 `0600`。本地运行目录为 `0700`，由交互启动器创建或接触的日志、PID、状态和锁所有者文件均保持私有权限。

旧启动器识别只接受当前绝对路径对应的明确 zsh 执行形态。命令行中仅仅包含该路径的编辑器、轮询 shell 或其他 zsh 不是旧控制器。

## 串行替换与事务排空

交互启动器在重启前安装 HUP、INT、TERM 和 EXIT 清理，并用原子目录锁串行化启动流程。第二个控制器取得锁后：

1. 精确识别旧控制器并发送 `SIGTERM`；
2. 旧控制器停止日志跟随，只对自己持有的精确后端发送 `SIGTERM`；
3. 为服务端既定 15 秒 durable drain 保留完整时间，启动器最早 20 秒、运维脚本最早 17.5 秒后才允许对身份仍一致的进程发 `SIGKILL`；
4. 等旧控制器和后端真正退出、端口释放后，才启动一个替代后端；
5. 依据旧 TTY 尽力关闭 Terminal 标签页。

macOS Terminal 自动关闭受 Automation 权限约束，因此标签页关闭是尽力而为；即使系统拒绝 UI 自动化，后端的唯一性、事务排空和进程所有权也不受影响。

## 启动中断、外部替换与健康检查

启动中断发生在 detached 后端创建与控制器状态写入之间时，清理逻辑会从 PID 文件恢复候选者，但仍必须通过后端身份合同才会停止。锁、状态和属于该实例的 PID 文件随后清理，避免留下半启动实例。

控制器持续核验后端 PID、指纹、cwd 和命令。后端主动退出或被外部 `ops restart` 替换时，旧控制器转为失败状态并只清理自己的状态，不会停止替代后端。

启动成功要求健康响应同时满足 `ok=true`、`service=beastbound-auth` 和 `storage.ok=true`；仅端口可连接或任意 JSON `ok` 不再被视为就绪。

## 验证

隔离测试全部使用临时仓库、随机端口和假 HTTP 后端，不读取仓库 `.local/mysql.env`，不连接玩家数据库：

- 无关健康监听者不会被 stop/restart 发送信号；
- PID 文件指向 sleeper 时只清陈旧 PID，不误杀 sleeper；
- 4 秒慢退出能完整排空，不被提前强杀；
- PID 文件丢失时可从精确监听者恢复，restart 等旧实例退出；
- 交互控制器关闭会等待后端排空并清理状态、PID 和锁；
- 第二控制器串行替换第一控制器，监听者始终唯一；
- 仅命令行提到启动器路径的 decoy zsh 不会被终止；
- 健康等待期间中断不会遗留 detached 后端或锁；
- 外部运维替换的后端不会被旧控制器杀死；
- 非交互模式只重启一次且不保留控制器状态。

macOS 真实路径用 `open` 连续启动两次：第一次得到一个带 TTY 的控制器、一个健康后端和一个 `8787` 监听者；第二次启动后旧控制器与旧后端均已退出，新 PID 不同且仍只有一个监听者。最终向新控制器发送退出信号后，控制器、后端、监听端口、状态文件、PID 文件和启动锁均无残留。真实 smoke 使用现有本机后端配置，仅做启动、健康读取和停服，没有执行玩家操作、修改 MySQL 全局参数或重启共享 MySQL。

最终静态与定向命令：

```text
git diff --check
zsh -n start-backend.command
node --check server/node/scripts/server-ops.js
node --check server/node/test/server-ops-lifecycle.test.js
node --check server/node/test/start-backend-launcher.test.js
node --test server/node/test/server-ops-lifecycle.test.js
node --test server/node/test/start-backend-launcher.test.js
node --test \
  server/node/test/server-ops-lifecycle.test.js \
  server/node/test/start-backend-launcher.test.js \
  server/node/test/durable-mutation-coordinator.test.js \
  server/node/test/auth-durable-commit.test.js
```

两套生命周期测试为 `10/10`；包含 durable mutation 与 commit 回归的组合矩阵为 `71/71`。

## 非目标与剩余风险

本阶段不改变游戏内事务、结算或资产规则，不修改 durable mutation 的 15 秒合同，不代表生产环境滚动部署方案，也不提供 200 人容量证据。没有运行完整本地 CI。

自动测试已覆盖新后端创建后的健康等待中断，但尚未单独注入“控制器恰在运维脚本等待旧后端 drain 时被再次中断”的窄窗口；真实连续启动路径已经覆盖旧实例排空后再启动的主合同，该故障注入可作为后续运维测试增强，不阻断本阶段交付。
