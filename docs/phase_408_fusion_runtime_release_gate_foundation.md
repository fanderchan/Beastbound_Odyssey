# Phase 408：融合正式开放发布证明基础门禁

## 结论

首批两条融合路线新增了服务端双层失败关闭门禁：生产融合目录只有在加载并验证一份固定路径、固定身份、固定范围的 P1.4 runtime release attestation 后，才允许进入报价或执行流程。即使有人单独把 `pet_fusion_recipes.json` 的 `runtimeEnabled` 改为 `true`，服务端也会拒绝启动该开放目录；即使绕过目录构造器直接注入一个开启对象，融合 domain 仍会在任何宠物消耗前返回发布门禁失败。

本阶段没有创建所有者批准文件，没有创建正式 attestation，没有修改两只融合宠的发布状态，也没有接入正常玩家入口。生产事实继续保持：

```text
releaseApproved=false
runtimeEnabled=false
playerEntryOpened=false
portrait owner review=pending
```

因此 P1.4 仍未完成，当前玩家行为不变。

## 固定发布合同

未来正式证明固定绑定：

- 目录 `pet_fusion_recipes_v2` 及其文件 SHA-256；
- `emberhorn_solar_crown_fusion_v1` 与 `emberhorn_moss_rampart_fusion_v1` 两条正式配方，顺序和目标形态均不可漂移；
- Phase 372 已批准但明确保持 runtime 关闭的两套非骑乘身体视觉决定；
- 两只融合宠各自的 runtime metadata、180 帧双视角战斗 bundle digest、40 帧独立八方向世界动作；
- 两张专用大头照的完整 metadata SHA、runtime PNG SHA 和抠图 eligibility mask SHA；
- 大头照只能采用同次操作的精确 eligibility mask 做 despill，禁止全图颜色修正、mask 外改色或 alpha 改写；
- 项目所有者对“大头照、融合信息布局、正常玩家入口、正式运行开放”四个范围的独立批准；
- 关闭态资源复验、三宠权威原子事务、幂等／断线／冲突／回滚、真实 Main 入口与性能四类通过证据；
- 首发两只融合结果继续不可骑乘。

attestation 未来只允许位于：

```text
client/godot/data/pet_fusion_runtime_release_attestation_v1.json
```

没有环境变量、命令行参数或生产配置可以跳过该证明。

## 测试隔离

既有权威事务测试需要一个开启目录。测试通道必须同时满足：

1. 调用者显式设置 `allowUnattestedRuntimeForTests=true`；
2. 目录允许 test-only recipe；
3. `catalogPath` 必须以 `test://` 开头。

构造结果带有 `testOnly=true / status=test_only_unattested` 标记；domain 只在目录路径仍为 `test://` 时接受这个标记。把相同开关用于普通文件路径会直接报错，不能成为生产后门。

## 双层失败关闭

第一层在 `createPetFusionRecipeCatalog`：开启目录先完成原有配方、正式资源和不可骑乘检查，再验证正式发布证明。证明缺失、SHA 漂移、目录不一致、所有者范围不完整、画像或身体生命周期未批准、验证证据不全，均使目录构造失败。

第二层在 `pet-fusion-domain`：开启目录必须携带构造器返回的正式证明，或严格隔离的 `test://` 标记。直接注入一个只有 `runtimeEnabled=true` 的对象不会进入报价、随机权威或档案写入。

## 验证

本阶段完成时通过：

- `node --check`：发布证明、融合目录、融合 domain 与新增测试语法均通过；
- 发布证明／目录定向测试：`45/45`；
- 融合 domain、HTTP、durable commit、关闭态回放组合：`32/32`；
- 发布证明测试覆盖正常加载，以及 attestation SHA、所有者批准范围、画像精确 mask、runtime 目录和宠物 bundle 生命周期五类漂移；
- 目录测试覆盖生产缺证明失败、`test://` 显式测试标记和普通路径拒绝绕过；
- domain 测试覆盖直接注入外形完整但未经构造器验证的伪证明时，在报价阶段失败关闭。

完整 `npm --prefix server/node test` 也已执行，但当前仓库基线在与融合无关的旧组中存在失败，不能记作本阶段通过证据。失败横跨 demo seed、profile migration、runtime hot collections、战斗随机时序及真实 MySQL 竞争组；其中 `profile-migration-batch-ops.test.js` 不引用 auth service 或任何融合模块，单文件串行复跑仍为 `2/8`，足以排除本切片新增目录字段导致该组失败。本阶段以全部融合测试、直接交叉域测试与静态／Godot 门禁作为提交依据，不冒充完整服务端套件全绿。

## 后续

正式开放仍须依次完成：

1. 项目所有者明确批准或拒绝 Phase 407 成片中的两张专用大头照和信息布局；
2. 接入正常玩家入口，但继续保持生产目录关闭；
3. 完成真实三宠事务、幂等重试、断线恢复、冲突和回滚验收；
4. 录制正常玩家真实 Main 1280×720 交互与移动前后性能证据；
5. 生成独立 owner runtime decision 和正式 attestation，最后一次原子打开目录、资源与玩家入口。
