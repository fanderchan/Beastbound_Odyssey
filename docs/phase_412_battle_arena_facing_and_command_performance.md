# Phase 412：原创战斗环境候选、双方相向与指令热路径收口

## 结论

本阶段把 Phase 411 认定为最高视觉短板的灰色 10v10 工程场替换为可审的原创战场候选，同时没有越过
项目所有者审批：`苔光草甸` 只允许显式 QA 审片，普通玩家、正式运行态和发布态全部保持关闭。真实
1280×720 Main 成片已验证 20 名正式人物／宠物、十指令、目标切换与 HUD 安全区。

项目所有者连续指出双方人物朝向后，最终规则以实际像素语义为准，不再假定前、背两套源图具有对称
方向：左上敌方使用原始正面斜视并保持朝右下；右下我方使用背面斜视并单独水平翻转朝左上。双方人物
现在与各自宠物同向并朝向战场中心。世界地图的真八方向独立源图仍禁止运行时镜像；这里只允许战斗棋盘
展示层对我方背视角做一次明确变换。

审片时同时复现了战斗指令同步在重复点击和人物／宠物回合切换中做整套 HUD 重排、档案归一化和重复
样式构造的问题。本阶段把这些工作改为状态签名、脏缓存和有限样式资源，行为与玩家文字不变。

## 原创战场候选与生命周期

`BattleArenaVisualCatalog` 对四张既有审片候选补齐精确 SHA-256 和 1280×720 校验；本阶段只把
`moss_meadow` 暴露给 Phase 412 的显式录像／性能入口：

| 字段 | 固定值 |
| --- | --- |
| 候选 | `moss_meadow`／苔光草甸 |
| bundle | `battle_review_arenas_v1` |
| 来源地图语义 | `firebud_village_gate` |
| PNG SHA-256 | `215210ead48013359fe16cf0d4043811d4ef86d160cbedcdc08c1f11c0effa69` |
| `ownerReviewStatus` | `pending` |
| `runtimeEnabled` | `false` |
| `releaseApproved` | `false` |
| `ordinaryPlayerEnabled` | `false` |
| QA 暴露 | 仅 `--phase403-battle-layout-owner-review-capture` 的显式 Main 审片路径 |

普通战斗状态即使伪造同名字段，也拿不到贴图、可读性遮罩或证据元数据；贴图哈希、尺寸、显式入口与
关闭态任一漂移都会让自动检查和证据工具失败。候选没有烘入人物，也没有复制 StoneAge 地图或资产；
参考项目只用于成熟战斗信息层级判断。

## 双方人物朝向合同

正式人物的战斗前／背视角是独立制作的源图，但两套源图的水平语义并不对称：

- 敌方：`front_3quarter_sw` 的实际人物朝向已经是棋盘右下，因此保持 `flip_h=false`；
- 我方：`back_3quarter_ne` 在当前棋盘需要翻转后才朝左上，因此固定 `flip_h=true`；
- 未知阵营：失败关闭，不进行展示翻转；
- 世界八方向：继续要求每个方向都有独立源图，禁止把一个世界方向镜像成另一个方向。

`CharacterActionAssetCatalog` 是唯一映射来源；Main 绘制、人物运行时检查和战斗审片控制器共同验证
同一规则，防止以后再次把双方统一翻转，出现“修好一边、翻坏另一边”。

## 指令与 HUD 热路径

本阶段没有改变战斗规则、按钮含义或服务器权威边界，只消除重复表现工作：

- 觉醒指令宿主拥有固定 viewport 布局时，人物／宠物 owner 切换不再调用整套 `_layout_hud()`；
- 指令视图用 owner、可见／排序 ID、自动状态、宠物技能子菜单与尺寸组成签名；相同状态只同步启用态，
  不重复隐藏、摆放和重建控件；
- 自动战斗策略的设置与选项只在档案变更或战斗开始后重建一次；重复按钮同步不再做完整 profile
  normalize、装备和宠技扫描；
- 徽章只缓存 `normal`、`danger`、`disabled` 三类样式资源，文字、图标和 modulate 只在值变化时写入；
- 悬停人物／宠物时只更新被动说明可见性与文本，不再重排整个 HUD；
- 回归检查用真实跨帧左键验证人物→宠物→人物链，并断言相同状态零额外布局、零额外自动档案重建。

## 视觉判断

