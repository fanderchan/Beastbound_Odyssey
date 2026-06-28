# Phase140：地图 / 副本结构正式化

本阶段把已有村庄、野外、洞穴、玄影洞窟和 GM 地图从“可运行测试地图”收拢为正式区域契约。目标是让任务、自动寻路、怪物分布、掉落、数值策划都能引用同一套稳定地图结构。

## 区域契约

`client/godot/data/map_regions.json` 现在为每个区域声明：

- `id` / `label` / `type`：区域身份。
- `mapIds`：区域包含的地图。
- `entryMapId`：区域入口地图。
- `levelRange`：区域推荐或预期等级范围。
- `safeReturn`：离开副本或测试区时回到的地图与出生点。
- `sharedMapIds`：允许被多个区域共享的地图，例如 `firebud_village_gate` 同时承担村口和村外草丛。

## 村庄

`firebud_village` 保留正式设施列表：

- 村医
- 杂货铺
- 装备铺
- 兽栏
- 记录点
- 转生导师

记录点继续使用 `recordPoint`，不使用“复活点”文案。

## 洞穴和副本

四大洞穴使用 `subDungeons` 拆成四个子副本：

- 岩脉洞穴
- 潮回洞穴
- 焰心洞穴
- 岚息洞穴

每个子副本声明：

- `floorOrder`
- `entryMapId`
- `bossMapId`
- `guardianInteractionId`
- `encounterGroupId`
- `rewardItemId`
- `recommendedLevelRange`

玄影洞窟声明完整 `floorOrder`、`captureMapIds`、`bossMapId` 和 `safeReturn`。后续数值策划可按楼层稳定配置怪物等级、捕捉目标和掉落。

## 校验

`MapRegionCatalog.validation_errors()` 会检查：

- 区域 ID、类型、标签。
- `entryMapId` 是否属于区域。
- 地图重复是否声明 `sharedMapIds`。
- 村庄是否包含基础设施。
- 洞穴是否声明 `bossMode`、`bossMapId`、楼层顺序。
- 子副本楼层、入口、Boss 层、守护兽、遇敌组、推荐等级。
- `safeReturn` 是否指向已知地图。

## 自测

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 2600 -- --auto-map-region-contract-check
```

这个自测会同时检查区域契约和转生试炼地图契约。
