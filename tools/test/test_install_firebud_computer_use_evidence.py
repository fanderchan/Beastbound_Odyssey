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


if __name__ == "__main__":
    unittest.main()
