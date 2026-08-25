#!/usr/bin/env python3
"""Install a fresh Firebud v2 Computer Use action matrix transactionally.

The input JPEGs must be the untouched 640x392 screenshots emitted by
``@oai/sky`` for the ten fixed actions.  This installer is intentionally
limited to a repository-local ``.run/evidence`` staging directory and to the
still-pending Firebud v2 bundle.  It rewrites the raw images, action receipts,
aggregate review and manifest as one rollback-capable transaction; it never
changes owner acceptance, release approval or runtime enablement.
"""

from __future__ import annotations

import argparse
import hashlib
import importlib.util
import json
import os
import re
import struct
import sys
from pathlib import Path
from typing import Any


REPO_ROOT = Path(__file__).resolve().parents[1]
REFRESH_PATH = REPO_ROOT / "tools" / "refresh_map_visual_action_evidence.py"
REFRESH_SPEC = importlib.util.spec_from_file_location(
    "_beastbound_map_action_evidence_refresh", REFRESH_PATH
)
if REFRESH_SPEC is None or REFRESH_SPEC.loader is None:
    raise RuntimeError(f"无法加载地图动作证据刷新器：{REFRESH_PATH}")
REFRESH = importlib.util.module_from_spec(REFRESH_SPEC)
REFRESH_SPEC.loader.exec_module(REFRESH)

HUD_GLYPH_PATH = REPO_ROOT / "tools" / "audit_firebud_hud_glyph_stability.py"
HUD_GLYPH_SPEC = importlib.util.spec_from_file_location(
    "_beastbound_firebud_hud_glyph_stability_installer", HUD_GLYPH_PATH
)
if HUD_GLYPH_SPEC is None or HUD_GLYPH_SPEC.loader is None:
    raise RuntimeError(f"无法加载 Firebud HUD 字形门禁：{HUD_GLYPH_PATH}")
HUD_GLYPH = importlib.util.module_from_spec(HUD_GLYPH_SPEC)
HUD_GLYPH_SPEC.loader.exec_module(HUD_GLYPH)

BUNDLE_ID = "firebud_region_visual_v2"
BUNDLE_ROOT = (
    REPO_ROOT / "client" / "godot" / "assets" / "maps" / BUNDLE_ID
)
MANIFEST_PATH = BUNDLE_ROOT / "map-visual-bundle.json"
REPORT_PATH = BUNDLE_ROOT / "evidence" / "computer-use-review.json"
HUD_GLYPH_BOARD_PATH = (
    BUNDLE_ROOT / "evidence" / "computer-use-hud-glyph-board.png"
)
RAW_ROOT = BUNDLE_ROOT / "evidence" / "computer-use-actions" / "raw"
RECEIPT_ROOT = BUNDLE_ROOT / "evidence" / "computer-use-actions"
ALLOWED_STAGE_ROOT = (REPO_ROOT / ".run" / "evidence").resolve()
APP_BUNDLE_ID = "com.beastbound.review.firebud"
WINDOW_TITLE = "Beastbound Odyssey / 万兽纪元 (DEBUG)"
SCENE = "res://scenes/Main.tscn"
MAP_IDS = ("firebud_training_yard", "firebud_village_gate")
ACTION_KINDS = REFRESH.ACTION_KINDS
ISO_UTC = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$")


