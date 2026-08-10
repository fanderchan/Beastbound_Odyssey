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

Approve a small key-pose gate before producing dozens of frames: standalone pet front/back/world cardinal poses, plus one supported mounted character-pet front/back pose when the contract is rideable. A first-release fusion target with `rideable=false` must omit the mounted set instead of producing an unused or fictional rider composition. Do not expand a failed identity, scale, seat, direction, or anatomy.

## Dedicated shared headshot portrait

Every formal pet has one canonical portrait composed and authored specifically as a headshot. It is not a crop, zoom, screenshot, traced cutout, or masked excerpt of an identity board, full-body showcase, world frame, battle frame, or mounted frame. The portrait must be newly drawn or generated from the approved identity board so the face, expression, signature horns/ears/crest and defining material accents remain readable inside a small card.

Use the same canonical portrait identity across:

- the bottom pet roster bar;
- the pet codex and collection lists;
- ride-permit/ride-qualification cards;
- pet-egg cards or reward previews;
- later compatible compact pet selectors and notifications.

Those consumers may derive deterministic sizes from the shared transparent master and add their own border, rarity color, level, lock, certificate, egg shell, badge or selection state. They must not maintain separate pet likenesses, bake UI chrome into the portrait, or fall back to cropping a full-body asset when a portrait is missing.

The portrait production contract is `presentation.artProduction.portrait`. It must declare:

- `capability=shared_dedicated_headshot_v1`, `independentlyAuthored=true`, and `fullBodyCropAllowed=false`;
- all four baseline `sharedUses`: `pet_roster_bar`, `pet_codex`, `ride_permit`, and `pet_egg`;
- a source status and original-production method, approved identity references, dedicated source-asset paths, and the ownership/provenance record path;
- its own `ownerReviewRequired`, `ownerReviewStatus`, and `evidencePaths`, separate from the aggregate pet-art status.

Create a lossless square transparent source master at no less than 512×512 unless the current asset pipeline documents a higher canonical size. Keep comfortable safe area around the silhouette, use a deliberate head-and-upper-body composition, and preserve asymmetric identity details without mirroring. Generate runtime variants only through deterministic resize/canvas rules from that portrait master; do not derive the master from another production asset.

Before owner review, show:

- the transparent master at readable/native size;
- a contact row at representative compact sizes such as 48, 64, 96 and 128 px;
- real-client screenshots for every currently implemented baseline consumer;
- source paths, prompt or author brief, ownership record, processing parameters and immutable hashes.

`planned` may record future source paths with `source.status=planned`. Before `owner_review_pending` or `approved`, the dedicated source must be available, portrait evidence must be non-empty, and the nested owner-review state must truthfully reflect the owner's decision. Approval of world or battle art never implicitly approves the portrait, and portrait approval never implicitly approves the motion matrices.

## World movement matrix: true eight means true eight

The PC world path uses the existing Godot runtime names `south`, `southwest`, `west`, `northwest`, `north`, `northeast`, `east`, and `southeast` as eight independently authored visual directions. These names are the canonical asset-directory contract; do not introduce underscore aliases. Different filenames or logical inputs backed by mirrored pixels are not true eight.

For a formally supported rideable pet, prove all three visual subjects:

1. standalone character — may reuse an already approved character pack;
2. standalone pet — required for following, roaming and world display;
3. each declared character-riding-pet combination — required as a separate AI-generated whole subject.

Minimum per subject and direction is `idle 1 + walk 4`, therefore 40 frames per subject. More frames are allowed when they improve motion. The four walk frames must show a real gait, stable ground line and stable body scale; four copies with vertical bobbing do not pass.

A non-rideable first-release fusion target proves only the standalone pet subject. It still requires all eight independently authored world directions and the complete standalone battle matrix; it does not require a character or mounted bundle and must fail closed if any riding path tries to treat it as supported.

