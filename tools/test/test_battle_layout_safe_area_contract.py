#!/usr/bin/env python3
"""Static source and geometry contract for the Phase 403 battle safe areas."""

from __future__ import annotations

import json
import math
import re
import unittest
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
CONSTANTS_PATH = REPO_ROOT / "client/godot/scripts/battle/battle_layout_constants.gd"
MODEL_PATH = REPO_ROOT / "client/godot/scripts/battle/battle_layout_safe_area_model.gd"
BATTLE_MODEL_PATH = REPO_ROOT / "client/godot/scripts/battle/battle_model.gd"
MAIN_PATH = REPO_ROOT / "client/godot/scripts/main.gd"
WORLD_HUD_PATH = REPO_ROOT / "client/godot/scripts/ui/world_hud_awakened_view.gd"
COMMAND_HOST_PATH = REPO_ROOT / "client/godot/scripts/ui/battle_command_awakened_host.gd"
COMMAND_PRESENTER_PATH = REPO_ROOT / "client/godot/scripts/ui/battle_command_awakened_presenter.gd"
COMMAND_VIEW_PATH = REPO_ROOT / "client/godot/scripts/ui/battle_command_awakened_view.gd"
COMMAND_VIEW_CHECK_PATH = (
    REPO_ROOT / "client/godot/scripts/qa/battle_command_awakened_view_check.gd"
)
MOUNT_PROFILE_PATH = REPO_ROOT / "client/godot/data/mount_visual_profiles.json"
SERVER_PATH = REPO_ROOT / "server/node/src/auth-service.js"

VIEWPORT = (1280.0, 720.0)
LEGACY_ORIGIN = (128.0, 338.4)
LEGACY_LANE_STEP = (152.0, 52.0)
LEGACY_RANK_STEP = (76.0, -48.0)


