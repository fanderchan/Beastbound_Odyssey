# Phase 321：蓝人龙与整体骑乘世界真八向样板

日期：2026-07-19

## 本阶段结论

蓝人龙作为 Phase 320 后第一只完整扩产样板，现已完成两套彼此独立的世界动作包：

- 蓝人龙宠物本体：八方向各 `idle 1 + walk 4`，共 40 张 256px 运行帧和 40 张 512px 透明源帧；
- 见习猎人骑蓝人龙：八方向各 `idle 1 + walk 4`，共 40 张 256px 运行帧和 40 张 512px 透明源帧；
- 方向固定为 `south / southwest / west / northwest / north / northeast / east / southeast`，没有运行时镜像；
- 骑乘的每一帧都是人物与宠物一次生成的完整主体，不使用人物层、宠物层、鞍位或遮挡层拼贴。

本阶段只完成世界 `idle/walk` 样板，不把关键姿势或正在生产的战斗动作冒充成完整宠物资产。两套 metadata 均保持 `runtimeEnabled=false`、`ownerReviewStatus=pending`，不会因工程自评通过而直接进入普通玩家运行路径。

## 原创与生产合同

蓝人龙身份延续 Phase 320 的原创身份锁：钴蓝鳞片、浅青鳍膜、浅色分节腹甲、深蓝背棘、单尾和幼年直立双足体型。StoneAge 8.0 只用于验证成熟 2.5D 网游中的八向可读性、地面锚点和骑乘构图目标，没有复制其宠物、人物、动作或贴图。

宠物本体八向待机与每方向四相步行均独立生成；整体骑乘则按人物、宠物、坐姿、接触、缰绳和前后遮挡作为一个主体生成。原图以像素无损 WebP 归档，保存逐字提示、原图哈希、解码像素哈希、处理参数、512px 源帧和 256px 运行帧。

## 比例与动作自审

骑乘原始帧在同一 160px QA 画布上的可见高度只有 113～128px，低于徒步人物 147px 基线，因此没有直接视为通过。按本组合单独校准 `1.22252×` 后，八方向可见高度为 138～157px；该倍率只登记在蓝人龙骑乘包的 QA 建议中，尚未修改共享世界或战斗比例。战斗比例继续与地图比例分离。

宠物本体 40 张运行帧全部唯一，八个待机方向也全部唯一；每方向四相步态的落地基线漂移为 0px、中心漂移为 0～1px。整体骑乘 40 张运行帧同样全部唯一，方向对不存在像素镜像；人物与蓝人龙始终同向，骨盆落在低鞍位，手、靴、缰绳和前后遮挡连续。

当前残余视觉风险：

- 宠物本体部分侧后方向由待机切到行走时，尾部外轮廓会有轻微变化；
- 整体骑乘东南向步行的轮廓中心漂移最大为 23px，虽然落地基线为 0px，仍需在真实地图速度下确认是否产生横向晃动；
- 160px 联系表和同步 GIF 只能证明动作资产本身，不能替代真实地图阴影、移动速度和玩家审美验收。

## 非作者交叉审查

两名未参与对应世界包制作的 agent 已完成只读交叉审查，结论均为自审通过、主人验收待定：

- 宠物本体：八个方向与命名一致，40 张运行帧全部唯一，没有镜像冒充；四相步态、落地基线和蓝鳞/青鳍/浅色腹甲身份稳定。真实地图 MP4 需重点观察北、北西方向在 160px 下脚步对比偏弱，以及切换方向瞬间的连贯性；
- 整体骑乘：人物与蓝人龙同轴，八方向独立，座位、比例、手脚接触和四相步态达到样板门槛。真实地图 MP4 需重点观察东南向水平漂移、东西侧骑手上身略僵，以及缰绳和靴部的轻微接触跳动。

以上结论只关闭生产自审门槛，不替代真实 Godot 场景与玩家审美验收，因此两套资产继续保持 `owner_review_pending`。

## 证据

宠物本体：

- `.run/art_batch_phase320/blue_man_dragon/world-production/evidence-v1/blue-man-dragon-world-idle-walk-source-512.png`
- `.run/art_batch_phase320/blue_man_dragon/world-production/evidence-v1/blue-man-dragon-world-idle-walk-map-160.png`
- `.run/art_batch_phase320/blue_man_dragon/world-production/evidence-v1/blue-man-dragon-world-walk-true8-160.gif`
- `.run/art_batch_phase320/blue_man_dragon/world-production/evidence-v1/blue-man-dragon-world-qc-summary.json`

整体骑乘：

- `client/godot/assets/mounted/novice_hunter_v1/blue_man_dragon_water10/qa/world/true8-world-contact-8x5.png`
- `client/godot/assets/mounted/novice_hunter_v1/blue_man_dragon_water10/qa/world/true8-mounted-world-cycle.gif`
- `client/godot/assets/mounted/novice_hunter_v1/blue_man_dragon_water10/qa/world/map-160px-proportion-calibrated.png`
- `client/godot/assets/mounted/novice_hunter_v1/blue_man_dragon_water10/qa/world/world-qc.json`

## 验证与后续门槛

本阶段提交前已通过：PNG/JSON/metadata 静态审计、30 项 Python 管线回归、Godot parse、宠物资产定向门禁，以及两名非作者 agent 的方向交叉审查。世界包通过后仍只算样板的一半；蓝人龙双战斗视角 12 动作、整体骑乘战斗动作、真实 Godot 地图预览和 10V10 动作导演 MP4 完成前，P2.2b 保持未完成。