Do not accept direction semantics from directory names, arrows, prompts, or a generator's claim. Before installation, build a review row for every canonical direction that places `idle-1` beside `walk-1..4`, and inspect the actual screen-facing/travel vector across all five frames. A direction fails if idle and walk disagree, if any frame turns into its opposite or neighboring diagonal, or if rider and mount do not share the same axis. A safe byte-preserving slot swap is allowed only when both existing sources are independently verified as the exact opposite pair; otherwise regenerate the affected source frames without mirroring.

For mounted frames:

- generate rider, mount, seat, hands, legs, harness and occlusion as one complete picture;
- keep `runtimeMirroring=false`, `runtimeLayeredComposition=false`, and one mounted body texture per frame;
- do not paste a separately generated rider onto a pet, delete hidden limbs, or repair the seam with a rectangular foreground patch;
- keep rider and mount on the same facing/travel axis with believable human scale and seat depth;
- allow only whole-image post-processing: background removal, crop, canvas normalization, overall scale, baseline alignment and edge cleanup.

If a supported combination is missing, show the on-foot character. Never guess another mount, restore layered composition, or disguise mirrored facings as finished art.

## Battle matrix: make every result readable without the log

The current fixed 10V10 battlefield renders two formal diagonals, not all eight world facings:

- enemy upper-left / screen-left formation: `front_3quarter_sw`, facing the ally;
- ally lower-right / screen-right formation: `back_3quarter_ne`, facing the enemy.

Produce both views for required standalone-pet battle actions, and for mounted battle actions only when the design contract is rideable. Do not multiply every battle row into eight unused directions unless the battle camera/facing contract changes.

### Final-facing contract: inspect rendered geometry, not the filename

The two source-view names describe authored camera views, not their final on-board direction. Beastbound's canonical presentation mapping is:

| Side | Authored source view | Applied `flipH` | Required final direction |
| --- | --- | --- | --- |
| `enemy` | `front_3quarter_sw` | `true` | southeast, toward arena centre |
| `ally` | `back_3quarter_ne` | `true` | northwest, toward arena centre |

Standalone pets always use this mapping. Integrated mounted whole-frame actors use the same mapping when the design is rideable; mounted rendering delegates to the pet battle-facing contract and bundle metadata may describe the mapping but must not override it. If generated frames only look correct with `flipH=false`, normalize or regenerate that pack instead of creating a private exception.

This is a mandatory visual and automated gate:

- assert both source view and applied flip for `enemy` and `ally`;
- render both formations together; rideable contracts also show same-side pet and mounted actors at once;
- reject outward-facing silhouettes and any pass inferred from separate source contact sheets; rideable contracts additionally reject mounted/pet disagreement;
- inspect at least idle, approach/contact, return/down and one counter/knock-away moment on both sides.

A complete 12-action/180-frame bundle still fails when this final-facing gate fails.

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

### Reversible KO frame continuity

Frame suffixes are playback order, not contact-sheet layout. Enforce the same chronology in both formal views:

- `down-1..8` moves from surprise/balance loss through collapse to one stable unconscious ground hold; it must never stand back up, swap chronology, or become a sleep loop.
- `down-8` and `revive-1` are exact byte-for-byte decoded RGBA matches in both the 512px source frames and 256px runtime frames.
- `revive-1..8` starts at that held pose and recovers toward ready/idle without teleporting, re-collapsing, or replaying `down` in the wrong order.
- The installer and read-only catalog audit must fail closed when either runtime view breaks the exact handoff. Source continuity remains a formal production gate even when a lean archive omits per-frame source copies after validation.

The body still owns the unconscious expression: unfocused or spiral eyes when visible, slack mouth and sprawled weight. Never use a smile, restful closed-eye sleep, X/death eyes, grave imagery, blood or gore. Dizzy halos, orbiting stars and status icons remain independent runtime effects and cannot rescue a body strip that reads as asleep.

## Supported mounted combinations

