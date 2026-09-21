# Phase614：单包地图提升预检与历史目录审计修复

日期：2026-09-22。在等待 R1.W029 外观结论时，预检 R1.10 的启用工具，复现并修复两处工程阻断。新版洞穴的像素、摆放、玩法数据、正式目录和待验收状态均未改变。

## 问题与处理

`promote_map_visual_release.py` 原先要求 review 目录恰好等于 primary 加本次地图。当前 review 还保留两张 Firebud 候选，因此单独准备岩脉四层时报 `missing=[] extra=['firebud_training_yard', 'firebud_village_gate']`，无法继续。工具现只取选中 bundle 的地图与原 primary 地图；其他 review-only 项保留在原评审目录。已有 primary 项缺失或被无关修改、目标路径不匹配、选中 bundle 被挂到未声明 mapId、准备后目录发生变化仍会拒绝。

第二处是 Python auditor 未同步 [Phase540](phase_540_production_release_r1_w021_map_catalog_and_eight_direction_baseline.md) 已建立的 Godot 行为：冻结报告的 `catalogSha256` 是采集时全目录的历史身份，不能因无关地图增删而失效。修复前，当前正式 `mistcap_marsh_visual_v1` 仅因此一项失败；不是素材或权威地图变化。

Python 现保留历史 SHA 的格式校验，并继续逐项验证当前目标的目录成员、manifest 路径、binding 字节、权威地图字节和冻结报告自身哈希。没有重写旧报告、接受记录或发布证明。生产合同与 schema 说明同步补齐这一边界。

## 验证

- 新回归先在旧实现上复现失败，修复后工具／原子回滚套件 **13/13**、独立审计套件 **51/51**。覆盖新加入／替换地图、其他候选保留、越界别名、无关目录变动，以及目标成员／manifest／binding／地图数据／重复项／非法历史 SHA 的拒绝。
- 当前真实目录只读预检：拟新增四层 `earth_vein_cave*`，删除 0、修改既有项 0；Firebud 两张候选不进入拟启用目录。原 manifest 和两份目录字节不变，没有执行真实 `--dry-run`／`--apply` 或生成所有者文件。
- 新洞穴独立审计 **166 files / 51 PNG / 29 JSON / errors=[]**，`releaseReady=false`，仍缺所有者接受、发布证明、正式启用。原正式雾冠地图审计 **37 files / 14 PNG / 13 JSON / errors=[] / releaseReady=true**；其制品字节未改。
- 隔离 Godot 解析、严格地图运行检查和镜头策略检查 **3/3 PASS**。QA lane 已清理，真实玩家目录摘要前后一致，进程全部正常收尾。
- 本次只改工具、工具测试及文档；客户端脚本、资源与数据的 Git diff 为空。运行内容摘要仍为 `beastbound-map-runtime-surface-v2:28dbd813cd8e1c24165fcefc1f299970dedd02a6715253b9b4446e057f54a43d`，Phase611 影片与 Phase613 性能继续对应当前内容。没有重复测量帧率或运行无关全量 CI。

只读预检、拟启用目录与两个审计结果保存在 `.run/phase614-map-promotion-preflight/`。Godot 摘要为 `.run/godot_auto_checks/phase614-catalog-preflight/2026-09-21T18-13-18-886Z_summary.json`。

```sh
python3 -B -m unittest tools.test.test_map_visual_release_tools
python3 -B .agents/skills/design-beastbound-maps/tests/test_audit_map_bundle.py
node tools/run_godot_auto_checks.mjs --only=--auto-map-visual-runtime-check,--auto-world-presentation-profile-check --fail-fast --output-dir .run/godot_auto_checks/phase614-catalog-preflight --timeout-ms 120000
node tools/repository_guide.mjs refresh
node tools/repository_guide.mjs check
git diff --check
```

## 后续边界

W029 仍等待老板采用、继续返工或延期的决定。本次只读目录准备不是正式提升，也没有执行最终 released 候选审计。若老板接受，R1.10 仍须调用正式提升工具，同步严格 runtime canary 的地图清单，验证 primary／pre-export 与普通 Main 的实际贴图、人物比例和交互；不能拿 preview 的成功代替普通启动验证。全游戏发布与 P2.1a 仍未完成。
