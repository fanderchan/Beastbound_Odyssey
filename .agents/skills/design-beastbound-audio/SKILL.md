---
name: design-beastbound-audio
description: Design, create, implement, audit, and validate original music, ambience, UI sounds, character and pet voices, and animation-timed combat sound effects for Beastbound Odyssey. Use for BGM state changes, town/wilderness/cave/battle audio, attacks, skills, hits, blocks, dodges, counters, launches, knockbacks, falls, deaths, victories, volume controls, Godot audio buses, audio provenance, runtime cue catalogs, listening evidence, or any request that says the game is silent.
---

# Design Beastbound Audio

Build a readable game-audio system, not a folder of disconnected sound files. Music establishes the current high-level state; short effects explain player actions and battle outcomes at the exact animation moment when they become visible.

## Start from repository truth

1. Read repository and `client/godot/AGENTS.md`, the active roadmap audio item, and the newest relevant phase notes.
2. Run `git status --short --branch` and inspect recent `git log`. Preserve unrelated art, imports, generated files, server work, and user changes.
3. Inventory existing audio assets, buses, settings, world/map lifecycle, battle event queue, animation phases, UI actions, tests, and capture tooling before choosing a design.
4. Inspect `/Users/fander/projects/_local_references/StoneAge` only for mature event categories and timing intent. Never copy its sounds, melodies, filenames, IDs, code, data, or numeric mix.
5. Also use `$godot-2d-client` for runtime work. Use Computer Use for the final normal-client interaction pass when available, but do not treat a screen-only pass as proof that audio played.
6. Read [production-contract.md](references/production-contract.md) before creating or integrating audio. Read [runtime-cue-contract.md](references/runtime-cue-contract.md) before adding cue IDs or playback calls.

## Choose the delivery mode

- For “应该有什么声音、规划音频”: define contexts, event cues, timing, mix priorities, reuse families, source strategy, and acceptance gates without claiming runtime completion.
- For “做、实装、游戏没声音”: complete one coherent canary from original source generation through runtime switching, action-timed cues, settings, automated analysis, and a real-client recording.
- For “换音乐、改音效、声音不对”: reproduce the exact transition or action, change only the relevant source/cue/mix contract, and regression-test adjacent contexts.
- For “审计”: inspect source, provenance, catalog, runtime bindings, audio metrics, transition evidence, and orphan processes read-only.
- Stop for the owner only when a choice changes an accepted musical identity, monetized/licensed source, accessibility policy, or broad creative direction. Clear clipping, missing cues, wrong timing, duplicate playback, broken looping, and incorrect state restoration are bugs to fix directly.

## Freeze an Audio Design Contract

Before producing files, write down:

1. **contexts** — at minimum `town`, `wilderness`, `cave`, `battle_normal`; add `battle_boss` only when the runtime has an authoritative boss distinction;
2. **ownership** — original procedural composition, commissioned work, or licensed source; include proof, replacement path, and prohibited reuse;
3. **cue families** — music, ambience, UI, attack motion, skill cast, contact, reaction, status, creature voice, and outcome;
4. **event timing** — windup/launch at action start, contact at the visible hit frame, reaction after contact, and outcome after the result becomes visible;
5. **reuse** — share sounds by weapon/material/element/creature acoustic archetype; do not make one asset per named pet, village, or skill by default;
6. **mix** — bus hierarchy, target loudness, concurrency cap, priority, cooldown/de-duplication, ducking, and crossfade duration;
7. **controls** — persisted music and effects levels plus mute behavior; a player must not need debug UI to change them;
8. **validation** — exact runtime scenarios, metrics, recordings, and residual listening-review state.

For the first Beastbound pass, prefer an original state machine:

```text
map town       -> music.town
map wilderness -> music.wilderness
map cave       -> music.cave
battle active  -> music.battle_normal (temporarily overrides the map)
battle exit    -> restore music for the current map
```

Do not restart the same track for UI changes or minor subareas. Crossfade only when the high-level context changes.

## Author original, replaceable sources

- Create audio from original recorded, commissioned, or programmatically synthesized sources. A generated asset is not automatically copyright-safe; record the tool, prompt/specification, seed, timestamp, processing command, and ownership basis.
- Keep a deterministic, canonical source specification and generator for procedural assets. Freeze tool versions and hashes for every installed runtime file.
- Use 48 kHz. Prefer mono PCM16 WAV for short/high-concurrency effects and stereo Ogg Vorbis for long music or ambience; retain a reproducible lossless master or generator specification.
- Make loops intrinsically seamless or audit the seam after encoding. Do not hide a pop with a long fade that creates an audible hole.
- Do not normalize every sound to the same peak. Balance by perceived role: music is a bed, UI is concise, contact is readable, and critical counter/launch/outcome cues win under contention.
- Keep first-pass music restrained and loopable. Do not begin with one song per map, adaptive stems, every-pet voice sets, or every-skill exclusives.

For the deterministic Beastbound bundle, regenerate and audit from the repository root:

