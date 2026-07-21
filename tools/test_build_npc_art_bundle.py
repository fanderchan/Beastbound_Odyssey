#!/usr/bin/env python3
"""Deterministic regression tests for tools/build_npc_art_bundle.py.

Synthetic PNGs live only in temporary directories. The one real canary test is
read-only and never installs or rewrites game assets.
"""

from __future__ import annotations

import concurrent.futures
import dataclasses
import importlib.util
import json
import os
import shutil
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path
from unittest import mock

import numpy as np
from PIL import Image, ImageDraw, ImageOps


TOOLS_DIR = Path(__file__).resolve().parent
REPO_ROOT = TOOLS_DIR.parent
CANARY_WORLD = (
    REPO_ROOT
    / "client/godot/assets/npcs/npc_bank_keeper_f_v1/source/world-idle-2x4-raw.png"
)
STABLE_CANARY_WORLD = (
    REPO_ROOT
    / "client/godot/assets/npcs/npc_stable_keeper_m_v1/source/world-idle-2x4-raw.png"
)
STABLE_CANARY_PORTRAITS = (
    REPO_ROOT
    / "client/godot/assets/npcs/npc_stable_keeper_m_v1/source/portrait-2x2-raw.png"
)
BANK_CANARY_PORTRAITS = (
    REPO_ROOT
    / "client/godot/assets/npcs/npc_bank_keeper_f_v1/source/portrait-2x2-raw.png"
)
MANOR_CANARY_PORTRAITS = (
    REPO_ROOT
    / "client/godot/assets/npcs/npc_manor_steward_m_v1/source/rejected/provenance-unverified-v1/portrait-2x2-white-dividers.png"
)
GUARD_CANARY_PORTRAITS = (
    REPO_ROOT
    / "client/godot/assets/npcs/npc_village_guard_m_v1/source/portrait-2x2-raw.png"
)
GUARD_REJECTED_CROSS_CELL_PORTRAITS = (
    REPO_ROOT
    / "client/godot/assets/npcs/npc_village_guard_m_v1/source/rejected/portrait-2x2-v1-cross-cell-shield-fragments.png"
)
REAL_RESIDUAL_CANARY = {
    "npc_stable_keeper_m_v1": {
        "raw": {
            "world": (STABLE_CANARY_WORLD, "d71ae10a8e2cc4e906e4aabccbbb9b4e3ec4f7f49c8531cb49d360b2da4e9e06"),
            "portrait": (STABLE_CANARY_PORTRAITS, "c54a0db3d8b14d8e06b2d46f17ab563265b4db1b33982318e3b1995e76967cb8"),
        },
        "repair": {
            "world": {
                "fad50b175cac6bd5c8a868e8f5ac9643fc6b3807430f0655ae1e6e7ed8c8878b": ("southwest", (177, 48, 182, 50), 9),
                "2f9c942e1cef161af058ac393495d74a937fa4b2a0a2ba6983cea69ac5d93c9a": ("west", (221, 116, 226, 120), 11),
                "50bfcdefde9d38dd7e2acbbafcf49ec053de88a114e3384b68e37ba9f32edf49": ("northwest", (97, 83, 102, 94), 40),
                "7596887036d9cfd0623905e001362e58c1eaef3f94d7e2f42665ecf907a9092a": ("northeast", (157, 112, 161, 115), 10),
            },
            "portrait": {
                "f910607e8f7fc0a57a5e92619deac0375f671696950aa5e9066f8e0a0ced079d": ("neutral", (316, 136, 318, 139), 5),
                "0211ca9e4d2583349cf20270304b04024c8596d2bb0fb5ff1af7286690f3e440": ("smile", (316, 65, 318, 67), 3),
                "5a85ced1038e96a6a57abae0bdc8be9dcc5fa4466a07d3cd6c167b2f7e79a4d0": ("smile", (451, 212, 453, 214), 3),
                "cfb5e69aad43231563c696afbd5ef10171c6e4b1ab16a304deb92c6cff17147e": ("smile", (430, 224, 433, 226), 4),
                "fd3b149b21ad1ea4a51c5be023ec3fcd7d1364ee4cdb79e7d1815bc792e6c46d": ("concerned", (230, 63, 234, 67), 9),
                "54828e577fd708f4eca0cb59705f4a9fd63984d960ac47fd95ecda5b11372feb": ("concerned", (363, 211, 366, 214), 6),
            },
        },
        # The runtime S/D/G diagnostic also sees this authored dark-brown/purple
        # smile-hair shadow.  It is deliberately frozen as retain-authored-color:
        # a diagnostic false positive must never be promoted into a delete rule.
        "retain": {
            "world": {},
            "portrait": {
                "440f409823a72912e827845ddaf7e7d83defda30a42b1d62939cf78e4a0f59c9": ("smile", (436, 123, 437, 125), 2),
            },
        },
        "points": (
            ("portrait", "concerned", (335, 184), (364, 213), "54828e577fd708f4eca0cb59705f4a9fd63984d960ac47fd95ecda5b11372feb"),
            ("portrait", "concerned", (214, 48), (232, 64), "fd3b149b21ad1ea4a51c5be023ec3fcd7d1364ee4cdb79e7d1815bc792e6c46d"),
            ("world", "northwest", (107, 62), (100, 86), "50bfcdefde9d38dd7e2acbbafcf49ec053de88a114e3384b68e37ba9f32edf49"),
            ("world", "northwest", (107, 63), (100, 88), "50bfcdefde9d38dd7e2acbbafcf49ec053de88a114e3384b68e37ba9f32edf49"),
            ("world", "northwest", (107, 64), (100, 90), "50bfcdefde9d38dd7e2acbbafcf49ec053de88a114e3384b68e37ba9f32edf49"),
            ("world", "northwest", (107, 65), (99, 91), "50bfcdefde9d38dd7e2acbbafcf49ec053de88a114e3384b68e37ba9f32edf49"),
            ("world", "northeast", (113, 82), (157, 112), "7596887036d9cfd0623905e001362e58c1eaef3f94d7e2f42665ecf907a9092a"),
            ("world", "southwest", (121, 42), (179, 49), "fad50b175cac6bd5c8a868e8f5ac9643fc6b3807430f0655ae1e6e7ed8c8878b"),
        ),
        "before": (21, 58),
        "after": (1, 4),
    },
    "npc_bank_keeper_f_v1": {
        "raw": {
            "world": (CANARY_WORLD, "93c35f959eeba4e7aa5dd3f85d4546e85c8edff9edbfb9fbb4c65c912b619364"),
            "portrait": (BANK_CANARY_PORTRAITS, "286310bce5a87c82bedffadf4afffe5ab6f649832405e268fc58d6cb41375b30"),
        },
        "repair": {
            "world": {
                "d0a86d14fd283f02a9d037559f02bee8dcbf056ed6792402e100a39025170c5e": ("south", (177, 302, 182, 315), 49),
                "70b74d950f8472e19823a41614ce559eabd40eaaa609e82338f4c2cb3ca37c57": ("northeast", (186, 192, 190, 201), 29),
            },
            "portrait": {
                "e04b81335919fda37ded513d9d866d19c7a39d293ab54ea26b8c0b5b09b5eef6": ("neutral", (212, 292, 216, 295), 7),
            },
        },
        "retain": {"world": {}, "portrait": {}},
        "points": (
            ("world", "northeast", (112, 125), (188, 194), "70b74d950f8472e19823a41614ce559eabd40eaaa609e82338f4c2cb3ca37c57"),
            ("world", "south", (96, 163), (179, 303), "d0a86d14fd283f02a9d037559f02bee8dcbf056ed6792402e100a39025170c5e"),
            ("world", "south", (96, 164), (179, 306), "d0a86d14fd283f02a9d037559f02bee8dcbf056ed6792402e100a39025170c5e"),
            ("world", "south", (96, 165), (179, 308), "d0a86d14fd283f02a9d037559f02bee8dcbf056ed6792402e100a39025170c5e"),
            ("world", "south", (96, 166), (179, 310), "d0a86d14fd283f02a9d037559f02bee8dcbf056ed6792402e100a39025170c5e"),
            ("world", "south", (96, 167), (179, 312), "d0a86d14fd283f02a9d037559f02bee8dcbf056ed6792402e100a39025170c5e"),
            ("portrait", "neutral", (177, 241), (213, 293), "e04b81335919fda37ded513d9d866d19c7a39d293ab54ea26b8c0b5b09b5eef6"),
        ),
        "before": (9, 18),
        "after": (0, 0),
    },
}
REFERENCE_CHROMA_HELPER = (
    Path.home() / ".codex/skills/.system/imagegen/scripts/remove_chroma_key.py"
)
REFERENCE_CHROMA_FIXTURE = (
    TOOLS_DIR / "test/fixtures/npc_chroma_reference_v1.json"
)
REAL_ROLE_REGRESSION_GROUPS = (
    (
        "stable/world",
        REPO_ROOT
        / "client/godot/assets/npcs/npc_stable_keeper_m_v1/source/world-idle-2x4-raw.png",
        "world",
        "d71ae10a8e2cc4e906e4aabccbbb9b4e3ec4f7f49c8531cb49d360b2da4e9e06",
    ),
    (
        "stable/portrait",
        REPO_ROOT
        / "client/godot/assets/npcs/npc_stable_keeper_m_v1/source/candidates/portrait-2x2-v4-four-edge-safe-regeneration.png",
        "portrait",
        "c54a0db3d8b14d8e06b2d46f17ab563265b4db1b33982318e3b1995e76967cb8",
    ),
    (
        "bank/world",
        REPO_ROOT
        / "client/godot/assets/npcs/npc_bank_keeper_f_v1/source/world-idle-2x4-raw.png",
        "world",
        "93c35f959eeba4e7aa5dd3f85d4546e85c8edff9edbfb9fbb4c65c912b619364",
    ),
    (
        "bank/portrait",
        REPO_ROOT
        / "client/godot/assets/npcs/npc_bank_keeper_f_v1/source/portrait-2x2-raw.png",
        "portrait",
        "286310bce5a87c82bedffadf4afffe5ab6f649832405e268fc58d6cb41375b30",
    ),
    (
        "healer/world",
        REPO_ROOT
        / "client/godot/assets/npcs/npc_village_healer_f_v1/source/world-idle-2x4-raw.png",
        "world",
        "8dc64119f97fe6240bd6b83852ce0a15ed60f9543c3b0d6bf37558c34f6a54e0",
    ),
    (
        "healer/portrait",
        REPO_ROOT
        / "client/godot/assets/npcs/npc_village_healer_f_v1/source/portrait-2x2-raw.png",
        "portrait",
        "e9fad1c81d2a44d8cb75625b7006790efe10c21cd36ab1f60433d1f7016e2ca4",
    ),
    (
        "guard/portrait",
        GUARD_CANARY_PORTRAITS,
        "portrait",
        "7c14193d800746c151c351c73af472581d6129bf55ea9edb02845f7c8ee480c9",
    ),
    (
        "artisan/world",
        REPO_ROOT
        / "client/godot/assets/npcs/npc_equipment_artisan_m_v1/source/raw/world-idle-2x4-v5.png",
        "world",
        "2f6fe26e9dbefdd4be3c334d5e738617cd931a1d8e8c8d45b802721782b5dd76",
    ),
    (
        "artisan/portrait",
        REPO_ROOT
        / "client/godot/assets/npcs/npc_equipment_artisan_m_v1/source/raw/portrait-2x2-v3.png",
        "portrait",
        "2abda06d3f827cb4b959757edb3e08d4c416d794849ff15472d0b8d725404323",
    ),
    (
        "trainer/world",
        REPO_ROOT
        / "client/godot/assets/npcs/npc_riding_trainer_f_v1/source/raw/world-idle-2x4-v3-northwest-repaired.png",
        "world",
        "cf5ab89075acb739098e2e1edb44f8d15fcdd01bbe587381a10f53bf05ab9de4",
    ),
    (
        "trainer/portrait",
        REPO_ROOT
        / "client/godot/assets/npcs/npc_riding_trainer_f_v1/source/raw/portrait-2x2-v2.png",
        "portrait",
        "ef9f9183c11654de6594024c286f4e5149062d386f38f1c4f754e5f5d01686f2",
    ),
)
sys.path.insert(0, str(TOOLS_DIR))

import build_npc_art_bundle as builder  # noqa: E402