ACTION_CONFIG: dict[str, dict[str, dict[str, Any]]] = {
    "firebud_training_yard": {
        "pointer": {
            "description": "打开训练场当前地图，核对地图指针、坐标和四个真实导航目标。",
            "steps": [
                {"action": "left_click", "windowPoint": [76, 76], "target": "左上角当前地图徽记"},
                {"action": "get_app_state", "fresh": True, "afterSettleMs": 1000},
            ],
            "observations": [
                "当前地图标题为火芽训练场且坐标为 14,12",
                "训练师阿土、猪门卫、村民阿禾和村口木门四个导航目标可见",
                "地图指针与世界落点一致，界面没有 QA 或调试覆盖层",
            ],
        },
        "movement_path": {
            "description": "点击训练场东北侧草地，核对真实跨帧移动和连续路线。",
            "steps": [
                {"action": "left_click", "windowPoint": [430, 150], "target": "东北侧可行走草地"},
                {"action": "get_app_state", "fresh": True, "afterSettleMs": 1000},
            ],
            "observations": [
                "角色离开 14,12 出生点并跨越多个格子",
                "连续黄色路线与菱形终点标记完整可见",
                "镜头跟随平稳，任务栏和底部 HUD 没有截断路线",
            ],
        },
        "warp": {
            "description": "通过训练场地图面板选择村口木门，核对跨图寻路和火芽村落点。",
            "steps": [
                {"action": "left_click", "windowPoint": [76, 76], "target": "左上角当前地图徽记"},
                {"action": "left_click", "windowPoint": [82, 233], "target": "村口木门 / 进入"},
                {"action": "get_app_state", "fresh": True, "afterTravelMs": 6500},
            ],
            "observations": [
                "角色从训练场沿正常路线抵达村口木门",
                "地图切换到火芽村入口且落点为 3,15",
                "切图后服务 NPC 新布局与记录图腾均正常显示",
            ],
        },
        "collision": {
            "description": "点击低木栅栏左侧邻格，核对角色停在显式阻挡 footprint 外。",
            "steps": [
                {"action": "left_click", "windowPoint": [102, 146], "target": "低木栅栏左侧可行走邻格"},
                {"action": "get_app_state", "fresh": True, "afterSettleMs": 1800},
            ],
            "observations": [
                "角色停在低木栅栏左侧可行走邻格，没有进入栅栏阻挡 footprint",
                "围栏与角色脚点保持明确阻挡边界，没有发生穿透",
                "阻挡物仍按世界层级覆盖路线，HUD 没有消费这次点击",
            ],
        },
        "occlusion": {
            "description": "走到低木栅栏后侧，核对角色前后层级和局部遮挡。",
            "steps": [
                {"action": "left_click", "windowPoint": [133, 130], "target": "低木栅栏后侧可行走格"},
                {"action": "get_app_state", "fresh": True, "afterSettleMs": 2200},
            ],
            "observations": [
                "角色从出生点走到低木栅栏后侧",
                "围栏横杆与立柱正确盖住角色下半身，上半身仍清晰可见",
                "遮挡只改变绘制层级，没有把角色错误裁掉或改成碰撞",
            ],
        },
    },
    "firebud_village_gate": {
        "pointer": {
            "description": "打开火芽村当前地图，核对服务节点、记录点和地图指针。",
            "steps": [
                {"action": "left_click", "windowPoint": [76, 76], "target": "左上角当前地图徽记"},
                {"action": "get_app_state", "fresh": True, "afterSettleMs": 1000},
            ],
            "observations": [
                "当前地图标题为火芽村入口且坐标为 3,15",
                "服务 NPC、记录点与训练目标在地图面板中可达",
                "地图缩略图与当前三个生活化服务簇和中央通行带一致",
            ],
        },
        "movement_path": {
            "description": "点击村口西南侧草地，核对真实跨帧移动与服务区碰撞回避。",
            "steps": [
                {"action": "left_click", "windowPoint": [39, 355], "target": "村口西南侧可行走草地"},
                {"action": "get_app_state", "fresh": True, "afterSettleMs": 1800},
            ],
            "observations": [
                "角色从 3,15 出生区跨越多个格子抵达西南侧草地",
                "路径绕开服务 NPC、记录图腾和下方花箱，没有打开对话或服务面板",
                "镜头跟随稳定，任务 HUD 与底部操作栏保持完整",
            ],
        },
        "warp": {
            "description": "点击主线自动寻路，从火芽村返回训练场，再离开训练师对话恢复正常 HUD。",
            "steps": [
                {"action": "left_click", "windowPoint": [550, 262], "target": "主线任务自动寻路按钮"},
                {"action": "get_app_state", "fresh": True, "afterTravelMs": 5000},
                {"action": "left_click", "windowPoint": [430, 297], "target": "训练师对话离开按钮"},
                {"action": "get_app_state", "fresh": True, "afterSettleMs": 1200},
            ],
            "observations": [
                "自动寻路穿过村口传送点并返回火芽训练场",
                "切图后角色抵达训练师阿土的可交互邻格",
                "训练师对话可正常打开和离开，最终任务正文与自动寻路按钮完整可见",
            ],
        },
        "collision": {
            "description": "点击服务簇西南侧可行走格，核对路线绕开 NPC、图腾和下方花箱。",
            "steps": [
                {"action": "left_click", "windowPoint": [132, 246], "target": "服务簇西南侧可行走格"},
                {"action": "get_app_state", "fresh": True, "afterSettleMs": 2200},
            ],
            "observations": [
                "角色沿中央保留通道抵达服务簇西南侧，没有穿进任何 NPC 轮廓",
                "记录图腾与下方花箱的显式 footprint 保持阻挡，角色停在可行走格",
                "没有打开对话、服务面板或记录界面，任务 HUD 也没有消费点击",
            ],
        },
        "occlusion": {
            "description": "走到记录图腾后侧，核对石柱、标牌与角色的局部遮挡。",
            "steps": [
                {"action": "left_click", "windowPoint": [323, 250], "target": "记录图腾后侧可行走点"},
                {"action": "get_app_state", "fresh": True, "afterSettleMs": 2400},
            ],
            "observations": [
                "角色沿真实路线从图腾西北侧通行到记录图腾后侧",
                "石柱与记录标牌正确盖住靠近侧下半身，头部和肩部仍清晰可辨",
                "遮挡只改变世界层绘制顺序，没有角色残片，也没有侵入任务 HUD",
            ],
        },
    },
}


