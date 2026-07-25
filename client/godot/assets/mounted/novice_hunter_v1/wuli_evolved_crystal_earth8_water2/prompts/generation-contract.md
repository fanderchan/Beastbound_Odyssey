# 见习猎人骑晶甲乌力关键姿势生成合同 v1

Built-in image generation prompt used verbatim:

```text
Use case: stylized-concept
Asset type: production mounted-character key-pose board for a high-definition 2.5D turn-based pet MMORPG

Input images:
- Image 1 is the exact 晶甲乌力 identity reference. Preserve this exact evolved mount: mature broad low boar-armadillo chassis, deep warm-umber coat, mineral-cream muzzle and belly, aqua eyes, short pig muzzle, exactly two cream tusks, exactly two triangular ears, four powerful legs with exactly three dark granite claws per foot, one large faceted smoky-quartz brow shield, paired massive translucent quartz shoulder bastions, layered smoky-quartz dorsal shell plates with restrained aqua internal veins and inclusions, one curled tail with one polished crystal bud. No extra horns, spikes or floating crystal.
- Image 2 is the exact 见习猎人 identity reference. Preserve the same normal adult male human face and body proportions, warm brown skin, dark chestnut hair, bone-and-leaf hairpin, ochre sleeveless fur-trimmed tunic, dark teal cross-body strap and pouch, red sash, wrist wraps, bare arms and brown fur-trimmed boots.

Primary request: Create two integrated whole-frame images of the exact same adult 见习猎人 riding the exact same 晶甲乌力. Each panel must be newly generated as one coherent rider-plus-mount illustration. Never paste, composite, mask or layer a separate character image over a pet image.

Composition and layout: one landscape two-pose board on a perfectly flat solid #FF00FF chroma-key background, two equal invisible side-by-side cells, no visible divider, grid, label, text, floor, shadow or scenery. Left cell: front_3quarter_sw, rider and 晶甲乌力 both facing lower-left. Right cell: back_3quarter_ne, rider and 晶甲乌力 both facing upper-right. Both complete integrated subjects use the same scale and stable mount-foot baseline. Keep at least 8% clean flat-magenta margin on all sides of each cell.

Adult scale and mount enlargement: the hunter must keep the same believable adult proportions and visual person scale as the on-foot reference, including normal head-to-body ratio and full-size hands and boots. Never shrink him into a child, doll or mascot. Enlarge 晶甲乌力 into a credible massive bison-sized evolved guardian while preserving its low four-legged silhouette and crystal architecture. The mount grows to carry the adult; the adult does not shrink.

Integrated crystal-safe seat anatomy: preserve the faceted brow shield, both shoulder bastions and layered dorsal shell. Directly behind the paired shoulder bastions and before the tallest dorsal plate, form one believable low central inter-plate valley without deleting any major crystal structure. Place one thin plain dark-brown hide pad entirely inside this valley and one restrained low leather grip; no high saddle, metal armor, decoration or paid-looking equipment. The rider pelvis is seated and weight-bearing in the valley. His thighs pass outside the central seat but inside/behind the shoulder bastions, contacting fur below the safe blunt crystal rims; no crystal may pierce, overlap through or replace the rider’s pelvis, torso, arms, thighs or boots. Both boots remain complete and clear of forelegs and shoulder crystals. Hands hold the low grip; torso aligns slightly forward. The massive shoulders frame the rider without swallowing him.

Style/medium: original high-definition hand-painted 2.5D game sprite, modern-HD nostalgic East Asian pet-RPG spirit, orthographic/isometric sprite camera, crisp silhouette at game scale, soft fur, semi-translucent smoky quartz with restrained aqua interior depth, subtle dark plum-brown outline, identical lighting and rendering quality in both cells.

Identity invariants: same rider face, adult scale, clothing, hairpin and limb anatomy in both panels; same 晶甲乌力 brow shield, paired shoulder bastions, dorsal crystal architecture, two tusks, two ears, four three-clawed legs, low body and crystal-bud tail in both panels. Far limbs may be naturally occluded but not deleted. The rider must not hide the evolved silhouette.

Avoid: separate-layer collage, pasted seams, floating or tiny rider, child proportions, opposite-facing rider, rider impaled by crystal, shoulder crystal through thighs, rider sitting on brow shield, high throne saddle, ornate premium tack, missing shoulder bastion, changed crystal topology, giant razor spikes, extra horn/limb, transparent glass body, huge aqua FX, famous-game resemblance, gradient or textured background, watermark.
```