def _require_phase397_command_geometry_contract(
    *,
    main_source: str,
    presenter_source: str,
    view_source: str,
    check_source: str,
    host_source: str | None = None,
) -> None:
    if host_source is None:
        host_source = COMMAND_HOST_PATH.read_text(encoding="utf-8")
    configure_start = view_source.find("func configure_command_buttons(")
    configure_end = view_source.find("\nfunc command_buttons()", configure_start)
    if configure_start < 0 or configure_end <= configure_start:
        raise AssertionError("missing focused legacy-button takeover")
    configure_source = view_source[configure_start:configure_end]
    authoritative_button_writes = [
        line.strip()
        for line in configure_source.splitlines()
        if re.match(r"^_command_buttons\s*=", line.strip())
    ]
    if authoritative_button_writes != ["_command_buttons = buttons"]:
        raise AssertionError(
            "focused view must retain the exact host button dictionary"
        )
    if "duplicate" in configure_source or "copy" in configure_source:
        raise AssertionError(
            "focused button takeover must not duplicate or copy the dictionary"
        )
    reset_index = configure_source.find(
        "button.custom_minimum_size = Vector2.ZERO"
    )
    prepare_index = configure_source.find("_prepare_button(button")
    if reset_index < 0 or prepare_index <= reset_index:
        raise AssertionError(
            "focused view must clear legacy minimum before preparing layout"
        )
    if (
        'return Vector2(70.0, 42.0) if battle_command_owner == "player"'
        not in main_source
    ):
        raise AssertionError("legacy constructor contract changed")
    command_accessor_start = view_source.find("func command_buttons() -> Dictionary:")
    command_accessor_end = view_source.find(
        "\nfunc contract_grid()", command_accessor_start
    )
    if command_accessor_start < 0 or command_accessor_end <= command_accessor_start:
        raise AssertionError("focused command_buttons accessor missing")
    command_accessor_source = view_source[
        command_accessor_start:command_accessor_end
    ].strip()
    if command_accessor_source != (
        "func command_buttons() -> Dictionary:\n"
        "\treturn _command_buttons"
    ):
        raise AssertionError("focused command_buttons must return authoritative dictionary")
    mount_start = host_source.find("func _mount_command_view() -> void:")
    mount_end = host_source.find("\nfunc _mount_function_drawer()", mount_start)
    if mount_start < 0 or mount_end <= mount_start:
        raise AssertionError("awakened host command mount missing")
    mount_source = host_source[mount_start:mount_end]
    configure_call = "_view.configure_command_buttons(_host.battle_command_buttons)"
    authoritative_rebind = "_host.battle_command_buttons = _view.command_buttons()"
    if (
        mount_source.count(configure_call) != 1
        or mount_source.count(authoritative_rebind) != 1
        or mount_source.find(configure_call) >= mount_source.find(authoritative_rebind)
    ):
        raise AssertionError("host must pass and retain the same authoritative button dictionary")
    presenter_fragments = (
        "const TOUCH_SIZE := Vector2(68.0, 72.0)",
        "const RIGHT_COLUMN_REGION := Rect2(418.0, 0.0, 68.0, 300.0)",
        "const BOTTOM_ROW_REGION := Rect2(8.0, 228.0, 478.0, 72.0)",
        "not rect.size.is_equal_approx(TOUCH_SIZE)",
        "not RIGHT_COLUMN_REGION.encloses(rect)",
        "not BOTTOM_ROW_REGION.encloses(rect)",
        "previous_rect.intersects(rect)",
        "if PLAYER_LAYOUT.size() != 10:",
        "if PET_LAYOUT.size() != 8:",
        "if AUTO_LAYOUT.keys().size() != 3:",
    )
    check_fragments = (
        "func _player_command_geometry_snapshot(view: Control) -> Dictionary:",
        'call("command_buttons")',
        "var host_buttons_value = host.battle_command_buttons",
        "var host_buttons := host_buttons_value as Dictionary",
        '"spirit", "attack", "item", "run", "help", "capture", "switch_pet", "defend"',
        'call("synthetic_button", "managed")',
        'call("synthetic_button", "auto")',
        "Presenter.PLAYER_LAYOUT.keys()",
        "visible_count == 10",
        "seen_instance_ids.size() == 10",
        "authoritative_legacy_count == 8",
        "legacy_identity_mismatches.is_empty()",
        "(host_control as Control).get_instance_id() != instance_id",
        "var expected_global := Rect2(",
        "expected_local.size.is_equal_approx(Presenter.TOUCH_SIZE)",
        "actual_rect.position.is_equal_approx(expected_global.position)",
        "actual_rect.size.is_equal_approx(expected_global.size)",
        "and position_exact",
        "right_global.encloses(actual_rect)",
        "bottom_global.encloses(actual_rect)",
        "previous_rect.intersects(actual_rect)",
        '"playerGeometry": player_geometry',
        '["宠", "主", "取消"]',
        '["技能", "攻击", "撤回", "逃跑", "援助", "折返", "防御", "自动"]',
    )
    if any(fragment not in presenter_source for fragment in presenter_fragments):
        raise AssertionError("presenter exact-size or no-overlap selftest missing")
    if any(fragment not in check_source for fragment in check_fragments):
        raise AssertionError("focused actual player-button geometry gate missing")
    geometry_start = check_source.find(
        "func _player_command_geometry_snapshot(view: Control) -> Dictionary:"
    )
    geometry_end = check_source.find(
        "\nfunc _top_battle_layout_snapshot(", geometry_start
    )
    if geometry_start < 0 or geometry_end <= geometry_start:
        raise AssertionError("focused actual geometry function boundary missing")
    geometry_source = check_source[geometry_start:geometry_end]
    measured_line = "var actual_rect := button.get_global_rect()"
    actual_rect_writes = [
        line.strip()
        for line in geometry_source.splitlines()
        if re.match(
            r"^(?:var\s+)?actual_rect(?:\.[A-Za-z_][A-Za-z0-9_]*)?\s*(?::=|=)",
            line.strip(),
        )
    ]
    if actual_rect_writes != [measured_line]:
        raise AssertionError(
            "actual_rect must be measured once and never overwritten"
        )
    expected_local_writes = [
        line.strip()
        for line in geometry_source.splitlines()
        if re.match(
            r"^(?:var\s+)?expected_local(?:\.[A-Za-z_][A-Za-z0-9_]*)?\s*(?::=|=)",
            line.strip(),
        )
    ]
    if expected_local_writes != ["var expected_local := Presenter.scaled_rect("]:
        raise AssertionError("expected_local must come only from Presenter.scaled_rect")
    expected_global_writes = [
        line.strip()
        for line in geometry_source.splitlines()
        if re.match(
            r"^(?:var\s+)?expected_global(?:\.[A-Za-z_][A-Za-z0-9_]*)?\s*(?::=|=)",
            line.strip(),
        )
    ]
    if expected_global_writes != ["var expected_global := Rect2("]:
        raise AssertionError("expected_global must be built once from view and Presenter")
    expected_global_definition = (
        "var expected_global := Rect2(\n"
        "\t\t\tview.global_position + expected_local.position,\n"
        "\t\t\texpected_local.size\n"
        "\t\t)"
    )
    if geometry_source.count(expected_global_definition) != 1:
        raise AssertionError(
            "expected_global must use only view position and Presenter-scaled rect"
        )
    measurement_index = geometry_source.find(measured_line)
    expected_index = geometry_source.find("var expected_global := Rect2(")
    position_compare_index = geometry_source.find(
        "actual_rect.position.is_equal_approx(expected_global.position)"
    )
    size_compare_index = geometry_source.find(
        "actual_rect.size.is_equal_approx(expected_global.size)"
    )
    if not (
        0 <= measurement_index < expected_index < position_compare_index
        and expected_index < size_compare_index
    ):
        raise AssertionError(
            "actual global rect must be measured before both expected comparisons"
        )

