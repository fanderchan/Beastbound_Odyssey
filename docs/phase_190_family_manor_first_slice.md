# Phase190：家族与九大庄园第一版

本阶段参考本地 StoneAge 8.0 源码的家族/庄园结构，但不复制代码、地图或资产。

## StoneAge 8.0 参考结论

- 家族系统主干在 `_local_references/StoneAge/gmsv/src/char/family.c` 和 `include/family.h`：包含家族创建、加入、退出、成员、族长、声望、留言、银行、据点等。
- 九大庄园开关在 `_local_references/StoneAge/saac/src/version.h` 的 `_FIX_9_FMPOINT`。
- 原版庄园占领状态由 `saac/src/acfamily.c` 的 `FMPOINT` 结构保存：庄园入口、族长图层、邻近村庄、占领家族和声望。
- 庄园战排程由 `gmsv/src/include/npc_scheduleman.h`、`npc_manorsman.c`、`npc_fmwarpman.c` 维护，有挑战、准备、开战、休战、战斗结束等状态。

## Beastbound 第一版范围

第一版先完成可玩闭环：

- 家族：创建、加入、离开、成员列表、族长。
- 九大庄园：固定配置在 `client/godot/data/manors.json`。
- 庄园战：族长发起即时挑战，服务端按家族成员档案战力结算。
- 占领：胜利后写入庄园占领家族，并从原占领家族移除该庄园。
- 庄园道具场：`item_shops.json` 中新增 9 个庄园商店，占领对应庄园的家族成员才可购买。
- 持久化：MySQL 展开表包含 `families`、`manors`、`manor_battles`，完整状态仍保存在 `server_state`。

## 暂不做

- 原版式排程 NPC、挑战确认、准备场、跨服庄园战。
- 家族银行、家族税收、家族守护兽、族长职务代理、长老权限。
- 真实多人庄园战房间。当前是服务端即时结算版，后续可以接入 `party_pve`/PVP 房间。
- 庄园专属地图和美术资产。

## 验证

- `node --test server/node/test/auth-family-manor.test.js`
- `node --test server/node/test/auth-storage.test.js`
- `godot --headless --path client/godot --quit`