Ordinary pets, evolution targets and other rideable designs keep explicit runtime support rather than magical compatibility. Their design contract lists at least one supported character appearance for a non-deferred pet art plan. The first fusion release is the explicit exception: fusion targets declare `rideable=false`, list only the standalone `pet` world subject and omit the mounted contract entirely. Each supported rideable character-pet pair needs:

- the true-eight integrated world pack;
- the two-view mounted battle action pack;
- its own scale/contact-distance/HP-label review at actual game size.

Do not claim every character appearance is supported because one protagonist combination exists. Unproduced combinations use the safe on-foot fallback while retaining the real riding gameplay state.

## Production sequence

1. Inspect the pet design contract, existing character pack, asset manifests and closest same-body-plan pet.
2. Write the identity lock and full portrait/subject/direction/action matrix.
3. Approve the dedicated headshot at native and representative compact sizes, then approve cardinal and formal battle key poses at actual relative scale and prove both teams face inward after the runtime view/flip mapping is applied.
4. Generate standalone pet true-eight idle/walk and its contact sheet/video.
5. For rideable contracts, generate each supported mounted combination as true-eight whole-frame art and review seat, anatomy and gait; skip this step for non-rideable fusion targets.
6. Generate both battle views for the core pet, plus mounted actions only for rideable contracts, from the same identity board.
7. Normalize portrait runtime variants and motion frames deterministically through their declared canonical derivation implementations; preserve prompt, raw source, processed assets, parameters and ownership metadata.
8. Integrate the canonical portrait through a focused manifest/catalog shared by UI consumers, and motion assets through focused catalogs/models; do not scatter hardcoded texture paths through `main.gd` or duplicate per-surface likenesses.
9. Run deterministic checks, then real `Main.tscn` screenshot/video review.
10. Fix the first failed portrait or matrix before producing another pet or mounted combination.

## Color cleanup and canonical runtime derivation

Do not infer spill from color alone. A despill or color repair may touch pixels only when the exact eligibility mask was produced by the same chroma-key operation from the same raw input. Already-transparent art without that mask must remain byte-preserving or fail closed. Never substitute an all-true image mask, a hue/distance threshold, component size, or a visual guess; those can erase legitimate purple contours, natural green materials and translucent VFX. Preserve alpha exactly and record the mask provenance, affected-pixel count, before/after decoded RGBA hashes and focused visual evidence for every permitted repair.

The normalized 512px source frame is the authority for its 256px runtime frame. Builder, fail-closed installer and derivation audit must call one canonical runtime function that owns premultiplied resize and final transparent-pixel normalization. No caller may append a private resize, alpha cleanup, despill or color pass before comparing hashes. Change the shared function and parity tests together; include a transparent authored-color fixture and a builder-to-installer decoded-RGBA equality fixture.

## Source evidence without repository bloat

Formal installation must validate the complete production bundle before copying anything: original lossless generation sheets, exact prompts, 512px transparent source frames, deterministic processing metadata, per-action QC, and derived 256px runtime frames. Repository size is not a reason to skip that gate.

The tracked runtime repository may use the validated `lean` archive mode when the same pixels would otherwise be stored repeatedly. Lean mode must retain:

- the dedicated portrait master or another durable lossless portrait source, its deterministic runtime derivatives, focused compact-size evidence, source/ownership metadata and immutable hashes;
- every 256px runtime frame and combined contact/QC evidence;
- every action's exact prompt, processing metadata, QC record, and immutable source/runtime hashes;
- one lossless representative generation sheet for each independently authored battle view;
- a source ledger that records all omitted 512px/source-archive hashes, ownership, origin, replacement path, and that full source validation occurred before install.

Per-frame 512px splits and duplicate raw/clean/input intermediates may stay in the ignored local production archive because they are not runtime inputs. Never use lean mode to discard the only lossless generated source, hide a failed frame, weaken deterministic runtime derivation, or claim owner approval. Use `full` mode when an external source archive does not exist and the repository copy is the only durable evidence.