```bash
python3 .agents/skills/design-beastbound-audio/scripts/synthesize_audio_bundle.py \
  --spec client/godot/assets/audio/beastbound_audio_v1/source/spec.json \
  --output client/godot/assets/audio/beastbound_audio_v1
python3 .agents/skills/design-beastbound-audio/scripts/audit_audio_bundle.py \
  --bundle client/godot/assets/audio/beastbound_audio_v1
python3 .agents/skills/design-beastbound-audio/tests/test_audio_pipeline.py -v
```

## Integrate through focused audio models

1. Put playback, bus setup, crossfades, pooling, settings, and caching in a focused audio manager under `client/godot/scripts/audio/`.
2. Put event-to-cue decisions in a pure cue model/catalog. Keep `main.gd` changes to lifecycle wiring and explicit animation-timing notifications.
3. Load and validate the cue catalog once. Never scan directories, parse JSON, import resources, or allocate an unbounded number of players in `_process`, `_draw`, input, or battle signatures.
4. Use separate music and effects buses. Bound simultaneous one-shots, apply cue cooldowns, and choose a deterministic voice-stealing rule.
5. Do not play every battle sound when a network packet arrives. The authoritative event decides *what happened*; the client animation marker decides *when it is heard*.
6. A dodge keeps its motion sound but replaces contact with a short evade cue. A block replaces ordinary contact. A counter is its own action sequence. A launch/knockback/down cue follows the hit rather than masking it.
7. Pet and character differences use declared acoustic profiles with safe shared fallbacks. Missing optional audio must not block battle progression.
8. On battle entry, fade world music out and battle music in. On battle exit or reconnect recovery, restore the current map context exactly once.
9. Persist settings locally and clamp values. Apply slider changes to buses immediately but debounce disk persistence; a drag must not perform repeated `FileAccess` writes or renames. Muting or changing volume must not rebuild the world, restart the same BGM, or affect authoritative state.
10. Headless checks may exercise catalog, routing, cooldown, pooling, and state transitions without creating physical `AudioStreamPlayback` objects. A focused playback test may opt in explicitly, but it must stop players, clear streams, and allow AudioServer at least two frames to drain before immediate process exit.
11. When new audio files are not yet visible to `ResourceLoader`, run the Godot editor import scan once (`godot --headless --editor --path client/godot --quit`) before blaming the source bundle. Never commit `.godot/imported/` as source.

See [runtime-cue-contract.md](references/runtime-cue-contract.md) for canonical cue names, priorities, and timing phases.

## Prove sound, timing, and stability

For every integrated canary:

- Parse every changed JSON and run `git diff --check`.
- Run the source/bundle auditor and verify sample rate, channels, duration, clipping, DC offset, hashes, cue coverage, orphan assets, loop seam, and provenance.
- Run `godot --headless --path client/godot --quit` plus focused cue-model, state-transition, battle-timeline, settings-persistence, and pool-cap tests.
- Exercise the normal `res://scenes/Main.tscn` path at 1280x720. Verify town startup, map transition, battle entry, attack/contact, dodge or block, counter, launch/knockback, outcome, battle exit, and restored world music.
- Capture a short MP4 or synchronized video-plus-audio evidence from the real client. Confirm the output contains an audio stream; inspect decoded sample peak, reconstructed true peak, and loudness, then listen to the final artifact. Do not infer true-peak safety from a sample-peak limiter setting.
- For deterministic MovieWriter evidence, use the normal display driver with `--audio-driver Dummy` when speakers should remain silent. Do not use `--headless`, because headless runtime intentionally suppresses physical playback.
- Record idle and moving performance if audio hooks touch `_process`, battle playback, world draw, input, map loading, or transition hot paths.
- Confirm no Godot, backend, recorder, or audio-analysis process remains orphaned.

Automated metrics catch silence, clipping, gaps, broken loops, duplicate cues, and wrong bindings; they do not prove that music is pleasant or that impact weight feels right. Mark a new mix `owner_listening_pending` until the owner hears frozen evidence. Runtime review may still be enabled when the owner explicitly asked for implementation, but do not call the creative mix accepted.

## Iterate this Skill from evidence

After each real use:

1. record any ambiguity, missed event, false-positive gate, platform issue, or manual step;
2. fix the production contract, cue contract, or reusable script rather than keeping the lesson only in a phase note;
3. run the Skill validator and its script tests;
4. forward-test the revised rule against the just-produced bundle;
5. keep project-specific cue IDs and creative values in project data, not hardcoded into this reusable workflow.

Do not loosen a gate merely to pass the current asset. Explain why the old rule failed, then add the smallest general correction.

## Finish narrowly

- Document contexts, cue coverage, source/provenance, runtime architecture, exact checks, evidence, and remaining listening review in a new phase note.
- Update the roadmap only after the implemented slice, tests, normal-client evidence, and required review state are truthful.
- Stage and publish only the audio Skill, original audio sources/runtime assets, focused audio code/catalog/tests, minimal wiring, and phase note for this issue.
