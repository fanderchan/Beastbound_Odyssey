#!/usr/bin/env python3
"""Build the frozen Earth Vein Cave Computer Use evidence matrix.

The raw before/after JPEGs must already come from real ``@oai/sky`` Computer
Use actions.  The distinct 1280x720 PNG/report pairs must already come from the
closed real-Main action-capture recorder.  This tool validates both sets,
writes one immutable JSONL receipt per observed action, writes the aggregate
Computer Use report, and wires only the manifest evidence fields.  It never
changes release lifecycle or owner-acceptance state.
"""

from __future__ import annotations

import argparse
import hashlib
import json
import re
import struct
import sys
from pathlib import Path
from typing import Any


BUNDLE_ROOT = Path(__file__).resolve().parents[2]
MANIFEST_PATH = BUNDLE_ROOT / "map-visual-bundle.json"
EVIDENCE_ROOT = BUNDLE_ROOT / "evidence"
RAW_ROOT = EVIDENCE_ROOT / "computer-use-actions" / "raw"
RECEIPT_ROOT = EVIDENCE_ROOT / "computer-use-actions"
RUNTIME_ROOT = EVIDENCE_ROOT / "runtime-actions"
REPORT_PATH = EVIDENCE_ROOT / "computer-use-review.json"

BUNDLE_ID = "earth_vein_cave_visual_v1"
APP_BUNDLE_ID = "com.beastbound.review.firebud"
WINDOW_TITLE = "Beastbound Odyssey / 万兽纪元 (DEBUG)"
SCENE = "res://scenes/Main.tscn"
MAP_IDS = (
    "earth_vein_cave",
    "earth_vein_cave_f2",
    "earth_vein_cave_f3",
    "earth_vein_cave_f4",
)
ACTION_KINDS = (
    "pointer",
    "movement_path",
    "warp",
    "collision",
    "occlusion",
)
ACTION_MODES = {
    "pointer": "idle",
    "movement_path": "moving",
    "warp": "moving",
    "collision": "moving",
    "occlusion": "moving",
}
ISO_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")

MAP_LABELS = {
    "earth_vein_cave": "岩脉洞穴一层",
    "earth_vein_cave_f2": "岩脉洞穴二层",
    "earth_vein_cave_f3": "岩脉洞穴三层",
    "earth_vein_cave_f4": "岩脉洞穴顶层",
}

