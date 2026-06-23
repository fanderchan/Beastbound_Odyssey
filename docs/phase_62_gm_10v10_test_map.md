# Phase62：GM 10v10 完整客户端测试地图

本阶段把 10v10 测试从局部战斗预览改成完整客户端地图。

## 设计

- 新增地图 `GM练级测试场`。
- 启动参数 `--gm-10v10-map` 只改变出生地图，不隐藏任何已有系统。
- 推荐和 `--full-client-preview` 一起使用，语义是“完整客户端 + GM测试出生点”。
- GM 草丛 `encounterRate = 1.0`，并声明 `enemyCount = 10`。
- 遇敌仍走自然遇敌、伙伴、内挂、背包、宠物和战斗结算的完整链路。
- 我方人数不自动补满；需要用动作栏 `伙伴` 加陪练伙伴，最多形成 5 人 5 宠。

## 手工测试

```sh
godot --path client/godot --scene res://scenes/Main.tscn -- --full-client-preview --gm-10v10-map
```

建议路径：

1. 确认左上地图名是 `GM练级测试场`。
2. 点动作栏 `伙伴`，加满 4 个陪练伙伴。
3. 在草丛走动或点 `挂机`。
4. 进入战斗后敌方应固定 10 只。
5. 点战斗里的 `自动`，观察完整 10v10 练级、合击和停止按钮。

## 自动测试

```sh
godot --headless --path client/godot --scene res://scenes/Main.tscn --quit-after 1800 -- --auto-gm-10v10-map-check
```

覆盖：

- GM 地图能加载。
- 出生点在 GM 草丛内。
- 草丛配置为 100% 遇敌、固定 10 个敌人。
- 不加陪练时，完整遇敌链路生成 2v10。
- 加满 4 个陪练后，完整遇敌链路生成 10v10。
