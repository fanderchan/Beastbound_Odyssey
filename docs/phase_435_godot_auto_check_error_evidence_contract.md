# Phase 435：Godot auto-check 错误证据字段合同修复

## 结果与范围

修复 `--auto-auth-server-client-check` 在业务自检全部通过时仍被
`tools/run_godot_auto_checks.mjs` 判为 failed 的封装误报。

根因不是客户端解析或重连失败，而是该历史检查把“错误映射合同已通过”的布尔证据命名为
`error=true`。runner 会刻意把顶层 `error`、`errors`、`failure`、`failures` 视为失败保留字段，
因此在读到 `status=ok ... error=true` 时正确地拒绝把整条完成标记算作成功。

本阶段只把生产者字段改名为 `error_contract=true`，不放宽 runner 对真正错误字段的失败关闭规则，
不改变任何玩家 UI、联网协议、请求合同或游戏逻辑。

## 回归合同

Node 工具测试新增以下约束：

- `auto_check_coordinator.gd` 的真实完成格式必须包含 `error_contract=%s`；
- 真实完成格式不得再次包含顶层 `error=%s`；
- `status=ok ... error_contract=true` 必须被解析为成功；
- `status=ok ... error=true` 仍必须被解析为失败。

隔离候选还确认当前已提交的 `main.gd` 有 222 个来源可追溯的 `--auto-*-check`，而工具测试仍保留旧的
221 计数。本阶段同步该精确基线，继续保留每个 flag 的唯一 completion prefix 与源码生产者检查。

## 验证

- `godot --version`：`4.7.stable.official.5b4e0cb0f`；
- 隔离暂存候选 `node --test tools/test/run_godot_auto_checks.test.mjs`：`44/44 PASS`；
- 隔离暂存候选完成首次资源导入后，
  `node tools/run_godot_auto_checks.mjs --only=--auto-auth-server-client-check --fail-fast --timeout-ms 180000`：
  Godot parse 与 auth server client check `2/2 PASS`；
- `git diff --check`：`PASS`；
- 不连接共享／生产服务器，不写玩家数据，不生成玩家可见诊断。