ACTION_CONFIG: dict[str, dict[str, dict[str, Any]]] = {
    "earth_vein_cave": {
        "pointer": {
            "point": [58, 104],
            "target": "世界地图按钮",
            "description": "打开一层真实地图面板，核对当前楼层、坐标与全部导航目标。",
            "observations": [
                "地图面板显示岩脉洞穴一层与当前坐标 4,20",
                "二层、返回火芽村和洞穴练级区导航目标均可见",
                "点击由正常 Main 窗口消费，没有调试覆盖层",
            ],
        },
        "movement_path": {
            "point": [430, 150],
            "target": "一层右上方可行走石地",
            "description": "点击一层可行走石地，核对跨帧移动、连续路线与终点标记。",
            "observations": [
                "角色离开出生点并跨越多个网格",
                "黄色连续路线和菱形终点标记清晰可读",
                "移动后仍停留在岩脉洞穴一层且没有越出地图边界",
            ],
        },
        "warp": {
            "point": [82, 150],
            "target": "地图面板中的岩脉洞穴二层 / 上层",
            "description": "从一层地图面板选择二层，走到楼梯并核对二层落点。",
            "observations": [
                "导航目标明确标注岩脉洞穴二层 / 上层",
                "角色沿正常路线抵达楼梯并完成地图切换",
                "切换后地图标题为岩脉洞穴二层且落点为 5,20",
            ],
        },
        "collision": {
            "point": [420, 270],
            "target": "一层 9,6 岩石阻挡物基座",
            "description": "点击一层显式阻挡岩石，核对角色停在 footprint 外侧。",
            "observations": [
                "黄色路线终点落在阻挡物位置",
                "角色最终停在相邻可行走格 10,5",
                "角色没有进入或穿过岩石碰撞 footprint",
            ],
        },
        "occlusion": {
            "point": [222, 270],
            "target": "一层下缘前景岩脊后方",
            "description": "让角色走入一层前景岩脊后方，核对岩脊的前景遮挡层。",
            "observations": [
                "动作前角色完整显示在岩脊上方的可行走区域",
                "动作后角色进入岩脊后方并被前景岩脊正确盖住",
                "遮挡改变绘制层级而没有生成额外碰撞或画面破口",
            ],
        },
    },
    "earth_vein_cave_f2": {
        "pointer": {
            "point": [58, 104],
            "target": "世界地图按钮",
            "description": "打开二层真实地图面板，核对楼层标题与上下层导航。",
            "observations": [
                "地图面板明确显示岩脉洞穴二层",
                "一层 / 下层、三层 / 上层与二层练级区均可见",
                "当前位置与地图标记同步，没有错层或错指针",
            ],
        },
        "movement_path": {
            "point": [264, 187],
            "target": "二层出生口北侧可行走石地",
            "description": "在二层点击近场石地，核对真实跨帧短路径移动。",
            "observations": [
                "角色从 5,20 移动到 5,18",
                "路线没有被 HUD 或楼梯交互误消费",
                "移动期间保持二层候选美术与正常玩家 HUD",
            ],
        },
        "warp": {
            "point": [82, 178],
            "target": "地图面板中的岩脉洞穴三层 / 上层",
            "description": "从二层选择三层并核对三层出生点。",
            "observations": [
                "选择的是三层 / 上层而不是返回一层",
                "角色走完整条楼层路线并触发正常楼梯传送",
                "切换后地图面板确认岩脉洞穴三层与落点 5,20",
            ],
        },
        "collision": {
            "point": [365, 207],
            "target": "二层 8,16 岩石阻挡物基座",
            "description": "点击二层近场阻挡岩石，核对路线止于显式 footprint 外。",
            "observations": [
                "角色向岩石移动后停在相邻可行走格",
                "终点菱形与视觉基座位置一致",
                "角色没有穿入岩石或与贴图底座重叠",
            ],
        },
        "occlusion": {
            "point": [155, 281],
            "target": "二层下缘前景岩脊后方",
            "description": "让角色穿到二层前景岩脊后，核对大岩脊遮挡。",
            "observations": [
                "动作前角色在岩石阻挡物旁完整可见",
                "动作后角色进入下缘岩脊后方并被正确遮挡",
                "大岩脊覆盖角色而没有覆盖 HUD 或产生空白边缘",
            ],
        },
    },
    "earth_vein_cave_f3": {
        "pointer": {
            "point": [58, 104],
            "target": "世界地图按钮",
            "description": "打开三层地图面板，核对三层标题、上下层出口和练级区。",
            "observations": [
                "地图面板标题为岩脉洞穴三层",
                "二层 / 下层、顶层 / 上层和三层练级区均可见",
                "当前指针与 5,20 出生点一致",
            ],
        },
        "movement_path": {
            "point": [264, 187],
            "target": "三层出生口北侧可行走石地",
            "description": "点击三层近场石地，核对真实路径与稳定镜头。",
            "observations": [
                "角色从 5,20 移动到 5,18",
                "镜头跟随平稳且石地纹理没有网格闪烁",
                "动作没有触发菜单、对话或楼层切换",
            ],
        },
        "warp": {
            "point": [82, 178],
            "target": "地图面板中的岩脉洞穴顶层 / 上层",
            "description": "从三层选择顶层并核对顶层出生点。",
            "observations": [
                "选择的是顶层 / 上层导航目标",
                "角色经正常路径抵达楼梯并完成切层",
                "切换后地图面板确认岩脉洞穴顶层与落点 5,22",
            ],
        },
        "collision": {
            "point": [346, 226],
            "target": "三层 8,17 岩石阻挡物基座",
            "description": "点击三层显式阻挡岩石，核对人物止步与 footprint。",
            "observations": [
                "路线菱形落在岩石阻挡位置",
                "角色停在 9,16 的相邻可行走格",
                "人物轮廓与岩石底座没有视觉穿插",
            ],
        },
        "occlusion": {
            "point": [150, 185],
            "target": "三层左下前景岩脊后方",
            "description": "从岩脊侧面走入其后方，核对三层前后层级切换。",
            "observations": [
                "动作前角色位于岩脊右侧并完整显示",
                "动作后角色位于 4,23 并被整段前景岩脊遮住",
                "遮挡边缘连续，没有角色残片或错误穿帮",
            ],
        },
    },
    "earth_vein_cave_f4": {
        "pointer": {
            "point": [58, 104],
            "target": "世界地图按钮",
            "description": "打开顶层地图面板，核对两座守护台与返回三层导航。",
            "observations": [
                "地图面板标题为岩脉洞穴顶层",
                "岩脉守护兽、岩脉共鸣守卫和三层 / 下层目标同时可见",
                "两个守护台标记与地图布局位置一致",
            ],
        },
        "movement_path": {
            "point": [264, 187],
            "target": "顶层出生口北侧可行走石地",
            "description": "在顶层点击近场石地，核对真实移动与顶层镜头边界。",
            "observations": [
                "角色从 5,22 移动到 5,20",
                "镜头没有暴露地图边缘或越过石地裙边",
                "正常玩家 HUD 与顶层候选美术保持稳定",
            ],
        },
        "warp": {
            "point": [82, 205],
            "target": "地图面板中的岩脉洞穴三层 / 下层",
            "description": "从顶层选择三层 / 下层并核对返回落点。",
            "observations": [
                "点击的是第三个三层 / 下层目标，没有误触两座守护台",
                "角色走到返回楼梯并正常完成切层",
                "切换后到达岩脉洞穴三层的 21,7 返回落点",
            ],
        },
        "collision": {
            "point": [400, 165],
            "target": "顶层 16,12 岩柱阻挡物基座",
            "description": "点击顶层高岩柱基座，核对三格 footprint 与人物止步。",
            "observations": [
                "角色从 16,16 接近岩柱并停在 17,11",
                "路线菱形冻结在高岩柱基座位置",
                "角色没有进入三格阻挡 footprint，视觉基座与碰撞一致",
            ],
        },
        "occlusion": {
            "point": [365, 205],
            "target": "顶层 18,10 晶簇后侧",
            "description": "走到顶层晶簇后侧，核对小型前景物件的局部遮挡。",
            "observations": [
                "动作前角色与晶簇分离且全身可见",
                "动作后角色站到晶簇后方，腿部被晶簇前景正确盖住",
                "上身仍保持清晰，局部遮挡没有变成碰撞或整人消失",
            ],
        },
    },
}