Reference roles:

- Image 1: exact 晶甲乌力 mount identity.
- Image 2: exact 见习猎人 rider identity and adult scale.

Production route: built-in `image_gen`, integrated whole-frame generation, no layer composition.

## 正式骑乘战斗动作合同 v1

项目所有者于 2026-07-25 确认当前晶甲乌力外形适合作为坐骑；该确认冻结上面的成人比例、落座位置、晶甲结构与两侧朝向，只授权继续生产，完整成片仍为 `owner_review_pending`。

### 固定生产矩阵

| 动作 | 帧数 | FPS | 循环 | 语义 |
| --- | ---: | ---: | --- | --- |
| `idle` | 6 | 8 | 是 | 低幅呼吸和承重变化，骑手骨盆始终贴合坐槽。 |
| `walk` | 8 | 10 | 是 | 厚重四足步态，骑手随背部节奏起伏，不上下漂浮。 |
| `attack` | 8 | 12 | 否 | 晶甲乌力前压冲撞/獠牙顶击后归位，骑手伏身抓稳。 |
| `skill` | 8 | 12 | 否 | 额晶盾与肩堡聚起受控水蓝脉光并向前释放石化震脉，主体轮廓不被特效吞没。 |
| `hurt` | 6 | 12 | 否 | 短促后缩受击，骑手收紧腿和握把，不离鞍。 |
| `defend` | 6 | 10 | 否 | 低头让额晶盾、肩堡形成前向防线，骑手压低重心。 |
| `dodge` | 8 | 12 | 否 | 明确向后侧移半步后回到原位；不是闪现，四足与骑手都要有可读位移。 |
| `counter` | 8 | 12 | 否 | 承受后立即以肩堡/獠牙短促反顶，再完整归位。 |
| `stagger` | 8 | 10 | 否 | 失衡、压低、重新站稳；不得误读成倒地或击飞。 |
| `knockaway` | 8 | 12 | 否 | 整体被横向抛离并重落地，骑手和坐骑始终保持一个完整主体。 |
| `down` | 8 | 10 | 否 | 从清醒站立单调进入稳定侧卧/伏倒，最后一帧保持倒地。 |
| `revive` | 8 | 10 | 否 | 第一帧与 `down-8` 完全相同，从倒地单调复起并恢复清醒站立。 |

每个动作、每个视角单独调用一次内置 `image_gen`：6 帧使用 `2×3`，8 帧使用 `2×4`；所有格子必须是精确纯色 `#FF00FF`、按行优先排列、留足安全边距。确定性后处理只允许色键、切格、整体共同比例、脚底锚定、透明清理和 512→256 派生。

### 两侧朝向与身份不变量

- `front_3quarter_sw`：人宠共同朝左下；`back_3quarter_ne`：人宠共同朝右上。两侧独立生成，禁止离线或运行时镜像。
- 成人见习猎人的脸型、发饰、赭黄毛边衣、青色斜挎带、红腰带、腕带和靴子在全部 180 帧保持一致。
- 晶甲乌力必须一直保留短猪鼻、两枚獠牙、两耳、四足三爪、额部晶盾、成对肩堡、层叠烟晶背甲、克制的水蓝脉络和卷尾晶芽。
- 人物不得缩小、浮空、离鞍或被晶体穿过；不得把肩堡删掉来迁就动作，也不得增加高鞍、付费鞍具或额外晶角。
- 技能特效只能附着在额晶盾/地面释放方向，不得成为独立角色、遮盖人物或烘焙状态光环。
- 正式安装前必须通过完整 180 帧、重复帧、边缘、洋红残留、透明 RGB、源/运行时确定性和 `down-8 == revive-1` 门禁；安装后仍保持 `runtimeEnabled=false` 与 `ownerReviewStatus=pending`，直到真实 1× 成片获项目所有者确认。
