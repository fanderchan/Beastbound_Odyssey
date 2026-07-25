Use case: stylized-concept
Asset type: production integrated mounted key-pose board for a 2.5D pet MMORPG
Input images: Image 1 is the exact approved 月岚风狐 identity board; Image 2 is the exact approved novice_hunter_v1 adult character identity.
Primary request: Create two newly illustrated whole-subject images of the exact adult novice hunter riding the exact same 月岚风狐. Generate rider, fox, seat contact, hands, legs, grip and occlusion together as one coherent picture per cell. Never paste, layer, mask, mirror, patch, or composite a separate character PNG over the fox.

Board contract: strict landscape 1-row by 2-column board on a perfectly flat solid #FF00FF background. Left cell `front_3quarter_sw`: fox head on screen-left, both tails trail screen-right, both fox and rider face and travel lower-left toward the viewer. Right cell `back_3quarter_ne`: fox head unmistakably on screen-right, both tails trail screen-left, both fox and rider face and travel upper-right away from the viewer. Same integrated scale and feet baseline, generous padding, all ears, ear vanes, both tails, paws, hands and boots inside their cell. No labels, divider, border, shadow or grid.

Exact 月岚风狐 identity: advanced adult evolution of the wind-fox lineage with a substantially deeper chest, longer broad rideable back, stable shoulders and hips, four long weight-bearing legs, mature narrow fox muzzle, large deep-teal eyes and thick moon-white neck mane. Long ears sweep upward and backward; each ear has exactly two mist-fin-shaped fur vanes, which are attached fur and never wings. Pearl silver-white main coat with moon-blue-gray shading; dark teal to mist-teal ear tips, lower legs and tail tips; restrained pale-cyan crescent forehead mark and two long crescent wind marks on each visible body side.

Tail hard gate: exactly two and only two large physical fur tails from the same hindquarter region. One upper tail curves upward and backward; one lower tail curls below it. Their two separate roots, two tail bodies and two tips remain traceable, with a clearly open crescent-shaped negative space between them. Never merge them into one tail, add a third or ninth tail, hide one behind the rider, or let either tail pass through the rider, legs, back or body. Mist-gale fur-flow fins may remain attached along neck, shoulder-back and tails, but they cannot become wings, floating ribbons or detached magic.

Rider identity and scale: preserve the exact adult novice hunter from Image 2, same adult head/body ratio and face, brown hair with bone-leaf pin, ochre sleeveless fur-trimmed tunic, dark teal cross-body strap and pouch, red sash, wrist wraps, bare arms and two complete brown fur-trimmed boots. The evolved fox is a large adult long-backed mount, visibly larger and more mature than both ordinary wind fox forms. The adult rider remains visually substantial and must never become a child, chibi, doll, mascot or mini rider.

Seat and contact: place the rider low just behind the stable shoulders on the clear central long-back channel, never on the neck, ear vanes, attached fur-flow fins or tails. Pelvis visibly rests into compressed back fur; thighs straddle the ribcage, knees bend naturally, and both complete boots hang on opposite sides with plausible near/far occlusion. Both hands hold one short plain hide grip near the shoulder base. No decorative saddle or bridle. Keep the neck/shoulder fur-flow fins outside the rider contact channel and never pierce or wrap them through the hunter. No floating pelvis, standing pose, pasted waist, missing or duplicated limb, merged boot, leg through torso, opposite-facing rider, tail-body intersection or wing.

Style: original collectible high-definition hand-painted 2.5D game sprite; clean at 130-175px; layered pearl fur, crisp mature silhouette, dark plum-blue outline, restrained moon-cyan accents, nostalgic Chinese pet-RPG warmth with modern HD polish, orthographic/isometric sprite camera and coherent soft light matching the references.

Avoid: glow haze that hides anatomy, shadow, ground, scenery, dust, motion trail, detached effect, text, logo, watermark, weapon, armor, saddle, background gradient or texture; no copied famous multi-tail fox or third-party character.

## 正式骑乘战斗动作合同 v1

项目所有者于 2026-07-26 认可月岚风狐世界真八方向成片并授权继续；该决定只冻结上面的成年骑手比例、双尾身份、落座关系与两侧朝向，不代表本次 180 帧骑乘战斗成片已经通过 owner 终审。

### 固定生产矩阵

| 动作 | 帧数 | FPS | 循环 | 语义 |
| --- | ---: | ---: | --- | --- |
| `idle` | 6 | 8 | 是 | 双尾低幅摆动、四足承重和骑手呼吸同步，落座关系不漂移。 |
| `walk` | 8 | 10 | 是 | 轻快四足步态，骑手随背部节奏起伏，两条尾巴始终可分别追踪。 |
| `attack` | 8 | 12 | 否 | 月岚风狐前压扑击后归位，骑手伏身抓稳，不与宠物分层错位。 |
| `skill` | 8 | 12 | 否 | 身体与双尾完成受控的新月风旋，不烘焙脱离主体的大型特效。 |
| `hurt` | 6 | 12 | 否 | 人宠整体明显后缩受击，骑手收紧腿和握把，不离鞍。 |
| `defend` | 6 | 10 | 否 | 四足压低并稳住前身，骑手同步降低重心，不能误读为待机。 |
| `dodge` | 8 | 12 | 否 | 明确后撤/侧移半步后回位，不闪现，也不退化为通用受击。 |
| `counter` | 8 | 12 | 否 | 回避或承压后立刻以前爪和肩部短促反扑，再完整归位。 |
| `stagger` | 8 | 10 | 否 | 整个人骑宠主体失衡、压低、重新站稳，区别于倒地和击飞。 |
| `knockaway` | 8 | 12 | 否 | 人骑宠作为一个主体被横向抛离并重落地，末帧不错误恢复待机。 |
| `down` | 8 | 10 | 否 | 从清醒站立单调进入稳定侧卧/伏倒，最后一帧持续倒地。 |
| `revive` | 8 | 10 | 否 | 第一帧与 `down-8` 完全相同，从倒地连续复起并恢复站立。 |

每个动作、每个视角使用一次 OpenAI 内置 `image_gen`：6 帧为 `2×3`，8 帧为 `2×4`；全部候选均使用纯色 `#FF00FF` 背景与逐动作原始提示词。确定性后处理只包含色键、切格、整组共同比例、脚底锚定、透明清理和 512→256 派生。

### 两侧朝向与身份不变量

- `front_3quarter_sw` 与 `back_3quarter_ne` 分别独立生成，禁止离线或运行时镜像。
- 月岚风狐始终保持珍珠银白主色、深青到雾青末端、额部新月纹、长耳附着毛鳍、四足长背，以及恰好两条可分别追踪的实体尾巴。
- 成人见习猎人的发饰、赭黄毛边衣、青色斜挎带、红腰带、腕带和完整双靴在全部 180 帧保持一致；不得缩成小人、浮空、离鞍或被尾巴/毛鳍穿体。
- 骑手与月岚风狐每帧均为一次生成的完整整图主体，不使用人物/宠物分层拼接。
- `down-8 == revive-1` 必须在 512px 源帧与 256px 运行帧分别保持完全相同的 RGBA；正式安装前还必须通过重复帧、边缘、洋红残留、透明 RGB 与源/运行时确定性检查。
- 安装与 1× 审片完成后仍维持 `runtimeEnabled=false`、`ownerReviewStatus=pending`，直到项目所有者明确确认本轮骑乘战斗动态成片。
