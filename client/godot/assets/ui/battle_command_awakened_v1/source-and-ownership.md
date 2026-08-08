# Battle command awakened UI source and ownership

- Bundle: `battle_command_awakened_v1`
- Created: 2026-08-02
- Intended use: Beastbound Odyssey battle command HUD only.
- Source type: project-original raster icons generated with OpenAI built-in
  ImageGen from a project-authored prompt.
- Reference boundary: the supplied StoneAge: Awakening screenshots informed
  command hierarchy and right-edge placement only. The final layout uses a
  clean aligned bottom row and right edge, never an arc. Their art,
  logos, textures, screenshots, and source assets are not shipped.
- Runtime source: `source/generated/battle_command_icon_atlas_alpha.png`.
- Rebuild: run `python3 source/build_icons.py` from this bundle directory.
- Replacement path: replace the reviewed alpha atlas with another original or
  license-clear 4x4 atlas in the same declared order, then rebuild and review
  all 16 96x96 outputs at 1280x720.
- Review status: engineering candidate; player-visible visual acceptance is
  pending the project owner's inspection of the real-client screenshots.
