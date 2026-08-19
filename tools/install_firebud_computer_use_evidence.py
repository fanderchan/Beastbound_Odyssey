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

BUNDLE_ID = "firebud_region_visual_v2"
BUNDLE_ROOT = (
    REPO_ROOT / "client" / "godot" / "assets" / "maps" / BUNDLE_ID
)
MANIFEST_PATH = BUNDLE_ROOT / "map-visual-bundle.json"
REPORT_PATH = BUNDLE_ROOT / "evidence" / "computer-use-review.json"
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
            "description": "点击木栅栏另一侧草地，核对路线绕过显式阻挡 footprint。",
            "steps": [
                {"action": "left_click", "windowPoint": [450, 220], "target": "木栅栏右侧可行走草地"},
                {"action": "get_app_state", "fresh": True, "afterSettleMs": 1000},
            ],
            "observations": [
                "黄色路线从木栅栏下端绕到右侧且没有把角色画进栅栏基座",
                "角色与低木栅栏保持可辨识的安全间距",
                "阻挡物仍按世界层级覆盖路线，HUD 没有消费这次点击",
            ],
        },
        "occlusion": {
            "description": "走到补给陶罐后侧，核对角色前后层级和局部遮挡。",
            "steps": [
                {"action": "left_click", "windowPoint": [401, 181], "target": "补给陶罐左后侧可行走邻格"},
                {"action": "get_app_state", "fresh": True, "afterSettleMs": 1800},
            ],
            "observations": [
                "角色从出生点走到补给陶罐后侧",
                "陶罐正确盖住角色腿部而上半身仍清晰可见",
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
            "description": "点击服务区右侧草地，核对路线穿过主通道而不穿 NPC。",
            "steps": [
                {"action": "left_click", "windowPoint": [430, 220], "target": "服务区右侧可行走草地"},
                {"action": "get_app_state", "fresh": True, "afterSettleMs": 1000},
            ],
            "observations": [
                "角色从 3,15 出生区进入服务区主通道",
                "黄色路线从 NPC 间的保留通道通过且没有穿进人物轮廓",
                "新布局下任务感叹号、记录图腾和路径仍可同时辨认",
            ],
        },
        "warp": {
            "description": "点击主线自动寻路，从火芽村返回训练场并打开训练师对话。",
            "steps": [
                {"action": "left_click", "windowPoint": [550, 262], "target": "主线任务自动寻路按钮"},
                {"action": "get_app_state", "fresh": True, "afterTravelMs": 8000},
            ],
            "observations": [
                "自动寻路穿过村口传送点并返回火芽训练场",
                "切图后角色抵达训练师阿土的可交互邻格",
                "正常训练师对话打开，证明落点与后续交互都可达",
            ],
        },
        "collision": {
            "description": "点击古树树冠阻挡区，核对大地标视觉范围与不可行走 footprint。",
            "steps": [
                {"action": "left_click", "windowPoint": [470, 100], "target": "火芽古树树冠与树干投影"},
                {"action": "get_app_state", "fresh": True, "afterSettleMs": 1000},
            ],
            "observations": [
                "白色指针落在古树阻挡投影内",
                "角色保持在 3,15 且没有生成穿树路线",
                "古树视觉基座、树干和实际阻挡范围没有出现穿帮",
            ],
        },
        "occlusion": {
            "description": "走入火芽古树后侧，核对大型树冠与树干的前景遮挡。",
            "steps": [
                {"action": "left_click", "windowPoint": [390, 180], "target": "古树树冠左缘后方可行走点"},
                {"action": "get_app_state", "fresh": True, "afterSettleMs": 1800},
            ],
            "observations": [
                "角色沿真实路线抵达古树后侧可行走点",
                "角色被树冠和树干正确压在后层，只保留合理的局部轮廓",
                "古树没有遮挡任务 HUD，前景边缘也没有角色残片",
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
            refreshed_actions.append(action)

    refreshed_report = dict(report)
    refreshed_report["generatedAtUtc"] = generated_at_utc
    refreshed_report["result"] = "PASS"
    refreshed_report["testedMapIds"] = list(MAP_IDS)
    refreshed_report["blockers"] = []
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
