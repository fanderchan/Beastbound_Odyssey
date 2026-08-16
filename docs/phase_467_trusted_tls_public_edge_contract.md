# Phase467：可信 TLS 公网边缘合同与双后端 WSS 门槛

## 目标与当前结论

本阶段关闭 `P0.6d-3b-2o` 的应用侧反向代理／TLS 残项：正式 Node 入口可以显式启用
`trusted_tls_proxy` 模式，并在启动和每次 HTTP／WebSocket admission 上失败关闭。新增隔离门槛用真实
TLS 1.3、临时证书链、一个 HTTPS/WSS 边缘监听和两个独立私有后端监听，证明证书校验、转发身份、
产品接口直连拒绝、限流与 WSS `events.ready` 可以在同一条真实传输路径成立。

本阶段没有部署或认证 Nginx、Caddy、HAProxy、云负载均衡、防火墙、WAF/CDN 或公网 CA，也没有证明
账号粘性入口和宽口径网络分区恢复。因此 `P0.6d-3b`、`P0.6d-3`、`P0.6d`、`P0.6` 与 `P3.2`
继续保持未完成，不能据此宣称已经具备完整公网横向部署能力。

## 已复现缺口

Phase255 已有严格 HTTP/WS 解析、可信代理链、限流、Origin allowlist 与 token 安全边界，但代理使用仍是
可选行为：即便部署者本意是“只允许 TLS 反代”，直接连接 Node 的产品请求仍会进入正常协议检查；默认
启动入口也没有一份统一、可审计、可安全摘要的公网边缘配置。因此旧实现只能表达“可以信任哪些代理”，
不能表达“本进程必须经这些 TLS 代理进入”。

本阶段保持 `direct` 为兼容默认，只在运维显式选择时收紧，不改变本地单机与 LAN 调试入口。

## 运行配置合同

新增 `PublicEdgeRuntimeConfig`，正式入口只从本次启动传入的环境构建配置，并在创建集群 runtime、存储和
监听器之前完成校验：

```text
BEASTBOUND_EDGE_MODE=direct | trusted_tls_proxy
BEASTBOUND_TRUSTED_PROXIES=<exact IP or CIDR list>
BEASTBOUND_WS_ALLOWED_ORIGINS=<canonical origin list>
```

`trusted_tls_proxy` 模式的失败关闭规则如下：

1. `BEASTBOUND_TRUSTED_PROXIES` 必须非空、可解析，且禁止 `0.0.0.0/0` 与 `::/0` 信任全部来源；
2. `BEASTBOUND_AUTH_HOST` 必须是 loopback、RFC1918／link-local IPv4、IPv6 ULA／link-local 或
   `localhost`，不能以 `0.0.0.0`、`::` 或公网地址直接开放 Node；
3. 配置的 WebSocket browser Origin 必须是 exact canonical HTTPS origin，不接受 HTTP、路径、凭据或
   非 URL 文本；原生 Godot 不发送 Origin 的既有合同保持不变；
4. 安全摘要只暴露 mode、布尔值和 proxy/origin 数量，不记录代理 IP、Origin、token 或玩家地址。

应用仍不持有公网证书，也不在 Node 内实现通用反向代理。证书、TLS 终止、header sanitation、HSTS、
防火墙与上游清洗继续由部署边缘负责。

## HTTP 与 WebSocket admission

安全模式下，除私有健康检查外，每个请求必须同时满足：

- immediate peer 命中可信代理 exact IP/CIDR；
- `X-Forwarded-For` 非空并继续通过既有 256B／最多 3 hop／逐 IP 归一／从右向左首个非可信 hop 规则；
- `X-Forwarded-Proto` 是单值且精确归一为 `https`；数组、空值、`http` 或逗号链均拒绝；
- HTTP 与 WebSocket 共用同一个 `NetworkAdmission.networkIdentity()`，不能只保护 REST 而遗漏 upgrade。

精确 `/health`、`/health/live`、`/health/ready` 可由私网探针在没有任何 forwarding header 时直连；一旦
携带 forwarding metadata，就必须按完整安全代理合同校验。产品直连返回稳定中文安全错误，普通玩家 UI
不会看到内部代理 IP、配置或调试字段。

