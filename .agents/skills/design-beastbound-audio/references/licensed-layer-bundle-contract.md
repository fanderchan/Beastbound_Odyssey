# Licensed Layer Bundle Contract

Use this contract when a Beastbound bundle includes CC0 or other explicitly
approved source recordings. It complements, and does not weaken,
[production-contract.md](production-contract.md).

## Source boundary

- Never extract audio from StoneAge or another commercial game. Its event
  categories may inform timing; its binaries may not enter this pipeline.
- Prefer official author/project pages and CC0. Preserve the downloaded source
  file inside the bundle when redistribution is permitted.
- Every source requires a frozen SHA-256 plus author, license name, and absolute
  license URI. A download page is useful evidence but does not replace a
  license URI.
- Treat a hash mismatch as source drift. Inspect and deliberately update the
  specification; never silently regenerate provenance around changed bytes.

## Specification

Put the canonical specification at `<bundle>/source/spec.json`. The bundle
directory name must equal `bundleId`.

Each top-level `sources` entry has:

```json
{
  "sourceId": "kenney_punch_medium_001",
  "sourcePath": "source/third_party/kenney/impactPunch_medium_001.ogg",
  "sourceType": "licensed_cc0",
  "author": "Kenney",
  "licenseName": "CC0-1.0",
  "licenseUrl": "https://creativecommons.org/publicdomain/zero/1.0/",
  "sourcePageUrl": "https://kenney.nl/assets/impact-sounds",
  "expectedSha256": "<64 lowercase hex characters>"
}
```

Use exactly one path form:

- `sourcePath` is relative to the bundle and is appropriate for redistributable
  third-party sources;
- `projectPath` is relative to the repository root and is appropriate for a
  project-owned carry-forward master already stored elsewhere.

For a project-owned source, use a stable project URI such as
`project://beastbound-odyssey/original-audio` in `licenseUrl`. Do not use this
form to disguise a third-party source.

## Asset modes

Use `projectCopy` for one declared source:

```json
{
  "assetId": "music_town_v2",
  "cueId": "music.town",
  "filename": "town_loop.ogg",
  "projectCopy": "music_town_source",
  "trimStartSeconds": 1.0,
  "trimEndSeconds": 65.0,
  "loopCrossfadeSeconds": 2.0,
  "loopRotationSeconds": 48.25,
  "highpassHz": 10.0,
  "masterGainDb": 3.0
}
```

`projectCopy` may also be the source ID string. Music must use exactly one
source. The builder keeps the immutable input unchanged, renders a reviewed
trim and tail-to-head crossfade to a lossless 48 kHz stereo intermediate,
selects a deterministic natural low-discontinuity rotation point without
adding an edge fade, and emits Ogg Vorbis quality 5. The rotation changes only
where playback starts; it must not change the loop duration.
`loopRotationSeconds` is an optional reviewed override measured in the
lossless circular intermediate, not in the immutable source. Use it only when
the final encoded Ogg fails a boundary gate after deterministic search, and
keep the encoded result under the same three-boundary audit. `highpassHz` is
optional and limited to inaudible/subsonic cleanup; declare and preserve it in
provenance rather than silently filtering a licensed master.

Use `layers` for one or more SFX sources:

```json
{
  "assetId": "combat_hit_light_v2",
  "cueId": "combat.hit_light",
  "filename": "combat_hit_light.wav",
  "layers": [
    {
      "sourceId": "kenney_punch_medium_001",
      "trimStartSeconds": 0.0,
      "trimEndSeconds": 0.30,
      "delayMs": 0,
      "gainDb": -6.0,
      "highpassHz": 55,
      "lowpassHz": 9000,
      "pitchScale": 0.94
    }
  ],
  "masterGainDb": -2.0
}
```

Layer fields are optional except `sourceId`. `trimEndSeconds` is an absolute
source time, not a duration. `pitchScale` changes pitch and duration together;
use it for subtle variation rather than tempo-sensitive music. Use
`durationSeconds` on the asset only when a reviewed hard trim is required.

The builder:

- requires FFmpeg 8;
- decodes each layer, trims, resets timestamps, resamples, applies pitch,
  high/low-pass filters, gain, and delay in that order;
- pins FFmpeg input, filter-complex, and output threading to one, and uses
  `asetnsamples=n=1024:p=0` to stabilize each layer's frame cadence without
  extending a shorter source past its natural EOF;
- mixes with `amix normalize=0`;
- applies optional master gain, a 3 ms fade-in, and a 40 ms fade-out;
- writes 48 kHz mono PCM16 WAV for SFX and 48 kHz stereo Ogg Vorbis quality 5
  for music;
- records the actual Vorbis encoder used (`libvorbis`, or FFmpeg 8 native
  `vorbis -strict experimental` when libvorbis is unavailable), all trim,
  crossfade and gain fields, plus the deterministic rotation search result.

The builder does not loudness-normalize or rescue an over-hot mix. Choose layer
and master gain deliberately, then let the bundle auditor reject clipping,
silence, DC, invalid loops, or incorrect channels.

## Build and audit

```bash
python3 .agents/skills/design-beastbound-audio/scripts/build_cc0_audio_bundle.py \
  --spec client/godot/assets/audio/<bundle-id>/source/spec.json \
  --output client/godot/assets/audio/<bundle-id>
python3 .agents/skills/design-beastbound-audio/scripts/audit_audio_bundle.py \
  --bundle client/godot/assets/audio/<bundle-id>
```

The builder emits `audio-cues.json` and `source/provenance.json`. Provenance
records the generator and FFmpeg version, implementation hash, complete
processing command, source IDs and hashes, license fields, runtime hashes, and
specification fragment hash. The auditor re-hashes both runtime and source
files; a provenance document alone is not proof that the current files match.
For Ogg loops it decodes to the declared granule duration, concatenates four
independently decoded copies, and measures all three real boundaries. Do not
reuse one boundary value three times or include duration in a “music is
distinct” score.

Run at least three consecutive builds against the same frozen specification
and compare every runtime hash. A scheduling workaround that pads EOF, changes
an already reviewed sample count, or merely happens to match twice is not a
valid determinism fix.
