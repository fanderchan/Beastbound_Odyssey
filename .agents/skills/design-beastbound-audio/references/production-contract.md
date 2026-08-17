# Beastbound Audio Production Contract

Use this contract for every formal music, ambience, UI, character, pet, or combat-audio delivery.

## Source and ownership

Every runtime asset must have one ledger entry containing:

- stable `assetId` and `cueIds`;
- role (`music`, `ambience`, `ui`, `motion`, `contact`, `reaction`, `voice`, `outcome`);
- source type (`procedural_original`, `recorded_original`, `commissioned`, or `licensed`);
- author/tool and version;
- canonical prompt or synthesis specification path;
- explicit seed when generation uses randomness;
- complete processing/encoding commands;
- source and runtime SHA-256;
- ownership/license basis and replacement path;
- review state.

Do not install copied game audio, copyrighted melodies, opaque downloads, or a file whose origin cannot be proven.

For licensed layers, also keep one source record per immutable input file with
`sourceId`, bundle-relative `sourcePath` or repository-relative `projectPath`,
author, source type, license name and URI, source-page URI when available,
expected SHA-256, and current SHA-256. Re-hash the source during every audit.
Use [licensed-layer-bundle-contract.md](licensed-layer-bundle-contract.md) for
the canonical specification and FFmpeg processing order.

## Format

| Role | Runtime default | Channels | Sample rate |
|---|---|---:|---:|
| Short/high-concurrency SFX | PCM16 WAV | mono unless stereo is meaningful | 48,000 Hz |
| Music and long ambience | Ogg Vorbis quality 5 or reviewed equivalent | stereo | 48,000 Hz |
| Reproducible master | lossless WAV or deterministic generator | declared | 48,000 Hz |

MP3 is not a production master. Opus is not a Beastbound Godot runtime format for this pipeline.

## Mix and signal gates

- No decoded sample may clip. Runtime true peak should remain at or below `-1 dBTP`; short procedural WAV effects must remain at or below `-1 dBFS`.
- Remove unintended DC offset. Formal first-pass SFX fail when absolute mean sample amplitude exceeds `0.001` full scale. A deliberate asymmetric waveform must be documented and still avoid speaker-risking low-frequency bias.
- Music should begin near `-18 LUFS-I` and remain subordinate to critical battle feedback. Treat this as a mix starting point, not a reason to destroy dynamics.
- Short cues are assessed by peak, RMS, crest factor, duration, and listening; integrated LUFS is not reliable for very short effects.
- Before bus gain and the master limiter, newly mastered one-shot files should normally retain at least `3 dB` sample-peak headroom. Any exception needs an overlap capture proving the final mix remains within the true-peak gate.
- Start with music crossfade `0.75 s`, ordinary SFX cap `12`, and per-cue cooldown `40–120 ms`. Tune only from overlap evidence.
- Same-context synchronization is idempotent: it must not restart or stack the current music.
- Enabling physical playback after a deferred/headless context selection must
  start that selected cue; metadata equality alone must not suppress the first
  real stream load.
- If a new context interrupts an unfinished crossfade, retain the currently
  louder stream as the outgoing side and reuse the quieter player. The summed
  equal-power envelope must not collapse between transitions.
- The Master HardLimiter ceiling is explicitly configured, not merely the engine default. Start at `-2.0 dB` for this Godot PCM path, then analyze the frozen mixed capture and tune only as needed to keep reconstructed true peak at or below `-1 dBTP`.
- A sample-peak limiter ceiling is not a true-peak measurement. Measure both decoded sample peak and oversampled/reconstructed true peak; do not claim `-1 dBTP` merely because the limiter reads `-1 dB`.

## Loop gate

Audit the decoded runtime stream, not only the source:

1. compare the final and initial windows;
2. measure boundary sample discontinuity and window RMS difference;
3. inspect a looped render containing at least three boundaries;
4. listen on headphones and speakers.

Fail an audible click, sudden ambience reset, beat truncation, or silence hole. Record the exact method and thresholds in the bundle auditor; do not rely on a prose “seamless” claim.

For Ogg Vorbis, honor the container granule duration when removing decoder
padding. Build the repeated-loop audit from independently decoded copies rather
than assuming a decoder's `stream_loop` output has no per-copy padding. If a
natural encoded cut misses the hard sample/window gates, choose a deterministic
stable cut in the lossless circular master and rotate before encoding; never
hide the problem with a start/end fade that creates a recurring volume hole.

For the deterministic PCM16 canary, fail when:

- the decoded last-to-first sample discontinuity exceeds `0.002` full scale;
- first/last decoded `20 ms` RMS differs by more than `1.0 dB`;
- a three-boundary render exceeds the same discontinuity gate.

An auditor reports `pass` only when its failures array is empty. Do not turn a failed hard gate into a warning to ship the current bundle.

## Runtime bundle

A complete bundle contains:

```text
source/spec.json
source/provenance.json
source/.gdignore
source/third_party/* (when the license permits redistribution)
runtime/music/*
runtime/ambience/*
runtime/sfx/*
audio-cues.json
audit-report.json
evidence/
```

Generated Godot cache under `.godot/imported/` is never source. Put
`source/.gdignore` in a runtime bundle so raw masters and third-party downloads
are not imported a second time by Godot. Track `.import` only when project
policy requires it to freeze import/loop settings; otherwise set loop behavior
in the focused runtime catalog/manager and prove it through Godot.

## Required first-pass evidence

- town, wilderness, cave, and normal battle music are non-silent and distinguishable;
- town, wilderness, and cave ambience are non-silent, distinguishable, and
  remain subordinate to their matching BGM;
- map ambience uses an independent equal-power transition, routes through the
  effects control, ducks during battle, and restores the current map bed;
- battle entry and exit crossfade without stacking or abrupt volume jumps;
- deferred playback starts the selected context when enabled, and an
  interrupted three-context crossfade preserves intermediate total power;
- motion and contact are separate;
- dodge/block replace ordinary contact correctly;
- counter is heard as its own action;
- launch/knockback and down/outcome follow the hit in order;
- launch remains distinct from the preceding contact under low battle music, and down remains distinguishable from ordinary knockback by its short unconscious/daze accent;
- music and SFX volume settings persist;
- muted output stays muted after transition and relaunch;
- the normal-client capture contains an audio stream and no clipping;
- the Godot-imported runtime stream is non-silent; canonical-WAV analysis alone is not runtime evidence;
- QA/MovieWriter exit stops active players, clears their streams, waits for AudioServer drainage, and reports no leaked playback resource;
- effect-family review uses one continuous numbered movie: isolated cues first, then representative dense cases under low music;
- owner listening status is explicit.