class NpcArtBundleBuilderTests(unittest.TestCase):
    def _draw_world_cell(
        self, size: tuple[int, int], index: int, background: tuple[int, int, int]
    ) -> Image.Image:
        width, height = size
        cell = Image.new("RGBA", size, (*background, 255))
        draw = ImageDraw.Draw(cell)
        center_x = width // 2
        top = max(8, height // 9)
        bottom = height - max(9, height // 10)
        body_half = max(9, width // 6)
        draw.rounded_rectangle(
            (center_x - body_half, top + height // 6, center_x + body_half, bottom),
            radius=max(5, width // 16),
            fill=(42 + index * 19, 86 + index * 11, 176 - index * 13, 255),
        )
        head_radius = max(7, width // 10)
        draw.ellipse(
            (
                center_x - head_radius,
                top,
                center_x + head_radius,
                top + head_radius * 2,
            ),
            fill=(218 - index * 5, 157 + index * 4, 104 + index * 6, 255),
        )
        # Keep the synthetic head four-connected to the torso.  The production
        # gate intentionally treats a large detached foreground component as a
        # regeneration failure, so the baseline fixture must model one subject.
        draw.rectangle(
            (
                center_x - 1,
                top + head_radius * 2 - 2,
                center_x + 1,
                top + height // 6 + 2,
            ),
            fill=(218 - index * 5, 157 + index * 4, 104 + index * 6, 255),
        )
        prop_left = center_x - body_half - max(6, width // 13) + (index % 3)
        prop_top = top + height // 3 + (index % 2) * 3
        draw.rectangle(
            (
                prop_left,
                prop_top,
                prop_left + max(5, width // 14),
                prop_top + max(10, height // 8),
            ),
            fill=(235 - index * 7, 191 - index * 5, 34 + index * 9, 255),
        )
        # Ordinary authored color that is outside the residual key-color
        # proposal and needs no chroma review entry.
        draw.rectangle(
            (
                center_x + 2,
                top + height // 3,
                center_x + max(7, width // 12),
                top + height // 3 + max(5, height // 18),
            ),
            fill=(76, 91, 176, 255),
        )
        return cell

    def _draw_portrait_cell(
        self, size: tuple[int, int], index: int, background: tuple[int, int, int]
    ) -> Image.Image:
        width, height = size
        cell = Image.new("RGBA", size, (*background, 255))
        draw = ImageDraw.Draw(cell)
        center_x = width // 2
        radius_x = max(14, width // 4)
        radius_y = max(16, height // 3)
        top = max(10, height // 7)
        draw.ellipse(
            (center_x - radius_x, top, center_x + radius_x, top + radius_y * 2),
            fill=(205 - index * 11, 139 + index * 8, 91 + index * 7, 255),
        )
        draw.rectangle(
            (
                center_x - radius_x - max(4, width // 18),
                top + radius_y,
                center_x - radius_x + max(4, width // 24),
                top + radius_y + max(12, height // 7),
            ),
            fill=(41 + index * 31, 118, 182 - index * 19, 255),
        )
        mouth_y = top + radius_y + max(5, height // 12)
        draw.rectangle(
            (center_x - 5 - index, mouth_y, center_x + 6, mouth_y + 2 + index),
            fill=(89, 27 + index * 7, 34, 255),
        )
        return cell

    @staticmethod
    def _change_one_visible_pixel(cell: Image.Image) -> None:
        pixels = np.asarray(cell.convert("RGBA"), dtype=np.uint8).copy()
        background = pixels[0, 0, :3]
        visible = np.any(pixels[:, :, :3] != background, axis=2)
        y, x = np.argwhere(visible)[len(np.argwhere(visible)) // 2]
        pixels[y, x, 0] = (int(pixels[y, x, 0]) + 1) % 256
        cell.paste(Image.fromarray(pixels, mode="RGBA"))

    def _make_sheet(
        self,
        path: Path,
        *,
        rows: int,
        cols: int,
        size: tuple[int, int],
        group: str,
        background: tuple[int, int, int] = builder.DEFAULT_KEY,
        empty_index: int | None = None,
        edge_index: int | None = None,
        unsafe_border_index: int | None = None,
        residue_index: int | None = None,
        duplicate_pair: tuple[int, int] | None = None,
        mirror_pair: tuple[int, int] | None = None,
        vertical_mirror_pair: tuple[int, int] | None = None,
        near_duplicate_pair: tuple[int, int] | None = None,
        near_mirror_pair: tuple[int, int] | None = None,
        near_vertical_mirror_pair: tuple[int, int] | None = None,
        scale_drift_index: int | None = None,
        portrait_bust_crop: bool = False,
        portrait_dividers: bool = False,
        non_opaque: bool = False,
    ) -> None:
        width, height = size
        x_boundaries = builder.grid_boundaries(width, cols)
        y_boundaries = builder.grid_boundaries(height, rows)
        sheet = Image.new("RGBA", size, (*background, 255))
        cells: list[Image.Image] = []
        for index in range(rows * cols):
            row, col = divmod(index, cols)
            cell_size = (
                x_boundaries[col + 1] - x_boundaries[col],
                y_boundaries[row + 1] - y_boundaries[row],
            )
            if index == empty_index:
                cell = Image.new("RGBA", cell_size, (*background, 255))
            elif group == "world":
                cell = self._draw_world_cell(cell_size, index, background)
            else:
                cell = self._draw_portrait_cell(cell_size, index, background)
            cells.append(cell)

        if group == "portrait" and portrait_bust_crop:
            for index, cell in enumerate(cells):
                _, col = divmod(index, cols)
                draw = ImageDraw.Draw(cell)
                crop_top = int(cell.height * 0.72)
                color = (37 + index * 29, 82 + index * 13, 143 - index * 11, 255)
                if col == 0:
                    draw.rectangle(
                        (cell.width // 3, crop_top, cell.width - 1, cell.height - 1),
                        fill=color,
                    )
                else:
                    draw.rectangle(
                        (0, crop_top, (cell.width * 2) // 3, cell.height - 1),
                        fill=color,
                    )

        def conform(source: Image.Image, target: Image.Image) -> Image.Image:
            return source.resize(target.size, Image.Resampling.NEAREST)

        if duplicate_pair is not None:
            source, target = duplicate_pair
            cells[target] = conform(cells[source], cells[target])
        if mirror_pair is not None:
            source, target = mirror_pair
            cells[target] = conform(ImageOps.mirror(cells[source]), cells[target])
        if vertical_mirror_pair is not None:
            source, target = vertical_mirror_pair
            cells[target] = conform(ImageOps.flip(cells[source]), cells[target])
        if near_duplicate_pair is not None:
            source, target = near_duplicate_pair
            cells[target] = conform(cells[source], cells[target])
            self._change_one_visible_pixel(cells[target])
        if near_mirror_pair is not None:
            source, target = near_mirror_pair
            cells[target] = conform(ImageOps.mirror(cells[source]), cells[target])
            self._change_one_visible_pixel(cells[target])
        if near_vertical_mirror_pair is not None:
            source, target = near_vertical_mirror_pair
            cells[target] = conform(ImageOps.flip(cells[source]), cells[target])
            self._change_one_visible_pixel(cells[target])
        if scale_drift_index is not None:
            source = cells[scale_drift_index]
            short = source.resize(
                (source.width, max(1, source.height // 2)), Image.Resampling.NEAREST
            )
            replacement = Image.new("RGBA", source.size, (*background, 255))
            replacement.alpha_composite(short, (0, source.height - short.height))
            cells[scale_drift_index] = replacement
        if edge_index is not None:
            ImageDraw.Draw(cells[edge_index]).rectangle(
                (1, 8, 8, cells[edge_index].height - 8), fill=(24, 144, 81, 255)
            )
        if unsafe_border_index is not None:
            cells[unsafe_border_index].putpixel((0, 0), (0, 0, 0, 255))
        if residue_index is not None:
            residue_cell = cells[residue_index]
            ImageDraw.Draw(residue_cell).rectangle(
                (
                    residue_cell.width // 2 - 3,
                    residue_cell.height // 2 - 3,
                    residue_cell.width // 2 + 3,
                    residue_cell.height // 2 + 3,
                ),
                fill=(254, 1, 254, 255),
            )

        for index, cell in enumerate(cells):
            row, col = divmod(index, cols)
            sheet.alpha_composite(cell, (x_boundaries[col], y_boundaries[row]))
        if group == "portrait" and portrait_dividers:
            draw = ImageDraw.Draw(sheet)
            divider_width = max(2, min(width, height) // 80)
            center_x = x_boundaries[1]
            center_y = y_boundaries[1]
            draw.rectangle(
                (center_x - divider_width, 0, center_x + divider_width, height - 1),
                fill=(255, 255, 255, 255),
            )
            draw.rectangle(
                (0, center_y - divider_width, width - 1, center_y + divider_width),
                fill=(255, 255, 255, 255),
            )
        if non_opaque:
            sheet.putpixel((width // 2, height // 2), (12, 34, 56, 128))
        sheet.save(path, format="PNG", optimize=False)

    def _refresh_generation_ledger(self, inputs: dict[str, Path]) -> None:
        source_modes: dict[str, str] = {}
        for key in ("world", "portraits"):
            alpha = np.asarray(Image.open(inputs[key]).convert("RGBA"), dtype=np.uint8)[:, :, 3]
            source_modes[key] = (
                builder.SOURCE_MODE_GENUINE_TRANSPARENT
                if np.any(alpha == 0)
                else builder.SOURCE_MODE_OPAQUE_CHROMA
            )
        requested_background = (
            "transparent"
            if len(set(source_modes.values())) == 1
            and source_modes["world"] == builder.SOURCE_MODE_GENUINE_TRANSPARENT
            else (
                builder.REQUESTED_BACKGROUND
                if len(set(source_modes.values())) == 1
                else "mixed"
            )
        )
        ledger = {
            "schemaVersion": 1,
            "tool": "image_gen",
            "model": "npc-regression-model-v1",
            "generatedAt": "2026-07-21T12:00:00+08:00",
            "requestedBackground": requested_background,
            "parameters": {"quality": "high", "format": "png"},
            "negativeConstraints": [
                "no runtime mirroring",
                "no labels inside cells",
                "no cropped subject",
            ],
            "sources": {
                "identityBoard": {
                    "fileSha256": builder.sha256_file(inputs["identity"]),
                },
                "worldSheet": {
                    "fileSha256": builder.sha256_file(inputs["world"]),
                    "worldPromptSha256": builder.sha256_file(inputs["world_prompt"]),
                    "identityBoardSha256": builder.sha256_file(inputs["identity"]),
                    "sourceMode": source_modes["world"],
                    "requestedBackground": (
                        "transparent"
                        if source_modes["world"] == builder.SOURCE_MODE_GENUINE_TRANSPARENT
                        else builder.REQUESTED_BACKGROUND
                    ),
                },
                "portraitSheet": {
                    "fileSha256": builder.sha256_file(inputs["portraits"]),
                    "portraitPromptSha256": builder.sha256_file(
                        inputs["portrait_prompt"]
                    ),
                    "identityBoardSha256": builder.sha256_file(inputs["identity"]),
                    "sourceMode": source_modes["portraits"],
                    "requestedBackground": (
                        "transparent"
                        if source_modes["portraits"] == builder.SOURCE_MODE_GENUINE_TRANSPARENT
                        else builder.REQUESTED_BACKGROUND
                    ),
                },
            },
        }
        inputs["generation"].write_text(
            json.dumps(ledger, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
        )

    def _make_sheet_genuine_transparent(self, path: Path) -> None:
        rgba = np.asarray(Image.open(path).convert("RGBA"), dtype=np.uint8).copy()
        background = np.all(
            rgba[:, :, :3] == np.array(builder.DEFAULT_KEY, dtype=np.uint8),
            axis=2,
        )
        rgba[background, :3] = (17, 29, 41)
        rgba[background, 3] = 0
        Image.fromarray(rgba, mode="RGBA").save(
            path, format="PNG", optimize=False
        )

    def _inputs(
        self,
        root: Path,
        *,
        world_size: tuple[int, int] = (512, 320),
        portrait_size: tuple[int, int] = (320, 320),
        world_kwargs: dict[str, object] | None = None,
        portrait_kwargs: dict[str, object] | None = None,
        genuine_transparent: bool = False,
    ) -> dict[str, Path]:
        root.mkdir(parents=True, exist_ok=True)
        inputs = {
            "world": root / "world.png",
            "portraits": root / "portraits.png",
            "identity": root / "identity.png",
            "world_prompt": root / "world-prompt.md",
            "portrait_prompt": root / "portrait-prompt.md",
            "generation": root / "generation-ledger.json",
            "ownership": root / "ownership-ledger.json",
        }
        self._make_sheet(
            inputs["world"],
            rows=2,
            cols=4,
            size=world_size,
            group="world",
            **(world_kwargs or {}),
        )
        self._make_sheet(
            inputs["portraits"],
            rows=2,
            cols=2,
            size=portrait_size,
            group="portrait",
            **(portrait_kwargs or {}),
        )
        if genuine_transparent:
            for path in (inputs["world"], inputs["portraits"]):
                self._make_sheet_genuine_transparent(path)
        identity = Image.new("RGB", (240, 240), (24, 39, 55))
        draw = ImageDraw.Draw(identity)
        draw.ellipse((55, 25, 185, 155), fill=(205, 139, 91))
        draw.rectangle((65, 135, 175, 225), fill=(42, 86, 176))
        identity.save(inputs["identity"], format="PNG", optimize=False)
        inputs["world_prompt"].write_text(
            "true eight independently authored NPC directions\n", encoding="utf-8"
        )
        inputs["portrait_prompt"].write_text(
            "same identity: neutral, speaking, smile, concerned\n", encoding="utf-8"
        )
        inputs["ownership"].write_text(
            json.dumps(
                {
                    "schemaVersion": 1,
                    "origin": "AI-generated original",
                    "owner": "Beastbound Odyssey project",
                    "licenseBasis": "project-owned generated output",
                    "replacementPath": str((root / "durable-archive").resolve()),
                },
                ensure_ascii=False,
                indent=2,
            )
            + "\n",
            encoding="utf-8",
        )
        self._refresh_generation_ledger(inputs)
        return inputs

    def _options(
        self,
        root: Path,
        inputs: dict[str, Path],
        **overrides: object,
    ) -> builder.BuildOptions:
        values: dict[str, object] = {
            "role_id": "stable_keeper_m_v1",
            "display_name": "兽栏管理员（男）",
            "world_sheet": inputs["world"],
            "portrait_sheet": inputs["portraits"],
            "identity_board": inputs["identity"],
            "world_prompt": inputs["world_prompt"],
            "portrait_prompt": inputs["portrait_prompt"],
            "generation_ledger": inputs["generation"],
            "ownership_ledger": inputs["ownership"],
            "output_dir": root / "bundle",
        }
        if "world_explicit_mask" in inputs:
            values["world_explicit_mask"] = inputs["world_explicit_mask"]
            values["world_mask_authoring_ledger"] = inputs[
                "world_mask_authoring_ledger"
            ]
        if "portrait_explicit_mask" in inputs:
            values["portrait_explicit_mask"] = inputs["portrait_explicit_mask"]
            values["portrait_mask_authoring_ledger"] = inputs[
                "portrait_mask_authoring_ledger"
            ]
        values.update(overrides)
        return builder.BuildOptions(**values)

    def _install_explicit_mask_review(
        self,
        inputs: dict[str, Path],
        group: str,
        *,
        default_decision: str = "background-hole",
    ) -> list[dict[str, object]]:
        if group == "world":
            raw_path = inputs["world"]
            rows, cols = 2, 4
            slots = builder.DEFAULT_DIRECTIONS
        else:
            raw_path = inputs["portraits"]
            rows, cols = 2, 2
            slots = builder.DEFAULT_PORTRAIT_SLOTS
        raw = Image.open(raw_path).convert("RGBA")
        x_boundaries = builder.grid_boundaries(raw.width, cols)
        y_boundaries = builder.grid_boundaries(raw.height, rows)
        final_mask = np.zeros((raw.height, raw.width), dtype=np.uint8)
        components: list[dict[str, object]] = []
        for index, slot in enumerate(slots):
            row, col = divmod(index, cols)
            box = (
                x_boundaries[col],
                y_boundaries[row],
                x_boundaries[col + 1],
                y_boundaries[row + 1],
            )
            classification = builder._classify_chroma(
                raw.crop(box), builder.chroma_edge_policy(group, col)
            )
            cell_mask = classification.automatic_eligible.copy()
            component_groups = (
                (
                    builder.ENCLOSED_COMPONENT_TYPE,
                    "background-hole",
                    classification.enclosed_components,
                ),
                (
                    builder.FRINGE_COMPONENT_TYPE,
                    "background-fringe",
                    classification.fringe_components,
                ),
                (
                    builder.OUTER_BACKGROUND_COMPONENT_TYPE,
                    "background-hole",
                    classification.outer_background_components,
                ),
                (
                    builder.RESIDUAL_KEY_COMPONENT_TYPE,
                    builder.RESIDUAL_KEY_RETAIN_DECISION,
                    classification.residual_key_components,
                ),
            )
            for component_type, background_decision, group_components in component_groups:
                for component in group_components:
                    descriptor = builder._component_descriptor(
                        component, slot, box, component_type
                    )
                    decision = (
                        builder.RESIDUAL_KEY_RETAIN_DECISION
                        if component_type == builder.RESIDUAL_KEY_COMPONENT_TYPE
                        else "retain-subject"
                        if default_decision == "retain-subject"
                        else background_decision
                    )
                    entry = {
                        **descriptor,
                        "decision": decision,
                        "reviewer": "Synthetic Fixture Reviewer",
                        "reviewedAt": "2026-07-21T13:00:00+08:00",
                    }
                    components.append(entry)
                    if decision in (
                        "background-hole",
                        "background-fringe",
                        builder.RESIDUAL_KEY_REPAIR_DECISION,
                    ):
                        cell_mask |= component
            final_mask[box[1] : box[3], box[0] : box[2]] = (
                cell_mask.astype(np.uint8) * 255
            )
        mask_path = raw_path.parent / f"{group}-explicit-mask.png"
        ledger_path = raw_path.parent / f"{group}-mask-authoring-ledger.json"
        Image.fromarray(final_mask, mode="L").save(mask_path, format="PNG", optimize=False)
        ledger = {
            "schemaVersion": 1,
            "operation": builder.MASK_REVIEW_OPERATION,
            "group": group,
            "reviewMethod": builder.MASK_REVIEW_METHOD,
            "source": {
                "rawSheetFileSha256": builder.sha256_file(raw_path),
                "rawSheetDecodedRgbaByteSha256": builder.rgba_bytes_hash(raw),
                "rawSheetGodotCanonicalRgbaSha256": builder.godot_canonical_rgba_hash(raw),
                "rawSheetDecodedRgbaSha256": builder.rgba_hash(raw),
                "explicitMaskFileSha256": builder.sha256_file(mask_path),
                "explicitMaskPixelSha256": builder.mask_hash(
                    Image.open(mask_path).convert("L")
                ),
                "width": raw.width,
                "height": raw.height,
            },
            "classifier": {
                "operation": builder.CHROMA_OPERATION,
                "connectivity": builder.CHROMA_CONNECTIVITY,
                "edgePolicy": (
                    builder.WORLD_EDGE_POLICY
                    if group == "world"
                    else builder.PORTRAIT_EDGE_POLICY
                ),
                "fringeMaximumFourNeighbourDistance": builder.FRINGE_MAX_DISTANCE,
                "fringeReviewGrouping": builder.FRINGE_REVIEW_GROUPING,
                "residualKeyReviewGrouping": builder.RESIDUAL_KEY_REVIEW_GROUPING,
                "largeEnclosedComponentReviewThreshold": builder.LARGE_ENCLOSED_COMPONENT_REVIEW_THRESHOLD,
            },
            "components": components,
        }
        ledger_path.write_text(
            json.dumps(ledger, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        inputs[f"{group}_explicit_mask"] = mask_path
        inputs[f"{group}_mask_authoring_ledger"] = ledger_path
        return components

    def _refresh_explicit_mask_binding(
        self, inputs: dict[str, Path], group: str
    ) -> dict[str, object]:
        mask_path = inputs[f"{group}_explicit_mask"]
        ledger_path = inputs[f"{group}_mask_authoring_ledger"]
        ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
        ledger["source"]["explicitMaskFileSha256"] = builder.sha256_file(mask_path)
        ledger["source"]["explicitMaskPixelSha256"] = builder.mask_hash(
            Image.open(mask_path).convert("L")
        )
        ledger_path.write_text(
            json.dumps(ledger, ensure_ascii=False, indent=2) + "\n",
            encoding="utf-8",
        )
        return ledger

    def _component_points(
        self,
        inputs: dict[str, Path],
        group: str,
        entry: dict[str, object],
    ) -> list[tuple[int, int]]:
        raw_path = inputs["world" if group == "world" else "portraits"]
        raw = Image.open(raw_path).convert("RGBA")
        slots = (
            builder.DEFAULT_DIRECTIONS
            if group == "world"
            else builder.DEFAULT_PORTRAIT_SLOTS
        )
        rows, cols = (2, 4) if group == "world" else (2, 2)
        index = slots.index(str(entry["slot"]))
        row, col = divmod(index, cols)
        x = builder.grid_boundaries(raw.width, cols)
        y = builder.grid_boundaries(raw.height, rows)
        box = (x[col], y[row], x[col + 1], y[row + 1])
        classification = builder._classify_chroma(
            raw.crop(box), builder.chroma_edge_policy(group, col)
        )
        groups = {
            builder.ENCLOSED_COMPONENT_TYPE: classification.enclosed_components,
            builder.FRINGE_COMPONENT_TYPE: classification.fringe_components,
            builder.OUTER_BACKGROUND_COMPONENT_TYPE: classification.outer_background_components,
            builder.RESIDUAL_KEY_COMPONENT_TYPE: classification.residual_key_components,
        }
        for component in groups[str(entry["componentType"])]:
            if builder.component_pixel_hash(component) == entry["componentPixelSha256"]:
                return [
                    (box[0] + int(point_x), box[1] + int(point_y))
                    for point_y, point_x in np.argwhere(component)
                ]
        self.fail("fixture component hash was not reproduced")

    def _prepare_real_group_read_only(
        self, raw_path: Path, group: str
    ) -> tuple[list[builder.PreparedFrame], dict[str, object], list[dict[str, object]]]:
        rows, cols, slots = (
            (2, 4, builder.DEFAULT_DIRECTIONS)
            if group == "world"
            else (2, 2, builder.DEFAULT_PORTRAIT_SLOTS)
        )
        original_hash = builder.sha256_file(raw_path)
        with tempfile.TemporaryDirectory() as temporary:
            copied = Path(temporary) / f"{group}.png"
            shutil.copyfile(raw_path, copied)
            inputs = {"world" if group == "world" else "portraits": copied}
            components = self._install_explicit_mask_review(inputs, group)
            snapshot = builder._freeze_file(copied, f"real {group} canary")
            raw = builder._load_png_snapshot(snapshot, require_opaque=True)
            mask_snapshot = builder._freeze_file(
                inputs[f"{group}_explicit_mask"], f"real {group} mask"
            )
            ledger_snapshot = builder._freeze_file(
                inputs[f"{group}_mask_authoring_ledger"], f"real {group} ledger"
            )
            ledger = json.loads(
                inputs[f"{group}_mask_authoring_ledger"].read_text(encoding="utf-8")
            )
            review = builder._build_explicit_mask_review(
                group,
                snapshot,
                raw,
                mask_snapshot,
                ledger_snapshot,
                ledger,
            )
            frames, grid = builder._prepare_group(
                raw,
                group,
                rows,
                cols,
                slots,
                4,
                4,
                review,
                builder.SOURCE_MODE_OPAQUE_CHROMA,
            )
        self.assertEqual(builder.sha256_file(raw_path), original_hash)
        return frames, grid, components

    def _render_real_group_with_residual_repairs_read_only(
        self,
        raw_path: Path,
        group: str,
        repair_component_hashes: set[str] | None = None,
    ) -> tuple[dict[str, builder.RenderedFrame], list[dict[str, object]]]:
        rows, cols, slots = (
            (2, 4, builder.DEFAULT_DIRECTIONS)
            if group == "world"
            else (2, 2, builder.DEFAULT_PORTRAIT_SLOTS)
        )
        original_hash = builder.sha256_file(raw_path)
        with tempfile.TemporaryDirectory() as temporary:
            copied = Path(temporary) / f"{group}.png"
            shutil.copyfile(raw_path, copied)
            inputs = {"world" if group == "world" else "portraits": copied}
            self._install_explicit_mask_review(inputs, group)
            ledger_path = inputs[f"{group}_mask_authoring_ledger"]
            mask_path = inputs[f"{group}_explicit_mask"]
            ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
            mask = np.asarray(
                Image.open(mask_path).convert("L"), dtype=np.uint8
            ).copy()
            residual_entries = [
                entry
                for entry in ledger["components"]
                if entry["componentType"] == builder.RESIDUAL_KEY_COMPONENT_TYPE
            ]
            self.assertGreater(len(residual_entries), 0)
            for entry in residual_entries:
                component_hash = str(entry["componentPixelSha256"])
                should_repair = (
                    repair_component_hashes is None
                    or component_hash in repair_component_hashes
                )
                entry["decision"] = (
                    builder.RESIDUAL_KEY_REPAIR_DECISION
                    if should_repair
                    else builder.RESIDUAL_KEY_RETAIN_DECISION
                )
                if should_repair:
                    for point_x, point_y in self._component_points(
                        inputs, group, entry
                    ):
                        mask[point_y, point_x] = 255
            Image.fromarray(mask, mode="L").save(
                mask_path, format="PNG", optimize=False
            )
            ledger_path.write_text(json.dumps(ledger), encoding="utf-8")
            self._refresh_explicit_mask_binding(inputs, group)

            source_snapshot = builder._freeze_file(copied, f"real {group} canary")
            source = builder._load_png_snapshot(
                source_snapshot, require_opaque=True
            )
            mask_snapshot = builder._freeze_file(mask_path, "real repair mask")
            ledger_snapshot = builder._freeze_file(
                ledger_path, "real repair ledger"
            )
            frozen_ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
            review = builder._build_explicit_mask_review(
                group,
                source_snapshot,
                source,
                mask_snapshot,
                ledger_snapshot,
                frozen_ledger,
            )
            prepared, _grid = builder._prepare_group(
                source,
                group,
                rows,
                cols,
                slots,
                4,
                4,
                review,
                builder.SOURCE_MODE_OPAQUE_CHROMA,
            )
            rendered, _scale = builder._render_group(
                prepared,
                builder.WORLD_SIZE if group == "world" else builder.PORTRAIT_SIZE,
                8 if group == "world" else 12,
                0.86 if group == "world" else 0.90,
                "baseline" if group == "world" else "center",
            )
        self.assertEqual(builder.sha256_file(raw_path), original_hash)
        return {frame.prepared.slot: frame for frame in rendered}, residual_entries

    @staticmethod
    def _runtime_residual_scan_masks(
        image: Image.Image,
    ) -> tuple[np.ndarray, np.ndarray]:
        """Frozen real-canary S/D/G oracle; diagnostic only, never a delete mask."""

        rgba = np.asarray(image.convert("RGBA"), dtype=np.uint8)
        red = rgba[:, :, 0].astype(np.int16)
        green = rgba[:, :, 1].astype(np.int16)
        blue = rgba[:, :, 2].astype(np.int16)
        alpha = rgba[:, :, 3]
        minimum_red_blue = np.minimum(red, blue)
        maximum_red_blue = np.maximum(red, blue)
        red_blue_delta = np.abs(red - blue)
        strong = (
            (alpha >= 64)
            & (maximum_red_blue >= 96)
            & ((minimum_red_blue - green) >= 55)
            & (red_blue_delta <= 55)
        )
        dark_support = (
            (alpha >= 64)
            & (maximum_red_blue >= 20)
            & ((minimum_red_blue - green) >= 12)
            & (red_blue_delta <= 55)
        )
        expanded = np.zeros_like(strong, dtype=np.bool_)
        for component in builder._connected_components(
            dark_support, connectivity=8
        ):
            if np.any(component & strong):
                expanded |= component
        return strong, expanded

    def _assert_runtime_point_backprojects_to_residual(
        self,
        frame_metadata: dict[str, object],
        classification: builder.ChromaClassification,
        runtime_point: tuple[int, int],
        raw_cell_coordinate: tuple[int, int],
        component_hash: str,
    ) -> None:
        paste_x, paste_y = frame_metadata["runtimePastePosition"]
        crop_width, crop_height = frame_metadata["paddedCropSize"]
        resized_width, resized_height = frame_metadata["resizedCropSize"]
        crop_x, crop_y = frame_metadata["paddedCropBbox"][:2]
        runtime_x, runtime_y = runtime_point
        source_x = (
            (runtime_x - paste_x + 0.5) * crop_width / resized_width
            - 0.5
            + crop_x
        )
        source_y = (
            (runtime_y - paste_y + 0.5) * crop_height / resized_height
            - 0.5
            + crop_y
        )
        raw_x, raw_y = raw_cell_coordinate
        self.assertLessEqual(abs(source_x - raw_x), 3.0)
        self.assertLessEqual(abs(source_y - raw_y), 3.0)
        self.assertTrue(
            classification.residual_key_candidate[raw_y, raw_x],
            f"runtime point {runtime_point} did not bind its frozen raw residual point",
        )
        component = next(
            (
                candidate
                for candidate in classification.residual_key_components
                if builder.component_pixel_hash(candidate) == component_hash
            ),
            None,
        )
        self.assertIsNotNone(component)
        assert component is not None
        self.assertTrue(component[raw_y, raw_x])

    def _large_enclosed_world_fixture(
        self, root: Path
    ) -> tuple[dict[str, Path], dict[str, object]]:
        inputs = self._inputs(root / "inputs")
        sheet = Image.open(inputs["world"]).convert("RGBA")
        draw = ImageDraw.Draw(sheet)
        # A deliberately authored non-key rim encloses a single exact-key area
        # larger than the attention threshold without changing the silhouette.
        draw.rectangle((41, 56, 87, 100), fill=(38, 67, 112, 255))
        draw.rectangle((44, 59, 84, 92), fill=(*builder.DEFAULT_KEY, 255))
        sheet.save(inputs["world"], format="PNG", optimize=False)
        self._refresh_generation_ledger(inputs)
        components = self._install_explicit_mask_review(inputs, "world")
        large = [
            entry
            for entry in components
            if entry["slot"] == "south"
            and entry["componentType"] == builder.ENCLOSED_COMPONENT_TYPE
            and int(entry["pixelCount"])
            > builder.LARGE_ENCLOSED_COMPONENT_REVIEW_THRESHOLD
        ]
        self.assertEqual(len(large), 1)
        self.assertTrue(large[0]["requiresLargeComponentAttention"])
        return inputs, large[0]

    def _residual_key_world_fixture(
        self, root: Path
    ) -> dict[str, Path]:
        inputs = self._inputs(root / "inputs")
        sheet = Image.open(inputs["world"]).convert("RGBA")
        # Two pixels embedded inside the south torso: they are changed by the
        # frozen global soft-matte proposal, but are outside automatic,
        # enclosed, fringe, and outer-background scopes.
        sheet.putpixel((64, 80), (180, 5, 159, 255))
        sheet.putpixel((65, 80), (180, 5, 159, 255))
        sheet.save(inputs["world"], format="PNG", optimize=False)
        self._refresh_generation_ledger(inputs)
        return inputs

    def _assert_build_fails(
        self,
        message: str,
        *,
        world_size: tuple[int, int] = (512, 320),
        world_kwargs: dict[str, object] | None = None,
        portrait_kwargs: dict[str, object] | None = None,
    ) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._inputs(
                root / "inputs",
                world_size=world_size,
                world_kwargs=world_kwargs,
                portrait_kwargs=portrait_kwargs,
            )
            with self.assertRaisesRegex(builder.NpcBundleBuildError, message):
                builder.build_bundle(self._options(root, inputs))
            self.assertFalse((root / "bundle").exists())

    def test_valid_bundle_has_identity_ledgers_canonical_layout_and_qc(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._inputs(root / "inputs")
            output = root / "bundle"
            metadata = builder.build_bundle(self._options(root, inputs))

            self.assertEqual(metadata["toolVersion"], builder.TOOL_VERSION)
            self.assertEqual(metadata["appearanceId"], "npc_stable_keeper_m_v1")
            self.assertEqual(metadata["portraitSlots"], list(builder.DEFAULT_PORTRAIT_SLOTS))
            self.assertFalse(metadata["qc"]["directionReview"]["automaticallyApproved"])
            self.assertEqual(
                (output / "identity/identity-board.png").read_bytes(),
                inputs["identity"].read_bytes(),
            )
            self.assertEqual(len(list(output.glob("runtime/world/*/idle-1.png"))), 8)
            self.assertEqual(len(list(output.glob("runtime/portraits/*.png"))), 4)
            for path in output.glob("runtime/world/*/idle-1.png"):
                rgba = np.asarray(Image.open(path).convert("RGBA"), dtype=np.uint8)
                self.assertEqual((rgba.shape[1], rgba.shape[0]), (256, 256))
                self.assertGreater(int(np.count_nonzero(rgba[:, :, 3] == 0)), 0)
                self.assertGreater(int(np.count_nonzero(rgba[:, :, 3] > 0)), 0)
                self.assertEqual(int(np.count_nonzero(rgba[rgba[:, :, 3] == 0, :3])), 0)

            manifest = json.loads((output / "npc-bundle.json").read_text(encoding="utf-8"))
            self.assertEqual(manifest["review"]["artStatus"], "in_production")
            self.assertEqual(manifest["review"]["ownerReviewStatus"], "pending")
            self.assertFalse(manifest["release"]["runtimeEnabled"])
            self.assertFalse(manifest["release"]["releaseApproved"])
            self.assertEqual(manifest["portraits"]["states"], list(builder.DEFAULT_PORTRAIT_SLOTS))
            self.assertEqual(manifest["generation"]["requestedBackground"], "#FF00FF")
            self.assertEqual(
                manifest["generation"]["backgroundOperations"]["opaqueChroma"],
                builder.CHROMA_OPERATION,
            )
            self.assertEqual(manifest["ownership"]["owner"], "Beastbound Odyssey project")
            self.assertEqual(
                manifest["identity"]["fileSha256"], builder.sha256_file(inputs["identity"])
            )
            self.assertTrue((output / "source/tool/build_npc_art_bundle.py").is_file())
            dependencies = json.loads(
                (output / "source/dependencies.json").read_text(encoding="utf-8")
            )
            self.assertEqual(dependencies["versions"]["pillow"], builder.PIL.__version__)
            self.assertEqual(dependencies["versions"]["numpy"], builder.np.__version__)

    def test_measured_mask_is_same_operation_and_preserves_every_unmasked_rgb(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._inputs(
                root / "inputs",
                world_kwargs={"background": (248, 4, 246)},
                portrait_kwargs={"background": (247, 3, 245)},
            )
            sheet = Image.open(inputs["world"]).convert("RGBA")
            ImageDraw.Draw(sheet).rectangle(
                (66, 74, 75, 82), fill=(174, 42, 196, 255)
            )
            sheet.save(inputs["world"], format="PNG", optimize=False)
            self._refresh_generation_ledger(inputs)
            self._install_explicit_mask_review(inputs, "world")
            output = root / "bundle"
            builder.build_bundle(self._options(root, inputs))
            raw = np.asarray(
                Image.open(output / "source/raw/cells/world/south-idle-1.png").convert("RGBA"),
                dtype=np.uint8,
            )
            mask_image = Image.open(output / "source/masks/world/south/idle-1.png").convert("L")
            mask = np.asarray(mask_image, dtype=np.uint8) == 255
            processed = np.asarray(
                Image.open(output / "source/processed/world/south/idle-1.png").convert("RGBA"),
                dtype=np.uint8,
            )
            self.assertFalse(np.any(np.all(raw[:, :, :3] == (255, 0, 255), axis=2)))
            self.assertTrue(np.all(processed[mask] == 0))
            self.assertTrue(np.array_equal(processed[~mask], raw[~mask]))
            authored_purple = np.all(processed[:, :, :3] == (174, 42, 196), axis=2)
            self.assertGreater(int(np.count_nonzero(authored_purple)), 0)

            provenance = json.loads(
                (output / "source/provenance.json").read_text(encoding="utf-8")
            )
            frame = provenance["frames"][0]
            self.assertEqual(frame["eligibilityOperation"], builder.CHROMA_OPERATION)
            self.assertEqual(frame["maskPixelSha256"], builder.mask_hash(mask_image))
            self.assertEqual(frame["ambiguousEnclosedCandidatePixels"], 0)
            self.assertFalse(frame["postMaskGlobalColorDeletion"])
            self.assertIn([248, 4, 246], [sample["rgb"] for sample in frame["measuredBackgroundSamples"]])

    def test_genuine_transparent_preserves_alpha_positive_and_archives_exact_changed_mask(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._inputs(root / "inputs", genuine_transparent=True)
            raw_sheet = np.asarray(
                Image.open(inputs["world"]).convert("RGBA"), dtype=np.uint8
            ).copy()
            alpha_zero = raw_sheet[:, :, 3] == 0
            checker = (np.indices(alpha_zero.shape).sum(axis=0) % 2) == 0
            raw_sheet[alpha_zero & checker, :3] = 0
            visible_y, visible_x = np.argwhere(raw_sheet[:, :, 3] == 255)[0]
            raw_sheet[visible_y, visible_x, 3] = 128
            Image.fromarray(raw_sheet, mode="RGBA").save(
                inputs["world"], format="PNG", optimize=False
            )
            self._refresh_generation_ledger(inputs)
            metadata = builder.build_bundle(
                self._options(
                    root,
                    inputs,
                    world_source_mode=builder.SOURCE_MODE_GENUINE_TRANSPARENT,
                    portrait_source_mode=builder.SOURCE_MODE_GENUINE_TRANSPARENT,
                )
            )
            output = root / "bundle"
            provenance = json.loads(
                (output / "source/provenance.json").read_text(encoding="utf-8")
            )
            frame = provenance["frames"][0]
            raw = np.asarray(Image.open(output / frame["rawPath"]).convert("RGBA"), dtype=np.uint8)
            processed = np.asarray(
                Image.open(output / frame["processedPath"]).convert("RGBA"),
                dtype=np.uint8,
            )
            eligibility = np.asarray(
                Image.open(output / frame["eligibilityMaskPath"]).convert("L"),
                dtype=np.uint8,
            ) == 255
            changed = np.asarray(
                Image.open(output / frame["changedPixelMaskPath"]).convert("L"),
                dtype=np.uint8,
            ) == 255
            expected_changed = np.any(raw != processed, axis=2)
            self.assertTrue(np.array_equal(eligibility, raw[:, :, 3] == 0))
            self.assertTrue(np.array_equal(changed, expected_changed))
            self.assertTrue(np.array_equal(raw[raw[:, :, 3] > 0], processed[raw[:, :, 3] > 0]))
            self.assertTrue(np.all(processed[raw[:, :, 3] == 0] == 0))
            self.assertLess(int(np.count_nonzero(changed)), int(np.count_nonzero(eligibility)))
            self.assertEqual(frame["sourceMode"], builder.SOURCE_MODE_GENUINE_TRANSPARENT)
            runtime = Image.open(output / frame["runtimePath"]).convert("RGBA")
            self.assertNotEqual(
                builder.rgba_hash(runtime), builder.godot_canonical_rgba_hash(runtime)
            )
            self.assertEqual(
                frame["runtimeRgbaSha256"], builder.rgba_hash(runtime)
            )
            self.assertEqual(
                frame["runtimeGodotCanonicalRgbaSha256"],
                builder.godot_canonical_rgba_hash(runtime),
            )
            self.assertEqual(metadata["inputs"]["worldSheet"]["sourceMode"], builder.SOURCE_MODE_GENUINE_TRANSPARENT)

    def test_genuine_transparent_rejects_opaque_empty_partial_only_and_tiny_island(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._inputs(root / "opaque")
            with self.assertRaisesRegex(builder.NpcBundleBuildError, "fully opaque"):
                builder.build_bundle(
                    self._options(
                        root,
                        inputs,
                        world_source_mode=builder.SOURCE_MODE_GENUINE_TRANSPARENT,
                    )
                )

        for case in ("empty", "partial-only", "tiny-island"):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                inputs = self._inputs(root / "inputs", genuine_transparent=True)
                image = np.asarray(
                    Image.open(inputs["world"]).convert("RGBA"), dtype=np.uint8
                ).copy()
                if case == "empty":
                    image[:, :, :] = 0
                    expected = "fully transparent"
                elif case == "partial-only":
                    image[:, :, 3] = 128
                    expected = "partial alpha but no fully transparent"
                else:
                    image[5, 5] = (70, 80, 90, 255)
                    expected = "detached alpha-positive islands"
                Image.fromarray(image, mode="RGBA").save(
                    inputs["world"], format="PNG", optimize=False
                )
                self._refresh_generation_ledger(inputs)
                with self.assertRaisesRegex(builder.NpcBundleBuildError, expected):
                    builder.build_bundle(
                        self._options(
                            root,
                            inputs,
                            world_source_mode=builder.SOURCE_MODE_GENUINE_TRANSPARENT,
                        )
                    )

    def test_requested_background_is_exactly_derived_from_both_source_modes(self) -> None:
        cases = (
            ("opaque", builder.REQUESTED_BACKGROUND),
            ("genuine", "transparent"),
            ("mixed", "mixed"),
        )
        for case, expected_background in cases:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                inputs = self._inputs(
                    root / "inputs", genuine_transparent=case == "genuine"
                )
                if case == "mixed":
                    self._make_sheet_genuine_transparent(inputs["world"])
                    self._refresh_generation_ledger(inputs)
                metadata = builder.build_bundle(self._options(root, inputs))
                manifest = json.loads(
                    (root / "bundle/npc-bundle.json").read_text(encoding="utf-8")
                )
                self.assertEqual(
                    manifest["generation"]["requestedBackground"],
                    expected_background,
                )
                self.assertEqual(
                    metadata["inputs"]["worldSheet"]["sourceMode"],
                    (
                        builder.SOURCE_MODE_GENUINE_TRANSPARENT
                        if case in ("genuine", "mixed")
                        else builder.SOURCE_MODE_OPAQUE_CHROMA
                    ),
                )
                self.assertEqual(
                    metadata["inputs"]["portraitSheet"]["sourceMode"],
                    (
                        builder.SOURCE_MODE_GENUINE_TRANSPARENT
                        if case == "genuine"
                        else builder.SOURCE_MODE_OPAQUE_CHROMA
                    ),
                )

        for case, wrong_background in (
            ("opaque", "transparent"),
            ("genuine", builder.REQUESTED_BACKGROUND),
            ("mixed", builder.REQUESTED_BACKGROUND),
        ):
            with self.subTest(case=f"wrong-{case}"), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                inputs = self._inputs(
                    root / "inputs", genuine_transparent=case == "genuine"
                )
                if case == "mixed":
                    self._make_sheet_genuine_transparent(inputs["world"])
                    self._refresh_generation_ledger(inputs)
                ledger = json.loads(inputs["generation"].read_text(encoding="utf-8"))
                ledger["requestedBackground"] = wrong_background
                inputs["generation"].write_text(json.dumps(ledger), encoding="utf-8")
                with self.assertRaisesRegex(
                    builder.NpcBundleBuildError,
                    "requestedBackground must be derived exactly",
                ):
                    builder.build_bundle(self._options(root, inputs))

        for missing_field in ("sourceMode", "requestedBackground"):
            with self.subTest(missing=missing_field), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                inputs = self._inputs(root / "inputs")
                ledger = json.loads(inputs["generation"].read_text(encoding="utf-8"))
                del ledger["sources"]["worldSheet"][missing_field]
                inputs["generation"].write_text(json.dumps(ledger), encoding="utf-8")
                with self.assertRaisesRegex(
                    builder.NpcBundleBuildError,
                    rf"worldSheet\.{missing_field} must be",
                ):
                    builder.build_bundle(self._options(root, inputs))

    def test_reviewed_background_hole_components_are_archived_and_mask_bounded(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._inputs(
                root / "inputs", world_kwargs={"residue_index": 0}
            )
            components = self._install_explicit_mask_review(inputs, "world")
            self.assertGreater(len(components), 0)
            metadata = builder.build_bundle(self._options(root, inputs))
            output = root / "bundle"
            provenance = json.loads(
                (output / "source/provenance.json").read_text(encoding="utf-8")
            )
            south = provenance["frames"][0]
            self.assertEqual(
                south["maskReview"]["mode"],
                "automatic-plus-reviewed-components",
            )
            self.assertEqual(
                south["maskReview"]["reviewOperation"],
                builder.MASK_REVIEW_OPERATION,
            )
            self.assertGreater(south["classifierEnclosedCandidatePixels"], 0)
            self.assertEqual(south["unreviewedEnclosedCandidatePixels"], 0)
            self.assertEqual(
                south["maskReview"]["reviewedBackgroundHolePixelCount"],
                sum(
                    int(entry["pixelCount"])
                    for entry in components
                    if entry["slot"] == "south"
                ),
            )
            raw = np.asarray(
                Image.open(output / south["rawPath"]).convert("RGBA"), dtype=np.uint8
            )
            mask = np.asarray(
                Image.open(output / south["maskPath"]).convert("L"), dtype=np.uint8
            ) == 255
            processed = np.asarray(
                Image.open(output / south["processedPath"]).convert("RGBA"),
                dtype=np.uint8,
            )
            self.assertTrue(np.array_equal(raw[~mask], processed[~mask]))
            self.assertTrue(np.all(processed[mask] == 0))
            manifest = json.loads((output / "npc-bundle.json").read_text(encoding="utf-8"))
            review = manifest["generation"]["explicitMaskReviews"]["world"]
            self.assertEqual(
                review["maskAuthoringLedgerFileSha256"],
                builder.sha256_file(inputs["world_mask_authoring_ledger"]),
            )
            self.assertIn("worldExplicitMask", metadata["inputs"])

    def test_large_reviewed_hole_requires_exact_attention_and_changed_mask(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs, large = self._large_enclosed_world_fixture(root)
            builder.build_bundle(self._options(root, inputs))
            output = root / "bundle"
            provenance = json.loads(
                (output / "source/provenance.json").read_text(encoding="utf-8")
            )
            south = provenance["frames"][0]
            archived = [
                entry
                for entry in south["maskReview"]["reviewedComponents"]
                if entry["componentPixelSha256"]
                == large["componentPixelSha256"]
            ]
            self.assertEqual(len(archived), 1)
            self.assertTrue(archived[0]["requiresLargeComponentAttention"])
            raw = np.asarray(
                Image.open(output / south["rawPath"]).convert("RGBA"),
                dtype=np.uint8,
            )
            processed = np.asarray(
                Image.open(output / south["processedPath"]).convert("RGBA"),
                dtype=np.uint8,
            )
            changed = np.asarray(
                Image.open(output / south["changedPixelMaskPath"]).convert("L"),
                dtype=np.uint8,
            ) == 255
            self.assertTrue(np.array_equal(changed, np.any(raw != processed, axis=2)))
            points = self._component_points(inputs, "world", large)
            for sheet_x, sheet_y in points:
                self.assertTrue(changed[sheet_y, sheet_x])
                self.assertEqual(processed[sheet_y, sheet_x].tolist(), [0, 0, 0, 0])

        for case in ("attention", "half", "reviewer"):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                inputs, large = self._large_enclosed_world_fixture(root)
                ledger_path = inputs["world_mask_authoring_ledger"]
                ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
                target = next(
                    entry
                    for entry in ledger["components"]
                    if entry["componentPixelSha256"]
                    == large["componentPixelSha256"]
                )
                if case == "attention":
                    target["requiresLargeComponentAttention"] = False
                    expected = "mismatched requiresLargeComponentAttention"
                elif case == "reviewer":
                    target["reviewer"] = ""
                    expected = "reviewer must be a non-empty string"
                else:
                    mask_path = inputs["world_explicit_mask"]
                    mask = np.asarray(
                        Image.open(mask_path).convert("L"), dtype=np.uint8
                    ).copy()
                    point_x, point_y = self._component_points(
                        inputs, "world", large
                    )[0]
                    mask[point_y, point_x] = 0
                    Image.fromarray(mask, mode="L").save(
                        mask_path, format="PNG", optimize=False
                    )
                    expected = "splits enclosed-chroma component"
                ledger_path.write_text(json.dumps(ledger), encoding="utf-8")
                if case == "half":
                    self._refresh_explicit_mask_binding(inputs, "world")
                with self.assertRaisesRegex(builder.NpcBundleBuildError, expected):
                    builder.build_bundle(self._options(root, inputs))

    def test_background_fringe_distance_boundary_accepts_three_and_rejects_four(self) -> None:
        raw = self._draw_world_cell((96, 128), 0, builder.DEFAULT_KEY)
        baseline = builder._classify_chroma(raw)
        within_two = builder._within_four_neighbour_distance(
            baseline.automatic_eligible, 2
        )
        within_three = builder._within_four_neighbour_distance(
            baseline.automatic_eligible, 3
        )
        within_four = builder._within_four_neighbour_distance(
            baseline.automatic_eligible, 4
        )
        exact_distance = {
            3: within_three & ~within_two,
            4: within_four & ~within_three,
        }
        for distance, should_pass in ((3, True), (4, False)):
            with self.subTest(distance=distance):
                candidates = np.argwhere(
                    exact_distance[distance] & ~baseline.automatic_eligible
                )
                self.assertGreater(len(candidates), 0)
                point_y, point_x = (int(value) for value in candidates[0])
                component = np.zeros_like(
                    baseline.automatic_eligible, dtype=np.bool_
                )
                component[point_y, point_x] = True
                matte = baseline.rgba.copy()
                matte[point_y, point_x] = (18, 22, 24, 128)
                metadata = {
                    **baseline.metadata,
                    "classifierEnclosedCandidatePixels": 0,
                    "classifierEnclosedComponentCount": 0,
                    "classifierAdjacentFringeCandidatePixels": 1,
                    "classifierAdjacentFringeComponentCount": 1,
                    "classifierReviewedOuterBackgroundHoleCandidatePixels": 0,
                    "classifierReviewedOuterBackgroundHoleComponentCount": 0,
                }
                classification = dataclasses.replace(
                    baseline,
                    enclosed_components=(),
                    fringe_candidate=component,
                    fringe_components=(component,),
                    outer_background_candidate=np.zeros_like(component),
                    outer_background_components=(),
                    matte_rgba=matte,
                    metadata=metadata,
                )
                box = (0, 0, raw.width, raw.height)
                descriptor = builder._component_descriptor(
                    component,
                    "south",
                    box,
                    builder.FRINGE_COMPONENT_TYPE,
                )
                eligibility = baseline.automatic_eligible | component
                mask_image = Image.fromarray(
                    eligibility.astype(np.uint8) * 255, mode="L"
                )
                frozen = builder.FrozenInput(
                    "synthetic fringe mask", Path("synthetic-mask.png"), b"", "0" * 64
                )
                review = builder.ExplicitMaskReview(
                    group="world",
                    mask_snapshot=frozen,
                    ledger_snapshot=frozen,
                    mask_image=mask_image,
                    ledger={
                        "source": {"rawSheetFileSha256": "1" * 64},
                        "components": [
                            {
                                **descriptor,
                                "decision": "background-fringe",
                                "reviewer": "Synthetic Boundary Reviewer",
                                "reviewedAt": "2026-07-21T13:00:00+08:00",
                            }
                        ],
                    },
                )
                with mock.patch.object(
                    builder, "_classify_chroma", return_value=classification
                ):
                    if should_pass:
                        frames, _grid = builder._prepare_group(
                            raw,
                            "world",
                            1,
                            1,
                            ("south",),
                            4,
                            4,
                            review,
                            builder.SOURCE_MODE_OPAQUE_CHROMA,
                        )
                        changed = np.asarray(
                            frames[0].changed_pixel_mask, dtype=np.uint8
                        ) == 255
                        self.assertTrue(changed[point_y, point_x])
                    else:
                        with self.assertRaisesRegex(
                            builder.NpcBundleBuildError,
                            "farther than 3px four-neighbour distance",
                        ):
                            builder._prepare_group(
                                raw,
                                "world",
                                1,
                                1,
                                ("south",),
                                4,
                                4,
                                review,
                                builder.SOURCE_MODE_OPAQUE_CHROMA,
                            )

    def test_reviewed_retain_subject_component_remains_visible(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._inputs(
                root / "inputs", world_kwargs={"residue_index": 0}
            )
            self._install_explicit_mask_review(
                inputs, "world", default_decision="retain-subject"
            )
            builder.build_bundle(self._options(root, inputs))
            raw = np.asarray(
                Image.open(
                    root / "bundle/source/raw/cells/world/south-idle-1.png"
                ).convert("RGBA"),
                dtype=np.uint8,
            )
            processed = np.asarray(
                Image.open(
                    root / "bundle/source/processed/world/south/idle-1.png"
                ).convert("RGBA"),
                dtype=np.uint8,
            )
            retained = np.all(processed[:, :, :3] == (254, 1, 254), axis=2) & (
                processed[:, :, 3] == 255
            )
            self.assertEqual(
                int(np.count_nonzero(retained)),
                int(
                    np.count_nonzero(
                        np.all(raw[:, :, :3] == (254, 1, 254), axis=2)
                        & (raw[:, :, 3] == 255)
                    )
                ),
            )

    def test_one_pixel_residual_key_color_fails_closed_without_review(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._residual_key_world_fixture(root)
            sheet = Image.open(inputs["world"]).convert("RGBA")
            x = builder.grid_boundaries(sheet.width, 4)
            y = builder.grid_boundaries(sheet.height, 2)
            classification = builder._classify_chroma(
                sheet.crop((x[0], y[0], x[1], y[1]))
            )
            self.assertEqual(
                classification.metadata[
                    "classifierResidualKeyColorCandidatePixels"
                ],
                2,
            )
            # Residual review has no minimum size: prove a single isolated
            # proposal pixel is itself a review component.
            one_pixel = sheet.copy()
            one_pixel.putpixel((65, 80), tuple(one_pixel.getpixel((64, 80))))
            one_pixel.putpixel((65, 80), (76, 91, 176, 255))
            one_pixel.save(inputs["world"], format="PNG", optimize=False)
            self._refresh_generation_ledger(inputs)
            with self.assertRaisesRegex(
                builder.NpcBundleBuildError,
                "1 residual key-color candidates",
            ):
                builder.build_bundle(self._options(root, inputs))
            self.assertFalse((root / "bundle").exists())

    def test_residual_key_color_is_exactly_retained_or_soft_matte_repaired(self) -> None:
        for decision in (
            builder.RESIDUAL_KEY_RETAIN_DECISION,
            builder.RESIDUAL_KEY_REPAIR_DECISION,
        ):
            with self.subTest(decision=decision), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                inputs = self._residual_key_world_fixture(root)
                components = self._install_explicit_mask_review(inputs, "world")
                target = next(
                    entry
                    for entry in components
                    if entry["slot"] == "south"
                    and entry["componentType"]
                    == builder.RESIDUAL_KEY_COMPONENT_TYPE
                    and int(entry["pixelCount"]) == 2
                )
                ledger_path = inputs["world_mask_authoring_ledger"]
                ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
                ledger_target = next(
                    entry
                    for entry in ledger["components"]
                    if entry["componentPixelSha256"]
                    == target["componentPixelSha256"]
                )
                ledger_target["decision"] = decision
                ledger_path.write_text(json.dumps(ledger), encoding="utf-8")
                if decision == builder.RESIDUAL_KEY_REPAIR_DECISION:
                    mask_path = inputs["world_explicit_mask"]
                    mask = np.asarray(
                        Image.open(mask_path).convert("L"), dtype=np.uint8
                    ).copy()
                    for point_x, point_y in self._component_points(
                        inputs, "world", target
                    ):
                        mask[point_y, point_x] = 255
                    Image.fromarray(mask, mode="L").save(
                        mask_path, format="PNG", optimize=False
                    )
                self._refresh_explicit_mask_binding(inputs, "world")
                builder.build_bundle(self._options(root, inputs))

                output = root / "bundle"
                raw_image = Image.open(
                    output / "source/raw/cells/world/south-idle-1.png"
                ).convert("RGBA")
                processed_image = Image.open(
                    output / "source/processed/world/south/idle-1.png"
                ).convert("RGBA")
                raw = np.asarray(raw_image, dtype=np.uint8)
                processed = np.asarray(processed_image, dtype=np.uint8)
                classification = builder._classify_chroma(raw_image)
                provenance = json.loads(
                    (output / "source/provenance.json").read_text(encoding="utf-8")
                )
                south = next(
                    frame
                    for frame in provenance["frames"]
                    if frame["group"] == "world" and frame["slot"] == "south"
                )
                archived = next(
                    entry
                    for entry in south["maskReview"]["reviewedComponents"]
                    if entry["componentPixelSha256"]
                    == target["componentPixelSha256"]
                )
                self.assertEqual(archived["decision"], decision)
                if decision == builder.RESIDUAL_KEY_RETAIN_DECISION:
                    self.assertTrue(
                        np.array_equal(processed[80, 64], raw[80, 64])
                    )
                    self.assertEqual(
                        south["maskReview"][
                            "reviewedRetainedAuthoredColorPixelCount"
                        ],
                        2,
                    )
                else:
                    self.assertTrue(
                        np.array_equal(
                            processed[80, 64],
                            classification.matte_rgba[80, 64],
                        )
                    )
                    self.assertFalse(np.array_equal(processed[80, 64], raw[80, 64]))
                    self.assertEqual(
                        south["maskReview"][
                            "reviewedResidualKeySpillPixelCount"
                        ],
                        2,
                    )

    def test_residual_review_rejects_missing_partial_stale_escape_and_old_contract(self) -> None:
        cases = (
            "missing",
            "partial",
            "stale-hash",
            "mask-escape",
            "decision-mask-contradiction",
            "old-operation",
        )
        for case in cases:
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                inputs = self._residual_key_world_fixture(root)
                components = self._install_explicit_mask_review(inputs, "world")
                target = next(
                    entry
                    for entry in components
                    if entry["slot"] == "south"
                    and entry["componentType"]
                    == builder.RESIDUAL_KEY_COMPONENT_TYPE
                    and int(entry["pixelCount"]) == 2
                )
                ledger_path = inputs["world_mask_authoring_ledger"]
                ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
                ledger_target = next(
                    entry
                    for entry in ledger["components"]
                    if entry["componentPixelSha256"]
                    == target["componentPixelSha256"]
                )
                mask_path = inputs["world_explicit_mask"]
                mask = np.asarray(
                    Image.open(mask_path).convert("L"), dtype=np.uint8
                ).copy()
                points = self._component_points(inputs, "world", target)
                if case == "missing":
                    ledger["components"].remove(ledger_target)
                    expected = "unreviewed residual-key-color-candidate component"
                elif case == "partial":
                    ledger_target["decision"] = builder.RESIDUAL_KEY_REPAIR_DECISION
                    point_x, point_y = points[0]
                    mask[point_y, point_x] = 255
                    expected = "splits residual-key-color-candidate component"
                elif case == "stale-hash":
                    ledger_target["componentPixelSha256"] = "0" * 64
                    expected = "unreviewed residual-key-color-candidate component"
                elif case == "mask-escape":
                    sheet = Image.open(inputs["world"]).convert("RGBA")
                    x = builder.grid_boundaries(sheet.width, 4)
                    y = builder.grid_boundaries(sheet.height, 2)
                    classification = builder._classify_chroma(
                        sheet.crop((x[0], y[0], x[1], y[1]))
                    )
                    allowed = (
                        classification.candidate
                        | classification.fringe_candidate
                        | classification.outer_background_candidate
                        | classification.residual_key_candidate
                    )
                    point_y, point_x = np.argwhere(~allowed)[0]
                    mask[int(point_y), int(point_x)] = 255
                    expected = "outside automatic/enclosed/fringe/outer/residual classifier scope"
                elif case == "decision-mask-contradiction":
                    ledger_target["decision"] = builder.RESIDUAL_KEY_REPAIR_DECISION
                    expected = "contradicts repair-key-spill decision"
                else:
                    ledger["operation"] = "reviewed_chroma_components_v2"
                    expected = builder.MASK_REVIEW_OPERATION
                Image.fromarray(mask, mode="L").save(
                    mask_path, format="PNG", optimize=False
                )
                ledger_path.write_text(json.dumps(ledger), encoding="utf-8")
                if case not in ("old-operation",):
                    self._refresh_explicit_mask_binding(inputs, "world")
                with self.assertRaisesRegex(builder.NpcBundleBuildError, expected):
                    builder.build_bundle(self._options(root, inputs))
                self.assertFalse((root / "bundle").exists())

    def test_static_detached_foreground_gate_blocks_128_pixels_without_deletion(self) -> None:
        image = Image.new("RGBA", (180, 180), (0, 0, 0, 0))
        draw = ImageDraw.Draw(image)
        draw.rectangle((60, 30, 130, 160), fill=(80, 110, 150, 255))
        draw.rectangle((20, 50, 21, 113), fill=(120, 80, 40, 255))
        report = builder._static_detached_foreground_report(
            image, "processed-cell"
        )
        self.assertEqual(len(report["blockingComponents"]), 1)
        self.assertEqual(report["blockingComponents"][0]["pixelCount"], 128)
        self.assertEqual(report["blockingComponents"][0]["bbox"], [20, 50, 22, 114])
        self.assertRegex(
            report["blockingComponents"][0]["componentPixelSha256"],
            r"^[0-9a-f]{64}$",
        )
        with self.assertRaisesRegex(
            builder.NpcBundleBuildError,
            "detached foreground component.*128 pixels.*no automatic deletion",
        ):
            builder._enforce_static_detached_foreground(
                image, "portrait", "concerned", "processed-cell"
            )
        self.assertEqual(image.getpixel((20, 50)), (120, 80, 40, 255))

        below = image.copy()
        ImageDraw.Draw(below).rectangle((20, 50, 21, 113), fill=(0, 0, 0, 0))
        ImageDraw.Draw(below).rectangle((20, 50, 20, 176), fill=(120, 80, 40, 255))
        passed = builder._enforce_static_detached_foreground(
            below, "portrait", "concerned", "runtime"
        )
        self.assertEqual(passed["largestDetachedComponentPixelCount"], 127)
        self.assertEqual(passed["blockingComponents"], [])

    def test_static_detached_foreground_builder_rejects_cross_cell_strip(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._inputs(root / "inputs")
            portraits = Image.open(inputs["portraits"]).convert("RGBA")
            ImageDraw.Draw(portraits).rectangle(
                (10, 50, 11, 133), fill=(120, 80, 40, 255)
            )
            portraits.save(inputs["portraits"], format="PNG", optimize=False)
            self._refresh_generation_ledger(inputs)
            with self.assertRaisesRegex(
                builder.NpcBundleBuildError,
                r'processed-cell has detached foreground component.*"pixelCount":168',
            ):
                builder.build_bundle(self._options(root, inputs))
            self.assertFalse((root / "bundle").exists())

    @unittest.skipUnless(
        GUARD_CANARY_PORTRAITS.is_file()
        and GUARD_REJECTED_CROSS_CELL_PORTRAITS.is_file(),
        "tracked guard portrait detached-foreground canaries are absent",
    )
    def test_real_guard_portrait_detached_foreground_gate_passes_clean_and_blocks_rejected(self) -> None:
        clean_sha = builder.sha256_file(GUARD_CANARY_PORTRAITS)
        rejected_sha = builder.sha256_file(GUARD_REJECTED_CROSS_CELL_PORTRAITS)
        self.assertEqual(
            clean_sha,
            "7c14193d800746c151c351c73af472581d6129bf55ea9edb02845f7c8ee480c9",
        )
        self.assertEqual(
            rejected_sha,
            "bc64bc6c98b040d069e5d4b780b48fa108dc73e207398564716b9ab96aeed0e8",
        )

        clean_frames, _grid, _components = self._prepare_real_group_read_only(
            GUARD_CANARY_PORTRAITS,
            "portrait",
        )
        self.assertEqual(
            [
                frame.metadata["sourceProcessing"][
                    "processedDetachedForegroundGate"
                ]["blockingComponents"]
                for frame in clean_frames
            ],
            [[], [], [], []],
        )

        with self.assertRaisesRegex(
            builder.NpcBundleBuildError,
            r'portrait slot speaking: (?=.*processed-cell has detached foreground component)(?=.*"pixelCount":215)(?=.*no automatic deletion)',
        ):
            self._prepare_real_group_read_only(
                GUARD_REJECTED_CROSS_CELL_PORTRAITS,
                "portrait",
            )
        self.assertEqual(builder.sha256_file(GUARD_CANARY_PORTRAITS), clean_sha)
        self.assertEqual(
            builder.sha256_file(GUARD_REJECTED_CROSS_CELL_PORTRAITS),
            rejected_sha,
        )

    def test_reviewed_magenta_costume_fringe_is_retained_and_dark_outline_is_untouched(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._inputs(root / "inputs")
            sheet = Image.open(inputs["world"]).convert("RGBA")
            # South cell body starts near x=43. Put an authored magenta trim on
            # its edge and a separate dark outline pixel beside ordinary art.
            draw = ImageDraw.Draw(sheet)
            draw.rectangle((43, 70, 45, 76), fill=(220, 40, 210, 255))
            draw.rectangle((84, 70, 85, 76), fill=(12, 15, 18, 255))
            sheet.save(inputs["world"], format="PNG", optimize=False)
            self._refresh_generation_ledger(inputs)
            components = self._install_explicit_mask_review(inputs, "world")
            costume_point = (43, 70)
            target = None
            for entry in components:
                if entry["slot"] != "south" or entry["componentType"] != builder.FRINGE_COMPONENT_TYPE:
                    continue
                if costume_point in self._component_points(inputs, "world", entry):
                    target = entry
                    break
            self.assertIsNotNone(target, "authored magenta trim must be reviewable fringe")
            assert target is not None
            ledger_path = inputs["world_mask_authoring_ledger"]
            ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
            for entry in ledger["components"]:
                if (
                    entry["slot"] == target["slot"]
                    and entry["componentType"] == target["componentType"]
                    and entry["componentPixelSha256"] == target["componentPixelSha256"]
                ):
                    entry["decision"] = "retain-subject"
            mask_path = inputs["world_explicit_mask"]
            mask = np.asarray(Image.open(mask_path).convert("L"), dtype=np.uint8).copy()
            for point_x, point_y in self._component_points(inputs, "world", target):
                mask[point_y, point_x] = 0
            Image.fromarray(mask, mode="L").save(mask_path, format="PNG", optimize=False)
            ledger_path.write_text(json.dumps(ledger), encoding="utf-8")
            self._refresh_explicit_mask_binding(inputs, "world")
            builder.build_bundle(self._options(root, inputs))
            raw = np.asarray(
                Image.open(root / "bundle/source/raw/cells/world/south-idle-1.png").convert("RGBA"),
                dtype=np.uint8,
            )
            processed = np.asarray(
                Image.open(root / "bundle/source/processed/world/south/idle-1.png").convert("RGBA"),
                dtype=np.uint8,
            )
            self.assertTrue(np.array_equal(processed[70, 43], raw[70, 43]))
            self.assertTrue(np.array_equal(processed[70, 84], raw[70, 84]))

    def test_explicit_mask_rejects_full_true_noncandidate_and_half_component(self) -> None:
        for case in ("full", "noncandidate", "half"):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                inputs = self._inputs(
                    root / "inputs", world_kwargs={"residue_index": 0}
                )
                components = self._install_explicit_mask_review(inputs, "world")
                mask_path = inputs["world_explicit_mask"]
                mask = np.asarray(Image.open(mask_path).convert("L"), dtype=np.uint8).copy()
                if case == "full":
                    mask[:, :] = 255
                    expected = "outside automatic/enclosed/fringe/outer/residual classifier scope"
                elif case == "noncandidate":
                    raw = Image.open(inputs["world"]).convert("RGBA")
                    x = builder.grid_boundaries(raw.width, 4)
                    y = builder.grid_boundaries(raw.height, 2)
                    classification = builder._classify_chroma(
                        raw.crop((x[0], y[0], x[1], y[1]))
                    )
                    point_y, point_x = np.argwhere(~classification.candidate)[0]
                    mask[int(point_y), int(point_x)] = 255
                    expected = "outside automatic/enclosed/fringe/outer/residual classifier scope"
                else:
                    points = self._component_points(inputs, "world", components[0])
                    point_x, point_y = points[0]
                    mask[point_y, point_x] = 0
                    expected = "splits enclosed-chroma component"
                Image.fromarray(mask, mode="L").save(mask_path, format="PNG", optimize=False)
                self._refresh_explicit_mask_binding(inputs, "world")
                with self.assertRaisesRegex(builder.NpcBundleBuildError, expected):
                    builder.build_bundle(self._options(root, inputs))
                self.assertFalse((root / "bundle").exists())

    def test_explicit_mask_rejects_missing_or_tampered_component_review(self) -> None:
        for case in ("missing", "component-hash", "mask-hash", "reviewer", "reviewed-at"):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                inputs = self._inputs(
                    root / "inputs", world_kwargs={"residue_index": 0}
                )
                self._install_explicit_mask_review(inputs, "world")
                ledger_path = inputs["world_mask_authoring_ledger"]
                ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
                if case == "missing":
                    ledger["components"] = []
                    expected = "unreviewed enclosed-chroma component"
                elif case == "component-hash":
                    ledger["components"][0]["componentPixelSha256"] = "0" * 64
                    expected = "unreviewed enclosed-chroma component"
                elif case == "mask-hash":
                    ledger["source"]["explicitMaskFileSha256"] = "0" * 64
                    expected = "explicitMaskFileSha256"
                elif case == "reviewer":
                    ledger["components"][0]["reviewer"] = ""
                    expected = "reviewer must be a non-empty string"
                else:
                    ledger["components"][0]["reviewedAt"] = "2026-07-21T13:00:00"
                    expected = "reviewedAt must include a timezone"
                ledger_path.write_text(json.dumps(ledger), encoding="utf-8")
                with self.assertRaisesRegex(builder.NpcBundleBuildError, expected):
                    builder.build_bundle(self._options(root, inputs))
                self.assertFalse((root / "bundle").exists())

    def test_explicit_mask_requires_pair_and_preserves_every_automatic_border_pixel(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._inputs(
                root / "inputs", world_kwargs={"residue_index": 0}
            )
            self._install_explicit_mask_review(inputs, "world")
            with self.assertRaisesRegex(
                builder.NpcBundleBuildError, "must be supplied together"
            ):
                builder.build_bundle(
                    self._options(root, inputs, world_mask_authoring_ledger=None)
                )

            mask_path = inputs["world_explicit_mask"]
            mask = np.asarray(
                Image.open(mask_path).convert("L"), dtype=np.uint8
            ).copy()
            self.assertEqual(int(mask[0, 0]), 255)
            mask[0, 0] = 0
            Image.fromarray(mask, mode="L").save(
                mask_path, format="PNG", optimize=False
            )
            self._refresh_explicit_mask_binding(inputs, "world")
            with self.assertRaisesRegex(
                builder.NpcBundleBuildError,
                "omits 1 automatic border-connected background pixels",
            ):
                builder.build_bundle(self._options(root, inputs))

    def test_explicit_mask_must_be_native_binary_grayscale_png(self) -> None:
        for case in ("rgba", "nonbinary"):
            with self.subTest(case=case), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                inputs = self._inputs(
                    root / "inputs", world_kwargs={"residue_index": 0}
                )
                self._install_explicit_mask_review(inputs, "world")
                mask_path = inputs["world_explicit_mask"]
                mask = Image.open(mask_path).convert("L")
                if case == "rgba":
                    mask.convert("RGBA").save(
                        mask_path, format="PNG", optimize=False
                    )
                    expected = "8-bit grayscale binary-mask PNG"
                else:
                    mask.putpixel((0, 0), 128)
                    mask.save(mask_path, format="PNG", optimize=False)
                    expected = "only binary values 0 and 255"
                self._refresh_explicit_mask_binding(inputs, "world")
                with self.assertRaisesRegex(builder.NpcBundleBuildError, expected):
                    builder.build_bundle(self._options(root, inputs))

    def test_float_alpha_unpremultiply_preserves_constant_red_edges(self) -> None:
        image = Image.new("RGBA", (32, 28), (0, 0, 0, 0))
        ImageDraw.Draw(image).rectangle((7, 5, 25, 23), fill=(255, 0, 0, 173))
        expected_alpha = np.asarray(
            image.getchannel("A").resize((71, 63), Image.Resampling.BILINEAR),
            dtype=np.uint8,
        )
        actual = np.asarray(builder.resize_rgba_premultiplied(image, (71, 63)), dtype=np.uint8)
        self.assertTrue(np.array_equal(actual[:, :, 3], expected_alpha))
        visible = actual[:, :, 3] > 0
        self.assertTrue(np.all(actual[visible, 0] == 255))
        self.assertTrue(np.all(actual[visible, 1:3] == 0))
        self.assertEqual(int(np.count_nonzero(actual[~visible, :3])), 0)

    def test_soft_matte_despill_matches_frozen_helper_alpha_cutoff(self) -> None:
        source_rgb = np.array(
            [[[220, 40, 210], [220, 40, 210], [220, 40, 210]]],
            dtype=np.int16,
        )
        proposed = np.array(
            [[[220, 40, 210, 251], [220, 40, 210, 252], [220, 40, 210, 254]]],
            dtype=np.uint8,
        )
        alpha = np.array([[251, 252, 254]], dtype=np.uint8)
        builder._despill_soft_matte_pixels(
            proposed, source_rgb, alpha, np.ones((1, 3), dtype=np.bool_)
        )
        self.assertEqual(proposed[0, 0].tolist(), [39, 40, 39, 251])
        self.assertEqual(proposed[0, 1].tolist(), [220, 40, 210, 252])
        self.assertEqual(proposed[0, 2].tolist(), [220, 40, 210, 254])

    def test_vectorized_global_matte_proposal_matches_portable_reference_golden(self) -> None:
        fixture = json.loads(REFERENCE_CHROMA_FIXTURE.read_text(encoding="utf-8"))
        self.assertEqual(
            fixture["referenceScriptSha256"], builder.SOFT_MATTE_REFERENCE_SHA256
        )
        rgba = np.asarray(fixture["inputRgba"], dtype=np.uint8)
        golden = np.asarray(fixture["goldenRgba"], dtype=np.uint8)
        self.assertEqual(builder.sha256_bytes(rgba.tobytes()), fixture["inputRgbaByteSha256"])
        self.assertEqual(builder.sha256_bytes(golden.tobytes()), fixture["goldenRgbaByteSha256"])
        key = tuple(fixture["parameters"]["keyRgb"])
        border = np.tile(np.array(key, dtype=np.int16), (16, 1))
        proposal, _fringe, _metadata = builder._bounded_soft_matte(
            rgba, border, np.zeros(rgba.shape[:2], dtype=np.bool_)
        )
        self.assertTrue(np.array_equal(proposal, golden))

    @unittest.skipUnless(
        REFERENCE_CHROMA_HELPER.is_file(), "optional live imagegen helper is absent"
    )
    def test_portable_reference_golden_matches_live_helper_when_available(self) -> None:
        fixture = json.loads(REFERENCE_CHROMA_FIXTURE.read_text(encoding="utf-8"))
        self.assertEqual(builder.sha256_file(REFERENCE_CHROMA_HELPER), fixture["referenceScriptSha256"])
        spec = importlib.util.spec_from_file_location(
            "npc_reference_remove_chroma_key", REFERENCE_CHROMA_HELPER
        )
        self.assertIsNotNone(spec)
        self.assertIsNotNone(spec.loader if spec else None)
        module = importlib.util.module_from_spec(spec)
        assert spec is not None and spec.loader is not None
        spec.loader.exec_module(module)
        rgba = np.asarray(fixture["inputRgba"], dtype=np.uint8)
        key = tuple(fixture["parameters"]["keyRgb"])
        reference = Image.fromarray(rgba.copy(), mode="RGBA").copy()
        module._apply_alpha_to_image(
            reference,
            key=key,
            tolerance=12,
            spill_cleanup=True,
            soft_matte=True,
            transparent_threshold=12.0,
            opaque_threshold=220.0,
        )
        self.assertTrue(np.array_equal(np.asarray(reference, dtype=np.uint8), np.asarray(fixture["goldenRgba"], dtype=np.uint8)))

    def test_hash_ledger_matches_every_recorded_non_metadata_output(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._inputs(root / "inputs")
            metadata = builder.build_bundle(self._options(root, inputs))
            for relative, expected in metadata["outputFileSha256"].items():
                self.assertEqual(builder.sha256_file(root / "bundle" / relative), expected, relative)
            self.assertNotIn("pipeline-meta.json", metadata["outputFileSha256"])
            provenance = json.loads(
                (root / "bundle/source/provenance.json").read_text(encoding="utf-8")
            )
            self.assertEqual(len(provenance["frames"]), 12)

    def test_non_divisible_grids_and_scale_gate_are_recorded(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._inputs(
                root / "inputs", world_size=(503, 317), portrait_size=(319, 313)
            )
            metadata = builder.build_bundle(self._options(root, inputs))
            world_grid = metadata["inputs"]["worldSheet"]["grid"]
            portrait_grid = metadata["inputs"]["portraitSheet"]["grid"]
            self.assertEqual(world_grid["boundaries"]["x"], [0, 125, 251, 377, 503])
            self.assertEqual(world_grid["boundaries"]["y"], [0, 158, 317])
            self.assertEqual(portrait_grid["boundaries"]["x"], [0, 159, 319])
            self.assertEqual(portrait_grid["boundaries"]["y"], [0, 156, 313])
            self.assertLessEqual(
                world_grid["maximumVisibleHeightDrift"],
                world_grid["maximumAllowedVisibleHeightDrift"],
            )

    def test_replay_survives_bundle_move_and_deleted_original_inputs(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs_root = root / "original-inputs"
            inputs = self._inputs(
                inputs_root, world_kwargs={"residue_index": 0}
            )
            self._install_explicit_mask_review(inputs, "world")
            first_dir = root / "first"
            first = builder.build_bundle(
                self._options(root, inputs, output_dir=first_dir)
            )
            relocated = root / "relocated" / "bundle"
            relocated.parent.mkdir()
            shutil.move(str(first_dir), str(relocated))
            shutil.rmtree(inputs_root)

            replay = first["replay"]
            replay_output = root / "replayed"
            script = replay["script"].replace("{bundle}", str(relocated))
            arguments = [
                value.replace("{bundle}", str(relocated)).replace(
                    "{output}", str(replay_output)
                )
                for value in replay["arguments"]
            ]
            result = subprocess.run(
                [sys.executable, script, *arguments],
                cwd=relocated,
                check=False,
                capture_output=True,
                text=True,
                env={**dict(os.environ), "PYTHONDONTWRITEBYTECODE": "1"},
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            replayed = json.loads(
                (replay_output / "pipeline-meta.json").read_text(encoding="utf-8")
            )
            self.assertEqual(first["outputFileSha256"], replayed["outputFileSha256"])
            self.assertIn("--world-explicit-mask", first["replay"]["arguments"])
            self.assertIn("--world-mask-authoring-ledger", first["replay"]["arguments"])

    def test_all_inputs_are_frozen_once_before_later_path_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._inputs(root / "inputs")
            frozen_world_bytes = inputs["world"].read_bytes()
            original_prepare = builder._prepare_group
            mutated = False

            def mutating_prepare(*args: object, **kwargs: object):
                nonlocal mutated
                if not mutated:
                    mutated = True
                    changed = Image.open(inputs["world"]).convert("RGBA")
                    changed.putpixel((changed.width // 8, changed.height // 4), (1, 2, 3, 255))
                    changed.save(inputs["world"], format="PNG", optimize=False)
                return original_prepare(*args, **kwargs)

            with mock.patch.object(builder, "_prepare_group", side_effect=mutating_prepare):
                metadata = builder.build_bundle(self._options(root, inputs))
            self.assertNotEqual(inputs["world"].read_bytes(), frozen_world_bytes)
            self.assertEqual(
                (root / "bundle/source/raw/world-sheet.png").read_bytes(), frozen_world_bytes
            )
            self.assertEqual(
                metadata["inputs"]["worldSheet"]["fileSha256"],
                builder.sha256_bytes(frozen_world_bytes),
            )

    def test_existing_output_is_immutable_and_marker_is_preserved(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._inputs(root / "inputs")
            output = root / "bundle"
            output.mkdir()
            marker = output / "keep.txt"
            marker.write_text("keep\n", encoding="utf-8")
            with self.assertRaisesRegex(builder.NpcBundleBuildError, "immutable"):
                builder.build_bundle(self._options(root, inputs))
            self.assertEqual(marker.read_text(encoding="utf-8"), "keep\n")

    def test_publish_toctou_uses_atomic_no_replace_and_preserves_racer(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._inputs(root / "inputs")
            output = root / "bundle"
            original_publish = builder._atomic_publish_new

            def racing_publish(staging: Path, target: Path) -> None:
                target.mkdir()
                (target / "racer.txt").write_text("racer\n", encoding="utf-8")
                original_publish(staging, target)

            with mock.patch.object(builder, "_atomic_publish_new", side_effect=racing_publish):
                with self.assertRaisesRegex(builder.NpcBundleBuildError, "appeared during publication"):
                    builder.build_bundle(self._options(root, inputs))
            self.assertEqual((output / "racer.txt").read_text(encoding="utf-8"), "racer\n")
            self.assertFalse(any(root.glob(".bundle.staging-*")))

    def test_lock_serializes_two_builders_and_only_one_publishes(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._inputs(root / "inputs")
            options = self._options(root, inputs)

            def run() -> object:
                try:
                    return builder.build_bundle(options)
                except builder.NpcBundleBuildError as exc:
                    return exc

            with concurrent.futures.ThreadPoolExecutor(max_workers=2) as executor:
                results = list(executor.map(lambda _: run(), range(2)))
            self.assertEqual(sum(isinstance(value, dict) for value in results), 1)
            failures = [value for value in results if isinstance(value, Exception)]
            self.assertEqual(len(failures), 1)
            self.assertIn("immutable", str(failures[0]))

    def test_ambiguous_enclosed_near_key_candidate_fails_closed(self) -> None:
        self._assert_build_fails(
            "enclosed chroma candidates", world_kwargs={"residue_index": 4}
        )

    def test_subject_edge_and_unsafe_border_fail_closed(self) -> None:
        self._assert_build_fails(
            "subject or residue touches|processed-cell has detached foreground component",
            world_kwargs={"edge_index": 3},
        )
        self._assert_build_fails(
            "safe generated magenta backdrop",
            world_kwargs={"unsafe_border_index": 0},
        )

    def test_portrait_bust_crop_policy_is_narrow_and_dividers_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._inputs(
                root / "inputs",
                portrait_kwargs={"portrait_bust_crop": True},
            )
            metadata = builder.build_bundle(self._options(root, inputs))
            portrait_frames = [
                frame for frame in metadata["frames"] if frame["group"] == "portrait"
            ]
            self.assertEqual(len(portrait_frames), 4)
            for frame in portrait_frames:
                chroma = frame["chroma"]
                self.assertEqual(
                    chroma["edgePolicy"], builder.PORTRAIT_EDGE_POLICY
                )
                self.assertEqual(chroma["requiredSafeEdges"][0], "top")
                self.assertIn("bottom", chroma["allowedSubjectCropEdges"])
                self.assertEqual(
                    chroma["innerCropMinimumYRatio"],
                    builder.PORTRAIT_INNER_CROP_MIN_Y_RATIO,
                )

        self._assert_build_fails(
            "safe generated magenta backdrop|inner sheet seam above the allowed lower crop zone",
            portrait_kwargs={"portrait_dividers": True},
        )

        cell = self._draw_portrait_cell((160, 160), 0, builder.DEFAULT_KEY)
        draw = ImageDraw.Draw(cell)
        draw.rectangle((159, 8, 159, 30), fill=(12, 34, 56, 255))
        with self.assertRaisesRegex(
            builder.NpcBundleBuildError,
            "safe generated magenta backdrop|inner sheet seam above the allowed lower crop zone",
        ):
            builder._classify_chroma(
                cell, builder.chroma_edge_policy("portrait", 0)
            )
        outer = self._draw_portrait_cell((160, 160), 0, builder.DEFAULT_KEY)
        outer.putpixel((0, 140), (12, 34, 56, 255))
        with self.assertRaisesRegex(
            builder.NpcBundleBuildError, "safe generated magenta backdrop"
        ):
            builder._classify_chroma(
                outer, builder.chroma_edge_policy("portrait", 0)
            )

        # Keep the policy contrast on an immutable synthetic fixture.  A left-
        # column portrait may intentionally crop through its bottom and lower
        # inner seam, while the same pixels must fail the world's all-edge-safe
        # policy.  Real production portraits can become four-edge-safe without
        # invalidating this regression contract.
        lower_bust = self._draw_portrait_cell(
            (160, 160), 0, builder.DEFAULT_KEY
        )
        ImageDraw.Draw(lower_bust).rectangle(
            (80, 116, 159, 159), fill=(37, 82, 143, 255)
        )
        portrait_classification = builder._classify_chroma(
            lower_bust, builder.chroma_edge_policy("portrait", 0)
        )
        self.assertEqual(
            portrait_classification.metadata["edgePolicy"],
            builder.PORTRAIT_EDGE_POLICY,
        )
        with self.assertRaisesRegex(
            builder.NpcBundleBuildError, "safe generated magenta backdrop"
        ):
            builder._classify_chroma(lower_bust)

    def test_empty_nonopaque_and_scale_drift_inputs_fail_closed(self) -> None:
        self._assert_build_fails("empty frame", world_kwargs={"empty_index": 2})
        self._assert_build_fails(
            "auto source-mode cannot classify alpha distribution|opaque-chroma source must be fully opaque",
            world_kwargs={"non_opaque": True},
        )
        self._assert_build_fails(
            "visible-height scale drift", world_kwargs={"scale_drift_index": 5}
        )

    def test_exact_and_near_duplicate_or_mirror_risks_fail_closed(self) -> None:
        self._assert_build_fails(
            "exact decoded-RGBA duplicates", world_kwargs={"duplicate_pair": (0, 1)}
        )
        self._assert_build_fails(
            "exact horizontal-mirror equality", world_kwargs={"mirror_pair": (0, 1)}
        )
        self._assert_build_fails(
            "exact vertical-mirror equality",
            world_kwargs={"vertical_mirror_pair": (0, 1)},
        )
        self._assert_build_fails(
            "near-duplicate visual risk", world_kwargs={"near_duplicate_pair": (0, 1)}
        )
        self._assert_build_fails(
            "near horizontal-mirror visual risk",
            world_kwargs={"near_mirror_pair": (0, 1)},
        )
        self._assert_build_fails(
            "near vertical-mirror visual risk",
            world_size=(503, 317),
            world_kwargs={"near_vertical_mirror_pair": (0, 4)},
        )

    def test_portrait_duplicates_and_bad_role_fail_closed(self) -> None:
        self._assert_build_fails(
            "portrait states contain exact decoded-RGBA duplicates",
            portrait_kwargs={"duplicate_pair": (0, 1)},
        )
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._inputs(root / "inputs")
            with self.assertRaisesRegex(builder.NpcBundleBuildError, "role-id"):
                builder.build_bundle(self._options(root, inputs, role_id="../../unstable"))

    def test_generation_ledger_must_bind_sheets_prompts_and_identity(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._inputs(root / "inputs")
            ledger = json.loads(inputs["generation"].read_text(encoding="utf-8"))
            ledger["sources"]["worldSheet"]["identityBoardSha256"] = "0" * 64
            inputs["generation"].write_text(json.dumps(ledger), encoding="utf-8")
            with self.assertRaisesRegex(builder.NpcBundleBuildError, "identityBoardSha256"):
                builder.build_bundle(self._options(root, inputs))
            self.assertFalse((root / "bundle").exists())

    def test_non_8_bit_or_non_rgb_png_is_rejected(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._inputs(root / "inputs")
            sixteen_bit = np.full((32, 32), 32768, dtype=np.uint16)
            Image.fromarray(sixteen_bit).save(inputs["identity"], format="PNG")
            self._refresh_generation_ledger(inputs)
            with self.assertRaisesRegex(builder.NpcBundleBuildError, "8-bit RGB or RGBA"):
                builder.build_bundle(self._options(root, inputs))

    @unittest.skipUnless(CANARY_WORLD.is_file(), "real image_gen NPC canary is absent")
    def test_real_imagegen_canary_uses_measured_non_exact_background_read_only(self) -> None:
        original_hash = builder.sha256_file(CANARY_WORLD)
        snapshot = builder._freeze_file(CANARY_WORLD, "real bank NPC canary")
        sheet = builder._load_png_snapshot(snapshot, require_opaque=True)
        x = builder.grid_boundaries(sheet.width, 4)
        y = builder.grid_boundaries(sheet.height, 2)
        cell = sheet.crop((x[1], y[0], x[2], y[1]))
        classification = builder._classify_chroma(cell)
        metadata = classification.metadata
        samples = [entry["rgb"] for entry in metadata["measuredBackgroundSamples"]]
        self.assertTrue(any(sample != [255, 0, 255] for sample in samples))
        self.assertGreater(metadata["automaticEligiblePixelCount"], 0)
        fringe_count = metadata["classifierAdjacentFringeCandidatePixels"]
        self.assertGreater(fringe_count, 0)
        with self.assertRaisesRegex(
            builder.NpcBundleBuildError,
            f"{fringe_count} adjacent chroma-fringe candidates",
        ):
            builder.border_connected_chroma_to_alpha(cell)
        self.assertEqual(builder.sha256_file(CANARY_WORLD), original_hash)

    @unittest.skipUnless(
        CANARY_WORLD.is_file() and STABLE_CANARY_WORLD.is_file(),
        "real stable/bank NPC canaries are absent",
    )
    def test_real_south_canaries_expose_enclosed_holes_and_fail_without_review_mask(self) -> None:
        for path, expected_count in (
            (STABLE_CANARY_WORLD, 489),
            (CANARY_WORLD, 25),
        ):
            with self.subTest(path=path.name):
                original_hash = builder.sha256_file(path)
                snapshot = builder._freeze_file(path, "real NPC south canary")
                sheet = builder._load_png_snapshot(snapshot, require_opaque=True)
                x = builder.grid_boundaries(sheet.width, 4)
                y = builder.grid_boundaries(sheet.height, 2)
                cell = sheet.crop((x[0], y[0], x[1], y[1]))
                classification = builder._classify_chroma(cell)
                self.assertEqual(
                    classification.metadata["classifierEnclosedCandidatePixels"],
                    expected_count,
                )
                with self.assertRaisesRegex(
                    builder.NpcBundleBuildError,
                    f"found {expected_count} enclosed chroma candidates",
                ):
                    builder.border_connected_chroma_to_alpha(cell)
                self.assertEqual(builder.sha256_file(path), original_hash)

    @unittest.skipUnless(
        STABLE_CANARY_WORLD.is_file() and CANARY_WORLD.is_file(),
        "real stable/bank NPC residual canaries are absent",
    )
    def test_real_stable_and_bank_sources_expose_residual_key_color_read_only(self) -> None:
        for label, path in (
            ("stable", STABLE_CANARY_WORLD),
            ("bank", CANARY_WORLD),
        ):
            with self.subTest(role=label):
                original_hash = builder.sha256_file(path)
                sheet = builder._load_png_snapshot(
                    builder._freeze_file(path, f"real {label} residual canary"),
                    require_opaque=True,
                )
                x = builder.grid_boundaries(sheet.width, 4)
                y = builder.grid_boundaries(sheet.height, 2)
                residual_pixels = 0
                residual_components = 0
                for index in range(8):
                    row, col = divmod(index, 4)
                    classification = builder._classify_chroma(
                        sheet.crop((x[col], y[row], x[col + 1], y[row + 1])),
                        builder.chroma_edge_policy("world", col),
                    )
                    residual_pixels += int(
                        classification.metadata[
                            "classifierResidualKeyColorCandidatePixels"
                        ]
                    )
                    residual_components += len(
                        classification.residual_key_components
                    )
                self.assertGreater(residual_pixels, 0)
                self.assertGreater(residual_components, 0)
                with self.assertRaisesRegex(
                    builder.NpcBundleBuildError,
                    "residual key-color candidates",
                ):
                    builder._prepare_group(
                        sheet,
                        "world",
                        2,
                        4,
                        builder.DEFAULT_DIRECTIONS,
                        4,
                        4,
                        None,
                        builder.SOURCE_MODE_OPAQUE_CHROMA,
                    )
                self.assertEqual(builder.sha256_file(path), original_hash)

    @unittest.skipUnless(
        all(
            all(raw_path.is_file() for raw_path, _sha in data["raw"].values())
            for data in REAL_RESIDUAL_CANARY.values()
        ),
        "tracked stable/bank raw residual canaries are absent",
    )
    def test_frozen_real_residual_canary_keeps_authored_false_positive_read_only(self) -> None:
        """Build retain/repair pairs from raw; S/D/G is diagnostic, not a delete mask."""

        self.assertEqual(
            sum(
                len(canary["repair"][group])
                for canary in REAL_RESIDUAL_CANARY.values()
                for group in ("world", "portrait")
            ),
            13,
        )
        self.assertEqual(
            sum(
                len(canary["retain"][group])
                for canary in REAL_RESIDUAL_CANARY.values()
                for group in ("world", "portrait")
            ),
            1,
        )

        for appearance_id, canary in REAL_RESIDUAL_CANARY.items():
            with self.subTest(appearance_id=appearance_id):
                retained_by_group: dict[
                    str, dict[str, builder.RenderedFrame]
                ] = {}
                repaired_by_group: dict[
                    str, dict[str, builder.RenderedFrame]
                ] = {}
                classification_by_slot: dict[
                    tuple[str, str], builder.ChromaClassification
                ] = {}
                for group in ("world", "portrait"):
                    raw_path, expected_sha = canary["raw"][group]
                    self.assertEqual(builder.sha256_file(raw_path), expected_sha)
                    repair_contract = canary["repair"][group]
                    retain_contract = canary["retain"][group]
                    repair_hashes = set(repair_contract)
                    retained, retained_entries = (
                        self._render_real_group_with_residual_repairs_read_only(
                            raw_path,
                            group,
                            set(),
                        )
                    )
                    repaired, repaired_entries = (
                        self._render_real_group_with_residual_repairs_read_only(
                            raw_path,
                            group,
                            repair_hashes,
                        )
                    )
                    retained_by_group[group] = retained
                    repaired_by_group[group] = repaired
                    self.assertEqual(
                        {
                            str(entry["componentPixelSha256"])
                            for entry in retained_entries
                        },
                        {
                            str(entry["componentPixelSha256"])
                            for entry in repaired_entries
                        },
                    )
                    self.assertTrue(
                        all(
                            entry["decision"]
                            == builder.RESIDUAL_KEY_RETAIN_DECISION
                            for entry in retained_entries
                        )
                    )
                    actual_repair_hashes = {
                        str(entry["componentPixelSha256"])
                        for entry in repaired_entries
                        if entry["decision"]
                        == builder.RESIDUAL_KEY_REPAIR_DECISION
                    }
                    self.assertEqual(actual_repair_hashes, repair_hashes)
                    for entry in repaired_entries:
                        expected_decision = (
                            builder.RESIDUAL_KEY_REPAIR_DECISION
                            if entry["componentPixelSha256"] in repair_hashes
                            else builder.RESIDUAL_KEY_RETAIN_DECISION
                        )
                        self.assertEqual(entry["decision"], expected_decision)

                    sheet = builder._load_png_snapshot(
                        builder._freeze_file(raw_path, f"{appearance_id} {group}"),
                        require_opaque=True,
                    )
                    rows, cols, slots = (
                        (2, 4, builder.DEFAULT_DIRECTIONS)
                        if group == "world"
                        else (2, 2, builder.DEFAULT_PORTRAIT_SLOTS)
                    )
                    x = builder.grid_boundaries(sheet.width, cols)
                    y = builder.grid_boundaries(sheet.height, rows)
                    for index, slot in enumerate(slots):
                        row, col = divmod(index, cols)
                        classification = builder._classify_chroma(
                            sheet.crop(
                                (x[col], y[row], x[col + 1], y[row + 1])
                            ),
                            builder.chroma_edge_policy(group, col),
                        )
                        classification_by_slot[(group, slot)] = classification
                    for component_hash, expected in {
                        **repair_contract,
                        **retain_contract,
                    }.items():
                        expected_slot, expected_bbox, expected_count = expected
                        classification = classification_by_slot[
                            (group, expected_slot)
                        ]
                        component = next(
                            candidate
                            for candidate in classification.residual_key_components
                            if builder.component_pixel_hash(candidate)
                            == component_hash
                        )
                        self.assertEqual(
                            list(builder._component_bbox(component)),
                            list(expected_bbox),
                        )
                        self.assertEqual(
                            int(np.count_nonzero(component)), expected_count
                        )

                old_totals = [0, 0]
                repaired_totals = [0, 0]
                repaired_expanded_by_slot: dict[
                    tuple[str, str], np.ndarray
                ] = {}
                for group, slots in (
                    ("world", builder.DEFAULT_DIRECTIONS),
                    ("portrait", builder.DEFAULT_PORTRAIT_SLOTS),
                ):
                    for slot in slots:
                        retained_strong, retained_expanded = (
                            self._runtime_residual_scan_masks(
                                retained_by_group[group][slot].runtime
                            )
                        )
                        new_strong, new_expanded = self._runtime_residual_scan_masks(
                            repaired_by_group[group][slot].runtime
                        )
                        old_totals[0] += int(np.count_nonzero(retained_strong))
                        old_totals[1] += int(np.count_nonzero(retained_expanded))
                        repaired_totals[0] += int(np.count_nonzero(new_strong))
                        repaired_totals[1] += int(np.count_nonzero(new_expanded))
                        repaired_expanded_by_slot[(group, slot)] = new_expanded
                self.assertEqual(tuple(old_totals), canary["before"])
                self.assertEqual(tuple(repaired_totals), canary["after"])

                # The stable smile retains one 2px authored hair-shadow
                # component.  Bilinear resampling makes that exact retained
                # source component appear as four diagnostic G pixels.  Bind
                # every one of them back to the reviewed component instead of
                # weakening the mask or pretending the scan is a delete rule.
                retained_runtime_slots = {
                    (group, expected[0])
                    for group in ("world", "portrait")
                    for expected in canary["retain"][group].values()
                }
                affected_runtime_slots = {
                    key
                    for key, expanded in repaired_expanded_by_slot.items()
                    if np.any(expanded)
                }
                self.assertEqual(affected_runtime_slots, retained_runtime_slots)
                for group, slot in retained_runtime_slots:
                    frame = repaired_by_group[group][slot]
                    metadata = frame.metadata
                    paste_x, paste_y = metadata["runtimePastePosition"]
                    crop_width, crop_height = metadata["paddedCropSize"]
                    resized_width, resized_height = metadata["resizedCropSize"]
                    crop_x, crop_y = metadata["paddedCropBbox"][:2]
                    retained_components = [
                        component
                        for component_hash, expected in canary["retain"][group].items()
                        if expected[0] == slot
                        for component in classification_by_slot[
                            (group, slot)
                        ].residual_key_components
                        if builder.component_pixel_hash(component) == component_hash
                    ]
                    self.assertGreater(len(retained_components), 0)
                    retained_points = np.concatenate(
                        [np.argwhere(component) for component in retained_components]
                    )
                    for runtime_y, runtime_x in np.argwhere(
                        repaired_expanded_by_slot[(group, slot)]
                    ):
                        source_x = (
                            (runtime_x - paste_x + 0.5)
                            * crop_width
                            / resized_width
                            - 0.5
                            + crop_x
                        )
                        source_y = (
                            (runtime_y - paste_y + 0.5)
                            * crop_height
                            / resized_height
                            - 0.5
                            + crop_y
                        )
                        self.assertTrue(
                            np.any(
                                (np.abs(retained_points[:, 1] - source_x) <= 1.0)
                                & (np.abs(retained_points[:, 0] - source_y) <= 1.0)
                            )
                        )

                for (
                    group,
                    slot,
                    runtime_point,
                    raw_cell_coordinate,
                    component_hash,
                ) in canary["points"]:
                    self._assert_runtime_point_backprojects_to_residual(
                        retained_by_group[group][slot].metadata,
                        classification_by_slot[(group, slot)],
                        runtime_point,
                        raw_cell_coordinate,
                        component_hash,
                    )

    @unittest.skipUnless(
        STABLE_CANARY_PORTRAITS.is_file() and BANK_CANARY_PORTRAITS.is_file(),
        "real stable/bank NPC portrait canaries are absent",
    )
    def test_real_portrait_bust_crops_use_only_narrow_safe_edge_policy(self) -> None:
        for path in (STABLE_CANARY_PORTRAITS, BANK_CANARY_PORTRAITS):
            with self.subTest(path=path.name):
                original_hash = builder.sha256_file(path)
                snapshot = builder._freeze_file(path, "real NPC portrait canary")
                sheet = builder._load_png_snapshot(snapshot, require_opaque=True)
                x = builder.grid_boundaries(sheet.width, 2)
                y = builder.grid_boundaries(sheet.height, 2)
                for index, slot in enumerate(builder.DEFAULT_PORTRAIT_SLOTS):
                    row, col = divmod(index, 2)
                    classification = builder._classify_chroma(
                        sheet.crop((x[col], y[row], x[col + 1], y[row + 1])),
                        builder.chroma_edge_policy("portrait", col),
                    )
                    self.assertEqual(
                        classification.metadata["edgePolicy"],
                        builder.PORTRAIT_EDGE_POLICY,
                        slot,
                    )
                self.assertEqual(builder.sha256_file(path), original_hash)

    @unittest.skipUnless(
        all(path.is_file() for _label, path, _group, _sha in REAL_ROLE_REGRESSION_GROUPS),
        "one or more real NPC role regression sources are absent",
    )
    def test_real_role_sources_pass_full_reviewed_prepare_read_only(self) -> None:
        for label, path, group, expected_sha in REAL_ROLE_REGRESSION_GROUPS:
            with self.subTest(role=label):
                self.assertEqual(builder.sha256_file(path), expected_sha)
                frames, grid, components = self._prepare_real_group_read_only(
                    path, group
                )
                self.assertEqual(
                    len(frames), 8 if group == "world" else 4
                )
                self.assertTrue(grid["explicitMaskReview"])
                self.assertGreater(len(components), 0)
                for frame in frames:
                    raw = np.asarray(frame.raw_cell.convert("RGBA"), dtype=np.uint8)
                    processed = np.asarray(
                        frame.processed_cell.convert("RGBA"), dtype=np.uint8
                    )
                    changed = np.asarray(
                        frame.changed_pixel_mask, dtype=np.uint8
                    ) == 255
                    self.assertTrue(
                        np.array_equal(changed, np.any(raw != processed, axis=2)),
                        f"{label}/{frame.slot}",
                    )

    @unittest.skipUnless(
        MANOR_CANARY_PORTRAITS.is_file(),
        "real manor NPC portrait divider canary is absent",
    )
    def test_real_white_portrait_divider_is_rejected_read_only(self) -> None:
        path = MANOR_CANARY_PORTRAITS
        original_hash = builder.sha256_file(path)
        snapshot = builder._freeze_file(path, "real manor portrait divider canary")
        sheet = builder._load_png_snapshot(snapshot, require_opaque=True)
        x = builder.grid_boundaries(sheet.width, 2)
        y = builder.grid_boundaries(sheet.height, 2)
        with self.assertRaisesRegex(
            builder.NpcBundleBuildError,
            "safe generated magenta backdrop|inner sheet seam above the allowed lower crop zone",
        ):
            builder._classify_chroma(
                sheet.crop((x[0], y[0], x[1], y[1])),
                builder.chroma_edge_policy("portrait", 0),
            )
        self.assertEqual(builder.sha256_file(path), original_hash)

    def test_read_only_auditor_accepts_builder_output_and_detects_mask_escape(self) -> None:
        auditor = (
            REPO_ROOT
            / ".agents/skills/design-beastbound-npcs/scripts/audit_npc_bundle.py"
        )
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._inputs(
                root / "inputs", world_kwargs={"residue_index": 0}
            )
            self._install_explicit_mask_review(inputs, "world")
            portraits = Image.open(inputs["portraits"]).convert("RGBA")
            # Exercise auditor replay in both bottom-row portrait cells with
            # exact v3.1 residual decisions.  These are reviewed authored-color
            # pixels, so neither belongs in the explicit repair mask.
            portraits.putpixel((80, 240), (180, 5, 159, 255))
            portraits.putpixel((240, 240), (180, 5, 159, 255))
            portraits.save(inputs["portraits"], format="PNG", optimize=False)
            self._refresh_generation_ledger(inputs)
            portrait_components = self._install_explicit_mask_review(
                inputs,
                "portrait",
            )
            bottom_row_residuals = [
                entry
                for entry in portrait_components
                if entry["slot"] in ("smile", "concerned")
                and entry["componentType"]
                == builder.RESIDUAL_KEY_COMPONENT_TYPE
                and entry["decision"] == builder.RESIDUAL_KEY_RETAIN_DECISION
            ]
            self.assertEqual(
                {entry["slot"] for entry in bottom_row_residuals},
                {"smile", "concerned"},
            )
            output = root / "bundle"
            builder.build_bundle(self._options(root, inputs))
            provenance = json.loads(
                (output / "source/provenance.json").read_text(encoding="utf-8")
            )
            for slot in ("smile", "concerned"):
                frame = next(
                    item
                    for item in provenance["frames"]
                    if item["group"] == "portrait" and item["slot"] == slot
                )
                self.assertGreater(
                    frame["classifierResidualKeyColorCandidatePixels"],
                    0,
                )
                self.assertEqual(
                    frame["maskReview"]["reviewOperation"],
                    builder.MASK_REVIEW_OPERATION,
                )
                self.assertGreater(
                    frame["maskReview"][
                        "reviewedRetainedAuthoredColorPixelCount"
                    ],
                    0,
                )
                self.assertEqual(
                    frame["processedDetachedForegroundGate"][
                        "blockingComponents"
                    ],
                    [],
                )
                self.assertEqual(
                    frame["runtimeDetachedForegroundGate"][
                        "blockingComponents"
                    ],
                    [],
                )
            valid = subprocess.run(
                [sys.executable, str(auditor), str(output)],
                cwd=REPO_ROOT,
                check=False,
                capture_output=True,
                text=True,
                env={**dict(os.environ), "PYTHONDONTWRITEBYTECODE": "1"},
            )
            self.assertEqual(valid.returncode, 0, valid.stderr)
            ledger_tamper = root / "ledger-tamper"
            shutil.copytree(output, ledger_tamper)

            processed_path = output / "source/processed/world/south/idle-1.png"
            mask = np.asarray(
                Image.open(output / "source/masks/world/south/idle-1.png").convert("L"),
                dtype=np.uint8,
            )
            processed = np.asarray(Image.open(processed_path).convert("RGBA"), dtype=np.uint8).copy()
            y, x = np.argwhere(mask == 0)[0]
            processed[y, x, 0] = (int(processed[y, x, 0]) + 1) % 256
            Image.fromarray(processed, mode="RGBA").save(processed_path, format="PNG")
            invalid = subprocess.run(
                [sys.executable, str(auditor), str(output)],
                cwd=REPO_ROOT,
                check=False,
                capture_output=True,
                text=True,
                env={**dict(os.environ), "PYTHONDONTWRITEBYTECODE": "1"},
            )
            self.assertNotEqual(invalid.returncode, 0)
            self.assertIn("outside its eligibility mask", invalid.stderr)

            ledger_path = (
                ledger_tamper
                / "source/reviewed-masks/world-mask-authoring-ledger.json"
            )
            ledger = json.loads(ledger_path.read_text(encoding="utf-8"))
            ledger["components"][0]["reviewer"] = "Tampered Reviewer"
            ledger_path.write_text(
                json.dumps(ledger, ensure_ascii=False, indent=2) + "\n",
                encoding="utf-8",
            )
            tampered = subprocess.run(
                [sys.executable, str(auditor), str(ledger_tamper)],
                cwd=REPO_ROOT,
                check=False,
                capture_output=True,
                text=True,
                env={**dict(os.environ), "PYTHONDONTWRITEBYTECODE": "1"},
            )
            self.assertNotEqual(tampered.returncode, 0)
            self.assertIn("mask authoring ledger", tampered.stderr)

    def test_cli_requires_provenance_inputs_and_has_no_force_or_slot_aliases(self) -> None:
        help_result = subprocess.run(
            [sys.executable, str(TOOLS_DIR / "build_npc_art_bundle.py"), "--help"],
            cwd=REPO_ROOT,
            check=False,
            capture_output=True,
            text=True,
            env={**dict(os.environ), "PYTHONDONTWRITEBYTECODE": "1"},
        )
        self.assertEqual(help_result.returncode, 0, help_result.stderr)
        for option in (
            "--identity-board",
            "--generation-ledger",
            "--ownership-ledger",
            "--world-explicit-mask",
            "--world-mask-authoring-ledger",
            "--portrait-explicit-mask",
            "--portrait-mask-authoring-ledger",
        ):
            self.assertIn(option, help_result.stdout)
        self.assertNotIn("--force", help_result.stdout)
        self.assertNotIn("--portrait-slots", help_result.stdout)

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            inputs = self._inputs(root / "inputs")
            output = root / "cli-bundle"
            result = subprocess.run(
                [
                    sys.executable,
                    str(TOOLS_DIR / "build_npc_art_bundle.py"),
                    "--role-id",
                    "bank_keeper_f_v1",
                    "--world-sheet",
                    str(inputs["world"]),
                    "--portrait-sheet",
                    str(inputs["portraits"]),
                    "--identity-board",
                    str(inputs["identity"]),
                    "--world-prompt",
                    str(inputs["world_prompt"]),
                    "--portrait-prompt",
                    str(inputs["portrait_prompt"]),
                    "--generation-ledger",
                    str(inputs["generation"]),
                    "--ownership-ledger",
                    str(inputs["ownership"]),
                    "--output-dir",
                    str(output),
                ],
                cwd=REPO_ROOT,
                check=False,
                capture_output=True,
                text=True,
                env={**dict(os.environ), "PYTHONDONTWRITEBYTECODE": "1"},
            )
            self.assertEqual(result.returncode, 0, result.stderr)
            self.assertIn("world=8 portraits=4 direction_review=required", result.stdout)
            self.assertTrue((output / "npc-bundle.json").is_file())


if __name__ == "__main__":
    unittest.main()