class EvidenceBuildError(RuntimeError):
    """The frozen Computer Use evidence contract failed."""


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--generated-at-utc", required=True)
    parser.add_argument("--replace", action="store_true")
    return parser.parse_args()


def _sha256(path: Path) -> str:
    digest = hashlib.sha256()
    with path.open("rb") as stream:
        for chunk in iter(lambda: stream.read(1024 * 1024), b""):
            digest.update(chunk)
    return digest.hexdigest()


def _relative(path: Path) -> str:
    return path.resolve().relative_to(BUNDLE_ROOT.resolve()).as_posix()


def _file_ref(path: Path) -> dict[str, str]:
    if not path.is_file() or path.stat().st_size <= 0:
        raise EvidenceBuildError(f"证据文件缺失或为空：{path}")
    return {"path": _relative(path), "sha256": _sha256(path)}


def _png_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()[:24]
    if len(data) != 24 or data[:8] != b"\x89PNG\r\n\x1a\n":
        raise EvidenceBuildError(f"不是有效 PNG：{path}")
    return struct.unpack(">II", data[16:24])


def _jpeg_size(path: Path) -> tuple[int, int]:
    data = path.read_bytes()
    if len(data) < 4 or data[:2] != b"\xff\xd8":
        raise EvidenceBuildError(f"不是有效 JPEG：{path}")
    index = 2
    sof_markers = {
        0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7,
        0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF,
    }
    while index + 4 <= len(data):
        if data[index] != 0xFF:
            index += 1
            continue
        marker = data[index + 1]
        index += 2
        if marker in {0xD8, 0xD9}:
            continue
        if index + 2 > len(data):
            break
        length = int.from_bytes(data[index:index + 2], "big")
        if length < 2 or index + length > len(data):
            break
        if marker in sof_markers and length >= 7:
            height = int.from_bytes(data[index + 3:index + 5], "big")
            width = int.from_bytes(data[index + 5:index + 7], "big")
            return width, height
        index += length
    raise EvidenceBuildError(f"JPEG 缺少可识别尺寸：{path}")


def _image_ref(path: Path) -> dict[str, Any]:
    width, height = _png_size(path)
    if (width, height) != (1280, 720):
        raise EvidenceBuildError(f"正式截图不是 1280x720：{path}")
    return {
        **_file_ref(path),
        "dimensions": [width, height],
        "alphaMode": "opaque",
    }