class FirebudEvidenceInstallError(RuntimeError):
    """The closed Firebud Computer Use installation contract failed."""


def _parse_args() -> argparse.Namespace:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--raw-root", required=True)
    parser.add_argument("--generated-at-utc", required=True)
    parser.add_argument("--replace-pending-evidence", action="store_true")
    return parser.parse_args()


def _sha256_bytes(payload: bytes) -> str:
    return hashlib.sha256(payload).hexdigest()


def _relative(path: Path) -> str:
    return path.resolve().relative_to(BUNDLE_ROOT.resolve()).as_posix()


def _file_ref_from_bytes(path: Path, payload: bytes) -> dict[str, str]:
    return {"path": _relative(path), "sha256": _sha256_bytes(payload)}


def _jpeg_dimensions(payload: bytes) -> tuple[int, int]:
    if len(payload) < 4 or payload[:2] != b"\xff\xd8":
        raise FirebudEvidenceInstallError("Computer Use 原图不是 JPEG")
    index = 2
    sof = {0xC0, 0xC1, 0xC2, 0xC3, 0xC5, 0xC6, 0xC7, 0xC9, 0xCA, 0xCB, 0xCD, 0xCE, 0xCF}
    while index + 4 <= len(payload):
        if payload[index] != 0xFF:
            index += 1
            continue
        marker = payload[index + 1]
        index += 2
        if marker in {0xD8, 0xD9}:
            continue
        if index + 2 > len(payload):
            break
        length = int.from_bytes(payload[index:index + 2], "big")
        if length < 2 or index + length > len(payload):
            break
        if marker in sof and length >= 7:
            height = int.from_bytes(payload[index + 3:index + 5], "big")
            width = int.from_bytes(payload[index + 5:index + 7], "big")
            return width, height
        index += length
    raise FirebudEvidenceInstallError("Computer Use JPEG 缺少可识别尺寸")


def _resolve_raw_root(value: str) -> Path:
    path = (REPO_ROOT / value).resolve() if not Path(value).is_absolute() else Path(value).resolve()
    try:
        path.relative_to(ALLOWED_STAGE_ROOT)
    except ValueError as error:
        raise FirebudEvidenceInstallError(
            "--raw-root 必须位于仓库 .run/evidence 内"
        ) from error
    if not path.is_dir() or path.is_symlink():
        raise FirebudEvidenceInstallError("--raw-root 必须是现有真实目录")
    return path


def _load_json(path: Path, label: str) -> dict[str, Any]:
    try:
        value = json.loads(path.read_text(encoding="utf-8"))
    except (OSError, json.JSONDecodeError) as error:
        raise FirebudEvidenceInstallError(f"{label} 无法解析") from error
    if not isinstance(value, dict):
        raise FirebudEvidenceInstallError(f"{label} 根节点必须是对象")
    return value


def _json_bytes(value: Any, *, compact: bool = False) -> bytes:
    if compact:
        text = json.dumps(value, ensure_ascii=False, separators=(",", ":"))
    else:
        text = json.dumps(value, ensure_ascii=False, indent=2)
    return (text + "\n").encode("utf-8")


def _write_atomic(path: Path, payload: bytes) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    temporary = path.with_name(f".{path.name}.{os.getpid()}.tmp")
    if temporary.exists():
        raise FirebudEvidenceInstallError(f"临时输出已存在：{temporary}")
    temporary.write_bytes(payload)
    temporary.replace(path)


