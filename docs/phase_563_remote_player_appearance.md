# Phase 563：同屏队友使用权威角色外观

日期：2026-09-19。承接 Phase 557 五人试玩发现的远端几何占位人物。此阶段补齐同屏人物表现，不改变地图、碰撞、玩法数值或美术开放状态；R1.W024 仍未完成。

## 问题与参考

旧 `publicOnlinePlayer` 和 presence wire 白名单不包含外观；世界深度层固定绘制几何人形。即使队友已选择其他人物、战斗中已有正式动作，地图上仍显示同一占位形象。网络变化还会重建整组远端节点，不适合持续动画。

本地 StoneAge 参考 `gmsv/src/char/char.c` 的 `CHAR_makeObjectCString` 将位置、方向和服务器角色图形号一起投影，`CHAR_sendCSpecifiedObjindex` 再发送给观看者。只采用“旁人看到服务器角色外观”的行为意图，未复制其代码、数值或资源。Beastbound 继续用自己的 `appearanceId`、共享资产目录和整体骑乘开放规则。

## 实现与边界

- `auth/online-player-appearance.js` 从当前角色绑定对应的服务端档案投影 `appearanceId`、`ridingFormId`。骑乘只来自本人活着且处于 riding 状态的宠物，不接受位置上报中的外观，也不公开宠物实例、属性、钱包或档案。
- HTTP 在线名单、WS snapshot / delta / rebase 保留这两个可选字段。它们是兼容新增字段，协议版本不变；旧包或未知人物仍回退见习猎人。
- 成功的 profile action 如改变外观，使用已有位置发送一次增量；静止上下骑不必等待走动。不修改格子、公开精度、碰撞或移动权威，不增加周期心跳。事件沿用 durable outbox，COMMIT 前不可见，写入失败不广播。
- `world/remote_player_visual.gd` 复用 `Player.tscn` 的素材、0.36 世界比例、锚点、动作和真八向。远端 presentation 明确禁用物理处理、键盘、移动控制及碰撞。未开放或不匹配的整体骑乘按本机相同规则回退徒步，不拼接、不镜像、不改变运行开关。
- 深度层按 stableId 更新节点，保留动画时钟；AOI 离开移除节点，同一包重复 ID 不复制角色。仍按现有脚底 `y + 24` 排序。名称位置和点击范围由实际人物动作范围确定，隐藏世界不拦截点击、不继续播放。
- 外观、骑乘、名字或公开精度改变时刷新缓存签名；地图调色修订也触发更新。单帧徒步待机停止逐帧处理，进入行走或多帧动作时恢复。动作范围共享缓存，不在逐帧路径读回纹理。

复用的是现有四套人物和当前允许的骑乘资源。本阶段未生成新像素、未改变来源记录或 owner / runtime / release 开关。远端跟随宠物、网络位置插值、200 人同图容量、全地图正式化不属于本次交付。

## 验证

```sh
git diff --check
node --check server/node/src/auth/online-player-appearance.js
node --check server/node/src/auth/profile-actions.js
node --check server/node/src/auth/online-presence.js
node --check server/node/src/auth-service.js
node --test server/node/test/online-player-appearance.test.js server/node/test/online-presence.test.js server/node/test/auth-social-world.test.js server/node/test/auth-profile-actions.test.js
node tools/run_godot_auto_checks.mjs --only=--auto-map-visual-runtime-check,--auto-character-runtime-appearance-check,--auto-camera-click-check --fail-fast
```

服务端 `91/91`，客户端含解析 `4/4` 通过。新增检查覆盖四外观 × 八方向 × idle/walk 的资源一致性、无镜像、相同比例和锚点、动作时钟连续、重复包、移除、隐藏、点击、旧包及骑乘回退。服务端验证伪造外观无效，静止上下骑不会公开 map-only 的格子，以及异步提交等待时不广播、成功后一次广播、失败后档案和广播均不生效。

最终客户端摘要：`.run/godot_auto_checks/2026-09-18T20-40-50-969Z_summary.json`。服务端日志：`.run/phase563-server-final.log`。初始诊断入口路径、GDScript 类型推断及测试返回结构错误均在本阶段修正；失败日志保留，不计入通过样本。

## 性能与原生画面

修改前后用相同隔离 Main、二层候选地图、180 帧预热和 480 帧采样，分别放置 4 / 24 个远端人物。移动场景还发送 60 次真实跨帧鼠标点击，并持续更新远端朝向。完整比较保存在 `.run/phase563-performance-final.json`；首次比较和后续单帧待机优化的记录分别保留，不能混选样本。

| 场景 | 修改前 process_scope 均值 ms | 最终均值 ms |
| --- | ---: | ---: |
| 4 远端，静止 | 0.034500 | 0.044125 |
| 4 远端，移动 | 0.129375 | 0.116750 |
| 24 远端，静止 | 0.041625 | 0.042000 |
| 24 远端，移动 | 0.270250 | 0.228000 |

不声称全部场景都加速：4 人静止略增，24 人静止近似原水平。人物单帧待机不再处理动画；移动时保留节点减少整组重建，但动画帧切换仍有必要成本。两组移动均为 60 次点击、120 个真实输入事件，全部接纳、最终目标一致。

这些是 headless 固定步长的脚本耗时诊断。模拟 60 FPS 不能当作原生绘制帧率，结果不替代四层正式 48 组性能矩阵，也不证明 200 人容量。

原生证据位于 `.run/phase563-native-showcase-final/`：真实 `Main.tscn`、1280×720、Metal，注入四个隔离 presence 样本，展示四套人物、八向行走姿态、回到待机及节点身份保持。该片证明实际客户端资源接入；它不是四个在线真人、自动路径移动或真实鼠标组队验收。初稿有一个样本处于楼梯后，后续仅调整展示样本位置使四套外观同时可读，没有改变游戏地图或遮挡规则。

最终 `remote_players.mp4` 为 765 帧、60 FPS、12.75 秒，全片解码通过；SHA-256 `a31853e78a11c5d1a584c91f7605cc956e3ef6bc85eaddc409ee96642733b6c4`。静止、行走和返回静止抽帧均已检查；同屏本人与远端见习猎人大小一致，另外三套人物可读。运行内容指纹为 `beastbound-map-runtime-surface-v2:cf3d0ee608db3b15dbd35307df87da56e501e77382a438bed9aa9ca1774eb179`。没有把展示片当作完整美术动作评审。

## 保留与下一步

既有 107 项洞穴候选文件及 4 项历史证据继续保留，未安装新的地图性能或 owner 回执。隔离测试和录像均要求进程退出、QA lane 清理、真实用户数据哈希不变；未修改真实账号或共享 MySQL，也未关闭用户原有客户端。

后续在解锁后的真实联网客户端补做队友点击菜单、上下骑、切图和五人守护战衔接；继续处理四层原生性能及当前版本精确证据。地图 bundle 保持 owner pending / runtime disabled / release blocked，R1.W024、R1.W025 和 P2.2b 不勾选。
