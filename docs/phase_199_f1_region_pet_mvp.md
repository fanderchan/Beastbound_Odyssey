# Phase 199: F1 Region And Catchable Pet MVP

Date: 2026-07-04

## Scope

This slice starts `stoneage_gap_plan.md` F1 with:

- Three original field regions connected from 火芽村入口:
  - 雾帽湿地, Lv10-24
  - 裂日荒原, Lv25-45
  - 风镜高地, Lv45-65
- Ten new catchable pet forms:
  - 苔背兽系: 湿地苔背兽, 晒甲苔背兽
  - 风狐系: 雾风狐, 高地风狐
  - 炽角兽系: 赤角兽, 灰烬角兽, 岚角兽
  - 潮鳍兽系: 雾潮鳍兽, 云潮鳍兽, 苇潮鳍兽

## Reference Boundary

The local StoneAge 8.0 reference was used only for mechanism intent: field progression, regional wild-pet pools, and catchable encounter placement. No StoneAge source, map layout, data values, art, or asset files were copied.

## Data Contracts

- Map loading registrations were added to `main.gd`, `panel_flow_coordinator.gd`, and `auto_check_coordinator.gd`.
- Region metadata lives in `client/godot/data/map_regions.json`.
- Each field map owns two encounter groups and one return warp to 火芽村入口.
- Each new pet form is `capture.catchable = true` and can produce a runtime battle actor through `PetTemplateCatalog.actor_from_form`.
- The ten F1 pets use current procedural placeholder palettes, but each declares `visual.artPlan.replacementPath` for later original art.

## Deferred

- F1 G1.3 battle action expansion is not included in this slice.
- F1 G1.4 regional material drops are not included in this slice.
- Species-specific Lv1-Lv140 growth observation profiles are deferred until the pet-growth balance pass; current catchable field pets follow the existing generic `growthProfileId` pattern used by early catchable pets.
