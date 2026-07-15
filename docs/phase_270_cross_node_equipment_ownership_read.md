# Phase 270：跨 Node 装备归属一致读穿

## 目标与复现

本阶段完成 `P0.6d-2c-8`，修复装备邮件领取后在另一 Node 上持续误报装备重复归属的假冻结。

修复前可以稳定复现：

1. Node B 的旧根仍包含装备邮件 `E1`；
2. Node A 条件领取 `E1`，在同一事务中删除或缩减邮件、把装备物化进 profile，并追加 `E1` 永久消费墓碑；
3. Node B 随后的市场读穿只替换 profile、市场与墓碑，不替换 profile 所属账号的邮箱；
4. Node B 因而得到“旧 `E1` 邮件 + 新物化装备 + `E1` 墓碑”的混合根；
5. 上架、购买、撤单或转寄装备会在保存前返回 `equipment_transfer_envelope_duplicate`。

该保护成功阻止了复制或丢失，但错误发生在数据库事务之前，global revision 也不会因条件领取而推进，所以旧 Node 无法依靠 CAS 冲突或失败重载自行恢复，玩家会持续无法操作该装备。

## 原因

装备归属不是单一 profile 事实，而是横跨以下容器的唯一性合同：

- profile 背包中的物化装备及 `transferProvenance`；
- 银行中的私有装备信封；
- 邮箱中的活动装备信封；
- 市场挂单中的活动装备信封；
- 永久消费墓碑。

Phase262 的范围读穿能够在同一 MySQL `REPEATABLE READ` 视图中更新市场、指定 profile 和引用墓碑，但市场 scope 固定返回零个邮箱分区；Phase269 的发信 scope 又把装备/混合附件直接排除在读穿之外。单独刷新 profile 会破坏上述跨容器快照的一致性。

不能根据墓碑在 Node 内局部裁剪旧邮件。部分领取后的邮件仍可能含其他装备、普通道具或货币；合成一封数据库中不存在的“剩余邮件”会重新引入复活或资产丢失风险。

## 一致读穿合同

共享资产读请求和返回视图新增显式布尔值 `includeProfileMailPartitions`。请求、MySQL reader、view certifier 和服务层 request/view match 必须四方一致，缺失、类型错误、额外分区、错误账号或乱序分区均失败关闭。市场 mutation 还必须由 `request.listingId` 在当前市场簿中推导操作者与当前卖家，并与返回的 binding/profile 和邮箱分区精确相等；空投影、只含操作者或错误卖家不能沿用旧缓存。

当该值为 `true` 时，MySQL 在同一 RR 事务里：

1. 读取 global revision；
2. 读取市场簿或收件账号；
3. 读取本次需要替换的 binding/profile；
4. 按 account ID 规范总序读取这些 profile 对应的完整收件箱分区；
5. 从市场、邮箱、银行和物化装备来源中收集 envelope ID；
6. 只读取这些 ID 的永久消费墓碑；
7. 认证 SQL 镜像、身份、profile revision、邮件收件人和分区集合后才允许采纳。

具体启用边界：

- 装备挂单创建：操作者 profile + 操作者邮箱；
- 装备挂单购买或撤销：操作者和目标卖家 profile + 对应一至两个邮箱，去重后规范排序；
- 本 Node 尚无目标挂单时：保守读取相关邮箱，直到 RR 市场簿证明真实类型；
- 装备或普通物品+装备混合附件发信：发件人 profile + 发件人邮箱 + 收件账号；
- 邮箱读取、领取和标记已读：继续读取当前账号 profile + 当前账号邮箱。

以下热路径保持轻量：

- 公开市场刷新不读取邮箱；
- 普通物品上架、购买和撤单不读取邮箱；
- 纯文本邮件不读取 profile 或邮箱；
- 只有普通物品附件的邮件读取发件人 profile，但不读取邮箱。

## 写入边界保持不变

本阶段只修复跨 Node 读事实，不把复杂装备写扩张成新的细粒度事务：

- 装备市场创建、购买、撤单继续使用 `legacy_global_cas`；
- 装备和混合附件邮件发送继续使用 `legacy_global_cas`；
- legacy 仍取得 global EXCLUSIVE compatibility barrier，校验完整 binding/profile snapshot；
- 条件事务仍取得 global SHARE barrier；
- 新 listing、mail、envelope tombstone 和 receipt 继续 strict INSERT；
- 单挂单创建继续使用实时全市场/单卖家容量 guard；
- Session-only lock timeout、transaction hard deadline 和 exact receipt 模糊 COMMIT 恢复规则不变。

因此当前完成态是“高频普通资产按行并行，复杂装备资产保守串行且跨 Node 可用”，不是“所有装备操作均已细粒度并行”。

## 验证

修复前新增服务级回归稳定得到：

```text
equipment_transfer_envelope_duplicate
装备托管档案存在重复归属，相关资产操作已暂停，请联系GM处理。
```

修复后定向验证覆盖：

- 远端领取装备邮件后，旧 Node 可以用新物化实例上架，旧邮件不会保留，来源墓碑继续存在；
- 远端领取后，旧 Node 可以把同一件装备转寄给第三个账号，只生成一封新邮件、只移除一次实例；
- 装备市场 mutation 的 actor/seller 邮箱按 canonical account ID 顺序读取；
- 普通市场 mutation、纯文本和普通附件发信保持零邮箱读取；
- `includeProfileMailPartitions=true` 但没有 actor profile、分区缺失或分区集合不匹配时失败关闭；
- 装备和混合附件发信的最终 planner 仍为 `legacy_global_cas`；
- 相邻市场、邮件、装备、shared-read 与 MySQL planner 回归全部通过。

定向 shared-read 与装备/混合邮件边界：

```text
node --test --test-concurrency=1 \
  server/node/test/auth-shared-asset-read-through.test.js \
  server/node/test/shared-asset-read-model.test.js \
  server/node/test/mysql-shared-asset-read.test.js \
  server/node/test/mysql-mail-send-conditional-save.test.js
```

结果为 `74/74`。再运行包含 HTTP、市场条件事务、经济、社交、持久化和装备隔离的 14 文件相邻矩阵，结果为 `349/349`；`git diff --check` 与改动生产、测试及门禁脚本的 `node --check` 通过。矩阵首次暴露一个仍返回旧 view schema 的 HTTP 测试桩，补齐 `includeProfileMailPartitions` 回显后转绿；终审构造的 actor-only market mutation 畸形投影也先被接受，补齐 `listingId` → actor/seller 精确绑定后已稳定拒绝。单点红绿用例和完整矩阵最终均通过。

本阶段没有运行完整本地 CI或新的真实 MySQL 门禁，也没有连接共享玩家库、修改 MySQL 全局参数或重启共享 MySQL。

## 性能与后续

额外邮箱读取只发生在低频装备资产写，并且每次最多覆盖操作者和目标卖家两个账号；普通市场和普通邮件热路径不增加邮箱 SQL。现有 `recipient_account_id` 索引用于限定账号分区。

当前产品尚未定义邮箱保留上限、归档或分页，因此单账号邮箱分区仍可能随运营时间增长。该产品/容量决定不能用本阶段的正确性修复代替，后续应单独设计保留策略、分页接口与系统/市场邮件共同容量规则。

`P0.6d-2c` 仍需一次父项收尾审计；event/presence/WS 跨 Node 路由、旧 writer 部署围栏和 200 客户端 30 分钟真实多 Node soak 仍属于 `P0.6d`，不在本阶段宣称完成。
