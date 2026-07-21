from __future__ import annotations

import importlib.util
import json
import re
import tempfile
import unittest
from pathlib import Path

from PIL import Image, ImageDraw


SCRIPT = (
    Path(__file__).resolve().parents[1]
    / "prepare_npc_blind_review_packet.py"
)
SPEC = importlib.util.spec_from_file_location(
    "prepare_npc_blind_review_packet", SCRIPT
)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


class PrepareNpcBlindReviewPacketTest(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        self.addCleanup(self.temporary.cleanup)
        self.root = Path(self.temporary.name)
        self.run_id = "phase327-blind-test-v1"
        self.appearance_id = "npc_fixture_m_v1"
        self.run_dir = (
            self.root / ".run" / "evidence" / "candidate" / self.run_id
        )
        self.run_dir.mkdir(parents=True)
        self.asset_root = (
            self.root
            / "client"
            / "godot"
            / "assets"
            / "npcs"
            / self.appearance_id
        )
        self.asset_root.mkdir(parents=True)
        self.metadata_path = self.asset_root / "action-bundle-meta.json"
        self.index_path = self.run_dir / "evidence-index.json"
        self.frames = self._write_frames()
        self._write_metadata(self.frames)
        self._write_index(self.frames)

    def _png(self, path: Path, size: tuple[int, int], ordinal: int) -> None:
        path.parent.mkdir(parents=True, exist_ok=True)
        image = Image.new("RGBA", size, (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        draw.rectangle(
            (40, 36, size[0] - 42, size[1] - 20),
            fill=(70 + ordinal * 5, 120, 190 - ordinal * 4, 255),
        )
        # Real antialias-style partial alpha with non-zero RGB proves the
        # producer preserves full decoded source pixels inside the wrapper.
        draw.line(
            (39, 36, size[0] - 41, 36),
            fill=(210, 80 + ordinal, 120, 96),
            width=1,
        )
        image.save(path, format="PNG", optimize=False, compress_level=9)
        image.close()

    def _frame(
        self, kind: str, slot: str, source: str, installed: str, ordinal: int
    ) -> dict[str, object]:
        path = self.asset_root / installed
        size = (256, 256) if kind == "world" else (512, 512)
        self._png(path, size, ordinal)
        with Image.open(path) as image:
            image.load()
            rgba_sha = TOOL._rgba_sha256(image)
        return {
            "kind": kind,
            "slot": (
                f"{slot}/idle/1" if kind == "world" else slot
            ),
            "sourceRuntimePath": source,
            "installedPath": installed,
            "fileSha256": TOOL._sha256_file(path),
            "rgbaSha256": rgba_sha,
        }

    def _write_frames(self) -> list[dict[str, object]]:
        frames = []
        for ordinal, direction in enumerate(TOOL.DIRECTIONS):
            frames.append(
                self._frame(
                    "world",
                    direction,
                    f"runtime/world/{direction}/idle-1.png",
                    f"world/directions/{direction}/idle/idle-1.png",
                    ordinal,
                )
            )
        for ordinal, state in enumerate(TOOL.PORTRAIT_STATES, start=8):
            frames.append(
                self._frame(
                    "portrait",
                    state,
                    f"runtime/portraits/{state}.png",
                    f"portrait/{state}.png",
                    ordinal,
                )
            )
        return frames

    def _write_metadata(self, frames: list[dict[str, object]]) -> None:
        value = {
            "schemaVersion": 1,
            "appearanceId": self.appearance_id,
            "installation": {"frames": frames},
        }
        self.metadata_path.write_text(
            json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True)
            + "\n",
            encoding="utf-8",
        )

    def _write_index(self, frames: list[dict[str, object]]) -> None:
        normalized = TOOL._installation_frames(
            {
                "appearanceId": self.appearance_id,
                "installation": {"frames": frames},
            },
            self.appearance_id,
        )
        source_set = TOOL._source_set_sha256(self.appearance_id, normalized)
        value = {
            "schemaVersion": 1,
            "indexType": TOOL.INDEX_TYPE,
            "runId": self.run_id,
            "status": "passed",
            "generatedAtUtc": "2026-07-21T14:00:00Z",
            "scene": TOOL.INDEX_SCENE,
            "appearanceIds": [self.appearance_id],
            "appearances": [
                {
                    "appearanceId": self.appearance_id,
                    "runId": self.run_id,
                    "status": "passed",
                    "sourceSetSha256": source_set,
                }
            ],
        }
        self.index_path.write_text(
            json.dumps(value, ensure_ascii=False, indent=2, sort_keys=True)
            + "\n",
            encoding="utf-8",
        )

    def _prepare(self) -> dict[str, object]:
        return TOOL.prepare_blind_packet(
            repo_root=self.root,
            run_id=self.run_id,
            appearance_id=self.appearance_id,
            evidence_index_path=self.index_path,
            metadata_path=self.metadata_path,
            producer_id="agent:test-producer",
        )

    def test_prepares_neutral_packet_and_private_mapping(self) -> None:
        result = self._prepare()
        self.assertEqual(result["anonymousPngCount"], 8)
        packet_path = Path(str(result["reviewPacket"]))
        mapping_path = Path(str(result["producerMapping"]))
        packet = json.loads(packet_path.read_text(encoding="utf-8"))
        mapping = json.loads(mapping_path.read_text(encoding="utf-8"))
        self.assertEqual(
            set(packet),
            {
                "schemaVersion",
                "packetType",
                "status",
                "appearanceId",
                "evidenceIndexSha256",
                "producerId",
                "generatedAtUtc",
                "assets",
            },
        )
        self.assertEqual(len(packet["assets"]), 8)
        self.assertEqual(len(mapping["presentation"]), 8)
        self.assertNotEqual(
            [
                entry["sourceRuntimePath"].split("/")[2]
                for entry in mapping["presentation"]
            ],
            list(TOOL.DIRECTIONS),
        )
        self.assertEqual(mapping["reviewPacketSha256"], TOOL._sha256_file(packet_path))
        source_by_path = {
            frame["installedPath"]: frame for frame in self.frames[:8]
        }
        for asset, private in zip(
            packet["assets"], mapping["presentation"], strict=True
        ):
            self.assertEqual(
                set(asset),
                {"presentationIndex", "opaquePath", "fileSha256", "rgbaSha256"},
            )
            opaque = Path(asset["opaquePath"])
            self.assertRegex(opaque.name, re.compile(r"^[0-9a-f]{32}\.png$"))
            self.assertFalse(any(word in opaque.name for word in TOOL.DIRECTIONS))
            with Image.open(opaque) as wrapper:
                wrapper.load()
                self.assertEqual(wrapper.mode, "RGBA")
                self.assertEqual(wrapper.size, (320, 320))
                self.assertEqual(wrapper.getpixel((0, 0)), (0, 0, 0, 0))
                center = wrapper.crop((32, 32, 288, 288))
                source_path = self.asset_root / private["installedPath"]
                with Image.open(source_path) as source:
                    source.load()
                    self.assertEqual(center.tobytes(), source.tobytes())
            installed = source_by_path[private["installedPath"]]
            self.assertNotEqual(asset["fileSha256"], installed["fileSha256"])
            self.assertNotEqual(asset["rgbaSha256"], installed["rgbaSha256"])
        packet_text = packet_path.read_text(encoding="utf-8")
        self.assertNotIn("sourceRuntimePath", packet_text)
        self.assertNotIn("installedPath", packet_text)

    def test_refuses_overwrite(self) -> None:
        self._prepare()
        with self.assertRaisesRegex(TOOL.BlindPacketError, "拒绝覆盖"):
            self._prepare()

    def test_shuffle_is_deterministic_and_non_identity(self) -> None:
        index_sha = TOOL._sha256_file(self.index_path)
        normalized = TOOL._installation_frames(
            json.loads(self.metadata_path.read_text(encoding="utf-8")),
            self.appearance_id,
        )
        source_set_sha = TOOL._source_set_sha256(
            self.appearance_id, normalized
        )
        first = TOOL._deterministic_order(
            run_id=self.run_id,
            appearance_id=self.appearance_id,
            index_sha=index_sha,
            source_set_sha=source_set_sha,
        )
        second = TOOL._deterministic_order(
            run_id=self.run_id,
            appearance_id=self.appearance_id,
            index_sha=index_sha,
            source_set_sha=source_set_sha,
        )
        self.assertEqual(first, second)
        self.assertNotEqual(tuple(first[0]), TOOL.DIRECTIONS)

    def test_refuses_stale_index_run_id(self) -> None:
        value = json.loads(self.index_path.read_text(encoding="utf-8"))
        value["runId"] = "phase327-old-run"
        self.index_path.write_text(json.dumps(value), encoding="utf-8")
        with self.assertRaisesRegex(TOOL.BlindPacketError, "陈旧"):
            self._prepare()

    def test_refuses_invalid_run_id(self) -> None:
        with self.assertRaisesRegex(TOOL.BlindPacketError, "不安全的 runId"):
            TOOL.prepare_blind_packet(
                repo_root=self.root,
                run_id="../old",
                appearance_id=self.appearance_id,
                evidence_index_path=self.index_path,
                metadata_path=self.metadata_path,
                producer_id="agent:test-producer",
            )

    def test_refuses_missing_direction(self) -> None:
        self.frames.pop(4)
        self._write_metadata(self.frames)
        with self.assertRaisesRegex(TOOL.BlindPacketError, "漏登记"):
            self._prepare()

    def test_refuses_duplicate_direction(self) -> None:
        self.frames.append(dict(self.frames[0]))
        self._write_metadata(self.frames)
        with self.assertRaisesRegex(TOOL.BlindPacketError, "重复登记"):
            self._prepare()

    def test_refuses_wrong_world_size(self) -> None:
        frame = self.frames[0]
        path = self.asset_root / str(frame["installedPath"])
        self._png(path, (255, 256), 0)
        frame["fileSha256"] = TOOL._sha256_file(path)
        with Image.open(path) as image:
            image.load()
            frame["rgbaSha256"] = TOOL._rgba_sha256(image)
        self._write_metadata(self.frames)
        self._write_index(self.frames)
        with self.assertRaisesRegex(TOOL.BlindPacketError, "256x256"):
            self._prepare()

    def test_refuses_source_set_drift(self) -> None:
        value = json.loads(self.index_path.read_text(encoding="utf-8"))
        value["appearances"][0]["sourceSetSha256"] = "0" * 64
        self.index_path.write_text(json.dumps(value), encoding="utf-8")
        with self.assertRaisesRegex(TOOL.BlindPacketError, "sourceSet"):
            self._prepare()


if __name__ == "__main__":
    unittest.main()
