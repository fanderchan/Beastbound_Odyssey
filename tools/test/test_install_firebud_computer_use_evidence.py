from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path


TOOL_PATH = Path(__file__).resolve().parents[1] / "install_firebud_computer_use_evidence.py"
SPEC = importlib.util.spec_from_file_location(
    "install_firebud_computer_use_evidence",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


class InstallFirebudComputerUseEvidenceTest(unittest.TestCase):
    def test_action_matrix_is_exact(self) -> None:
        self.assertEqual(set(TOOL.ACTION_CONFIG), set(TOOL.MAP_IDS))
        for map_id in TOOL.MAP_IDS:
            self.assertEqual(
                set(TOOL.ACTION_CONFIG[map_id]),
                set(TOOL.ACTION_KINDS),
            )

    def test_village_actions_match_current_safe_composition(self) -> None:
        village = TOOL.ACTION_CONFIG["firebud_village_gate"]
        movement = village["movement_path"]
        warp = village["warp"]
        collision = village["collision"]
        occlusion = village["occlusion"]

        self.assertEqual(movement["steps"][0]["windowPoint"], [39, 355])
        self.assertIn("西南侧草地", movement["description"])
        self.assertEqual(warp["steps"][2]["windowPoint"], [430, 297])
        self.assertIn("恢复正常 HUD", warp["description"])
        self.assertEqual(collision["steps"][0]["windowPoint"], [132, 246])
        self.assertIn("记录图腾", "\n".join(collision["observations"]))
        self.assertEqual(occlusion["steps"][0]["windowPoint"], [410, 270])
        self.assertEqual(occlusion["steps"][1]["windowPoint"], [280, 270])
        self.assertEqual(occlusion["steps"][3]["windowPoint"], [430, 297])
        self.assertIn("木牌任务点", occlusion["description"])
        self.assertIn("盖住角色下半身", "\n".join(occlusion["observations"]))
        self.assertNotIn("贸易柜台", str(collision) + str(occlusion))

    def test_training_collision_and_occlusion_use_current_fence_cells(self) -> None:
        training = TOOL.ACTION_CONFIG["firebud_training_yard"]
        collision = training["collision"]
        occlusion = training["occlusion"]

        self.assertEqual(collision["steps"][0]["windowPoint"], [102, 146])
        self.assertIn("低木栅栏", collision["description"])
        self.assertIn("阻挡 footprint", "\n".join(collision["observations"]))
        self.assertEqual(occlusion["steps"][0]["windowPoint"], [133, 130])
        self.assertIn("低木栅栏后侧", occlusion["description"])
        self.assertIn("围栏横杆与立柱", "\n".join(occlusion["observations"]))

    def test_raw_root_rejects_paths_outside_run_evidence(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            with self.assertRaises(TOOL.FirebudEvidenceInstallError):
                TOOL._resolve_raw_root(temp)

    def test_snapshot_restore_recovers_old_bytes_and_removes_new_file(self) -> None:
        with tempfile.TemporaryDirectory() as temp:
            root = Path(temp)
            old = root / "old.bin"
            new = root / "new.bin"
            old.write_bytes(b"old")
            snapshot = {old: b"old", new: None}
            old.write_bytes(b"changed")
            new.write_bytes(b"new")
            TOOL._restore_snapshot(snapshot)
            self.assertEqual(old.read_bytes(), b"old")
            self.assertFalse(new.exists())

    def test_installer_embeds_pixel_gate_and_single_precomposed_board(self) -> None:
        source = TOOL_PATH.read_text(encoding="utf-8")
        self.assertIn("HUD_GLYPH.analyze_image", source)
        self.assertIn("runtime_reference", source)
        self.assertIn("reference=(", source)
        self.assertIn("action_kind != \"pointer\"", source)
        self.assertIn("HUD_GLYPH.build_task_hud_board_bytes", source)
        self.assertIn("incrementalPreviewAcceptedAsPixelAuthority", source)
        self.assertIn("HUD_GLYPH_BOARD_PATH", source)


if __name__ == "__main__":
    unittest.main()
