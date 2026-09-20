# Phase 585：修复五人战斗事件流接收过小

日期：2026-09-20。继续 R1.W024。已复现并修复 Phase 584 的战斗期间静默断连；当前完整自动守护战保持一个健康连接，五账号奖励到账。真实鼠标双倒地／连续出洞、正式地图性能和美术接受仍待完成。

## 原因与修复

Phase 584 的服务端未拒绝连接，却观察到 8 次升级，客户端在战斗开始后游标停在 19。留存真实事件中，第一回合结算约 **80,908 字节**，关闭房间约 **115,504 字节**。

客户端一直使用 `WebSocketPeer.new()` 的默认接收容量 **65,535 字节**。[官方属性说明](https://docs.godotengine.org/en/stable/classes/class_websocketpeer.html#class-websocketpeer-property-inbound-buffer-size) 给出默认值；[Godot 4.7 实现](https://github.com/godotengine/godot/blob/4.7-stable/modules/websocket/wsl_peer.cpp) 同时把它作为单消息上限，超限关闭原因是 `1009 / Message too big`。这一关闭不会必然产生引擎 ERROR，因此旧录制门只查日志不能发现它。

`ServerAuthClientModel.event_stream_peer()` 现在统一创建带原认证头的连接，将接收容量设为 **256 KiB**，与既有 EventHub 的发送排队字节门相配。协调器仅改为调用该工厂；首次连接和重连均生效。上限有限，超过上限仍拒绝；每帧最多 8 包／64 个位置增量、服务器限流、重试规则、协议版本、战斗与奖励合同均不变。

本次只改变连接建立时的内存容量，没有新增每帧扫描、反序列化或轮询次数；未据此宣称世界帧耗时改善。Phase 579 的正式静止增量 FAIL 仍有效。

## 真实回环红绿验证

新增 `server_event_transport_check.gd`，接入既有 `--auto-auth-server-client-check`。它在官方 QA 目录中启动一次性 `127.0.0.1` 随机端口 WebSocket，调用真实 Main 的连接建立／轮询路径，跨帧接收含中文 UTF-8 的消息；恢复原会话、游标和模型，关闭测试 sockets。数据为不触发玩法的测试事件，不访问共享服务器或写真实档案。

| 消息字节数 | 旧客户端 | 修复后 |
| --- | --- | --- |
| 81,920 | 1009 关闭，未接收 | 完整接收，连接保持 |
| 262,080（服务端门内） | 1009 关闭，未接收 | 完整接收，连接保持 |
| 262,145（客户端门外） | 1009 拒绝 | 1009 拒绝 |

旧版红灯：`.run/godot_auto_checks/phase585-buffer-before-v2/2026-09-20T06-13-08-017Z.log`。更早一轮是夹具把协调器 epoch 误读为 Main 属性，已经修正，不作为产品红灯。修复后解析、认证／事件流、目标映射、战斗返回 **4/4**，原有 14 项时钟边界也继续通过。

自动守护战入口新增稳定连接验证：收到 ready 后全程保持 ready、没有重试、服务端仅接受一次连接且拒绝／超时等计数为零。它只适用于没有刻意断网的该夹具。旧 Phase 584 运行即使战斗成功、日志无 ERROR，现在也被明确拒绝；不会改写其历史回执。

## 当前完整自动守护战

在 `3d655f06b2e5bc5e9bbfe683f50c7dda6cf5add0` 加本阶段变更上运行现有 `--autoplay --record`。资料为 `.run/guardian-review/20260920T070239.575700Z/`，见 [本机核对摘要](../.run/phase585-event-transport/verification-summary.json)。源码库存采于该运行结束之后，明确不冒充运行前后哈希绑定或正式资产证据。

- 一个真实 Main 加四个 HTTP 测试队友完成 **10 回合胜利**；五账号均 `revision 102→103`、地之戒 `+1`、石币 `+244`。
- 约 **43.99 秒真实观察**、262 次采样，初次连接后的 **261 次均 ready**，重试次数始终 0；事件游标推进到 114。
- 服务端仅接受 **1 次连接**，拒绝、心跳超时、协议违规、慢客户端断开均为 0，退出后连接为 0。
- **4192 个逻辑帧零缺帧**，3898 次后台补绘；原生日志无 ERROR，客户端／后端正常结束，隔离目录清理，真实玩家目录不变。
- MP4 为 **1280×720、30 FPS、4254 帧／141.8 秒**，完整解码通过；SHA-256 `d24b6c047c7bd26ddb339c24c8cc3a7e2b059b3d003ff67a8ad9d5b964916b0a`。固定步长录像不代表正常前台性能，自动输入不等同于 Computer Use 或双方倒地专项验收。

## 验证与后续

```sh
git diff --check
python3 -B -m unittest tools/test/test_play_guardian_review.py
node tools/run_godot_auto_checks.mjs --only=--auto-auth-server-client-check,--auto-server-battle-target-mapping-check,--auto-server-battle-return-check --fail-fast --timeout-ms=180000 --output-dir=.run/godot_auto_checks/phase585-buffer-after
python3 tools/play_guardian_review.py --godot '<本机 QA Godot 路径>' --autoplay --record --timeout-seconds 600
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
```

Python **5/5**、Godot **4/4**、完整原生自动流程和新的事件流健康验证通过，未运行不相关的全量 CI。下一步继续真实鼠标的主控双倒地和四层返回／出洞，随后解决剩余正式性能与当前证据配对。107 项原有候选修改与 111 项保护文件保留；P2.1a、R1.W024、原 Phase 582 失败记录和所有者美术接受均未关闭。
