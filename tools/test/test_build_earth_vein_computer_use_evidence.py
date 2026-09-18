from __future__ import annotations

import importlib.util
from pathlib import Path
import unittest


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = (
    REPO_ROOT
    / "client/godot/assets/maps/earth_vein_cave_visual_v1/source/tools"
    / "build_computer_use_evidence.py"
)
SPEC = importlib.util.spec_from_file_location(
    "build_earth_vein_computer_use_evidence_test_target",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


class BuildEarthVeinComputerUseEvidenceTest(unittest.TestCase):
    def test_action_matrix_is_closed_and_points_stay_inside_window(self) -> None:
        self.assertEqual(tuple(TOOL.ACTION_CONFIG), TOOL.MAP_IDS)
        for map_id in TOOL.MAP_IDS:
            actions = TOOL.ACTION_CONFIG[map_id]
            self.assertEqual(tuple(actions), TOOL.ACTION_KINDS)
            for action_kind in TOOL.ACTION_KINDS:
                point = actions[action_kind]["point"]
                self.assertEqual(len(point), 2)
                self.assertGreaterEqual(point[0], 0)
                self.assertLess(point[0], 640)
                self.assertGreaterEqual(point[1], 32)
                self.assertLess(point[1], 392)

    def test_current_map_button_and_warp_setup_are_exact(self) -> None:
        for map_id in TOOL.MAP_IDS:
            self.assertEqual(
                TOOL.ACTION_CONFIG[map_id]["pointer"]["point"],
                [75, 76],
            )
            self.assertEqual(
                TOOL.ACTION_CONFIG[map_id]["warp"]["setupSteps"],
                TOOL.OPEN_MAP_SETUP_STEPS,
            )
        self.assertEqual(
            TOOL.ACTION_CONFIG["earth_vein_cave_f4"]["warp"]["point"],
            [82, 206],
        )

    def test_prepared_collision_receipts_keep_setup_steps(self) -> None:
        f1 = TOOL.ACTION_CONFIG["earth_vein_cave"]["collision"]
        f4 = TOOL.ACTION_CONFIG["earth_vein_cave_f4"]["collision"]
        self.assertEqual(f1["setupSteps"], TOOL.F1_COLLISION_SETUP_STEPS)
        self.assertEqual(f4["setupSteps"], TOOL.F4_COLLISION_SETUP_STEPS)
        source = TOOL_PATH.read_text(encoding="utf-8")
        self.assertIn('"setupSteps": config.get("setupSteps", [])', source)

    def test_partial_occlusion_targets_remain_readable(self) -> None:
        f3 = TOOL.ACTION_CONFIG["earth_vein_cave_f3"]["occlusion"]
        f4 = TOOL.ACTION_CONFIG["earth_vein_cave_f4"]["occlusion"]
        self.assertEqual(f3["point"], [150, 245])
        self.assertEqual(f4["point"], [250, 285])
        self.assertTrue(any("头肩可辨" in value for value in f3["observations"]))
        self.assertTrue(any("头肩可辨" in value for value in f4["observations"]))


if __name__ == "__main__":
    unittest.main()