苔光草甸相比 Phase 411 的灰色工程场已经有明确前／中／后景和边缘植被，中央黄绿色留白能承载 20
个单位，人物、宠物、血条和目标信息仍然清楚；这是可继续审的方向。它现在仍不是最终发布美术：同一
人物和宠物十连复制感明显，中央草地纹理节奏略均匀，战斗 HUD 的圆形按钮体系也偏工具化。正确处理是
保持候选关闭，后续分别做阵容差异、地表节奏和 HUD 降噪，而不是靠再叠装饰遮住单位。

## 真实画面证据

最终相向版本位于：

```text
.run/evidence/phase412_battle_arena_owner_review/
  phase412-battle-arena-moss-owner-review-v5/
```

录像为 1280×720、30 FPS、1×、13.533 秒、H.264/AAC，完整解码通过；10 帧接触表覆盖人物／宠物
行动和目标切换。证据仍标记 `ownerReviewStatus=pending`，未生成发布批准。

| 证据 | SHA-256 |
| --- | --- |
| 1× MP4 | `fe7132d1cb415007d75ef67403d56869887bdb34e58c75d1be3fe94f6fafa532` |
| 接触表 | `81bdbcf9c1f7802dee8145cf79c8a1f1f6daae84b36a15705e5a9fc18f095a82` |
| `summary.json` | `dc6938c5d0471014ffe84cda75f6d0cd5ec867961ab75892c38eecc8cad9d83e` |
| `SHA256SUMS` | `6bd07e4fee77570338a295d4e82d69bac4e566920bf89f39b78f73b0e3690eb4` |

录像使用隔离 `automation` QA lane，不启动后端、不访问 MySQL、不允许 profile 保存；结束后 lane 已清理，
真实玩家目录 inventory SHA-256 前后一致。

## 性能证据

严格通过的真实 Main 报告为：

```text
.run/evidence/phase412_battle_arena_performance/
  phase412-battle-arena-moss-perf-v18/
```

| 状态 | 最低／raw FPS | raw 帧间隔 P95 | `process_total` P95 | `draw_battle` P95 |
| --- | ---: | ---: | ---: | ---: |
| idle | 60.0／59.981 | 16.963 ms | 0.07 ms | 4.54 ms |
| command selection | 59.5／59.715 | 17.125 ms | 0.09 ms | 4.43 ms |
| target switch | 60.0／60.003 | 18.246 ms | 0.08 ms | 4.48 ms |

报告在 macOS／Metal Mobile／VSync／60 FPS／1280×720 前台窗口运行，完成 25 次真实跨帧左键、8 次
相邻目标切换、8 次撤回与再次攻击，精确命中 8/8，HUD passthrough 为 0。报告 `summary.json` SHA-256
为 `daf64015e0b21a58ea50b3e2762b96221c6e08ed3bdb8a951521a97f51a9c6bb`，`SHA256SUMS` 为
`d8e7dbac579722930779164b9a928c24e6520e41f00a85a70e8b47a98738d0b5`。

朝向最终修正后的 v16/v17 也完整跑完 24 次目标循环点击、8/8 精确目标和三段逐帧采样，但结束快照时
macOS 前台已经切回微信，严格环境门禁正确拒绝了两份报告；失败证据保留且没有改写为通过。v18 对
精确 Godot 测试进程做一次原生前台激活后，从开始到结束均由运行时快照证明处于前台，原阈值、原解析
和原失败规则未修改，因此 v18 才是本阶段最终权威报告。

## 验证

- `git diff --check`：通过；
- `godot --headless --path client/godot --quit`：Godot 4.7 解析通过；
- `--auto-character-runtime-appearance-check`：连同 parse `2/2`，我方翻转、敌方不翻转、未知阵营关闭；
- `--auto-battle-command-awakened-ui-check`：连同 parse `2/2`，真实人物／宠物指令链和缓存／布局断言通过；
- 战斗录像／性能 Python 定向单测：`25/25`；
- 三个录像／性能源码合同与宠物管理审图 digest：通过；
- 最终 v5 录像：`status=passed`、20 actor、零 HUD collision／passthrough、QA lane 清理和真实档案未变；
- v18 性能：全部 21 项帧率、帧间隔、process 和 draw 门禁通过，25 次真实点击、8/8 目标命中。

## 未越界事项

本阶段没有启用待审战场、没有把候选标记为发布批准、没有连接服务端或数据库、没有写真实玩家档案，
也没有暂存工作区内正在整理的宠物／骑宠资产。项目所有者若继续批准战场方向，仍需单独决定是否冻结
苔光草甸；批准前普通玩家继续使用现有正式战斗背景路径。
