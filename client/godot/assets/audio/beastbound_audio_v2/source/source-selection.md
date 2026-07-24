# Beastbound combat audio v2 source selection

## Goal

Replace the first procedural combat pass with short, dry, materially legible
Foley while keeping every semantic cue independently replaceable. This is an
owner-listening candidate, not a frozen final master.

## Selection rules

- Only project-owned source or creator-authored CC0 packs are accepted.
- No audio extracted from StoneAge or another commercial game is present.
- Runtime masters are 48 kHz mono PCM16 and retain at least 3 dB of per-file
  peak headroom before bus gain and the master limiter.
- Main impacts use low-centroid punch and soft-body recordings. Bright layers
  are low-passed and kept well below the body layer.
- Each one-shot receives a 3–10 ms onset fade and a 35–100 ms release fade to
  remove edit clicks and hard tails.
- Combo contacts stay light and staggered. Only the convergence frame receives
  the main combo impact.

## Measured basis

The chosen Kenney medium and heavy punch sources have average spectral
centroids around 0.70–0.86 kHz, and their energy above 5 kHz is roughly 40 dB
below overall energy. They therefore provide body without the sharp metallic
edge heard in the rejected sword candidates.

The selected swishes have centroids around 1.87–2.39 kHz. They are trimmed,
low-passed to 5.5–6.2 kHz and used at motion-layer levels only.

The downloaded StarNinjas attack and clash files are valid CC0, but were
rejected from this runtime pass: their energy above 5 kHz was only about
0.8–2 dB below overall energy, making them too bright for the requested warm,
non-abrupt mix even before simultaneous battle layers.

## Runtime hierarchy

1. Motion or cast layer, quiet.
2. One contact body, medium.
3. Optional result accent such as block or critical, quieter than the body.
4. Reaction layer such as launch, bounce edge or down, tied to its visible
   marker instead of the network-event arrival time.

The per-cue processing and exact source hashes are machine-readable in
`spec.json` and `provenance.json`.

## Phase 334 readability correction

Owner listening found that the first v2 `combat.down` master communicated only
a soft body drop, while `combat.launch` was masked by the preceding contact.
The same frozen CC0 sources are therefore remixed without adding new downloads:

- `combat.down` keeps its leather/body landing and adds three descending,
  delayed `rubberduck_item_gem_02` accents to communicate a short dazed or
  unconscious state without reusing the ascending victory pattern;
- `combat.launch` raises the dry air-displacement layer, adds a second
  high-frequency swish plus a sustained spell-air tail, while removing the
  redundant ordinary hit layer that previously masked the flight sound;
- neither change introduces a looping status sound or a new gameplay rule.