def _restore_snapshot(snapshot: dict[Path, bytes | None]) -> None:
    errors: list[str] = []
    for path, payload in snapshot.items():
        try:
            if payload is None:
                if path.exists():
                    path.unlink()
            else:
                _write_atomic(path, payload)
        except OSError as error:
            errors.append(f"{path}: {error}")
    if errors:
        raise FirebudEvidenceInstallError("证据事务回滚不完整：" + "; ".join(errors))


def install(raw_root: Path, generated_at_utc: str, *, replace: bool) -> dict[str, Any]:
    if not replace:
        raise FirebudEvidenceInstallError("必须显式使用 --replace-pending-evidence")
    if ISO_UTC.fullmatch(generated_at_utc) is None:
        raise FirebudEvidenceInstallError("--generated-at-utc 必须是 YYYY-MM-DDTHH:MM:SSZ")
    manifest = _load_json(MANIFEST_PATH, "Firebud manifest")
    lifecycle = {key: manifest.get(key) for key in REFRESH.EXPECTED_LIFECYCLE}
    if manifest.get("bundleId") != BUNDLE_ID or lifecycle != REFRESH.EXPECTED_LIFECYCLE:
        raise FirebudEvidenceInstallError(f"拒绝改动非 pending Firebud v2：{lifecycle}")

    config = REFRESH.BUNDLE_CONFIGS[BUNDLE_ID]
    REFRESH.refresh_bundle(
        BUNDLE_ROOT,
        bundle_id=BUNDLE_ID,
        config=config,
        generated_at_utc=generated_at_utc,
        apply=False,
    )

    staged: dict[tuple[str, str, str], bytes] = {}
    hud_glyph_by_action: dict[tuple[str, str], dict[str, Any]] = {}
    hud_board_items: list[dict[str, Any]] = []
    for map_id in MAP_IDS:
        for action_kind in ACTION_KINDS:
            pair: dict[str, bytes] = {}
            for phase in ("before", "after"):
                name = f"{map_id}_{action_kind}-{phase}.jpeg"
                source = raw_root / name
                if source.is_symlink() or not source.is_file():
                    raise FirebudEvidenceInstallError(f"缺少真实原图：{source}")
                payload = source.read_bytes()
                if _jpeg_dimensions(payload) != (640, 392):
                    raise FirebudEvidenceInstallError(f"Computer Use 原图尺寸错误：{source}")
                pair[phase] = payload
                staged[(map_id, action_kind, phase)] = payload
            if pair["before"] == pair["after"]:
                raise FirebudEvidenceInstallError(f"动作前后原图相同：{map_id}/{action_kind}")
            try:
                runtime_reference = (
                    BUNDLE_ROOT
                    / "evidence"
                    / "runtime-actions"
                    / map_id
                    / f"{action_kind}.png"
                )
                HUD_GLYPH.analyze_image(
                    runtime_reference,
                    label=f"runtime-reference:{map_id}:{action_kind}",
                )
                hud_glyph_by_action[(map_id, action_kind)] = HUD_GLYPH.analyze_image(
                    pair["after"],
                    label=f"computer-use:{map_id}:{action_kind}:after",
                    require_task_hud=action_kind != "pointer",
                    reference=(
                        runtime_reference if action_kind != "pointer" else None
                    ),
                )
            except HUD_GLYPH.HudGlyphAuditError as error:
                raise FirebudEvidenceInstallError(
                    f"Computer Use after 帧 HUD 字形不完整：{map_id}/{action_kind}: {error}"
                ) from error
            if action_kind != "pointer":
                hud_board_items.append(
                    {
                        "label": f"{map_id} {action_kind}",
                        "source": pair["after"],
                    }
                )

    report = _load_json(REPORT_PATH, "Computer Use review")
    actions = report.get("actions")
    if not isinstance(actions, list):
        raise FirebudEvidenceInstallError("Computer Use actions 必须是数组")
    by_key = {
        (str(action.get("mapId", "")), str(action.get("actionKind", ""))): dict(action)
        for action in actions
        if isinstance(action, dict)
    }
    expected = {(map_id, kind) for map_id in MAP_IDS for kind in ACTION_KINDS}
    if set(by_key) != expected:
        raise FirebudEvidenceInstallError("既有 Computer Use action 覆盖不完整")

    writes: dict[Path, bytes] = {}
    refreshed_actions: list[dict[str, Any]] = []
    for map_id in MAP_IDS:
        for action_kind in ACTION_KINDS:
            action_id = f"{map_id}_{action_kind}"
            before_path = RAW_ROOT / f"{action_id}-before.jpeg"
            after_path = RAW_ROOT / f"{action_id}-after.jpeg"
            before_payload = staged[(map_id, action_kind, "before")]
            after_payload = staged[(map_id, action_kind, "after")]
            before_ref = _file_ref_from_bytes(before_path, before_payload)
            after_ref = _file_ref_from_bytes(after_path, after_payload)
            action_config = ACTION_CONFIG[map_id][action_kind]
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
                "steps": action_config["steps"],
                "observations": action_config["observations"],
                "before": before_ref,
                "after": after_ref,
                "hudGlyphStability": hud_glyph_by_action[(map_id, action_kind)],
                "result": "PASS",
            }
            receipt_payload = _json_bytes(receipt, compact=True)
            writes[before_path] = before_payload
            writes[after_path] = after_payload
            writes[receipt_path] = receipt_payload
            action = by_key[(map_id, action_kind)]
            action["description"] = action_config["description"]
            action["result"] = "PASS"
            action["evidence"] = [before_ref, after_ref]
            action["actionReceipt"] = _file_ref_from_bytes(receipt_path, receipt_payload)
            action["hudGlyphStability"] = hud_glyph_by_action[(map_id, action_kind)]
            refreshed_actions.append(action)

    try:
        hud_board_payload = HUD_GLYPH.build_task_hud_board_bytes(
            hud_board_items,
            columns=4,
        )
    except HUD_GLYPH.HudGlyphAuditError as error:
        raise FirebudEvidenceInstallError(
            f"Computer Use HUD 单图审片板生成失败：{error}"
        ) from error
    writes[HUD_GLYPH_BOARD_PATH] = hud_board_payload

    refreshed_report = dict(report)
    refreshed_report["generatedAtUtc"] = generated_at_utc
    refreshed_report["result"] = "PASS"
    refreshed_report["testedMapIds"] = list(MAP_IDS)
    refreshed_report["blockers"] = []
    refreshed_report["hudGlyphStability"] = {
        "status": "passed",
        "taskHudAfterImageCount": len(hud_board_items),
        "pointerImageCount": len(MAP_IDS),
        "incrementalPreviewAcceptedAsPixelAuthority": False,
        "board": _file_ref_from_bytes(
            HUD_GLYPH_BOARD_PATH,
            hud_board_payload,
        ),
    }
    refreshed_report["actions"] = refreshed_actions
    writes[REPORT_PATH] = _json_bytes(refreshed_report)

    affected = set(writes) | {MANIFEST_PATH}
    snapshot = {path: path.read_bytes() if path.is_file() else None for path in affected}
    try:
        for path, payload in writes.items():
            _write_atomic(path, payload)
        result = REFRESH.refresh_bundle(
            BUNDLE_ROOT,
            bundle_id=BUNDLE_ID,
            config=config,
            generated_at_utc=generated_at_utc,
            apply=True,
        )
    except BaseException as error:
        try:
            _restore_snapshot(snapshot)
        except FirebudEvidenceInstallError as rollback_error:
            raise FirebudEvidenceInstallError(
                f"安装失败且旧证据回滚失败：{rollback_error}"
            ) from error
        raise
    result["rawPairCount"] = len(MAP_IDS) * len(ACTION_KINDS)
    result["hudGlyphTaskImageCount"] = len(hud_board_items)
    result["hudGlyphBoard"] = _file_ref_from_bytes(
        HUD_GLYPH_BOARD_PATH,
        hud_board_payload,
    )
    result["transaction"] = "committed"
    return result


def main() -> int:
    args = _parse_args()
    try:
        raw_root = _resolve_raw_root(str(args.raw_root))
        result = install(
            raw_root,
            str(args.generated_at_utc),
            replace=bool(args.replace_pending_evidence),
        )
    except (FirebudEvidenceInstallError, REFRESH.ActionEvidenceError, OSError, ValueError) as error:
        print(f"Firebud Computer Use evidence install failed: {error}", file=sys.stderr)
        return 1
    print("Firebud Computer Use evidence install: PASS " + json.dumps(result, ensure_ascii=False))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
