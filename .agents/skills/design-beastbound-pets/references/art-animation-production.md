# Beastbound Pet Art And Animation Production Contract

Use this contract only when the user asks for formal, complete, runtime-ready, rideable, sprite, animation, or art delivery. Concept and numeric design may remain `artStatus=deferred` with a future brief.

## Completion truth

Do not collapse these states into one “finished” label:

| State | Meaning |
| --- | --- |
| `deferred` | Design records an art brief; no production claim. |
| `planned` | Identity and required matrices are resolved; runtime art is not yet approved. |
| `in_production` | Some source/normalized frames exist; no completeness claim. |
| `owner_review_pending` | Automated checks and real-client evidence pass; the project owner has not accepted the look. |
| `approved` | Required scope passes deterministic, in-engine, self-review, and owner-review gates. |

`owner_review_pending` is not release-ready. A rejected key pose, contact sheet, screenshot, or video returns the affected set to `in_production`.

Keep `ownerReviewStatus` and `evidencePaths` honest. `artStatus=approved` requires `ownerReviewStatus=approved` plus recorded screenshot/video paths; automated checks alone may never set either value to approved.

## Lock identity before expansion

Create one reusable identity board before generating action rows. Lock:

- silhouette, body plan, limb/horn/tail count, proportions and footprint;
- face, eyes, mouth, signature markings, palette, materials and element accents;
- scale relative to the player, small pets, large pets and its mounted combination;
- near/far limb logic, asymmetric features and directions that may never be mirrored;
- role-shaped attack body part and skill silhouette;
- forbidden drift and known generation risks.

Approve a small key-pose gate before producing dozens of frames: standalone pet front/back/world cardinal poses and one supported mounted character-pet front/back pose. Do not expand a failed identity, scale, seat, direction, or anatomy.

## World movement matrix: true eight means true eight

The PC world path uses `south`, `south_west`, `west`, `north_west`, `north`, `north_east`, `east`, and `south_east` as eight independently authored visual directions. Different filenames or logical inputs backed by mirrored pixels are not true eight.

For a formally supported pet, prove all three visual subjects:

1. standalone character — may reuse an already approved character pack;
2. standalone pet — required for following, roaming and world display;
3. each declared character-riding-pet combination — required as a separate AI-generated whole subject.

Minimum per subject and direction is `idle 1 + walk 4`, therefore 40 frames per subject. More frames are allowed when they improve motion. The four walk frames must show a real gait, stable ground line and stable body scale; four copies with vertical bobbing do not pass.

For mounted frames:

- generate rider, mount, seat, hands, legs, harness and occlusion as one complete picture;
- keep `runtimeMirroring=false`, `runtimeLayeredComposition=false`, and one mounted body texture per frame;
- do not paste a separately generated rider onto a pet, delete hidden limbs, or repair the seam with a rectangular foreground patch;
- keep rider and mount on the same facing/travel axis with believable human scale and seat depth;
- allow only whole-image post-processing: background removal, crop, canvas normalization, overall scale, baseline alignment and edge cleanup.

If a supported combination is missing, show the on-foot character. Never guess another mount, restore layered composition, or disguise mirrored facings as finished art.

## Battle matrix: make every result readable without the log

The current fixed 10V10 battlefield renders two formal diagonals, not all eight world facings:

- ally lower-left: `back_3quarter_ne`, facing the enemy;
- enemy upper-right: `front_3quarter_sw`, facing the ally.

Produce both views for required pet and mounted battle actions. Do not multiply every battle row into eight unused directions unless the battle camera/facing contract changes.

The release semantic matrix is:

| Scenario | Visual requirement |
| --- | --- |
| `idle` | Stable identity and readable silhouette. |
| `walk` | Charge/return motion without sliding or scale popping. |
| `attack` | Anticipation, role-correct contact body part, hit pause and recovery. |
| `skill` | Distinguishable from normal attack without reading text. |
| `defend` / `guard_hit` | Defensive body pose plus separate contact/shield pressure; not ordinary hurt. |
| `hurt` | Clear impact and regain-balance beat. |
| `dodge` | Anticipation, side-step/arc and settled return; never just `walk` plus a tiny offset. |
| `dodge_counter` | A readable center-of-gravity transition between evasion and counter launch. |
| `counter` | A distinct reaction beat; ordinary attack frames may be shared only if the complete sequence remains unmistakable. |
| `stagger_return` | Wounded, uneven return to the original slot before normal KO; never reuse healthy walk. |
| `knockaway` | Contact, launch and straight/bounce trajectory stay visually continuous. |
| `down` | Reversible unconscious collapse and stable hold; never peaceful sleep, smile, death or gore. |
| `revive` | Clear recovery from the held unconscious state without teleporting to idle. |
| `combo` | Participants, order, common contact point and target reaction remain readable in 10V10. |

One semantic scenario does not always require a unique sprite row: shield contact, dizzy halo, impact pulse and launch trajectory are runtime effect/director layers. Reuse is acceptable only when a no-log video still identifies the event. Current history specifically rejects using `walk` as dodge or wounded return, using `idle/walk` for mounted combat, using ordinary hurt as defend-hit, and using a smiling sleep pose as down.

Keep the dizzy halo and orbiting stars outside the `down` body frames so revive can remove them immediately. The body must still read as unconscious when effects are hidden.

## Supported mounted combinations

Every pet is designed as rideable, but runtime visual support is explicit rather than magical. The design contract lists at least one supported character appearance for a non-deferred pet art plan. Each supported character-pet pair needs:

- the true-eight integrated world pack;
- the two-view mounted battle action pack;
- its own scale/contact-distance/HP-label review at actual game size.

Do not claim every character appearance is supported because one protagonist combination exists. Unproduced combinations use the safe on-foot fallback while retaining the real riding gameplay state.

## Production sequence

1. Inspect the pet design contract, existing character pack, asset manifests and closest same-body-plan pet.
2. Write the identity lock and full subject/direction/action matrix.
3. Approve cardinal and formal battle key poses at actual relative scale.
4. Generate standalone pet true-eight idle/walk and its contact sheet/video.
5. Generate each supported mounted combination as true-eight whole-frame art and review seat, anatomy and gait.
6. Generate both battle views for core pet and mounted actions from the same identity board.
7. Normalize frames deterministically; preserve prompt, raw source, processed frames, parameters and ownership metadata.
8. Integrate through focused catalogs/models and manifest paths; do not scatter hardcoded texture paths through `main.gd`.
9. Run deterministic checks, then real `Main.tscn` screenshot/video review.
10. Fix the first failed matrix before producing another pet or mounted combination.

## Mandatory review scenes

Use the isolated pet battle review lab and formal runtime path. At minimum record or inspect:

- true-eight standalone character, pet and mounted world loops;
- 10 riding characters plus 10 battle pets in the fixed formation;
- attack, skill attack, defend-hit, hurt/recovery and combo;
- dodge, dodge-to-counter, ordinary counter;
- counter kill with wounded return then down;
- high-damage counter knock-away and straight/bounce launch;
- reversible down hold and revive.

Use fixed seeds/director scenes for rare combinations, then one natural randomized 10V10 run. Director clips must drive real battle events and rendering, not a separate fake animation player.

## Acceptance gates

- Contact sheets show every required subject, direction, action and formal view together.
- Identity, anatomy, scale, palette, markings, body count and equipment do not drift.
- World and battle baselines, alpha bounds and frame edges remain stable.
- At 1280×720, events remain readable with the message/log panel ignored.
- No unit leaves a stale shadow/marker, crosses the wrong facing, slides home, or overlaps its target beyond the authored contact distance.
- The MP4 comes from the real Godot Metal path, has verified metadata and decodes fully.
- Asset checks, catalog/manifest checks, relevant Godot action/mount/battle checks and `git diff --check` pass.
- Source, ownership, prompt, replacement path and QA evidence are recorded.
- The project owner reviews representative screenshots/video when style, scale, motion, impact or sound cannot be proven by code.

Never mark `approved` solely because automated tests pass. Never expand a visually rejected canary to the rest of the roster.