def _capture_pair(map_id: str, action_kind: str) -> tuple[dict[str, Any], dict[str, str]]:
    image_path = RUNTIME_ROOT / map_id / f"{action_kind}.png"
    report_path = RUNTIME_ROOT / map_id / f"{action_kind}-capture.json"
    image_ref = _image_ref(image_path)
    report_ref = _file_ref(report_path)
    try:
        report = json.loads(report_path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise EvidenceBuildError(f"capture report 无法解析：{report_path}") from error
    expected_mode = ACTION_MODES[action_kind]
    required = {
        "result": "PASS",
        "ok": True,
        "bundleId": BUNDLE_ID,
        "mapId": map_id,
        "mode": expected_mode,
        "captureVariant": action_kind,
        "scene": SCENE,
        "viewport": [1280, 720],
        "mapArtStatus": "owner_review_pending",
        "mapArtQaPreview": True,
        "networkRequestAttempted": False,
        "networkRequestsDisconnected": True,
    }
    mismatches = [
        f"{key}={report.get(key)!r}"
        for key, expected in required.items()
        if report.get(key) != expected
    ]
    if report.get("screenshotSha256") != image_ref["sha256"]:
        mismatches.append("screenshotSha256")
    if report.get("errors") != []:
        mismatches.append(f"errors={report.get('errors')!r}")
    if mismatches:
        raise EvidenceBuildError(
            f"capture pair 合同失败 {map_id}/{action_kind}: " + ", ".join(mismatches)
        )
    return image_ref, report_ref


def _raw_pair(map_id: str, action_kind: str) -> tuple[dict[str, str], dict[str, str]]:
    prefix = f"{map_id}_{action_kind}"
    before_path = RAW_ROOT / f"{prefix}-before.jpeg"
    after_path = RAW_ROOT / f"{prefix}-after.jpeg"
    for path in (before_path, after_path):
        if _jpeg_size(path) != (640, 392):
            raise EvidenceBuildError(f"Computer Use 原图不是 640x392：{path}")
    before_ref = _file_ref(before_path)
    after_ref = _file_ref(after_path)
    if before_ref["sha256"] == after_ref["sha256"]:
        raise EvidenceBuildError(f"Computer Use before/after 完全相同：{prefix}")
    return before_ref, after_ref


def _write_json(path: Path, value: Any, *, compact: bool = False) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if compact:
        text = json.dumps(value, ensure_ascii=False, separators=(",", ":")) + "\n"
    else:
        text = json.dumps(value, ensure_ascii=False, indent=2) + "\n"
    path.write_text(text, encoding="utf-8")


def _build(generated_at_utc: str, replace: bool) -> None:
    if ISO_UTC.fullmatch(generated_at_utc) is None:
        raise EvidenceBuildError("--generated-at-utc 必须是 YYYY-MM-DDTHH:MM:SSZ")
    manifest = json.loads(MANIFEST_PATH.read_text(encoding="utf-8"))
    lifecycle = {
        key: manifest.get(key)
        for key in ("status", "ownerReviewStatus", "releaseApproved", "runtimeEnabled")
    }
    expected_lifecycle = {
        "status": "owner_review_pending",
        "ownerReviewStatus": "pending",
        "releaseApproved": False,
        "runtimeEnabled": False,
    }
    if lifecycle != expected_lifecycle:
        raise EvidenceBuildError(f"拒绝改动非 pending lifecycle：{lifecycle}")
    if manifest.get("bundleId") != BUNDLE_ID:
        raise EvidenceBuildError("bundleId 不一致")
    evidence = manifest.get("evidence")
    if not isinstance(evidence, dict):
        raise EvidenceBuildError("manifest.evidence 不是对象")
    if not replace and (
        REPORT_PATH.exists()
        or evidence.get("computerUseReport") is not None
        or evidence.get("runtimeScreenshots") not in ([], None)
    ):
        raise EvidenceBuildError("已有正式 Computer Use 证据；必须显式 --replace")

    receipt_paths = [
        RECEIPT_ROOT / f"{map_id}_{action_kind}.jsonl"
        for map_id in MAP_IDS
        for action_kind in ACTION_KINDS
    ]
    if not replace:
        existing = [str(path) for path in receipt_paths if path.exists()]
        if existing:
            raise EvidenceBuildError("拒绝覆盖已有 action receipt：" + ", ".join(existing))

    actions: list[dict[str, Any]] = []
    runtime_screenshots: list[dict[str, Any]] = []
    screenshot_hashes_by_map: dict[str, set[str]] = {
        map_id: set() for map_id in MAP_IDS
    }
    for map_id in MAP_IDS:
        for action_kind in ACTION_KINDS:
            config = ACTION_CONFIG[map_id][action_kind]
            mode = ACTION_MODES[action_kind]
            image_ref, capture_ref = _capture_pair(map_id, action_kind)
            if image_ref["sha256"] in screenshot_hashes_by_map[map_id]:
                raise EvidenceBuildError(
                    f"同一地图动作复用了截图像素：{map_id}/{action_kind}"
                )
            screenshot_hashes_by_map[map_id].add(image_ref["sha256"])
            before_ref, after_ref = _raw_pair(map_id, action_kind)
            action_id = f"{map_id}_{action_kind}"
            receipt_path = RECEIPT_ROOT / f"{action_id}.jsonl"
            receipt = {
                "schemaVersion": 1,
                "receiptType": "beastbound_computer_use_action_receipt",
                "generatedAtUtc": generated_at_utc,
                "bundleId": BUNDLE_ID,
                "mapId": map_id,
                "actionId": action_id,
                "actionKind": action_kind,
                "method": "computer_use",
                "tool": "@oai/sky",
                "appBundleId": APP_BUNDLE_ID,
                "windowTitle": WINDOW_TITLE,
                "scene": SCENE,
                "viewport": [1280, 720],
                "capturedWindowPoints": [640, 392],
                "displayServer": "macOS Metal",
                "steps": [
                    {
                        "action": "left_click",
                        "windowPoint": config["point"],
                        "target": config["target"],
                    },
                    {"action": "get_app_state", "fresh": True, "afterSettleMs": 1000},
                ],
                "observations": config["observations"],
                "before": before_ref,
                "after": after_ref,
                "result": "PASS",
            }
            _write_json(receipt_path, receipt, compact=True)
            receipt_ref = _file_ref(receipt_path)
            actions.append(
                {
                    "actionId": action_id,
                    "actionKind": action_kind,
                    "mapId": map_id,
                    "description": config["description"],
                    "result": "PASS",
                    "evidence": [
                        {"path": image_ref["path"], "sha256": image_ref["sha256"]},
                        capture_ref,
                        before_ref,
                        after_ref,
                    ],
                    "actionReceipt": receipt_ref,
                }
            )
            runtime_screenshots.append(
                {
                    "mapId": map_id,
                    "mode": mode,
                    "image": image_ref,
                    "captureReport": capture_ref,
                }
            )

    report = {
        "schemaVersion": 1,
        "reportType": "beastbound_map_computer_use_review",
        "generatedAtUtc": generated_at_utc,
        "bundleId": BUNDLE_ID,
        "result": "PASS",
        "testedMapIds": list(MAP_IDS),
        "excludedReleaseGate": None,
        "blockers": [],
        "method": "computer_use",
        "scene": SCENE,
        "viewport": [1280, 720],
        "displayServer": "macOS Metal",
        "actions": actions,
    }
    _write_json(REPORT_PATH, report)

    evidence["dressedReference"] = runtime_screenshots[0]["image"]
    f4_collision = next(
        entry["image"]
        for entry in runtime_screenshots
        if entry["mapId"] == "earth_vein_cave_f4"
        and entry["mode"] == "moving"
        and entry["image"]["path"].endswith("/collision.png")
    )
    evidence["layeredPreview"] = f4_collision
    evidence["runtimeScreenshots"] = runtime_screenshots
    evidence["computerUseReport"] = _file_ref(REPORT_PATH)
    manifest["evidence"] = evidence
    if {
        key: manifest.get(key)
        for key in expected_lifecycle
    } != expected_lifecycle:
        raise EvidenceBuildError("构建过程意外改变 lifecycle")
    _write_json(MANIFEST_PATH, manifest)


def main() -> int:
    args = _parse_args()
    try:
        _build(str(args.generated_at_utc), bool(args.replace))
    except (EvidenceBuildError, OSError, json.JSONDecodeError) as error:
        print(f"earth vein computer use evidence failed: {error}", file=sys.stderr)
        return 1
    print(
        "earth vein computer use evidence: PASS "
        f"maps={len(MAP_IDS)} actions={len(MAP_IDS) * len(ACTION_KINDS)}"
    )
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