## Mandatory review scenes

Use the isolated pet battle review lab and formal runtime path. At minimum record or inspect:

- the dedicated portrait at native and representative compact sizes, plus every currently implemented baseline UI consumer;
- true-eight standalone pet world loops, plus character and mounted loops only for rideable contracts;
- 10 battle pets in the fixed formation; rideable contracts additionally include 10 riding characters;
- attack, skill attack, defend-hit, hurt/recovery and combo;
- dodge, dodge-to-counter, ordinary counter;
- counter kill with wounded return then down;
- high-damage counter knock-away and straight/bounce launch;
- reversible down hold and revive.

Use fixed seeds/director scenes for rare combinations, then one natural randomized 10V10 run. Director clips must drive real battle events and rendering, not a separate fake animation player.

The true-eight world evidence must show each direction twice: a readable idle hold followed by at least one complete four-frame walk cycle. Show every subject declared by the design contract together; for a non-rideable fusion target that means the standalone pet only. A combined contact sheet is only an index and cross-direction consistency overview; shrinking many subjects into one image can hide facing, anatomy, alpha-edge and gait defects, so it never proves visual acceptance by itself. Direction approval must also inspect every `idle-1 + walk-1..4` source row at 1:1 pixels or a readable zoom and then watch the continuous per-form real-client video. The review scene must validate every declared 40-frame collection before recording and exit non-zero on a missing/unreadable frame or an empty column; a visually blank but successfully encoded video is a failed gate. After an independent visual direction audit passes, freeze the exact reviewed paths and hashes in a semantic-direction approval manifest. Hash validation prevents later drift but never performs or replaces the visual judgment, and owner review remains pending until the project owner accepts the result.

## Acceptance gates

- The portrait is a dedicated independently authored headshot, not a crop or derivative of any full-body/world/battle/mounted asset; identity, expression and signature features remain readable at representative compact sizes.
- The same canonical portrait asset and deterministic derivatives serve the roster bar, codex, ride permit, pet egg and other compatible consumers; surface-specific frames and badges remain UI overlays.
- Portrait source method, identity references, dedicated source paths, ownership record, processing metadata, hashes, focused evidence and nested owner-review state are present and truthful.
- Contact sheets show every required subject, direction, action and formal view together, but remain overview evidence rather than the visual-acceptance source.
- Every direction is inspected from its original runtime PNG at 1:1 or readable zoom, and the same exact frames are watched in the per-form continuous MP4.
- Every world-direction contact row shows `idle-1 + walk-1..4` together, and an independent reviewer verifies the five actual silhouettes against the canonical screen vector instead of trusting labels.
- Identity, anatomy, scale, palette, markings, body count and equipment do not drift.
- World and battle baselines, alpha bounds and frame edges remain stable.
- Both formal views satisfy exact decoded-RGBA `down-8 == revive-1` continuity in runtime, and full-source validation proves the same handoff before lean archival.
- Transparent frames with no exact chroma eligibility mask receive no global color cleanup; runtime hashes come only from the shared canonical derivation.
- At 1280×720, events remain readable with the message/log panel ignored.
- Both teams face the arena centre in the same real-client frame; rideable contracts additionally prove mounted actors and their same-side battle pets use identical final-facing mappings during idle, contact, return and down states.
- No unit leaves a stale shadow/marker, crosses the wrong facing, slides home, or overlaps its target beyond the authored contact distance.
- The MP4 comes from the real Godot Metal path, has verified metadata and decodes fully.
- Asset checks, catalog/manifest checks, relevant Godot pet-action/battle checks, mounted checks only for rideable contracts, and `git diff --check` pass.
- Source, ownership, prompt, replacement path and QA evidence are recorded.
- The project owner reviews representative screenshots/video when style, scale, motion, impact or sound cannot be proven by code.

Never mark `approved` solely because automated tests pass. Never expand a visually rejected canary to the rest of the roster.