def _vector_constant(path: Path, name: str) -> tuple[float, float]:
    match = re.search(
        rf"const\s+{re.escape(name)}\s*:=\s*Vector2\(\s*([-0-9.]+)\s*,\s*([-0-9.]+)\s*\)",
        path.read_text(encoding="utf-8"),
    )
    if match is None:
        raise AssertionError(f"missing Vector2 constant {name} in {path}")
    return float(match.group(1)), float(match.group(2))


def _rect_constant(path: Path, name: str) -> tuple[float, float, float, float]:
    match = re.search(
        rf"const\s+{re.escape(name)}\s*:=\s*Rect2\(\s*([-0-9.]+)\s*,\s*"
        rf"([-0-9.]+)\s*,\s*([-0-9.]+)\s*,\s*([-0-9.]+)\s*\)",
        path.read_text(encoding="utf-8"),
    )
    if match is None:
        raise AssertionError(f"missing Rect2 constant {name} in {path}")
    return tuple(float(match.group(index)) for index in range(1, 5))


def _rect_edges(rect: tuple[float, float, float, float]) -> tuple[float, float, float, float]:
    x, y, width, height = rect
    return x, y, x + width, y + height


def _merge_rects(
    first: tuple[float, float, float, float],
    second: tuple[float, float, float, float],
) -> tuple[float, float, float, float]:
    first_edges = _rect_edges(first)
    second_edges = _rect_edges(second)
    left = min(first_edges[0], second_edges[0])
    top = min(first_edges[1], second_edges[1])
    right = max(first_edges[2], second_edges[2])
    bottom = max(first_edges[3], second_edges[3])
    return left, top, right - left, bottom - top


def _grow_and_clip(
    rect: tuple[float, float, float, float],
    padding: float,
) -> tuple[int, int, int, int]:
    left, top, right, bottom = _rect_edges(rect)
    return (
        max(0, round(left - padding)),
        max(0, round(top - padding)),
        min(round(VIEWPORT[0]), round(right + padding)),
        min(round(VIEWPORT[1]), round(bottom + padding)),
    )


def _anchors(
    origin: tuple[float, float],
    lane_step: tuple[float, float],
    rank_step: tuple[float, float],
) -> dict[str, tuple[float, float]]:
    result: dict[str, tuple[float, float]] = {}
    for side in ("enemy", "ally"):
        for row in ("back", "front"):
            for slot_index in range(1, 6):
                if side == "enemy":
                    lane = 1 if row == "front" else 0
                    rank = slot_index - 1
                else:
                    lane = 5 if row == "back" else 4
                    rank = 5 - slot_index
                result[f"{side}.{row}.{slot_index}"] = (
                    origin[0] + lane_step[0] * lane + rank_step[0] * rank,
                    origin[1] + lane_step[1] * lane + rank_step[1] * rank,
                )
    return result


