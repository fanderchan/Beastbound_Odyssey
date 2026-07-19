from __future__ import annotations

import importlib.util
import tempfile
import unittest
from pathlib import Path

from PIL import Image


MODULE_PATH = Path(__file__).resolve().parents[1] / "finalize_pet_identity_gate.py"
SPEC = importlib.util.spec_from_file_location("finalize_pet_identity_gate", MODULE_PATH)
assert SPEC is not None and SPEC.loader is not None
MODULE = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(MODULE)


class FinalizePetIdentityGateTest(unittest.TestCase):
    def test_action_contract_is_complete_and_pending(self) -> None:
        actions = MODULE.action_metadata()
        self.assertEqual(list(actions), list(MODULE.ACTION_SPECS))
        self.assertEqual(len(actions), 12)
        self.assertTrue(all(value["status"] == "not_produced" for value in actions.values()))
        self.assertEqual(actions["idle"]["frameCount"], 6)
        self.assertEqual(actions["revive"]["frameCount"], 8)

    def test_lossless_webp_preserves_decoded_rgba_pixels(self) -> None:
        with tempfile.TemporaryDirectory() as directory:
            root = Path(directory)
            source = root / "source.png"
            archive = root / "source.webp"
            image = Image.new("RGBA", (9, 7), (0, 0, 0, 0))
            image.putpixel((1, 1), (12, 34, 56, 255))
            image.putpixel((4, 5), (222, 111, 7, 127))
            image.save(source)

            decoded_hash, archive_hash = MODULE.archive_lossless_webp(source, archive)

            self.assertTrue(archive.is_file())
            self.assertEqual(decoded_hash, MODULE.decoded_rgba_sha256(source))
            self.assertEqual(decoded_hash, MODULE.decoded_rgba_sha256(archive))
            self.assertEqual(archive_hash, MODULE.sha256_file(archive))


if __name__ == "__main__":
    unittest.main()