部署代理必须先删除客户端自带的 `Forwarded`、`X-Forwarded-*` 与 `X-Real-IP`，再写入自己的 canonical
值。应用只能验证“上一跳可信 + 链合法”，无法替第三方代理证明其 rewrite 配置，因此正式部署仍必须做
边缘 conformance test。

## 真实 TLS/WSS 双后端门槛

新增并执行：

```sh
node tools/run_trusted_tls_edge_gate.mjs
```

工具只创建一次性内存玩家状态和临时证书目录：

- OpenSSL 创建一天有效的临时 CA 与包含 `edge.beastbound.test` SAN 的服务器证书；私钥权限为 `0600`，
  不输出 key、token 或临时路径；
- 一个 IPv4 loopback TLS 边缘只允许 TLS 1.3；边缘到两个独立 Node 后端使用 IPv6 loopback，后端只
  信任该 immediate peer，从而真实客户端地址不会与代理地址混同；
- `/health/live` 经边缘到后端 A，注册与 WSS 经边缘到后端 B，证明两个独立监听均被真实触达；这只是
  门槛路由，不宣称已经实现账号粘性生产负载均衡；
- 正确临时 CA + hostname 成功，未提供 CA 固定失败，明文 HTTP 不能被 TLS 监听当成成功请求，响应可见
  HSTS；
- 直接连接后端健康检查为 200，直接连接产品接口为 `400 forwarded_for_required`；
- 同一个真实客户端连续伪造两个不同 XFF/XFP，边缘覆盖后首个注册为 200、第二个由后端同源桶返回 429，
  证明伪造来源不能绕过限流；
- 完整账号创建并选中角色后，以 Authorization bearer 和允许的 HTTPS Origin 完成真实 WSS 101，取得
  `events.ready`；
- 最终关闭 1 个边缘 + 2 个后端监听，逐端口确认不能重连，删除临时证书目录和内存玩家状态。

最终回执：

```json
{
  "status": "PASS",
  "tls": {
    "negotiated": "TLSv1.3",
    "certificateChainVerified": true,
    "untrustedCaRejected": true,
    "plaintextHttpRejected": true,
    "hstsObserved": true
  },
  "topology": {
    "independentBackendListeners": 2,
    "bothBackendsReached": true,
    "backendDirectProductRejected": true
  },
  "clientIdentity": {
    "incomingForwardingHeadersOverwritten": true,
    "sameClientSpoofAttemptsRateLimited": true,
    "observedStatuses": [200, 429]
  },
  "websocket": {
    "wssUpgradeAccepted": true,
    "certificateVerified": true,
    "eventsReadyObserved": true
  },
  "claims": {
    "productionProxyVendorValidated": false,
    "accountStickyIngressValidated": false,
    "broadNetworkPartitionValidated": false,
    "persistentServiceStarted": false
  },
  "cleanup": {
    "temporaryListenersClosed": 3,
    "temporaryPortsClosed": true,
    "temporaryCertificateDirectoryRemoved": true,
    "temporaryPlayerStateRemoved": true
  }
}
```

## 自动验证

- `node --check`：新增配置、修改的 admission/HTTP 入口、全部新增测试和 TLS 门槛工具通过；
- 默认启动、配置、HTTP 公网安全、network admission、EventHub 与 cluster runtime 相邻矩阵：`94/94`；
- `node tools/run_trusted_tls_edge_gate.mjs`：真实 TLS/WSS 门槛 `PASS`；
- `git diff --check`：通过。

本阶段没有读取本地数据库凭据、连接或改写玩家 MySQL／Valkey、修改共享 MySQL 全局参数、启动持久服务、
改变协议版本、战斗／经济数值或玩家 UI。临时失败跑也执行同一清理路径，并在返回前验证端口与证书目录。

## 后续边界

1. `P0.6d-3b` 仍需真实部署入口证明账号 sticky 规则与当前 owner 模型一致，并覆盖更宽的双向／迟到响应
   网络分区恢复；
2. `P3.2` 选择并部署实际 reverse proxy/load balancer，完成公网 CA 签发与续期、TLS 策略、header
   rewrite、WebSocket timeout、HSTS、日志脱敏、防火墙/WAF、监控告警和滚动维护演练；
3. 正式域名、代理网段和 Origin 必须来自真实运维拓扑，不把本门槛的 loopback/临时 CA 示例照搬上线。