def _actor_box(
    anchor: tuple[float, float],
    offset: tuple[float, float],
    size: tuple[float, float],
) -> tuple[int, int, int, int]:
    start_x = round(anchor[0] + offset[0])
    start_y = round(anchor[1] + offset[1])
    end_x = round(anchor[0] + offset[0] + size[0])
    end_y = round(anchor[1] + offset[1] + size[1])
    return start_x, start_y, end_x, end_y


def _intersection_area(
    first: tuple[int, int, int, int],
    second: tuple[int, int, int, int],
) -> int:
    width = max(0, min(first[2], second[2]) - max(first[0], second[0]))
    height = max(0, min(first[3], second[3]) - max(first[1], second[1]))
    return width * height


def _persistent_safe_zones() -> dict[str, tuple[tuple[int, int, int, int], ...]]:
    round_rect = _rect_constant(MODEL_PATH, "ROUND_PANEL_RECT")
    timer_rect = _rect_constant(MODEL_PATH, "TIMER_PANEL_RECT")
    message_rect = _rect_constant(MODEL_PATH, "MESSAGE_PANEL_RECT")
    footer_rect = _rect_constant(MODEL_PATH, "MESSAGE_FOOTER_RECT")
    right_rect = _rect_constant(MODEL_PATH, "COMMAND_RIGHT_COLUMN_RECT")
    bottom_rect = _rect_constant(MODEL_PATH, "COMMAND_BOTTOM_ROW_RECT")
    return {
        "topRoundAndTimer": (_grow_and_clip(_merge_rects(round_rect, timer_rect), 8.0),),
        "lowerLeftBattleMessage": (
            _grow_and_clip(message_rect, 8.0),
            _grow_and_clip(footer_rect, 8.0),
        ),
        "rightBottomCommandControls": (
            _grow_and_clip(right_rect, 8.0),
            _grow_and_clip(bottom_rect, 8.0),
        ),
    }


def _collisions(
    anchors: dict[str, tuple[float, float]],
    offset: tuple[float, float],
    size: tuple[float, float],
) -> list[tuple[str, str, int]]:
    result: list[tuple[str, str, int]] = []
    for slot_id, anchor in anchors.items():
        actor_box = _actor_box(anchor, offset, size)
        for zone, safe_rects in _persistent_safe_zones().items():
            for safe_rect in safe_rects:
                area = _intersection_area(actor_box, safe_rect)
                if area > 0:
                    result.append((slot_id, zone, area))
    return result


class BattleLayoutSafeAreaContractTest(unittest.TestCase):
    def test_phase397_source_geometry_matches_focused_model(self) -> None:
        self.assertEqual(
            _rect_constant(MODEL_PATH, "ROUND_PANEL_RECT"),
            (576.0, 18.0, 128.0, 40.0),
        )
        self.assertEqual(
            _rect_constant(MODEL_PATH, "TIMER_PANEL_RECT"),
            (584.0, 62.0, 112.0, 44.0),
        )
        self.assertEqual(
            _rect_constant(MODEL_PATH, "MESSAGE_PANEL_RECT"),
            (57.0, 469.0, 348.0, 233.0),
        )
        self.assertEqual(
            _rect_constant(MODEL_PATH, "MESSAGE_FOOTER_RECT"),
            (57.0, 703.0, 204.0, 17.0),
        )
        self.assertEqual(
            _rect_constant(MODEL_PATH, "MESSAGE_EXPANDED_RECT"),
            (24.0, 350.0, 560.0, 352.0),
        )
        self.assertEqual(
            _rect_constant(MODEL_PATH, "MESSAGE_EXPANDED_FOOTER_RECT"),
            (24.0, 703.0, 204.0, 17.0),
        )
        passive_rect = _rect_constant(MODEL_PATH, "BATTLE_PASSIVE_PANEL_RECT")
        self.assertEqual(passive_rect, (774.0, 18.0, 390.0, 64.0))
        self.assertEqual(
            _intersection_area(
                tuple(round(value) for value in _rect_edges(passive_rect)),
                tuple(
                    round(value)
                    for value in _rect_edges(
                        _merge_rects(
                            _rect_constant(MODEL_PATH, "ROUND_PANEL_RECT"),
                            _rect_constant(MODEL_PATH, "TIMER_PANEL_RECT"),
                        )
                    )
                ),
            ),
            0,
        )
        self.assertEqual(passive_rect[0] + passive_rect[2] + 12.0, 1176.0)
        self.assertEqual(
            _persistent_safe_zones(),
            {
                "topRoundAndTimer": ((568, 10, 712, 114),),
                "lowerLeftBattleMessage": (
                    (49, 461, 413, 710),
                    (49, 695, 269, 720),
                ),
                "rightBottomCommandControls": (
                    (1178, 394, 1262, 710),
                    (768, 622, 1262, 710),
                ),
            },
        )

        main_source = MAIN_PATH.read_text(encoding="utf-8")
        self.assertRegex(main_source, r"var margin := 18\.0")
        self.assertRegex(main_source, r"var round_size := Vector2\(128\.0, 40\.0\)")
        self.assertRegex(main_source, r"var round_y := margin")
        self.assertRegex(main_source, r"var timer_size := Vector2\(112\.0, 44\.0\)")
        self.assertRegex(main_source, r"var timer_y := margin \+ 44\.0")
        self.assertIn(
            "BattleLayoutSafeAreaModel.battle_passive_panel_rect(",
            main_source,
        )
        self.assertNotIn(
            "battle_passive_panel.position = Vector2((viewport_size.x - passive_width) * 0.5, passive_y)",
            main_source,
        )

        world_hud_source = WORLD_HUD_PATH.read_text(encoding="utf-8")
        self.assertRegex(
            world_hud_source,
            r"var message_rect := Rect2\(\s*Vector2\(57\.0 \* scale_x, 469\.0 \* scale_y\),"
            r"\s*Vector2\(348\.0 \* scale_x, 233\.0 \* scale_y\)",
        )
        self.assertRegex(
            world_hud_source,
            r"message_rect = Rect2\(\s*Vector2\(24\.0 \* scale_x, 350\.0 \* scale_y\),"
            r"\s*Vector2\(560\.0 \* scale_x, 352\.0 \* scale_y\)",
        )
        self.assertIn(
            "_clock_label.position = Vector2(0.0, message_size.y + 1.0)",
            world_hud_source,
        )
        self.assertIn(
            "_experience_label.position = Vector2(72.0, message_size.y + 1.0)",
            world_hud_source,
        )

        presenter_source = COMMAND_PRESENTER_PATH.read_text(encoding="utf-8")
        self.assertIn("const DESIGN_SIZE := Vector2(494.0, 300.0)", presenter_source)
        self.assertIn('"spirit": Rect2(418, 0, 68, 72)', presenter_source)
        self.assertIn('"auto": Rect2(418, 228, 68, 72)', presenter_source)
        self.assertIn('"managed": Rect2(8, 228, 68, 72)', presenter_source)
        host_source = COMMAND_HOST_PATH.read_text(encoding="utf-8")
        self.assertIn("viewport_size.x - view_size.x - 18.0", host_source)
        self.assertIn("viewport_size.y - view_size.y - 18.0", host_source)
        view_source = COMMAND_VIEW_PATH.read_text(encoding="utf-8")
        check_source = COMMAND_VIEW_CHECK_PATH.read_text(encoding="utf-8")
        _require_phase397_command_geometry_contract(
            main_source=main_source,
            presenter_source=presenter_source,
            view_source=view_source,
            check_source=check_source,
            host_source=host_source,
        )
        invalid_contracts = (
            {
                "main_source": main_source,
                "presenter_source": presenter_source,
                "view_source": view_source.replace(
                    "button.custom_minimum_size = Vector2.ZERO",
                    "button.custom_minimum_size = Vector2(70.0, 42.0)",
                    1,
                ),
                "check_source": check_source,
            },
            {
                "main_source": main_source,
                "presenter_source": presenter_source.replace(
                    "const TOUCH_SIZE := Vector2(68.0, 72.0)",
                    "const TOUCH_SIZE := Vector2(70.0, 72.0)",
                    1,
                ),
                "view_source": view_source,
                "check_source": check_source,
            },
            {
                "main_source": main_source,
                "presenter_source": presenter_source,
                "view_source": view_source.replace(
                    "_command_buttons = buttons",
                    "_command_buttons = buttons.duplicate()",
                    1,
                ),
                "check_source": check_source,
            },
            {
                "main_source": main_source,
                "presenter_source": presenter_source.replace(
                    "previous_rect.intersects(rect)",
                    "false",
                    1,
                ),
                "view_source": view_source,
                "check_source": check_source,
            },
            {
                "main_source": main_source,
                "presenter_source": presenter_source,
                "host_source": host_source,
                "view_source": view_source.replace(
                    "\treturn _command_buttons",
                    "\treturn _command_buttons.duplicate()",
                    1,
                ),
                "check_source": check_source,
            },
            {
                "main_source": main_source,
                "presenter_source": presenter_source,
                "host_source": host_source.replace(
                    "_view.configure_command_buttons(_host.battle_command_buttons)",
                    "_view.configure_command_buttons(_host.battle_command_buttons.duplicate())",
                    1,
                ),
                "view_source": view_source,
                "check_source": check_source,
            },
            {
                "main_source": main_source,
                "presenter_source": presenter_source,
                "view_source": view_source,
                "check_source": check_source.replace(
                    "actual_rect.size.is_equal_approx(expected_global.size)",
                    "actual_rect.size.x >= 60.0",
                    1,
                ),
            },
            {
                "main_source": main_source,
                "presenter_source": presenter_source,
                "view_source": view_source,
                "check_source": check_source.replace(
                    "view.global_position + expected_local.position",
                    "actual_rect.position",
                    1,
                ),
            },
            {
                "main_source": main_source,
                "presenter_source": presenter_source,
                "view_source": view_source,
                "check_source": check_source.replace(
                    "\t\tif not actual_rect.position.is_equal_approx(expected_global.position):\n",
                    "\t\texpected_global = actual_rect\n"
                    "\t\tif not actual_rect.position.is_equal_approx(expected_global.position):\n",
                    1,
                ),
            },
            {
                "main_source": main_source,
                "presenter_source": presenter_source,
                "view_source": view_source,
                "check_source": check_source.replace(
                    "actual_rect.position.is_equal_approx(expected_global.position)",
                    "actual_rect.position.x >= 0.0",
                    1,
                ),
            },
            {
                "main_source": main_source,
                "presenter_source": presenter_source,
                "view_source": view_source,
                "check_source": check_source.replace(
                    "\t\tvar expected_global := Rect2(\n"
                    "\t\t\tview.global_position + expected_local.position,\n"
                    "\t\t\texpected_local.size\n"
                    "\t\t)\n",
                    "\t\tvar expected_global := Rect2(\n"
                    "\t\t\tview.global_position + expected_local.position,\n"
                    "\t\t\texpected_local.size\n"
                    "\t\t)\n"
                    "\t\tactual_rect = expected_global\n",
                    1,
                ),
            },
            {
                "main_source": main_source.replace(
                    'return Vector2(70.0, 42.0) if battle_command_owner == "player"',
                    'return Vector2(68.0, 42.0) if battle_command_owner == "player"',
                    1,
                ),
                "presenter_source": presenter_source,
                "view_source": view_source,
                "check_source": check_source,
            },
        )
        for invalid_contract in invalid_contracts:
            with self.assertRaises(AssertionError):
                _require_phase397_command_geometry_contract(
                    **invalid_contract,
                )

    def test_visible_envelope_covers_formal_render_limits(self) -> None:
        offset = _vector_constant(MODEL_PATH, "FORMAL_MAX_VISIBLE_ENVELOPE_OFFSET")
        size = _vector_constant(MODEL_PATH, "FORMAL_MAX_VISIBLE_ENVELOPE_SIZE")
        self.assertEqual(offset, (-66.0, -148.0))
        self.assertEqual(size, (132.0, 164.0))

        main_source = MAIN_PATH.read_text(encoding="utf-8")
        self.assertIn("scale = 0.74", main_source)
        self.assertIn("var target_size := 156.0 * visual_scale", main_source)
        self.assertIn("(176.0 if compact else 240.0) * visual_scale", main_source)
        self.assertIn("128.0 if compact else 168.0", main_source)
        self.assertIn(
            "maxi(9, int(round((11.0 if compact else 15.0) * visual_scale)))",
            main_source,
        )
        self.assertIn("name_offset = -188.0 * visual_scale", main_source)
        self.assertIn("* visual_scale\n\t\t* 0.72", main_source)
        mount_profiles = json.loads(MOUNT_PROFILE_PATH.read_text(encoding="utf-8"))
        battle_scales = [
            float(profile["battlePresentationScale"])
            for profile in mount_profiles["forms"].values()
        ]
        self.assertEqual(max(battle_scales), 0.88)

    def test_new_template_clears_all_twenty_slots_without_repacking(self) -> None:
        origin = _vector_constant(CONSTANTS_PATH, "GRID_TEMPLATE_ORIGIN")
        lane_step = _vector_constant(CONSTANTS_PATH, "GRID_TEMPLATE_LANE_STEP")
        rank_step = _vector_constant(CONSTANTS_PATH, "GRID_TEMPLATE_RANK_STEP")
        visible_offset = _vector_constant(MODEL_PATH, "FORMAL_MAX_VISIBLE_ENVELOPE_OFFSET")
        visible_size = _vector_constant(MODEL_PATH, "FORMAL_MAX_VISIBLE_ENVELOPE_SIZE")
        self.assertEqual(origin, (94.0, 340.4))
        self.assertEqual(lane_step, LEGACY_LANE_STEP)
        self.assertEqual(rank_step, (64.0, -48.0))
        model_source = MODEL_PATH.read_text(encoding="utf-8")
        self.assertIn("var lane := 1 if row == ROW_FRONT else 0", model_source)
        self.assertIn("var lane := 5 if row == ROW_BACK else 4", model_source)
        self.assertIn(
            "GRID_TEMPLATE_RANK_STEP * float(slot_offset)",
            model_source,
        )
        self.assertIn(
            "GRID_TEMPLATE_RANK_STEP * float(4 - slot_offset)",
            model_source,
        )

        anchors = _anchors(origin, lane_step, rank_step)
        self.assertEqual(len(anchors), 20)
        self.assertEqual(len(set(anchors.values())), 20)
        self.assertEqual(_collisions(anchors, visible_offset, visible_size), [])
        for anchor in anchors.values():
            left, top, right, bottom = _actor_box(anchor, visible_offset, visible_size)
            self.assertGreaterEqual(left, 0)
            self.assertGreaterEqual(top, 0)
            self.assertLessEqual(right, round(VIEWPORT[0]))
            self.assertLessEqual(bottom, round(VIEWPORT[1]))
        self.assertAlmostEqual(anchors["enemy.front.5"][0], 502.0)
        self.assertAlmostEqual(anchors["enemy.front.5"][1], 200.4)
        self.assertAlmostEqual(anchors["ally.back.1"][0], 1110.0)
        self.assertAlmostEqual(anchors["ally.back.1"][1], 408.4)

        adjacent = min(
            math.dist(anchors[f"{side}.{row}.{slot}"], anchors[f"{side}.{row}.{slot + 1}"])
            for side in ("enemy", "ally")
            for row in ("front", "back")
            for slot in range(1, 5)
        )
        front_back = min(
            math.dist(anchors[f"{side}.front.{slot}"], anchors[f"{side}.back.{slot}"])
            for side in ("enemy", "ally")
            for slot in range(1, 6)
        )
        opponent = min(
            math.dist(anchors[enemy], anchors[ally])
            for enemy in anchors
            if enemy.startswith("enemy.")
            for ally in anchors
            if ally.startswith("ally.")
        )
        center_charge = math.dist(anchors["enemy.front.3"], anchors["ally.front.3"])
        self.assertGreaterEqual(adjacent, 80.0)
        self.assertGreaterEqual(front_back, 150.0)
        self.assertGreaterEqual(opponent, 390.0)
        self.assertGreaterEqual(center_charge, 470.0)

    def test_negative_fixtures_detect_historical_and_formal_envelopes(self) -> None:
        legacy = _anchors(LEGACY_ORIGIN, LEGACY_LANE_STEP, LEGACY_RANK_STEP)
        frozen_offset = _vector_constant(
            MODEL_PATH,
            "PHASE402_FROZEN_SAMPLE_ENVELOPE_OFFSET",
        )
        frozen_size = _vector_constant(
            MODEL_PATH,
            "PHASE402_FROZEN_SAMPLE_ENVELOPE_SIZE",
        )
        self.assertEqual(frozen_offset, (-48.0, -112.0))
        self.assertEqual(frozen_size, (96.0, 128.0))
        self.assertEqual(
            _collisions(
                legacy,
                frozen_offset,
                frozen_size,
            ),
            [
                ("enemy.front.5", "topRoundAndTimer", 1792),
                ("ally.back.1", "rightBottomCommandControls", 1736),
            ],
        )
        visible_offset = _vector_constant(MODEL_PATH, "FORMAL_MAX_VISIBLE_ENVELOPE_OFFSET")
        visible_size = _vector_constant(MODEL_PATH, "FORMAL_MAX_VISIBLE_ENVELOPE_SIZE")
        self.assertEqual(
            _collisions(legacy, visible_offset, visible_size),
            [
                ("enemy.front.4", "topRoundAndTimer", 96),
                ("enemy.front.5", "topRoundAndTimer", 5248),
                ("ally.back.1", "rightBottomCommandControls", 2240),
                ("ally.back.2", "rightBottomCommandControls", 304),
            ],
        )

    def test_existing_sparse_1v1_positions_remain_clear(self) -> None:
        main_source = MAIN_PATH.read_text(encoding="utf-8")
        self.assertIn(
            "and BattleLayoutSafeAreaModel.supports_reference_safe_area_contract(",
            main_source,
        )
        self.assertIn(
            "BattleLayoutSafeAreaModel.reference_actor_envelope_for_anchor(",
            main_source,
        )
        self.assertIn(
            "BattleLayoutSafeAreaModel.reference_persistent_hud_intersections_for_rect(",
            main_source,
        )
        self.assertIn(
            "BattleLayoutSafeAreaModel.template_enemy_slot_anchor(",
            main_source,
        )
        self.assertIn(
            "BattleLayoutSafeAreaModel.template_ally_slot_anchor(",
            main_source,
        )
        self.assertIn(
            'base = Vector2(viewport_size.x * 0.70, minf(viewport_size.y * 0.58, max_ally_front_y))',
            main_source,
        )
        self.assertIn(
            'base = Vector2(viewport_size.x * 0.82, minf(viewport_size.y * 0.70, max_ally_back_y))',
            main_source,
        )
        self.assertIn(
            'base = Vector2(viewport_size.x * 0.32, viewport_size.y * 0.42)',
            main_source,
        )
        battle_model_source = BATTLE_MODEL_PATH.read_text(encoding="utf-8")
        self.assertIn('"enemy.front.3"', battle_model_source)
        self.assertIn('"ally.back.3"', battle_model_source)
        self.assertIn('"ally.front.3"', battle_model_source)

        visible_offset = _vector_constant(MODEL_PATH, "FORMAL_MAX_VISIBLE_ENVELOPE_OFFSET")
        visible_size = _vector_constant(MODEL_PATH, "FORMAL_MAX_VISIBLE_ENVELOPE_SIZE")
        sparse_anchors = {
            "enemy.front.3": (409.6, 302.4),
            "ally.front.3": (896.0, 417.6),
            "ally.back.3": (1049.6, 504.0),
        }
        self.assertEqual(_collisions(sparse_anchors, visible_offset, visible_size), [])

    def test_server_slot_identity_and_order_are_untouched(self) -> None:
        server_source = SERVER_PATH.read_text(encoding="utf-8")
        self.assertIn("const BATTLE_PARTY_PVE_PLAYER_SLOTS = [3, 4, 2, 5, 1];", server_source)
        self.assertIn("slotId: `${BATTLE_SIDE_ALLY}.back.${slotNumber}`", server_source)
        self.assertIn("slotId: `${BATTLE_SIDE_ALLY}.front.${slotNumber}`", server_source)
        self.assertIn("slotId: `${BATTLE_SIDE_ENEMY}.${row}.${slotNumber}`", server_source)


if __name__ == "__main__":
    unittest.main()
