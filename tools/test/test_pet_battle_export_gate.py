from __future__ import annotations

import ast
import contextlib
import copy
import hashlib
import json
from pathlib import Path
import re
import shutil
import struct
import subprocess
import sys
import tempfile
import unittest
from unittest import mock
import zlib

import tools.promote_pet_battle_release_cache as promoter_module
import tools.run_pet_battle_export_gate as export_gate_module

from tools.audit_pet_battle_release_gate import (
    CANONICAL_JSON_CONTRACT_ID,
    MAX_SAFE_JSON_INTEGER,
    CanonicalJsonError,
    DEFAULT_REGISTRY,
    DEFAULT_RUNTIME_CACHE,
    EXPECTED_RUNTIME_FRAME_COUNT,
    _canonical_json_snapshot_from_bytes,
    _read_json,
    _registry_errors,
    build_report as build_release_report,
    build_runtime_cache_document,
    canonical_json_bytes,
    canonical_json_sha256 as audit_canonical_json_sha256,
    canonical_parity_vectors,
    normalize_canonical_json,
    registry_release_subject,
    registry_release_subject_sha256,
    validate_runtime_cache,
)
from tools.promote_pet_battle_release_cache import (
    apply_candidate,
    check_candidate,
    promotion_candidate,
    render_json,
)
from tools.run_pet_battle_export_gate import (
    EXPECTATION_CONTRACT_ID,
    EXPECTATION_FORM_KEYS,
    EXPECTATION_FRAME_KEYS,
    EXPECTATION_ID,
    EXPECTATION_ROOT_KEYS,
    FINAL_ATTESTATION_CONTRACT_ID,
    FINAL_ATTESTATION_ID,
    FRAME_IMPORT_BINDING_ID,
    IMPORT_ORACLE_ID,
    IMPORT_SIDECAR_AUDIT_ID,
    PCK_SANDBOX_CONTRACT_ID,
    PCK_QA_RESULT_KEYS,
    PCK_RELEASE_SUMMARY_KEYS,
    PHASE404_PATH_ALLOWLIST,
    PINNED_GODOT_EXECUTABLE_SHA256,
    PINNED_GODOT_SOURCE_COMMIT,
    PINNED_GODOT_VERSION,
    PIXEL_CONTRACT_ID,
    QA_REPORT_CONTRACT_ID,
    QA_REPORT_ID,
    REPO_ROOT_ENV,
    REPO_ROOT_SHA256_ENV,
    SOURCE_AUDIT_REPORT_KEYS,
    ExportGateError,
    ProcessGroupTimeout,
    GeneratedImportStateGuard,
    IsolatedPckLaunchDirectories,
    audit_import_sidecars,
    assert_pck_unchanged,
    assert_inventory_has_no_symlinks,
    assert_pck_sandbox_runtime_integrity,
    build_export_expectation,
    build_final_release_attestation,
    build_pck_sandbox_profile,
    canonical_frame_facts,
    canonical_json_sha256,
    changed_paths,
    decode_rgba8_png,
    expected_import_param_literals,
    expected_import_options,
    extract_godot_result,
    frame_import_binding_document,
    git_patch_bytes,
    godot47_fix_alpha_edges_rgba8,
    godot47_import_oracle,
    godot47_import_oracle_sha256,
    imported_pixel_contract_sha256,
    parse_texture_import_sidecar,
    read_external_expectation_snapshot,
    parse_pinned_godot_version,
    repo_root_binding,
    sha256_bytes,
    source_frame_expectation,
    source_runtime_tree_sha256,
    status_scope_report,
    tree_inventory,
    validate_expectation_document,
    validate_external_expectation_path,
    validate_pck_preflight,
    validate_pck_result,
    write_final_attestation_atomic,
)


REPO_ROOT = Path(__file__).resolve().parents[2]
REGISTRY_PATH = REPO_ROOT / DEFAULT_REGISTRY
CACHE_PATH = REPO_ROOT / DEFAULT_RUNTIME_CACHE


def _write_json(path: Path, value: object) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_bytes(render_json(value))


def _png_chunk(kind: bytes, payload: bytes) -> bytes:
    return (
        struct.pack(">I", len(payload))
        + kind
        + payload
        + struct.pack(">I", zlib.crc32(kind + payload) & 0xFFFFFFFF)
    )


def _rgba_png(width: int, height: int, rgba: bytes) -> bytes:
    if len(rgba) != width * height * 4:
        raise ValueError("RGBA byte count mismatch")
    stride = width * 4
    scanlines = b"".join(
        b"\x00" + rgba[row * stride : (row + 1) * stride]
        for row in range(height)
    )
    ihdr = struct.pack(">IIBBBBB", width, height, 8, 6, 0, 0, 0)
    return (
        b"\x89PNG\r\n\x1a\n"
        + _png_chunk(b"IHDR", ihdr)
        + _png_chunk(b"IDAT", zlib.compress(scanlines))
        + _png_chunk(b"IEND", b"")
    )


def _texture_import_sidecar(resource_path: str) -> bytes:
    destination = "res://.godot/imported/frame.png-deadbeef.ctex"
    params = "\n".join(
        f"{key}={value}" for key, value in expected_import_param_literals().items()
    )
    return (
        '[remap]\n\nimporter="texture"\n'
        'type="CompressedTexture2D"\n'
        'uid="uid://phase404fixture"\n'
        f'path="{destination}"\n'
        'metadata={\n"vram_texture": false\n}\n\n'
        '[deps]\n\n'
        f'source_file="{resource_path}"\n'
        f'dest_files=["{destination}"]\n\n'
        '[params]\n\n'
        f"{params}\n"
    ).encode("utf-8")


class PetBattleExportGateTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.registry = _read_json(REGISTRY_PATH)
        cls.runtime_cache = _read_json(CACHE_PATH)
        cls.expectation_evidence: dict[str, object] = {}
        cls.expectation = build_export_expectation(
            REPO_ROOT,
            evidence_out=cls.expectation_evidence,
        )
        cls.source_audit_snapshot = cls.expectation_evidence[
            "sourceAuditSnapshot"
        ]

    def _run_mocked_export_gate(
        self,
        repo_root: Path,
        *,
        guard_factory=None,
        final_builder_calls: list[bool] | None = None,
    ) -> tuple[
        dict[str, object],
        list[dict[str, object]],
        list[bool],
        Path,
        dict[str, object],
    ]:
        project_root = repo_root / "client/godot"
        output_dir = repo_root / ".run/evidence/phase404-mocked-export"
        godot_path = repo_root / ".run/mock-godot"
        for relative, payload in (
            (DEFAULT_REGISTRY, b'{"mock":"registry"}\n'),
            (DEFAULT_RUNTIME_CACHE, b'{"mock":"cache"}\n'),
            (Path("client/godot/export_presets.cfg"), b'[preset.0]\nname="macOS"\n'),
            (godot_path.relative_to(repo_root), b"mock-godot-executable\n"),
        ):
            path = repo_root / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(payload)
        project_root.mkdir(parents=True, exist_ok=True)
        mocked_expectation = copy.deepcopy(self.expectation)
        mocked_expectation["registrySha256"] = hashlib.sha256(
            (repo_root / DEFAULT_REGISTRY).read_bytes()
        ).hexdigest()
        mocked_expectation["runtimeCacheSha256"] = hashlib.sha256(
            (repo_root / DEFAULT_RUNTIME_CACHE).read_bytes()
        ).hexdigest()
        mocked_source_audit = copy.deepcopy(
            self.source_audit_snapshot["document"]
        )
        mocked_source_audit["runtimeCache"]["sha256"] = mocked_expectation[
            "runtimeCacheSha256"
        ]
        mocked_source_audit["runtimeCache"]["pinnedSha256"] = mocked_expectation[
            "runtimeCacheSha256"
        ]
        mocked_source_audit_bytes = render_json(mocked_source_audit)
        mocked_source_audit_snapshot = {
            "document": mocked_source_audit,
            "rawBytes": mocked_source_audit_bytes,
            "sha256": sha256_bytes(mocked_source_audit_bytes),
            "byteCount": len(mocked_source_audit_bytes),
        }
        mocked_expectation["sourceAuditReportSha256"] = (
            mocked_source_audit_snapshot["sha256"]
        )
        generated_sidecar = project_root / "assets/mock-frame.png.import"
        real_user_root = (
            repo_root
            / ".mock-godot/app_userdata/MockBeastbound"
        )
        qa_lane_root = repo_root / ".mock-godot/BeastboundOdysseyQA_Automation"
        real_user_root.mkdir(parents=True, exist_ok=True)
        (real_user_root / "player_profile.json").write_bytes(b"mock real profile\n")
        real_user_root = real_user_root.resolve()
        qa_lane_root = qa_lane_root.resolve()
        qa_lane_state = {"exists": False, "owner": "", "verifyLabels": []}
        subprocess_calls: list[dict[str, object]] = []
        scope_calls: list[bool] = []
        builder_calls = final_builder_calls if final_builder_calls is not None else []
        real_final_builder = export_gate_module.build_final_release_attestation
        real_sha256_file = export_gate_module._sha256_file
        mocked_import_sidecar_audit = {
            "schemaVersion": 1,
            "contractId": IMPORT_SIDECAR_AUDIT_ID,
            "pixelContractId": PIXEL_CONTRACT_ID,
            "importOracleSha256": mocked_expectation["importOracleSha256"],
            "godotVersion": PINNED_GODOT_VERSION,
            "godotSourceCommit": PINNED_GODOT_SOURCE_COMMIT,
            "godotExecutableSha256": PINNED_GODOT_EXECUTABLE_SHA256,
            "frameCount": 540,
            "frameBindingAggregateSha256": "7" * 64,
            "frames": [],
        }

        def fake_lane_helper(_repo_root: Path, command: str, arguments=()):
            arguments = list(arguments)

            def option(name: str) -> str:
                return arguments[arguments.index(name) + 1]

            real_sha = "b" * 64
            lane_sha = "a" * 64
            if command == "source-check":
                return {"status": "source_contract_passed"}
            if command == "prepare":
                self.assertFalse(qa_lane_state["exists"])
                qa_lane_state["exists"] = True
                qa_lane_state["owner"] = option("--owner")
                qa_lane_root.mkdir(parents=True, exist_ok=False)
                return {
                    "customUserDirName": export_gate_module.QA_LANE_CUSTOM_USER_DIR_NAME,
                    "editorCustomFeatures": export_gate_module.QA_LANE_FEATURE,
                    "feature": export_gate_module.QA_LANE_FEATURE,
                    "godotLaneRoot": str(qa_lane_root),
                    "godotRealRoot": str(real_user_root),
                    "lane": export_gate_module.QA_LANE,
                    "laneEntryCount": 1,
                    "laneInventorySha256": lane_sha,
                    "laneRoot": str(qa_lane_root),
                    "owner": qa_lane_state["owner"],
                    "realEntryCount": 2,
                    "realInventorySha256": real_sha,
                    "realRoot": str(real_user_root),
                    "status": "prepared",
                }
            if command == "verify":
                self.assertTrue(qa_lane_state["exists"])
                self.assertEqual(option("--owner"), qa_lane_state["owner"])
                return {
                    "feature": export_gate_module.QA_LANE_FEATURE,
                    "godotLaneRoot": str(qa_lane_root),
                    "lane": export_gate_module.QA_LANE,
                    "laneEntryCount": 1,
                    "laneInventorySha256": lane_sha,
                    "laneRoot": str(qa_lane_root),
                    "owner": qa_lane_state["owner"],
                    "realEntryCount": 2,
                    "realInventorySha256": real_sha,
                    "realRoot": str(real_user_root),
                    "realUnchanged": True,
                    "status": "verified",
                }
            if command == "cleanup":
                self.assertTrue(qa_lane_state["exists"])
                qa_lane_state["exists"] = False
                qa_lane_root.rmdir()
                return {
                    "feature": export_gate_module.QA_LANE_FEATURE,
                    "lane": export_gate_module.QA_LANE,
                    "laneAbsent": True,
                    "laneRoot": str(qa_lane_root),
                    "owner": qa_lane_state["owner"],
                    "realInventorySha256": real_sha,
                    "realRoot": str(real_user_root),
                    "realUnchanged": True,
                    "removedLaneEntryCount": 1,
                    "removedLaneInventorySha256": lane_sha,
                    "status": "cleaned",
                }
            if command == "inspect":
                self.assertFalse(qa_lane_state["exists"])
                return {
                    "feature": export_gate_module.QA_LANE_FEATURE,
                    "inspectionSha256": "c" * 64,
                    "lane": export_gate_module.QA_LANE,
                    "laneEntryCount": 0,
                    "laneInventorySha256": hashlib.sha256(b"absent\n").hexdigest(),
                    "laneRoot": str(qa_lane_root),
                    "laneRootState": "absent",
                    "lockedRealInventorySha256": "",
                    "owner": qa_lane_state["owner"],
                    "ownerCanaryState": "not_applicable",
                    "pendingLockPayloadSha256": "",
                    "pendingLockState": "absent",
                    "pendingLockedRealInventorySha256": "",
                    "pendingOwnerPayloadSha256": "",
                    "pendingOwnerState": "not_applicable",
                    "publishedLockState": "absent",
                    "realEntryCount": 2,
                    "realInventorySha256": real_sha,
                    "realRoot": str(real_user_root),
                    "status": "inspected",
                }
            self.fail(f"unexpected lane helper command: {command}")

        def fake_scope(_repo_root: Path, *, allow_generated_sidecars: bool = False):
            scope_calls.append(allow_generated_sidecars)
            generated_entries: list[dict[str, object]] = []
            if generated_sidecar.is_file():
                payload = generated_sidecar.read_bytes()
                generated_entries.append(
                    {
                        "path": "client/godot/assets/mock-frame.png.import",
                        "sha256": sha256_bytes(payload),
                        "size": len(payload),
                    }
                )
                if not allow_generated_sidecars:
                    raise ExportGateError("generated sidecar escaped cleanup")
            return {
                "ok": True,
                "productPathCount": len(PHASE404_PATH_ALLOWLIST),
                "productPaths": list(PHASE404_PATH_ALLOWLIST),
                "generatedSidecarCount": len(generated_entries),
                "generatedSidecarAggregateSha256": canonical_json_sha256(
                    generated_entries
                ),
                "generatedSidecars": generated_entries,
                "errors": [],
            }

        def fake_subprocess_run(command, **kwargs):
            command = [str(value) for value in command]
            self.assertNotIn("--user-data-dir", command)
            subprocess_calls.append(
                {
                    "command": command,
                    "env": dict(kwargs.get("env", {})),
                    "cwd": str(kwargs.get("cwd", "")),
                }
            )
            stdout = ""
            returncode = 0
            if "--import" in command:
                (project_root / ".godot").mkdir(parents=True, exist_ok=True)
                generated_sidecar.parent.mkdir(parents=True, exist_ok=True)
                generated_sidecar.write_bytes(b"generated import sidecar\n")
            elif "--export-pack" in command:
                pck_path = Path(command[-1])
                pck_path.parent.mkdir(parents=True, exist_ok=True)
                pck_path.write_bytes(b"mock immutable PCK\n")
            elif str(export_gate_module.SANDBOX_TOUCH_EXECUTABLE) in command:
                target = Path(command[-1])
                if target.name == ".beastbound-phase404-sandbox-deny-canary":
                    returncode = 1
                    stdout = "touch: Operation not permitted\n"
                else:
                    self.assertEqual(target.parent.resolve(), Path(kwargs["cwd"]).resolve())
                    target.touch()
            elif "--main-pack" in command:
                self.assertEqual(
                    command.count(export_gate_module.QA_LANE_ARG),
                    1,
                )
                expectation_path = Path(
                    kwargs["env"][export_gate_module.EXPECTATION_ENV]
                )
                expectation_sha = kwargs["env"][
                    export_gate_module.EXPECTATION_SHA256_ENV
                ]
                source_audit_path = Path(
                    kwargs["env"][export_gate_module.SOURCE_AUDIT_REPORT_ENV]
                )
                source_audit_sha = kwargs["env"][
                    export_gate_module.SOURCE_AUDIT_REPORT_SHA256_ENV
                ]
                launch_root = Path(kwargs["cwd"])
                self.assertTrue(expectation_path.is_file())
                self.assertTrue(source_audit_path.is_file())
                self.assertEqual(source_audit_path.parent, expectation_path.parent)
                self.assertEqual(
                    sha256_bytes(source_audit_path.read_bytes()),
                    source_audit_sha,
                )
                self.assertTrue(launch_root.is_dir())
                self.assertEqual(expectation_path.parent.parent, launch_root.parent)
                self.assertNotEqual(expectation_path.parent, launch_root)
                self.assertFalse(
                    export_gate_module._path_is_within(
                        expectation_path,
                        launch_root,
                    )
                )
                self.assertFalse(
                    export_gate_module._path_is_within(
                        launch_root,
                        expectation_path.parent,
                    )
                )
                loaded_expectation = read_external_expectation_snapshot(
                    expectation_path,
                    expectation_sha,
                )
                self.assertEqual(
                    loaded_expectation["document"]["canonicalJsonContractId"],
                    CANONICAL_JSON_CONTRACT_ID,
                )
                self.assertEqual(command[0], str(export_gate_module.SANDBOX_EXECUTABLE))
                self.assertEqual(command[1], "-f")
                self.assertTrue(Path(command[2]).is_file())
                pinned_godot = Path(command[3])
                self.assertEqual(pinned_godot.resolve(), godot_path.resolve())
                engine_log_path = Path(command[command.index("--log-file") + 1])
                self.assertEqual(engine_log_path.parent.resolve(), launch_root.resolve())
                engine_log_path.write_text("Godot Engine 4.7.mock\n", encoding="utf-8")
                repo_binding_path = kwargs["env"][REPO_ROOT_ENV]
                repo_binding_sha = kwargs["env"][REPO_ROOT_SHA256_ENV]
                lane_marker = (
                    export_gate_module.QA_LANE_ATTESTATION_PREFIX
                    + json.dumps(
                        {
                            "customUserDirName": export_gate_module.QA_LANE_CUSTOM_USER_DIR_NAME,
                            "feature": export_gate_module.QA_LANE_FEATURE,
                            "lane": export_gate_module.QA_LANE,
                            "status": "passed",
                            "userDataRoot": str(qa_lane_root.resolve()),
                        },
                        separators=(",", ":"),
                    )
                    + "\n"
                )
                if kwargs["env"].get(export_gate_module.USER_ROOT_PREFLIGHT_ENV) == "1":
                    stdout = lane_marker + export_gate_module.USER_ROOT_PREFLIGHT_PREFIX + json.dumps(
                        {
                            "ok": True,
                            "workingDir": str(launch_root.resolve()),
                            "resourceRoot": "",
                            "userRoot": str(qa_lane_root.resolve()),
                            "executablePath": str(pinned_godot.resolve()),
                            "repoRoot": repo_binding_path,
                            "repoRootSha256": repo_binding_sha,
                        },
                        separators=(",", ":"),
                    )
                else:
                    self.assertNotIn(
                        export_gate_module.USER_ROOT_PREFLIGHT_ENV,
                        kwargs["env"],
                    )
                    form_id = "bui_novice_sprout_earth5_wind5"
                    for argument in command:
                        prefix = "--auto-pet-action-asset-form="
                        if argument.startswith(prefix):
                            form_id = argument[len(prefix) :]
                    form = next(
                        value
                        for value in loaded_expectation["document"]["forms"]
                        if value["formId"] == form_id
                    )
                    result = {
                        "ok": True,
                        "formId": form_id,
                        "canonicalJsonContractId": CANONICAL_JSON_CONTRACT_ID,
                        "exportExpectationId": EXPECTATION_ID,
                        "exportExpectationContractId": EXPECTATION_CONTRACT_ID,
                        "pixelContractId": PIXEL_CONTRACT_ID,
                        "importOracleContractId": IMPORT_ORACLE_ID,
                        "importOracleSha256": mocked_expectation["importOracleSha256"],
                        "sourceAuditReportSha256": mocked_expectation[
                            "sourceAuditReportSha256"
                        ],
                        "expectedGodotVersion": PINNED_GODOT_VERSION,
                        "expectedGodotSourceCommit": PINNED_GODOT_SOURCE_COMMIT,
                        "expectedGodotExecutableSha256": PINNED_GODOT_EXECUTABLE_SHA256,
                        "actualGodotVersion": PINNED_GODOT_VERSION,
                        "actualGodotSourceCommit": PINNED_GODOT_SOURCE_COMMIT,
                        "importFixAlphaBorder": True,
                        "importPremultAlpha": False,
                        "exportWorkingDir": str(launch_root.resolve()),
                        "exportUserRoot": str(qa_lane_root.resolve()),
                        "exportResourceRoot": "",
                        "exportRepoRoot": repo_binding_path,
                        "exportRepoRootSha256": repo_binding_sha,
                        "exportExpectationMode": True,
                        "exportExpectationPathAbsolute": True,
                        "exportExpectationExpectedSha256": expectation_sha,
                        "exportExpectationSha256": expectation_sha,
                        "exportTextureFrameCount": EXPECTED_RUNTIME_FRAME_COUNT,
                        "exportTextureExpectedFrameCount": EXPECTED_RUNTIME_FRAME_COUNT,
                        "exportTextureTreeSha256": form[
                            "expectedImportedPixelTreeSha256"
                        ],
                        "exportExpectedImportedPixelTreeSha256": form[
                            "expectedImportedPixelTreeSha256"
                        ],
                        "battleFrameCount": EXPECTED_RUNTIME_FRAME_COUNT,
                        "battleViews": len(export_gate_module.FORMAL_VIEWS),
                        "battleActions": len(export_gate_module.FORMAL_ACTIONS),
                        "battleReleaseMode": form["releaseMode"],
                        "battleReleaseFormal": form["formalRelease"],
                        "battleNormalRuntimeSupported": True,
                        "battleNormalRuntimeWarmed": True,
                        "battleNormalRuntimeTextureLoaded": True,
                        "battleQaPreviewDisabledBefore": True,
                        "battleQaPreviewDisabledAfter": True,
                        "battleRuntimeTreeFrameCount": EXPECTED_RUNTIME_FRAME_COUNT,
                        "battleRuntimeTreeSha256": form["sourceRuntimeTreeSha256"],
                        "battleRuntimeTreeVerificationUsec": 0,
                        "battleReleaseRegistry": {
                            "ok": True,
                            "state": "READY",
                            "registryId": export_gate_module.RELEASE_REGISTRY_ID,
                            "runtimeCacheId": export_gate_module.RUNTIME_CACHE_ID,
                            "registryRawSha256": mocked_expectation["registrySha256"],
                            "runtimeCacheRawSha256": mocked_expectation[
                                "runtimeCacheSha256"
                            ],
                            "releaseSubjectSha256": mocked_expectation[
                                "releaseSubjectSha256"
                            ],
                            "formalFormIds": sorted(
                                item["formId"]
                                for item in mocked_expectation["forms"]
                                if item["formalRelease"] is True
                            ),
                            "legacyCompatibilityFormIds": sorted(
                                item["formId"]
                                for item in mocked_expectation["forms"]
                                if item["formalRelease"] is False
                            ),
                            "errors": [],
                        },
                        "pckProfileSaveEnabled": False,
                        "pckServerAccountSession": False,
                        "pckAuthAutoBypass": True,
                        "pckWorkingDir": str(launch_root.resolve()),
                        "pckUserRoot": str(qa_lane_root.resolve()),
                        "pckResourceRoot": "",
                        "pckRepoRoot": repo_binding_path,
                        "pckRepoRootSha256": repo_binding_sha,
                        "errors": [],
                    }
                    stdout = lane_marker + export_gate_module.RESULT_PREFIX + json.dumps(
                        result,
                        separators=(",", ":"),
                    )
            elif "--help" in command:
                stdout = "  -e, --editor  Start the editor.\n  -p, --project-manager  Start project manager.\n"
            elif "--version" in command:
                stdout = f"{PINNED_GODOT_VERSION}\n"
            return mock.Mock(returncode=returncode, stdout=stdout)

        def fake_sha256_file(path: Path) -> str:
            if Path(path).resolve() == godot_path.resolve():
                return PINNED_GODOT_EXECUTABLE_SHA256
            return real_sha256_file(path)

        def build_final_only_after_cleanup(**kwargs):
            cleanup_path = output_dir / "05_generated_sidecar_cleanup.json"
            cleanup = json.loads(cleanup_path.read_text(encoding="utf-8"))
            if cleanup.get("residualGeneratedSidecarCount") != 0:
                raise AssertionError("final builder ran before zero-residual cleanup")
            if (project_root / ".godot").exists() or generated_sidecar.exists():
                raise AssertionError("final builder ran while generated state remained")
            builder_calls.append(True)
            return real_final_builder(**kwargs)

        with contextlib.ExitStack() as patches:
            patches.enter_context(
                mock.patch.object(
                    export_gate_module,
                    "assert_exact_allowlist",
                    side_effect=fake_scope,
                )
            )
            def fake_build_export_expectation(
                _repo_root: Path,
                *,
                evidence_out: dict[str, object] | None = None,
            ):
                if evidence_out is not None:
                    evidence_out.clear()
                    evidence_out.update(
                        {"sourceAuditSnapshot": mocked_source_audit_snapshot}
                    )
                return mocked_expectation

            patches.enter_context(
                mock.patch.object(
                    export_gate_module,
                    "build_export_expectation",
                    side_effect=fake_build_export_expectation,
                )
            )
            patches.enter_context(
                mock.patch.object(
                    export_gate_module,
                    "audit_import_sidecars",
                    return_value=mocked_import_sidecar_audit,
                )
            )
            patches.enter_context(
                mock.patch.object(
                    export_gate_module,
                    "_sha256_file",
                    side_effect=fake_sha256_file,
                )
            )
            patches.enter_context(
                mock.patch.object(
                    export_gate_module,
                    "git_patch_bytes",
                    return_value=b"mocked frozen Phase404 patch",
                )
            )
            patches.enter_context(
                mock.patch.object(
                    export_gate_module,
                    "resolve_real_user_root",
                    return_value=real_user_root,
                )
            )
            patches.enter_context(
                mock.patch.object(
                    export_gate_module,
                    "run_qa_lane_helper",
                    side_effect=fake_lane_helper,
                )
            )
            patches.enter_context(
                mock.patch.object(
                    export_gate_module,
                    "build_final_release_attestation",
                    side_effect=build_final_only_after_cleanup,
                )
            )
            patches.enter_context(
                mock.patch.object(
                    export_gate_module,
                    "_run_subprocess",
                    side_effect=fake_subprocess_run,
                )
            )
            if guard_factory is not None:
                patches.enter_context(
                    mock.patch.object(
                        export_gate_module,
                        "GeneratedImportStateGuard",
                        guard_factory,
                    )
                )
            result = export_gate_module.run_export_gate(
                repo_root=repo_root,
                godot_executable=godot_path,
                output_dir=output_dir,
            )
        return result, subprocess_calls, scope_calls, output_dir, mocked_expectation

    def test_registry_release_subject_excludes_only_internal_cache_pin(self) -> None:
        baseline = registry_release_subject_sha256(self.registry)
        changed_pin = copy.deepcopy(self.registry)
        changed_pin["runtimeCache"]["sha256"] = "0" * 64
        self.assertEqual(registry_release_subject_sha256(changed_pin), baseline)

        changed_release = copy.deepcopy(self.registry)
        changed_release["formalReleaseEntries"][0]["petRoot"] = (
            "client/godot/assets/pets/wuli_normal_fast_wind10"
        )
        self.assertNotEqual(registry_release_subject_sha256(changed_release), baseline)
        self.assertNotIn("runtimeCache", registry_release_subject(self.registry))
        external_pin = copy.deepcopy(self.registry)
        external_pin["exportExpectation"] = {"sha256": "0" * 64}
        self.assertTrue(_registry_errors(external_pin))
        expanded_internal_pin = copy.deepcopy(self.registry)
        expanded_internal_pin["runtimeCache"]["expectationSha256"] = "0" * 64
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            expanded_registry_path = root / DEFAULT_REGISTRY
            expanded_cache_path = root / DEFAULT_RUNTIME_CACHE
            _write_json(expanded_registry_path, expanded_internal_pin)
            shutil.copyfile(CACHE_PATH, expanded_cache_path)
            self.assertFalse(validate_runtime_cache(root, expanded_internal_pin)["ok"])

            def audit_expanded_registry(*_args, **kwargs):
                self.assertFalse(kwargs["verify_runtime_cache"])
                audit_snapshot = dict(kwargs["registry_snapshot"])
                audit_snapshot["path"] = REGISTRY_PATH.resolve()
                return build_release_report(
                    REPO_ROOT,
                    verify_runtime_cache=False,
                    registry_snapshot=audit_snapshot,
                )

            with mock.patch.object(
                promoter_module,
                "build_report",
                side_effect=audit_expanded_registry,
            ):
                with self.assertRaisesRegex(
                    RuntimeError,
                    "source release audit failed before runtime-cache promotion",
                ):
                    promotion_candidate(root)

    def test_runtime_cache_pin_and_exact_entries_fail_closed_on_tamper(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            _write_json(root / DEFAULT_REGISTRY, self.registry)
            shutil.copyfile(CACHE_PATH, root / DEFAULT_RUNTIME_CACHE)
            baseline = validate_runtime_cache(root, self.registry)
            self.assertTrue(baseline["ok"], baseline["errors"])

            wrong_pin = copy.deepcopy(self.registry)
            wrong_pin["runtimeCache"]["sha256"] = "0" * 64
            self.assertFalse(validate_runtime_cache(root, wrong_pin)["ok"])

            for label, mutate in {
                "wrong_root": lambda cache: cache["entries"][0].__setitem__(
                    "petRoot", "client/godot/assets/pets/sibling"
                ),
                "wrong_form": lambda cache: cache["entries"][0].__setitem__(
                    "formId", "tampered_unknown_form"
                ),
                "wrong_mode": lambda cache: cache["entries"][0].__setitem__(
                    "releaseMode", "legacy_exact_asset"
                ),
                "wrong_tree": lambda cache: cache["entries"][0].__setitem__(
                    "battleRuntimeTreeSha256", "f" * 64
                ),
                "wrong_frame_count": lambda cache: cache["entries"][0].__setitem__(
                    "sourceRuntimeFrameCount", 179
                ),
                "wrong_actions": lambda cache: cache["entries"][0].__setitem__(
                    "normalBattleActionIds", ["idle"]
                ),
                "expanded_entry": lambda cache: cache["entries"].append(
                    copy.deepcopy(cache["entries"][0])
                ),
                "empty_cache": lambda cache: cache.clear(),
                "junk_entry": lambda cache: cache["entries"].append(None),
                "junk_parity_vector": lambda cache: cache["canonicalParityVectors"].append(None),
                "junk_action": lambda cache: cache["entries"][0][
                    "normalBattleActionIds"
                ].append(None),
                "schema_bool": lambda cache: cache.__setitem__(
                    "schemaVersion", True
                ),
                "formal_release_int": lambda cache: cache["entries"][0].__setitem__(
                    "formalRelease", 1
                ),
                "compatibility_exception_int": lambda cache: cache["entries"][0].__setitem__(
                    "compatibilityException", 0
                ),
                "runtime_enabled_int": lambda cache: cache["entries"][0].__setitem__(
                    "catalogRuntimeEnabled", 1
                ),
            }.items():
                with self.subTest(label=label):
                    changed_cache = copy.deepcopy(self.runtime_cache)
                    mutate(changed_cache)
                    cache_bytes = render_json(changed_cache)
                    (root / DEFAULT_RUNTIME_CACHE).write_bytes(cache_bytes)
                    changed_registry = copy.deepcopy(self.registry)
                    changed_registry["runtimeCache"]["sha256"] = sha256_bytes(cache_bytes)
                    status = validate_runtime_cache(root, changed_registry)
                    self.assertFalse(status["ok"], status)

        malformed_registry = copy.deepcopy(self.registry)
        malformed_registry["formalReleaseEntries"].append(None)
        self.assertTrue(_registry_errors(malformed_registry))
        malformed_legacy_actions = copy.deepcopy(self.registry)
        malformed_legacy_actions["legacyCompatibilityExceptions"][0][
            "legacyBattleActionIds"
        ].append(None)
        self.assertTrue(_registry_errors(malformed_legacy_actions))
        bool_schema_registry = copy.deepcopy(self.registry)
        bool_schema_registry["schemaVersion"] = True
        self.assertTrue(_registry_errors(bool_schema_registry))
        integer_policy_registry = copy.deepcopy(self.registry)
        integer_policy_registry["policy"]["exactFormOnly"] = 1
        self.assertTrue(_registry_errors(integer_policy_registry))

    def test_python_and_gdscript_canonical_vectors_are_frozen_together(self) -> None:
        vectors = canonical_parity_vectors()
        self.assertEqual(self.runtime_cache["canonicalParityVectors"], vectors)
        self.assertEqual(
            self.runtime_cache["canonicalJsonContractId"],
            CANONICAL_JSON_CONTRACT_ID,
        )
        gate_source = (
            REPO_ROOT / "client/godot/scripts/pet/pet_battle_release_gate.gd"
        ).read_text(encoding="utf-8")
        qa_source = (
            REPO_ROOT / "client/godot/scripts/qa/pet_action_asset_check.gd"
        ).read_text(encoding="utf-8")
        self.assertIn(CANONICAL_JSON_CONTRACT_ID, gate_source)
        self.assertIn("static func normalize_canonical_json", gate_source)
        self.assertIn("static func canonical_json_equal", gate_source)
        self.assertIn("TYPE_BOOL", gate_source)
        self.assertIn("TYPE_INT", gate_source)
        self.assertIn("TYPE_FLOAT", gate_source)
        self.assertIn("MAX_SAFE_JSON_INTEGER", gate_source)
        self.assertIn(
            'cache_entry.get("formalRelease", null), formal_release',
            gate_source,
        )
        self.assertIn(
            'cache_entry.get("compatibilityException", null), not formal_release',
            gate_source,
        )
        self.assertNotIn(
            'bool(cache_entry.get("formalRelease"',
            gate_source,
        )
        self.assertNotIn(
            'int(document.get("schemaVersion"',
            gate_source,
        )
        self.assertIn(
            "PetBattleReleaseGate.canonical_json_sha256(",
            qa_source,
        )
        self.assertIn(
            "PetBattleReleaseGate.normalize_canonical_json(parsed)",
            qa_source,
        )
        self.assertIn(
            "var engine_version := _runtime_godot_version_contract(version_info)",
            qa_source,
        )
        self.assertIn(
            "static func _runtime_godot_version_contract(version_info: Dictionary)",
            qa_source,
        )
        self.assertNotIn('str(version_info.get("string", ""))', qa_source)
        self.assertNotIn("static func _canonical_json_sha256", qa_source)
        for vector in vectors:
            self.assertEqual(
                audit_canonical_json_sha256(vector["value"]),
                vector["sha256"],
            )
            self.assertIn(vector["sha256"], gate_source)

    def test_canonical_v2_normalizes_only_safe_integral_numbers(self) -> None:
        self.assertEqual(canonical_json_bytes(6), canonical_json_bytes(6.0))
        self.assertEqual(canonical_json_bytes(180), canonical_json_bytes(180.0))
        self.assertEqual(canonical_json_bytes(-0.0), b"0")
        self.assertEqual(canonical_json_bytes(True), b"true")
        self.assertNotEqual(canonical_json_bytes(True), canonical_json_bytes(1))
        self.assertEqual(
            normalize_canonical_json(
                {
                    "nested": [
                        6.0,
                        {"frameCount": 180.0, "enabled": True},
                        -0.0,
                        float(-MAX_SAFE_JSON_INTEGER),
                        float(MAX_SAFE_JSON_INTEGER),
                    ]
                }
            ),
            {
                "nested": [
                    6,
                    {"frameCount": 180, "enabled": True},
                    0,
                    -MAX_SAFE_JSON_INTEGER,
                    MAX_SAFE_JSON_INTEGER,
                ]
            },
        )
        for invalid in (
            1.5,
            float("nan"),
            float("inf"),
            float("-inf"),
            MAX_SAFE_JSON_INTEGER + 1,
            -(MAX_SAFE_JSON_INTEGER + 1),
            float(MAX_SAFE_JSON_INTEGER + 1),
            float(-(MAX_SAFE_JSON_INTEGER + 1)),
            {1: "non-string-key"},
            (1, 2),
            b"not-json",
        ):
            with self.subTest(value=repr(invalid)), self.assertRaises(
                CanonicalJsonError
            ):
                canonical_json_bytes(invalid)

    def test_gdscript_canonical_v2_source_mutations_are_detected(self) -> None:
        gate_source = (
            REPO_ROOT / "client/godot/scripts/pet/pet_battle_release_gate.gd"
        ).read_text(encoding="utf-8")
        required_tokens = [
            CANONICAL_JSON_CONTRACT_ID,
            "static func normalize_canonical_json",
            "static func canonical_json_equal",
            "TYPE_NIL, TYPE_BOOL, TYPE_STRING:",
            "if not is_finite(float_value):",
            "if floor(float_value) != float_value:",
            "float_value < -MAX_SAFE_JSON_INTEGER",
            "float_value > MAX_SAFE_JSON_INTEGER",
            "return {\"ok\": true, \"value\": int(float_value), \"error\": \"\"}",
            *[vector["sha256"] for vector in canonical_parity_vectors()],
        ]

        def source_errors(source: str) -> list[str]:
            return [token for token in required_tokens if token not in source]

        self.assertEqual(source_errors(gate_source), [])
        mutations = {
            "contract": gate_source.replace(CANONICAL_JSON_CONTRACT_ID, "canonical_v1"),
            "bool_domain": gate_source.replace(
                "TYPE_NIL, TYPE_BOOL, TYPE_STRING:",
                "TYPE_NIL, TYPE_STRING:",
            ),
            "finite": gate_source.replace(
                "if not is_finite(float_value):",
                "if false:",
            ),
            "integral": gate_source.replace(
                "if floor(float_value) != float_value:",
                "if false:",
            ),
            "safe_bound": gate_source.replace(
                "float_value > MAX_SAFE_JSON_INTEGER",
                "float_value > 9223372036854775807",
            ),
            "public_equal": gate_source.replace(
                "static func canonical_json_equal",
                "static func removed_canonical_json_equal",
            ),
            "parity_sha": gate_source.replace(
                canonical_parity_vectors()[-1]["sha256"],
                "0" * 64,
            ),
        }
        for label, mutated in mutations.items():
            with self.subTest(label=label):
                self.assertTrue(source_errors(mutated))

    def test_cache_snapshot_normalizes_integral_float_but_rejects_fractional_source(self) -> None:
        raw_cache = CACHE_PATH.read_bytes()
        integral_float = raw_cache.replace(
            b'"expectedFrameCount": 180',
            b'"expectedFrameCount": 180.0',
            1,
        )
        self.assertNotEqual(integral_float, raw_cache)
        normalized = _canonical_json_snapshot_from_bytes(
            CACHE_PATH,
            integral_float,
        )
        self.assertEqual(
            normalized["document"]["sourceRuntimeFrameContract"][
                "expectedFrameCount"
            ],
            180,
        )
        self.assertIsInstance(
            normalized["document"]["sourceRuntimeFrameContract"][
                "expectedFrameCount"
            ],
            int,
        )
        fractional = raw_cache.replace(
            b'"expectedFrameCount": 180',
            b'"expectedFrameCount": 180.5',
            1,
        )
        with self.assertRaisesRegex(RuntimeError, "non-integral"):
            _canonical_json_snapshot_from_bytes(CACHE_PATH, fractional)

    def test_startup_gate_hot_lookup_has_no_lazy_io_or_placeholder_allocation(self) -> None:
        source = (
            REPO_ROOT / "client/godot/scripts/pet/pet_battle_release_gate.gd"
        ).read_text(encoding="utf-8")
        start = source.index("static func is_battle_runtime_allowed")
        end = source.index("\n\nstatic func", start + 1)
        hot_body = source[start:end]
        executable_hot_body = "\n".join(
            line for line in hot_body.splitlines() if not line.lstrip().startswith("#")
        )
        for forbidden in (
            "FileAccess",
            "ResourceLoader",
            "initialize(",
            "PetArtCatalog",
            "sha256",
            "_placeholder_decision",
        ):
            self.assertNotIn(forbidden, executable_hot_body)
        self.assertIn("_decisions_by_form.get", executable_hot_body)
        self.assertIn("STATE_UNINITIALIZED", source)
        self.assertIn("STATE_READY", source)
        self.assertIn("STATE_FAILED", source)

    def test_promotion_check_apply_is_deterministic_and_cannot_change_release_subject(self) -> None:
        candidate = promotion_candidate(REPO_ROOT)
        original_subject = registry_release_subject(self.registry)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            isolated = copy.deepcopy(candidate)
            isolated["repoRoot"] = root
            isolated["registryPath"] = root / DEFAULT_REGISTRY
            isolated["runtimeCachePath"] = root / DEFAULT_RUNTIME_CACHE
            isolated["registryPath"].parent.mkdir(parents=True, exist_ok=True)
            isolated["registryPath"].write_bytes(isolated["sourceRegistryBytes"])
            apply_candidate(isolated)
            before_check = (root / DEFAULT_REGISTRY).read_bytes()
            self.assertEqual(check_candidate(isolated), [])
            self.assertEqual((root / DEFAULT_REGISTRY).read_bytes(), before_check)
            promoted_registry = _read_json(root / DEFAULT_REGISTRY)
            self.assertEqual(registry_release_subject(promoted_registry), original_subject)
            self.assertEqual(
                _read_json(root / DEFAULT_RUNTIME_CACHE),
                build_runtime_cache_document(promoted_registry),
            )
            self.assertTrue(
                (root / ".run/locks/pet-battle-release-cache-promotion.lock").is_file()
            )

        promoter_source = (
            REPO_ROOT / "tools/promote_pet_battle_release_cache.py"
        ).read_text(encoding="utf-8")
        self.assertIn("with _promotion_lock(args.repo_root):", promoter_source)
        self.assertIn("with _promotion_lock(Path(candidate[\"repoRoot\"])):", promoter_source)

    def test_promotion_rejects_registry_drift_during_audit_or_before_write(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            registry_path = root / DEFAULT_REGISTRY
            _write_json(registry_path, self.registry)

            def drift_during_audit(*_args, **_kwargs):
                changed = copy.deepcopy(self.registry)
                changed["formalReleaseEntries"][0]["petRoot"] = "tampered/during/audit"
                _write_json(registry_path, changed)
                return {"status": "passed", "errors": []}

            with mock.patch.object(
                promoter_module,
                "build_report",
                side_effect=drift_during_audit,
            ):
                with self.assertRaisesRegex(RuntimeError, "changed while"):
                    promoter_module.promotion_candidate(root)

        candidate = promotion_candidate(REPO_ROOT)
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            isolated = copy.deepcopy(candidate)
            isolated["repoRoot"] = root
            isolated["registryPath"] = root / DEFAULT_REGISTRY
            isolated["runtimeCachePath"] = root / DEFAULT_RUNTIME_CACHE
            changed = copy.deepcopy(self.registry)
            changed["formalReleaseEntries"][0]["petRoot"] = "tampered/before/write"
            _write_json(isolated["registryPath"], changed)
            with self.assertRaisesRegex(RuntimeError, "drifted before"):
                apply_candidate(isolated)
            self.assertFalse(isolated["runtimeCachePath"].exists())

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            isolated = copy.deepcopy(candidate)
            isolated["repoRoot"] = root
            isolated["registryPath"] = root / DEFAULT_REGISTRY
            isolated["runtimeCachePath"] = root / DEFAULT_RUNTIME_CACHE
            isolated["registryPath"].parent.mkdir(parents=True, exist_ok=True)
            isolated["registryPath"].write_bytes(isolated["sourceRegistryBytes"])
            original_atomic_write = promoter_module._atomic_write

            def write_cache_then_drift(path: Path, payload: bytes) -> None:
                original_atomic_write(path, payload)
                if Path(path) == isolated["runtimeCachePath"]:
                    changed = copy.deepcopy(self.registry)
                    changed["formalReleaseEntries"][0]["petRoot"] = (
                        "tampered/concurrently/between/cache-and-pin"
                    )
                    _write_json(isolated["registryPath"], changed)

            with mock.patch.object(
                promoter_module,
                "_atomic_write",
                side_effect=write_cache_then_drift,
            ):
                with self.assertRaisesRegex(RuntimeError, "immediately before"):
                    apply_candidate(isolated)
            self.assertEqual(
                isolated["runtimeCachePath"].read_bytes(),
                isolated["runtimeCacheBytes"],
            )
            self.assertNotEqual(
                isolated["registryPath"].read_bytes(),
                isolated["registryBytes"],
            )

    def test_godot47_fix_alpha_edges_exact_oracle_and_cross_language_vectors(self) -> None:
        oracle = godot47_import_oracle()
        oracle_sha = godot47_import_oracle_sha256()
        self.assertEqual(oracle["contractId"], IMPORT_ORACLE_ID)
        self.assertEqual(oracle["godotVersion"], PINNED_GODOT_VERSION)
        self.assertEqual(oracle["godotSourceCommit"], PINNED_GODOT_SOURCE_COMMIT)
        self.assertEqual(
            oracle["godotExecutableSha256"], PINNED_GODOT_EXECUTABLE_SHA256
        )
        self.assertEqual(
            oracle_sha,
            "ae5fc15c454fb0916a51dc81c4954eb9b29c5f8b94def59c7412d66669e9eb0d",
        )
        square_source = bytes([1, 2, 3, 0]) * 24 + bytes([200, 201, 202, 20])
        square_expected = bytes([200, 201, 202, 0]) * 24 + bytes(
            [200, 201, 202, 20]
        )
        vectors = [
            (
                "threshold_alpha_0_1_19_20_255",
                5,
                1,
                bytes.fromhex("010203000405060107080913c86432140b1621ff"),
                bytes.fromhex("c8643200c8643201c8643213c86432140b1621ff"),
                "bb8c7772a5934465e69c7faa638ad9b883e9451613e6bcdfd6a82cc39d5ee9bc",
                "1fcbe4379effece9549014f3933e9c34f11a2d425d6f6d7e07d69b2a7a7b2026",
                "d0d0966527901cc010506047e905ac8cc00aff873a9bca2030317ea408457c46",
            ),
            (
                "tie_row_major_first",
                3,
                3,
                bytes.fromhex(
                    "010101ff0a141eff020202ff28323cffc9cacb0046505aff030303ff646e78ff040404ff"
                ),
                bytes.fromhex(
                    "010101ff0a141eff020202ff28323cff0a141e0046505aff030303ff646e78ff040404ff"
                ),
                "53994901c52fa899523af2be0e511d6548824894935e325c4d8a0b0eaf6b0cab",
                "97748f9d55db17ec91f11555c913c876d801efa7323bcf44fa672cb4e3f3814f",
                "9fee644af3cb292fc31644a567a0be3531f332fcac60f0a601aae9e8b8522115",
            ),
            (
                "radius4_square_diagonal",
                5,
                5,
                square_source,
                square_expected,
                "44bc2f6e3828b7d9b198c658766eec37b9ad9b37ac239178c2a8f516b81a82a8",
                "7740ead9f0b6f32d98e9f9ff8831ba43e74ee6baab05935cc123db13e6b2a6eb",
                "f0968c149c9440c5305ab0e3a1aef288011c008a262b6b4a71bd031975a7720b",
            ),
            (
                "radius_bounds_no_neighbor",
                6,
                1,
                bytes.fromhex("d2d3d4ff0102030004050601070809130a0b0c0033343500"),
                bytes.fromhex("d2d3d4ffd2d3d400d2d3d401d2d3d413d2d3d40033343500"),
                "f9c9d9201949ac7575af19d483ec29a0ca5d5d029a934769e8498bd2ba4dd309",
                "6c120d5dc37a7c75890bb8954f17ce2e8ce43d60ed9e125db6f3d24fe3e7d0f9",
                "ef38e343249929e7171c0f327a0f5b76a6a94d98520d6c836e078dde58a76703",
            ),
            (
                "source_copy_non_cascade",
                11,
                1,
                bytes.fromhex(
                    "c80a14ff15293d00162a3e01172b3f13182c4000192d41011a2e42131b2f43001c3044011d3145131e324600"
                ),
                bytes.fromhex(
                    "c80a14ffc80a1400c80a1401c80a1413c80a1400192d41011a2e42131b2f43001c3044011d3145131e324600"
                ),
                "f5ded048d3300fd1f3429f9d86229430bd5a8b22382c66b730227033379814a0",
                "5739cf058eeaa5665f79a7049e4bf4b0328dce1bbe6d3d541f2dbaa6ad08b3f4",
                "bfcb71ea35009e2c17b4c4ca6e994780c2b787ca9ee9e215e060811398fbb7dd",
            ),
        ]
        tree_frames: list[dict[str, object]] = []
        for vector_id, width, height, source, expected, source_sha, raw_sha, contract_sha in vectors:
            with self.subTest(vector=vector_id):
                actual = godot47_fix_alpha_edges_rgba8(width, height, source)
                self.assertEqual(actual, expected)
                self.assertEqual(sha256_bytes(source), source_sha)
                self.assertEqual(sha256_bytes(actual), raw_sha)
                self.assertEqual(
                    imported_pixel_contract_sha256(width, height, actual, oracle_sha),
                    contract_sha,
                )
                self.assertNotEqual(raw_sha, contract_sha)
                self.assertEqual(actual[3::4], source[3::4])
                frame = {
                    "path": f"res://fixture/{vector_id}.png",
                    "sourceFileSha256": "0" * 64,
                    "sourceRgba8Sha256": source_sha,
                    "importOracleSha256": oracle_sha,
                    "importOptions": expected_import_options(),
                    "expectedImportedRgba8RawSha256": raw_sha,
                    "expectedImportedPixelContractSha256": contract_sha,
                }
                frame["frameImportBindingSha256"] = canonical_json_sha256(
                    frame_import_binding_document(frame)
                )
                tree_frames.append(frame)
        pixel_tree = {
            "contractId": PIXEL_CONTRACT_ID,
            "formId": "godot47_fix_alpha_edges_contract_fixture",
            "petRoot": "fixture",
            "frames": tree_frames,
        }
        expected_tree_sha = (
            "f028642977cae90a1ba4be683988585f3b73e202252bd50dbc12917296eb1915"
        )
        self.assertEqual(canonical_json_sha256(pixel_tree), expected_tree_sha)

        exact_threshold = vectors[0][4]
        mutations = {
            "threshold": exact_threshold[:8] + vectors[0][3][8:12] + exact_threshold[12:],
            "tie": vectors[1][4][:16] + bytes([100, 110, 120, 0]) + vectors[1][4][20:],
            "radius": vectors[2][3][0:4] + vectors[2][4][4:],
            "no_neighbor_radius5": vectors[3][4][:-4] + bytes([210, 211, 212, 0]),
            "cascade": vectors[4][4][:20] + bytes([200, 10, 20, 1]) + vectors[4][4][24:],
            "premult": bytes(
                ((channel * exact_threshold[index - (index % 4) + 3] + 255) >> 8)
                if index % 4 != 3
                else channel
                for index, channel in enumerate(exact_threshold)
            ),
            "alpha": exact_threshold[:3] + b"\x01" + exact_threshold[4:],
        }
        mutation_dimensions = {
            "threshold": (5, 1, vectors[0][7]),
            "tie": (3, 3, vectors[1][7]),
            "radius": (5, 5, vectors[2][7]),
            "no_neighbor_radius5": (6, 1, vectors[3][7]),
            "cascade": (11, 1, vectors[4][7]),
            "premult": (5, 1, vectors[0][7]),
            "alpha": (5, 1, vectors[0][7]),
        }
        for label, mutated in mutations.items():
            width, height, exact_sha = mutation_dimensions[label]
            with self.subTest(mutation=label):
                self.assertNotEqual(
                    imported_pixel_contract_sha256(width, height, mutated, oracle_sha),
                    exact_sha,
                )
        for width, height, payload in ((0, 1, vectors[0][3]), (5, 1, b"bad")):
            with self.assertRaises(ExportGateError):
                godot47_fix_alpha_edges_rgba8(width, height, payload)

        gdscript = (
            REPO_ROOT / "client/godot/scripts/qa/pet_action_asset_check.gd"
        ).read_text(encoding="utf-8")
        self.assertIn(f'const EXPORT_PIXEL_CONTRACT_ID := "{PIXEL_CONTRACT_ID}"', gdscript)
        self.assertIn(
            f'const EXPORT_IMPORT_ORACLE_PARITY_SHA256 := "{oracle_sha}"', gdscript
        )
        self.assertIn(
            f'const EXPORT_PIXEL_TREE_PARITY_SHA256 := "{expected_tree_sha}"',
            gdscript,
        )
        oracle_start = gdscript.index("static func _godot47_fix_alpha_edges_rgba8(")
        oracle_end = gdscript.index("\n\nstatic func _premultiply_godot47", oracle_start)
        oracle_source = gdscript[oracle_start:oracle_end]
        self.assertIn("var source_pixels: PackedByteArray = pixels.duplicate()", oracle_source)
        self.assertIn("var fixed_pixels: PackedByteArray = source_pixels.duplicate()", oracle_source)
        self.assertIn("for candidate_y in range(", oracle_source)
        self.assertIn("for candidate_x in range(", oracle_source)
        self.assertLess(
            oracle_source.index("for candidate_y in range("),
            oracle_source.index("for candidate_x in range("),
        )
        self.assertIn("distance_squared >= closest_distance_squared", oracle_source)
        self.assertIn("fixed_pixels[target_offset + 2]", oracle_source)
        self.assertNotIn("fixed_pixels[target_offset + 3]", oracle_source)
        self.assertNotIn("rgba.convert(Image.FORMAT_RGBA8)", gdscript)
        self.assertNotIn("visibleRgba8", gdscript)
        frame_presence_slice = (
            '\t\t\t\tif frame.is_empty():\n'
            '\t\t\t\t\terrors.append("PCK export expectation 缺少规范帧：%s" % path)\n'
            "\t\t\t\t\tcontinue\n"
            "\t\t\t\t_append_exact_dictionary_key_errors(\n"
        )
        self.assertIn(frame_presence_slice, gdscript)
        self.assertNotIn("\t\t\t\t\tcontinue\n\t\t\t\t\tif (\n", gdscript)
        expectation_frame_start = gdscript.index(frame_presence_slice)
        expectation_frame_end = gdscript.index(
            "\n\tif expectation_paths_in_contract_order", expectation_frame_start
        )
        expectation_frame_source = gdscript[
            expectation_frame_start:expectation_frame_end
        ]
        self.assertIn("\n\t\t\t\tif (\n", expectation_frame_source)
        indentation_contract = {
            "if frame.is_empty()": 4,
            "_append_exact_dictionary_key_errors(": 4,
            'str(frame.get("view", "")) != view': 5,
            "for digest_key in [": 4,
            'errors.append("PCK export expectation RGBA8 byte count': 5,
            'errors.append("PCK export expectation import options': 5,
            'errors.append("PCK export expectation 帧 oracle': 5,
            "var frame_binding := _frame_import_binding_document(frame)": 4,
            'errors.append("PCK export expectation 帧 import binding': 5,
        }

        def frame_structure_errors(source: str) -> list[str]:
            structure_errors: list[str] = []
            source_lines = source.splitlines()
            for token, expected_tabs in indentation_contract.items():
                lines = [line for line in source_lines if token in line]
                if len(lines) != 1:
                    structure_errors.append(f"{token}:count={len(lines)}")
                    continue
                actual_tabs = len(lines[0]) - len(lines[0].lstrip("\t"))
                if actual_tabs != expected_tabs:
                    structure_errors.append(
                        f"{token}:tabs={actual_tabs},expected={expected_tabs}"
                    )
            identity_lines = [
                index
                for index, line in enumerate(source_lines)
                if 'str(frame.get("view", "")) != view' in line
            ]
            if len(identity_lines) != 1 or identity_lines[0] == 0:
                structure_errors.append("identity-condition:missing-or-duplicate")
            elif source_lines[identity_lines[0] - 1] != "\t\t\t\tif (":
                structure_errors.append("identity-condition:opener-scope")
            return structure_errors

        self.assertEqual(frame_structure_errors(expectation_frame_source), [])
        for token, expected_tabs in indentation_contract.items():
            exact_line = next(
                line for line in expectation_frame_source.splitlines() if token in line
            )
            for delta in (-1, 1):
                mutated_tabs = expected_tabs + delta
                if mutated_tabs < 0:
                    continue
                mutated_line = "\t" * mutated_tabs + exact_line.lstrip("\t")
                mutated_source = expectation_frame_source.replace(
                    exact_line, mutated_line, 1
                )
                with self.subTest(
                    gdscript_frame_anchor=token,
                    indentation_delta=delta,
                ):
                    self.assertTrue(frame_structure_errors(mutated_source))
        identity_opener = "\t\t\t\tif (\n\t\t\t\t\tstr(frame.get(\"view\", \"\")) != view"
        self.assertIn(identity_opener, expectation_frame_source)
        mutated_identity_opener = identity_opener.replace(
            "\t\t\t\tif (", "\t\t\t\t\tif (", 1
        )
        self.assertTrue(
            frame_structure_errors(
                expectation_frame_source.replace(
                    identity_opener, mutated_identity_opener, 1
                )
            )
        )

        export_function_start = gdscript.index(
            "static func _run_export_expectation(\n"
        )
        export_function_end = gdscript.index(
            "\n\nstatic func _append_export_form_binding_errors(", export_function_start
        )
        export_function_source = gdscript[export_function_start:export_function_end]
        export_return = "\treturn {"
        result_semantics = (
            export_return,
            '\t\t"ok": errors.is_empty(),',
            '\t\t"errors": errors,',
        )

        def result_structure_errors(source: str) -> list[str]:
            source_lines = source.splitlines()
            return [
                f"{line}:count={source_lines.count(line)}"
                for line in result_semantics
                if source_lines.count(line) != 1
            ]

        self.assertEqual(result_structure_errors(export_function_source), [])
        result_mutations = {
            export_return: "\t\treturn {",
            '\t\t"ok": errors.is_empty(),': '\t\t"ok": true,',
            '\t\t"errors": errors,': '\t\t"errors": [],',
        }
        for exact_line, replacement in result_mutations.items():
            with self.subTest(gdscript_result_semantics=exact_line.strip()):
                mutated_source = export_function_source.replace(
                    exact_line, replacement, 1
                )
                self.assertTrue(result_structure_errors(mutated_source))

        def gdscript_key_contract(name: str) -> set[str]:
            marker = f"const {name} := "
            start = gdscript.index(marker) + len(marker)
            end = gdscript.index("\n]\n", start) + 2
            parsed = ast.literal_eval(gdscript[start:end])
            self.assertIsInstance(parsed, list)
            self.assertTrue(all(isinstance(value, str) for value in parsed))
            self.assertEqual(len(parsed), len(set(parsed)), name)
            return set(parsed)

        self.assertEqual(
            gdscript_key_contract("EXPORT_EXPECTATION_ROOT_KEYS"),
            set(EXPECTATION_ROOT_KEYS),
        )
        self.assertEqual(
            gdscript_key_contract("EXPORT_EXPECTATION_FORM_KEYS"),
            set(EXPECTATION_FORM_KEYS),
        )
        self.assertEqual(
            gdscript_key_contract("EXPORT_EXPECTATION_FRAME_KEYS"),
            set(EXPECTATION_FRAME_KEYS),
        )
        self.assertEqual(
            gdscript_key_contract("SOURCE_AUDIT_REPORT_KEYS"),
            set(SOURCE_AUDIT_REPORT_KEYS),
        )
        source_audit_tokens = (
            'const SOURCE_AUDIT_REPORT_ENV := "BEASTBOUND_PET_BATTLE_SOURCE_AUDIT_REPORT"',
            'const SOURCE_AUDIT_REPORT_SHA256_ENV := "BEASTBOUND_PET_BATTLE_SOURCE_AUDIT_REPORT_SHA256"',
            "var source_audit_snapshot := _read_external_expectation(",
            "or source_audit_report_sha != source_audit_report_expected_sha",
            'str(expectation.get("sourceAuditReportSha256", ""))',
            "\t\t_append_source_audit_report_errors(\n",
            '"sourceAuditReportSha256": source_audit_report_sha,',
            '"formalWildTrainingFormCount": 13,',
            '"runtimeCandidateCount": 3,',
        )

        def source_audit_binding_errors(source: str) -> list[str]:
            return [token for token in source_audit_tokens if source.count(token) != 1]

        self.assertEqual(source_audit_binding_errors(gdscript), [])
        for token in source_audit_tokens:
            with self.subTest(gdscript_source_audit_binding=token):
                self.assertTrue(
                    source_audit_binding_errors(gdscript.replace(token, "removed", 1))
                )
        actual_pck_start = gdscript.index("\tvar verified_frames: Array = []")
        actual_pck_end = gdscript.index("\n\tvar texture_tree_document :=", actual_pck_start)
        actual_pck_source = gdscript[actual_pck_start:actual_pck_end]
        self.assertNotIn("_godot47_fix_alpha_edges_rgba8(", actual_pck_source)
        self.assertIn("var actual_raw_sha := _sha256_bytes(actual_pixels)", actual_pck_source)
        self.assertIn(
            'frame.get("expectedImportedRgba8RawSha256", "")', actual_pck_source
        )
        self.assertIn(
            'frame.get("expectedImportedPixelContractSha256", "")',
            actual_pck_source,
        )

    def test_texture_import_sidecar_parser_binds_complete_options_and_rejects_junk(self) -> None:
        resource_path = "res://assets/pets/fixture/views/front/idle/idle-1.png"
        payload = _texture_import_sidecar(resource_path)
        parsed = parse_texture_import_sidecar(payload, resource_path)
        self.assertEqual(parsed["importOptions"], expected_import_options())
        self.assertEqual(
            set(parsed["importOptions"]["parameterLiterals"]),
            set(expected_import_param_literals()),
        )
        mutations = {
            "duplicate_section": payload + b"\n[params]\n",
            "duplicate_key": payload.replace(
                b"process/fix_alpha_border=true\n",
                b"process/fix_alpha_border=true\nprocess/fix_alpha_border=true\n",
            ),
            "extra_param": payload + b"unexpected/option=1\n",
            "missing_param": payload.replace(b"process/size_limit=0\n", b""),
            "equivalent_decimal_0_70": payload.replace(
                b"compress/lossy_quality=0.7",
                b"compress/lossy_quality=0.70",
            ),
            "equivalent_exponent_0e0": payload.replace(
                b"compress/rdo_quality_loss=0.0",
                b"compress/rdo_quality_loss=0e0",
            ),
            "whitespace_around_assignment": payload.replace(
                b"process/size_limit=0",
                b"process/size_limit = 0",
            ),
            "trailing_whitespace": payload.replace(
                b"process/size_limit=0\n",
                b"process/size_limit=0 \n",
            ),
            "fix_false": payload.replace(
                b"process/fix_alpha_border=true",
                b"process/fix_alpha_border=false",
            ),
            "premult_true": payload.replace(
                b"process/premult_alpha=false",
                b"process/premult_alpha=true",
            ),
            "wrong_source": payload.replace(resource_path.encode(), b"res://wrong.png"),
            "invalid_utf8": payload + b"\xff",
        }
        for label, changed in mutations.items():
            with self.subTest(label=label), self.assertRaises(ExportGateError):
                parse_texture_import_sidecar(changed, resource_path)

    def test_canonical_540_sidecar_audit_is_stable_and_never_follows_symlinks(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            for form in self.expectation["forms"]:
                for frame in form["frames"]:
                    sidecar = root / f"{frame['sourceRepoPath']}.import"
                    sidecar.parent.mkdir(parents=True, exist_ok=True)
                    sidecar.write_bytes(_texture_import_sidecar(frame["path"]))
            report_a = audit_import_sidecars(root, self.expectation)
            report_b = audit_import_sidecars(root, self.expectation)
            self.assertEqual(report_a, report_b)
            self.assertEqual(report_a["contractId"], IMPORT_SIDECAR_AUDIT_ID)
            self.assertEqual(report_a["frameCount"], 540)
            self.assertEqual(len(report_a["frames"]), 540)

            first = self.expectation["forms"][0]["frames"][0]
            first_sidecar = root / f"{first['sourceRepoPath']}.import"
            original = first_sidecar.read_bytes()
            first_sidecar.write_bytes(
                original.replace(
                    b"process/fix_alpha_border=true",
                    b"process/fix_alpha_border=false",
                )
            )
            with self.assertRaisesRegex(ExportGateError, "params literal text"):
                audit_import_sidecars(root, self.expectation)
            first_sidecar.write_bytes(original)
            external = root / "outside.import"
            external.write_bytes(original)
            first_sidecar.unlink()
            first_sidecar.symlink_to(external)
            with self.assertRaisesRegex(ExportGateError, "symlink"):
                audit_import_sidecars(root, self.expectation)

    def test_source_frame_no_follow_rejects_leaf_and_parent_symlinks(self) -> None:
        pixels = bytes([255, 0, 0, 255]) * (256 * 256)
        fact = {
            "repoPath": "bundle/frame.png",
            "resourcePath": "res://bundle/frame.png",
            "view": "front_3quarter_sw",
            "action": "idle",
            "frameIndex": 1,
        }
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            outside = root / "outside.png"
            outside.write_bytes(_rgba_png(256, 256, pixels))
            bundle = root / "bundle"
            bundle.mkdir()
            leaf = bundle / "frame.png"
            leaf.symlink_to(outside)
            with self.assertRaisesRegex(ExportGateError, "symlink"):
                source_frame_expectation(root, fact)
            leaf.unlink()
            bundle.rmdir()
            outside_directory = root / "outside-directory"
            outside_directory.mkdir()
            (outside_directory / "frame.png").write_bytes(outside.read_bytes())
            bundle.symlink_to(outside_directory, target_is_directory=True)
            with self.assertRaisesRegex(ExportGateError, "symlink"):
                source_frame_expectation(root, fact)

    def test_source_frame_no_follow_rejects_ancestor_swap_during_open(self) -> None:
        pixels = bytes([255, 0, 0, 255]) * (256 * 256)
        fact = {
            "repoPath": "bundle/frame.png",
            "resourcePath": "res://bundle/frame.png",
            "view": "front_3quarter_sw",
            "action": "idle",
            "frameIndex": 1,
        }
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            bundle = root / "bundle"
            bundle.mkdir()
            (bundle / "frame.png").write_bytes(_rgba_png(256, 256, pixels))
            displaced_bundle = root / "bundle-before-swap"
            real_open = export_gate_module.os.open
            swapped = False

            def swapping_open(path, flags, mode=0o777, *, dir_fd=None):
                nonlocal swapped
                if str(path) == "frame.png" and dir_fd is not None and not swapped:
                    swapped = True
                    bundle.rename(displaced_bundle)
                    bundle.mkdir()
                    (bundle / "frame.png").write_bytes(b"attacker-controlled")
                kwargs = {} if dir_fd is None else {"dir_fd": dir_fd}
                return real_open(path, flags, mode, **kwargs)

            with mock.patch.object(export_gate_module.os, "open", side_effect=swapping_open):
                with self.assertRaisesRegex(ExportGateError, "parent changed"):
                    source_frame_expectation(root, fact)
            self.assertTrue(swapped)

    def test_png_source_raw_and_exact_import_oracle_hashes_stay_independent(self) -> None:
        source_pixels = bytearray(bytes([255, 0, 0, 255]) * (256 * 256))
        source_pixels[:4] = bytes([37, 91, 143, 0])
        transparent_rgb_changed = bytearray(source_pixels)
        transparent_rgb_changed[:4] = bytes([201, 202, 203, 0])
        opaque_rgb_changed = bytearray(source_pixels)
        opaque_rgb_changed[4:8] = bytes([0, 0, 255, 255])
        encoded = _rgba_png(256, 256, bytes(source_pixels))
        width, height, decoded = decode_rgba8_png(encoded)
        self.assertEqual((width, height, decoded), (256, 256, bytes(source_pixels)))

        fact = {
            "repoPath": "bundle/frame.png",
            "resourcePath": "res://bundle/frame.png",
            "view": "front_3quarter_sw",
            "action": "idle",
            "frameIndex": 1,
        }
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            target = root / fact["repoPath"]
            target.parent.mkdir(parents=True)
            target.write_bytes(encoded)
            original = source_frame_expectation(root, fact)
            target.write_bytes(_rgba_png(256, 256, bytes(transparent_rgb_changed)))
            transparent_replacement = source_frame_expectation(root, fact)
            self.assertNotEqual(
                original["sourceFileSha256"],
                transparent_replacement["sourceFileSha256"],
            )
            self.assertNotEqual(
                original["sourceRgba8Sha256"],
                transparent_replacement["sourceRgba8Sha256"],
            )
            self.assertEqual(
                original["expectedImportedRgba8RawSha256"],
                transparent_replacement["expectedImportedRgba8RawSha256"],
            )
            self.assertEqual(
                original["expectedImportedPixelContractSha256"],
                transparent_replacement["expectedImportedPixelContractSha256"],
            )
            target.write_bytes(_rgba_png(256, 256, bytes(opaque_rgb_changed)))
            opaque_replacement = source_frame_expectation(root, fact)
            self.assertNotEqual(
                original["expectedImportedRgba8RawSha256"],
                opaque_replacement["expectedImportedRgba8RawSha256"],
            )
            self.assertNotEqual(
                original["expectedImportedPixelContractSha256"],
                opaque_replacement["expectedImportedPixelContractSha256"],
            )
            target.unlink()
            with self.assertRaises(ExportGateError):
                source_frame_expectation(root, fact)
            target.write_bytes(_rgba_png(2, 2, bytes([0, 0, 0, 255]) * 4))
            with self.assertRaisesRegex(ExportGateError, "256x256"):
                source_frame_expectation(root, fact)

    def test_expectation_is_exact_180_per_form_and_self_authenticates_pixels(self) -> None:
        errors = validate_expectation_document(
            self.expectation,
            self.expectation["registrySha256"],
            self.runtime_cache,
            self.expectation["runtimeCacheSha256"],
            source_audit_snapshot=self.source_audit_snapshot,
        )
        self.assertEqual(errors, [])
        self.assertEqual(
            sha256_bytes(self.source_audit_snapshot["rawBytes"]),
            self.expectation["sourceAuditReportSha256"],
        )
        self.assertEqual(
            json.loads(self.source_audit_snapshot["rawBytes"].decode("utf-8")),
            self.source_audit_snapshot["document"],
        )
        self.assertEqual(len(self.expectation["forms"]), 3)
        self.assertTrue(
            all(len(form["frames"]) == EXPECTED_RUNTIME_FRAME_COUNT for form in self.expectation["forms"])
        )

        mutations = {
            "root_extra_key": lambda value: value.__setitem__("legacyPixelDigest", "0" * 64),
            "root_missing_key": lambda value: value.pop("sourceAuditReportSha256"),
            "form_extra_key": lambda value: value["forms"][0].__setitem__(
                "legacyPixelTreeSha256", "0" * 64
            ),
            "form_missing_key": lambda value: value["forms"][0].pop(
                "expectedImportedPixelTreeSha256"
            ),
            "frame_extra_key": lambda value: value["forms"][0]["frames"][0].__setitem__(
                "legacyVisibleRgba8Sha256", "0" * 64
            ),
            "frame_missing_key": lambda value: value["forms"][0]["frames"][0].pop(
                "expectedImportedRgba8RawSha256"
            ),
            "source_audit_digest": lambda value: value.__setitem__(
                "sourceAuditReportSha256", "0" * 64
            ),
            "missing_frame": lambda value: value["forms"][0]["frames"].pop(),
            "reverse_order": lambda value: value["forms"][0]["frames"].reverse(),
            "junk_form": lambda value: value["forms"].append(None),
            "junk_frame": lambda value: value["forms"][0]["frames"].append(None),
            "sibling_root": lambda value: value["forms"][0].__setitem__(
                "petRoot", "client/godot/assets/pets/sibling"
            ),
            "sibling_path": lambda value: value["forms"][0]["frames"][0].__setitem__(
                "path", "res://assets/pets/sibling/views/front_3quarter_sw/idle/idle-1.png"
            ),
            "pixel_raw_digest": lambda value: value["forms"][0]["frames"][0].__setitem__(
                "expectedImportedRgba8RawSha256", "0" * 64
            ),
            "pixel_contract_digest": lambda value: value["forms"][0]["frames"][0].__setitem__(
                "expectedImportedPixelContractSha256", "0" * 64
            ),
            "source_rgba_digest": lambda value: value["forms"][0]["frames"][0].__setitem__(
                "sourceRgba8Sha256", "0" * 64
            ),
            "source_file_digest": lambda value: value["forms"][0]["frames"][0].__setitem__(
                "sourceFileSha256", "0" * 64
            ),
            "frame_binding": lambda value: value["forms"][0]["frames"][0].__setitem__(
                "frameImportBindingSha256", "0" * 64
            ),
            "fix_alpha_false": lambda value: value["forms"][0]["frames"][0][
                "importOptions"
            ]["parameterLiterals"].__setitem__("process/fix_alpha_border", "false"),
            "premult_true": lambda value: value["forms"][0]["frames"][0][
                "importOptions"
            ]["parameterLiterals"].__setitem__("process/premult_alpha", "true"),
            "oracle_threshold": lambda value: value["importOracle"][
                "fixAlphaEdges"
            ].__setitem__("alphaEligibleBelow", 19),
            "oracle_radius": lambda value: value["importOracle"][
                "fixAlphaEdges"
            ].__setitem__("radius", 3),
            "oracle_tie": lambda value: value["importOracle"][
                "fixAlphaEdges"
            ].__setitem__("tieBreak", "last_candidate"),
            "oracle_premult": lambda value: value["importOracle"].__setitem__(
                "premultiplyAfterFixAlphaEdges", True
            ),
            "oracle_commit": lambda value: value["importOracle"].__setitem__(
                "godotSourceCommit", "0" * 40
            ),
            "oracle_binary": lambda value: value["importOracle"].__setitem__(
                "godotExecutableSha256", "0" * 64
            ),
            "pixel_contract": lambda value: value.__setitem__(
                "pixelContractId", "beastbound_texture_rgba8_sha256_v1"
            ),
            "wrong_dimension": lambda value: value["forms"][0]["frames"][0].__setitem__(
                "width", 128
            ),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                changed = copy.deepcopy(self.expectation)
                mutate(changed)
                self.assertTrue(
                    validate_expectation_document(
                        changed,
                        self.expectation["registrySha256"],
                        self.runtime_cache,
                        self.expectation["runtimeCacheSha256"],
                        source_audit_snapshot=self.source_audit_snapshot,
                    )
                )

        for label, mutate_snapshot in {
            "source_audit_raw": lambda snapshot: snapshot.__setitem__(
                "rawBytes", snapshot["rawBytes"] + b" "
            ),
            "source_audit_document": lambda snapshot: snapshot[
                "document"
            ].__setitem__("formalReleaseCount", 3),
            "source_audit_sha": lambda snapshot: snapshot.__setitem__(
                "sha256", "0" * 64
            ),
        }.items():
            with self.subTest(label=label):
                changed_snapshot = copy.deepcopy(self.source_audit_snapshot)
                mutate_snapshot(changed_snapshot)
                self.assertTrue(
                    validate_expectation_document(
                        self.expectation,
                        self.expectation["registrySha256"],
                        self.runtime_cache,
                        self.expectation["runtimeCacheSha256"],
                        source_audit_snapshot=changed_snapshot,
                    )
                )

    def test_three_form_pixel_trees_use_contract_order_not_lexical_path_order(self) -> None:
        expected_contract_trees = {
            "wuli_evolved_crystal_earth8_water2": (
                "f3d4bcd41f1a355d19d7388b89d54370370852b075741134d2eabc58deb9e088"
            ),
            "driftfox_evolved_moon_gale_wind7_water3": (
                "620a408a113c60eff4e3ef8fa79606151a5197a7414a95e1b1709ae3ffac1665"
            ),
            "bui_novice_sprout_earth5_wind5": (
                "88ad64e7be261da4b3508d59d6793fc7dcfd1aeab2e3bf0f58d59394f3161713"
            ),
        }
        for form in self.expectation["forms"]:
            form_id = form["formId"]
            cache_entry = next(
                entry
                for entry in self.runtime_cache["entries"]
                if entry["formId"] == form_id
            )
            self.assertEqual(
                source_runtime_tree_sha256(
                    form_id,
                    form["petRoot"],
                    form["frames"],
                ),
                cache_entry["battleRuntimeTreeSha256"],
            )
            self.assertEqual(
                form["expectedImportedPixelTreeSha256"],
                expected_contract_trees[form_id],
            )
            changed_frames = copy.deepcopy(form["frames"])
            changed_frames[0]["sourceFileSha256"] = "0" * 64
            self.assertNotEqual(
                source_runtime_tree_sha256(
                    form_id,
                    form["petRoot"],
                    changed_frames,
                ),
                cache_entry["battleRuntimeTreeSha256"],
            )
            lexical_frames = sorted(
                (
                    {
                        "path": frame["path"],
                        "sourceFileSha256": frame["sourceFileSha256"],
                        "sourceRgba8Sha256": frame["sourceRgba8Sha256"],
                        "importOracleSha256": frame["importOracleSha256"],
                        "importOptions": frame["importOptions"],
                        "expectedImportedRgba8RawSha256": frame[
                            "expectedImportedRgba8RawSha256"
                        ],
                        "expectedImportedPixelContractSha256": frame[
                            "expectedImportedPixelContractSha256"
                        ],
                        "frameImportBindingSha256": frame[
                            "frameImportBindingSha256"
                        ],
                    }
                    for frame in form["frames"]
                ),
                key=lambda frame: frame["path"],
            )
            lexical_sha = canonical_json_sha256(
                {
                    "contractId": PIXEL_CONTRACT_ID,
                    "formId": form_id,
                    "petRoot": form["petRoot"],
                    "frames": lexical_frames,
                }
            )
            self.assertNotEqual(lexical_sha, expected_contract_trees[form_id])
        gdscript = (
            REPO_ROOT / "client/godot/scripts/qa/pet_action_asset_check.gd"
        ).read_text(encoding="utf-8")
        self.assertIn("expectation_paths_in_contract_order != canonical_paths", gdscript)
        self.assertIn("for path in canonical_paths:", gdscript)
        self.assertNotIn("\tcanonical_paths.sort()", gdscript)
        self.assertIn(
            'expectation.get("forms", null),\n\t\t"PCK export expectation forms"',
            gdscript,
        )
        self.assertIn(
            'expectation_form.get("frames", null),\n\t\t"PCK export expectation frames"',
            gdscript,
        )

    def test_external_expectation_rejects_relative_res_user_and_project_paths(self) -> None:
        for invalid in (
            "relative/expectation.json",
            "res://expectation.json",
            "user://expectation.json",
            REPO_ROOT / "expectation.json",
        ):
            with self.subTest(path=str(invalid)), self.assertRaises(ExportGateError):
                validate_external_expectation_path(invalid, REPO_ROOT)
        with tempfile.TemporaryDirectory() as temporary:
            valid = validate_external_expectation_path(
                Path(temporary) / "expectation.json",
                REPO_ROOT,
            )
            self.assertTrue(valid.is_absolute())

    def test_phase404_startup_wiring_preserves_npc_preview_branch_structure(self) -> None:
        main_source = (REPO_ROOT / "client/godot/scripts/main.gd").read_text(
            encoding="utf-8"
        )
        guard = '\t\tif appearance_id != "":'
        call = "\t\t\tNpcArtCatalog.enable_qa_preview_appearance(appearance_id)"
        startup = "func _run_pet_battle_user_root_preflight_if_requested() -> bool:"

        def source_errors(source: str) -> list[str]:
            lines = source.splitlines()
            errors: list[str] = []
            for expected in (guard, call, startup):
                if lines.count(expected) != 1:
                    errors.append(f"missing or duplicate source line: {expected.strip()}")
            if errors:
                return errors
            guard_index = lines.index(guard)
            call_index = lines.index(call)
            startup_index = lines.index(startup)
            if call_index != guard_index + 1:
                errors.append("NPC preview call is not the direct if-body")
            if startup_index <= call_index:
                errors.append("Phase404 startup preflight escaped its top-level position")
            return errors

        self.assertEqual(source_errors(main_source), [])
        deindented_call = main_source.replace(call, call[1:], 1)
        indented_startup = main_source.replace(startup, "\t" + startup, 1)
        self.assertTrue(source_errors(deindented_call))
        self.assertTrue(source_errors(indented_startup))

    def test_expectation_and_pck_launch_roots_are_disjoint_and_always_cleaned(self) -> None:
        runner_source = (
            REPO_ROOT / "tools/run_pet_battle_export_gate.py"
        ).read_text(encoding="utf-8")
        self.assertNotIn('"--user-data-dir"', runner_source)
        main_source = (REPO_ROOT / "client/godot/scripts/main.gd").read_text(
            encoding="utf-8"
        )
        ready_start = main_source.index("func _ready() -> void:")
        ready_end = main_source.index("\n\nfunc ", ready_start + 1)
        ready_body = main_source[ready_start:ready_end]
        self.assertLess(
            ready_body.index("_run_pet_battle_user_root_preflight_if_requested()"),
            ready_body.index("PetBattleReleaseGate.initialize()"),
        )
        self.assertIn('result["pckProfileSaveEnabled"] = profile_save_enabled', main_source)
        self.assertIn(
            'result["pckServerAccountSession"] = _is_server_account_session()',
            main_source,
        )
        self.assertIn('result["pckAuthAutoBypass"] = auth_auto_bypass', main_source)
        expectation_root: Path | None = None
        launch_root: Path | None = None
        with IsolatedPckLaunchDirectories(REPO_ROOT) as isolated:
            expectation_root = isolated.expectation_root
            launch_root = isolated.pck_launch_root
            self.assertIsNotNone(expectation_root)
            self.assertIsNotNone(launch_root)
            assert expectation_root is not None
            assert launch_root is not None
            self.assertEqual(expectation_root.parent, launch_root.parent)
            sibling_expectation = validate_external_expectation_path(
                expectation_root / "expectation.json",
                REPO_ROOT,
                additional_forbidden_roots=(launch_root,),
            )
            self.assertEqual(sibling_expectation.parent, expectation_root)
            with self.assertRaisesRegex(ExportGateError, "forbidden root"):
                validate_external_expectation_path(
                    launch_root / "inside-user-or-res-root.json",
                    REPO_ROOT,
                    additional_forbidden_roots=(launch_root,),
                )
            symlink_file = expectation_root / "linked-expectation.json"
            symlink_file.symlink_to(launch_root / "target.json")
            with self.assertRaisesRegex(ExportGateError, "symlink"):
                validate_external_expectation_path(
                    symlink_file,
                    REPO_ROOT,
                    additional_forbidden_roots=(launch_root,),
                )
            symlink_directory = expectation_root / "launch-alias"
            symlink_directory.symlink_to(launch_root, target_is_directory=True)
            with self.assertRaisesRegex(ExportGateError, "forbidden root"):
                validate_external_expectation_path(
                    symlink_directory / "expectation.json",
                    REPO_ROOT,
                    additional_forbidden_roots=(launch_root,),
                )
        assert expectation_root is not None
        assert launch_root is not None
        self.assertFalse(expectation_root.exists())
        self.assertFalse(launch_root.exists())

        failed_expectation_root: Path | None = None
        failed_launch_root: Path | None = None
        with self.assertRaisesRegex(RuntimeError, "simulated launch failure"):
            with IsolatedPckLaunchDirectories(REPO_ROOT) as isolated:
                failed_expectation_root = isolated.expectation_root
                failed_launch_root = isolated.pck_launch_root
                raise RuntimeError("simulated launch failure")
        assert failed_expectation_root is not None
        assert failed_launch_root is not None
        self.assertFalse(failed_expectation_root.exists())
        self.assertFalse(failed_launch_root.exists())

        with tempfile.TemporaryDirectory() as temporary:
            parent = Path(temporary) / "ancestor"
            child = parent / "descendant"
            child.mkdir(parents=True)
            with mock.patch.object(
                export_gate_module.tempfile,
                "mkdtemp",
                side_effect=[str(parent), str(child)],
            ):
                with self.assertRaisesRegex(
                    ExportGateError,
                    "siblings|mutually disjoint",
                ):
                    with IsolatedPckLaunchDirectories(REPO_ROOT):
                        pass
            self.assertFalse(parent.exists())

    def test_user_tree_inventory_never_follows_symlinks(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary) / "user-root"
            outside = Path(temporary) / "outside"
            root.mkdir()
            outside.mkdir()
            (outside / "secret-profile.json").write_bytes(b"outside\n")
            (root / "logs").symlink_to(outside, target_is_directory=True)
            inventory = tree_inventory(root)
            self.assertEqual(
                inventory["entries"],
                [{"path": "logs", "kind": "symlink", "target": str(outside)}],
            )
            self.assertNotIn("secret-profile.json", json.dumps(inventory))
            with self.assertRaisesRegex(ExportGateError, "contains symlinks"):
                assert_inventory_has_no_symlinks(inventory, "test user root")

    def test_sandbox_profile_and_repo_root_binding_are_exact_and_deterministic(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            user_root = root / "app_userdata/MockBeastbound"
            user_root.mkdir(parents=True)
            profile = build_pck_sandbox_profile(user_root)
            profile_text = profile["profileBytes"].decode("utf-8")
            denied_root = str(user_root.parent.resolve())
            self.assertEqual(profile["contractId"], PCK_SANDBOX_CONTRACT_ID)
            self.assertIn(f'(literal "{denied_root}")', profile_text)
            self.assertIn(f'(subpath "{denied_root}")', profile_text)
            self.assertEqual(
                profile["profileSha256"],
                hashlib.sha256(profile["profileBytes"]).hexdigest(),
            )
            binding = repo_root_binding(root)
            self.assertEqual(binding, repo_root_binding(root))
            self.assertNotEqual(binding["sha256"], repo_root_binding(user_root)["sha256"])

    def test_pck_preflight_binds_working_user_repo_and_empty_resource_root(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            parent = Path(temporary)
            launch_root = parent / "launch"
            expectation_root = parent / "expectation"
            user_root = parent / "app_userdata/MockBeastbound"
            repo_root = parent / "repo"
            godot = parent / "Godot"
            for directory in (launch_root, expectation_root, user_root, repo_root):
                directory.mkdir(parents=True)
            godot.write_bytes(b"godot")
            expectation_path = expectation_root / "expectation.json"
            binding = repo_root_binding(repo_root)
            result = {
                "ok": True,
                "workingDir": str(launch_root.resolve()),
                "resourceRoot": "",
                "userRoot": str(user_root.resolve()),
                "executablePath": str(godot.resolve()),
                "repoRoot": binding["path"],
                "repoRootSha256": binding["sha256"],
            }
            facts = validate_pck_preflight(
                result,
                pck_launch_root=launch_root,
                godot_executable=godot,
                expectation_path=expectation_path,
                real_user_root=user_root,
                repo_root=repo_root,
                repo_binding_sha256=binding["sha256"],
            )
            self.assertEqual(facts["workingDir"], launch_root.resolve())
            self.assertEqual(facts["resourceRoot"], "")
            for label, mutation in (
                ("ok_int", {"ok": 1}),
                ("working", {"workingDir": str(parent / "wrong-launch")}),
                ("working_relative", {"workingDir": "relative"}),
                ("working_whitespace", {"workingDir": " " + str(launch_root)}),
                ("working_type", {"workingDir": launch_root}),
                ("resource", {"resourceRoot": "res://"}),
                ("user", {"userRoot": str(parent / "wrong-user")}),
                ("executable", {"executablePath": str(parent / "wrong-godot")}),
                ("repo", {"repoRoot": str(parent / "wrong-repo")}),
                ("repo_sha", {"repoRootSha256": "0" * 64}),
                ("repo_sha_upper", {"repoRootSha256": binding["sha256"].upper()}),
                ("extra", {"extra": True}),
            ):
                with self.subTest(label=label), self.assertRaises(ExportGateError):
                    validate_pck_preflight(
                        result | mutation,
                        pck_launch_root=launch_root,
                        godot_executable=godot,
                        expectation_path=expectation_path,
                        real_user_root=user_root,
                        repo_root=repo_root,
                        repo_binding_sha256=binding["sha256"],
                    )
            missing = dict(result)
            missing.pop("resourceRoot")
            with self.assertRaisesRegex(ExportGateError, "keys are not exact"):
                validate_pck_preflight(
                    missing,
                    pck_launch_root=launch_root,
                    godot_executable=godot,
                    expectation_path=expectation_path,
                    real_user_root=user_root,
                    repo_root=repo_root,
                    repo_binding_sha256=binding["sha256"],
                )
            for label, overlapping_path in (
                ("working", launch_root / "expectation.json"),
                ("user", user_root / "expectation.json"),
                ("repo", repo_root / "expectation.json"),
            ):
                with self.subTest(overlap=label), self.assertRaisesRegex(
                    ExportGateError,
                    "overlaps",
                ):
                    validate_pck_preflight(
                        result,
                        pck_launch_root=launch_root,
                        godot_executable=godot,
                        expectation_path=overlapping_path,
                        real_user_root=user_root,
                        repo_root=repo_root,
                        repo_binding_sha256=binding["sha256"],
                    )

    def test_phase404_pck_source_uses_sandbox_and_working_directory_contract(self) -> None:
        runner_source = (
            REPO_ROOT / "tools/run_pet_battle_export_gate.py"
        ).read_text(encoding="utf-8")
        main_source = (REPO_ROOT / "client/godot/scripts/main.gd").read_text(
            encoding="utf-8"
        )
        qa_source = (
            REPO_ROOT / "client/godot/scripts/qa/pet_action_asset_check.gd"
        ).read_text(encoding="utf-8")
        self.assertNotIn("clone_godot_editor_for_pck", runner_source)
        self.assertNotIn("selfContained", runner_source)
        self.assertNotIn("_sc_", runner_source)
        self.assertNotIn('"--user-data-dir"', runner_source)
        pck_check_start = runner_source.index("def run_sandboxed_godot_check(")
        pck_check_end = runner_source.index("\n\ndef run_export_gate(", pck_check_start)
        pck_check_body = runner_source[pck_check_start:pck_check_end]
        self.assertIn('"--main-pack"', pck_check_body)
        self.assertIn("sandboxed_command(", pck_check_body)
        export_start = runner_source.index("def _run_export_gate_managed_impl(")
        export_body = runner_source[export_start:]
        self.assertEqual(export_body.count("run_sandboxed_godot_check("), 2)
        self.assertNotIn('str(godot_path),\n                "--headless",\n                "--main-pack"', export_body)
        self.assertIn('var working_directory_handle := DirAccess.open(".")', main_source)
        self.assertIn('"workingDir": working_directory', main_source)
        self.assertIn('result["pckWorkingDir"]', main_source)
        self.assertIn('if resource_root != "":', qa_source)
        self.assertIn('"exportWorkingDir": export_working_dir', qa_source)
        self.assertIn('"exportResourceRoot": export_resource_root', qa_source)
        self.assertIn('"exportRepoRootSha256": export_repo_root_sha', qa_source)
        self.assertNotIn("expected_resource_root", runner_source)
        self.assertNotIn("subprocess.run(", runner_source)
        self.assertIn("start_new_session=True", runner_source)
        self.assertIn(
            "_signal_process_group(process_group_id, signal.SIGTERM",
            runner_source,
        )
        self.assertIn(
            "_signal_process_group(process_group_id, signal.SIGKILL",
            runner_source,
        )
        self.assertIn("if _process_group_exists(process.pid):", runner_source)
        self.assertIn("raise ProcessGroupLeak(", runner_source)
        self.assertEqual(export_body.count("run_godot_with_user_inventory("), 5)
        self.assertIn("write_final_attestation_atomic(", export_body)

    def test_pinned_godot_version_accepts_only_exact_single_line_build(self) -> None:
        self.assertEqual(
            parse_pinned_godot_version(f"{PINNED_GODOT_VERSION}\n"),
            PINNED_GODOT_VERSION,
        )
        self.assertEqual(
            parse_pinned_godot_version(f"{PINNED_GODOT_VERSION}\r\n"),
            PINNED_GODOT_VERSION,
        )
        for output in (
            "",
            "4.7.stable.official\n",
            "4.6.stable\n",
            f"warning\n{PINNED_GODOT_VERSION}\n",
            "14.7\n",
            f" {PINNED_GODOT_VERSION}\n",
            f"{PINNED_GODOT_VERSION} \n",
            f"{PINNED_GODOT_VERSION}\r",
            f"noise\v{PINNED_GODOT_VERSION}\n",
            f"noise\f{PINNED_GODOT_VERSION}\n",
            f"noise\x85{PINNED_GODOT_VERSION}\n",
            f"noise\u2028{PINNED_GODOT_VERSION}\n",
            f"noise\u2029{PINNED_GODOT_VERSION}\n",
            f"{PINNED_GODOT_VERSION}\n\n",
        ):
            with self.subTest(output=output), self.assertRaises(ExportGateError):
                parse_pinned_godot_version(output)

    def test_help_and_lane_attestation_require_raw_lf_or_crlf_lines(self) -> None:
        valid_help = (
            "  -e, --editor  Start the editor.\r\n"
            "  -p, --project-manager  Start project manager.\n"
        )
        self.assertEqual(
            export_gate_module.validate_pinned_godot_help(valid_help),
            {"editor": True, "projectManager": True},
        )
        qa_lane = {
            "customUserDirName": export_gate_module.QA_LANE_CUSTOM_USER_DIR_NAME,
            "feature": export_gate_module.QA_LANE_FEATURE,
            "lane": export_gate_module.QA_LANE,
            "godotLaneRoot": "/tmp/BeastboundOdysseyQA_Automation",
        }
        marker = export_gate_module.QA_LANE_ATTESTATION_PREFIX + json.dumps(
            {
                "customUserDirName": export_gate_module.QA_LANE_CUSTOM_USER_DIR_NAME,
                "feature": export_gate_module.QA_LANE_FEATURE,
                "lane": export_gate_module.QA_LANE,
                "status": "passed",
                "userDataRoot": "/tmp/BeastboundOdysseyQA_Automation",
            },
            separators=(",", ":"),
        )
        self.assertEqual(
            export_gate_module.parse_qa_lane_attestation(marker + "\r\n", qa_lane)[
                "status"
            ],
            "passed",
        )
        separators = ("\r", "\v", "\f", "\x00", "\x1f", "\x7f", "\x80", "\x85", "\u2028", "\u2029")
        for separator in separators:
            with self.subTest(separator=repr(separator)):
                spoofed_help = (
                    "noise"
                    + separator
                    + "  --editor editor\n  --project-manager manager\n"
                )
                with self.assertRaises(ExportGateError):
                    export_gate_module.validate_pinned_godot_help(spoofed_help)
                with self.assertRaises(ExportGateError):
                    export_gate_module.parse_qa_lane_attestation(
                        "noise" + separator + marker + "\n",
                        qa_lane,
                    )
        for mutation in (
            marker + "\n" + marker,
            "prefix " + marker,
            marker.replace('"lane":"automation"', '"lane":"client1"'),
        ):
            with self.assertRaises(ExportGateError):
                export_gate_module.parse_qa_lane_attestation(mutation, qa_lane)

    def test_authoritative_godot_json_requires_raw_column_zero_and_unique_keys(self) -> None:
        expected = {"nested": {"value": 1}, "ok": True}
        raw = json.dumps(expected, separators=(",", ":"))
        parsers = (
            (
                export_gate_module.extract_user_root_preflight,
                export_gate_module.USER_ROOT_PREFLIGHT_PREFIX,
            ),
            (extract_godot_result, export_gate_module.RESULT_PREFIX),
        )
        forbidden_controls = [
            chr(codepoint)
            for codepoint in range(0x20)
            if codepoint not in (0x0A, 0x0D)
        ] + ["\r", "\x7f", "\x80", "\x85", "\x9f", "\u2028", "\u2029"]
        for parser, prefix in parsers:
            with self.subTest(parser=parser.__name__, mode="valid"):
                self.assertEqual(parser("noise\r\n" + prefix + raw + "\n"), expected)
            canonical_numeric_raw = (
                '{"max":9007199254740991.0,"negativeZero":-0.0,'
                '"ok":true,"scaled":18e1}'
            )
            with self.subTest(parser=parser.__name__, mode="canonical_numbers"):
                self.assertEqual(
                    parser(prefix + canonical_numeric_raw),
                    {
                        "max": MAX_SAFE_JSON_INTEGER,
                        "negativeZero": 0,
                        "ok": True,
                        "scaled": 180,
                    },
                )
            mutations = {
                "noncolumn": "junk " + prefix + raw,
                "valid_plus_noncolumn": prefix + raw + "\njunk " + prefix + raw,
                "duplicate_line": prefix + raw + "\n" + prefix + raw,
                "duplicate_top": prefix + '{"ok":false,"ok":true}',
                "duplicate_nested": prefix
                + '{"ok":true,"nested":{"value":false,"value":true}}',
                "nan": prefix + '{"ok":true,"value":NaN}',
                "positive_infinity": prefix + '{"ok":true,"value":Infinity}',
                "negative_infinity": prefix + '{"ok":true,"value":-Infinity}',
                "positive_exponent_overflow": prefix + '{"ok":true,"value":1e999}',
                "negative_exponent_overflow": prefix + '{"ok":true,"value":-1e999}',
                "huge_positive_exponent": prefix
                + '{"ok":true,"value":1e100000000}',
                "huge_negative_exponent": prefix
                + '{"ok":true,"value":-1e100000000}',
                "positive_exponent_underflow": prefix + '{"ok":true,"value":1e-999}',
                "negative_exponent_underflow": prefix + '{"ok":true,"value":-1e-999}',
                "rounds_up_to_integer": prefix
                + '{"ok":true,"value":179.9999999999999999999}',
                "rounds_down_to_integer": prefix
                + '{"ok":true,"value":180.0000000000000000001}',
                "non_integral": prefix + '{"ok":true,"value":0.5}',
                "unsafe_integer": prefix
                + '{"ok":true,"value":9007199254740992}',
                "unsafe_integral_decimal": prefix
                + '{"ok":true,"value":9007199254740992.0}',
                "leading_json_space": prefix + " " + raw,
                "trailing_json_space": prefix + raw + " ",
                "two_objects": prefix + raw + raw,
                "array_root": prefix + "[]",
                "sgr": "\x1b[0m" + prefix + raw,
            }
            for label, mutation in mutations.items():
                with self.subTest(parser=parser.__name__, mutation=label), self.assertRaises(
                    ExportGateError
                ):
                    parser(mutation)
            for control in forbidden_controls:
                with self.subTest(
                    parser=parser.__name__, control=f"U+{ord(control):04X}"
                ), self.assertRaises(ExportGateError):
                    parser("noise" + control + prefix + raw + "\n")

    def test_lane_prepare_and_inspection_reject_overlap_bool_and_nonexact_strings(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            owner = "a" * 32
            lane_root = root / "qa-lane"
            real_root = root / "real-user-root"
            prepared = {
                "customUserDirName": export_gate_module.QA_LANE_CUSTOM_USER_DIR_NAME,
                "editorCustomFeatures": export_gate_module.QA_LANE_FEATURE,
                "feature": export_gate_module.QA_LANE_FEATURE,
                "godotLaneRoot": str(lane_root),
                "godotRealRoot": str(real_root),
                "lane": export_gate_module.QA_LANE,
                "laneEntryCount": 1,
                "laneInventorySha256": "b" * 64,
                "laneRoot": str(lane_root),
                "owner": owner,
                "realEntryCount": 2,
                "realInventorySha256": "c" * 64,
                "realRoot": str(real_root),
                "status": "prepared",
            }
            self.assertEqual(
                export_gate_module.validate_prepared_qa_lane(prepared, owner),
                prepared,
            )
            for label, changed_lane, changed_real in (
                ("same", real_root, real_root),
                ("lane_under_real", real_root / "lane", real_root),
                ("real_under_lane", lane_root, lane_root / "real"),
            ):
                mutation = prepared | {
                    "laneRoot": str(changed_lane),
                    "godotLaneRoot": str(changed_lane),
                    "realRoot": str(changed_real),
                    "godotRealRoot": str(changed_real),
                }
                with self.subTest(overlap=label), self.assertRaises(ExportGateError):
                    export_gate_module.validate_prepared_qa_lane(mutation, owner)

            class StringSubclass(str):
                pass

            with self.assertRaisesRegex(ExportGateError, "exact strings"):
                export_gate_module.validate_prepared_qa_lane(
                    prepared | {"status": StringSubclass("prepared")},
                    owner,
                )
            qa_lane = {
                **prepared,
                "lastLaneEntryCount": 1,
                "lastLaneInventorySha256": "b" * 64,
            }
            inspection = {
                "feature": export_gate_module.QA_LANE_FEATURE,
                "inspectionSha256": "d" * 64,
                "lane": export_gate_module.QA_LANE,
                "laneEntryCount": 0,
                "laneInventorySha256": "e" * 64,
                "laneRoot": str(lane_root),
                "laneRootState": "absent",
                "lockedRealInventorySha256": "",
                "owner": owner,
                "ownerCanaryState": "not_applicable",
                "pendingLockPayloadSha256": "",
                "pendingLockState": "absent",
                "pendingLockedRealInventorySha256": "",
                "pendingOwnerPayloadSha256": "",
                "pendingOwnerState": "not_applicable",
                "publishedLockState": "absent",
                "realEntryCount": 2,
                "realInventorySha256": "c" * 64,
                "realRoot": str(real_root),
                "status": "inspected",
            }
            self.assertEqual(
                export_gate_module.validate_post_cleanup_inspection(
                    inspection,
                    qa_lane,
                ),
                inspection,
            )
            for mutation in (
                {"laneEntryCount": False},
                {"status": StringSubclass("inspected")},
            ):
                with self.assertRaises(ExportGateError):
                    export_gate_module.validate_post_cleanup_inspection(
                        inspection | mutation,
                        qa_lane,
                    )

    def test_source_check_precedes_any_artifact_mutation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output = root / ".run/evidence/phase404-source-first"
            output.mkdir(parents=True)
            stale_final = output / "pet-battle-final-release-attestation.json"
            stale_qa = output / "pet-battle-export-qa-report.json"
            stale_final.write_text('{"status":"stale"}\n', encoding="utf-8")
            stale_qa.write_text('{"status":"stale"}\n', encoding="utf-8")

            def fail_source(_repo_root: Path):
                self.assertTrue(stale_final.is_file())
                self.assertTrue(stale_qa.is_file())
                raise ExportGateError("source contract first error")

            scope = mock.Mock()
            with mock.patch.object(
                export_gate_module,
                "validate_qa_lane_source_contract",
                side_effect=fail_source,
            ), mock.patch.object(
                export_gate_module,
                "assert_exact_allowlist",
                scope,
            ), self.assertRaisesRegex(ExportGateError, "source contract first"):
                export_gate_module.run_export_gate(
                    repo_root=root,
                    godot_executable=root / "unused-godot",
                    output_dir=output,
                )
            scope.assert_not_called()
            self.assertTrue(stale_final.is_file())
            self.assertTrue(stale_qa.is_file())

    def test_untrusted_prepare_attempt_is_unknown_and_never_cleaned(self) -> None:
        failures = (
            ProcessGroupTimeout(["helper", "prepare"], 1.0, "", ""),
            export_gate_module.ProcessGroupLeak(["helper", "prepare"], "", ""),
            ExportGateError("prepare identity payload rejected after helper side effects"),
        )
        for index, failure in enumerate(failures):
            with self.subTest(failure=type(failure).__name__), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                output = root / ".run/evidence/phase404-prepare-unknown"

                def fail_impl(*, lifecycle_context: dict[str, object], **_kwargs):
                    lifecycle_context.update(
                        {
                            "sourceContractPassed": True,
                            "attemptId": f"{index + 1:x}" * 32,
                            "qaLaneAttempted": True,
                            "qaLaneOwner": "a" * 32,
                            "qaLaneId": export_gate_module.QA_LANE,
                            "cleaned": False,
                        }
                    )
                    raise failure

                with mock.patch.object(
                    export_gate_module,
                    "_run_export_gate_managed_impl",
                    side_effect=fail_impl,
                ), mock.patch.object(
                    export_gate_module,
                    "verify_qa_lane_or_preserve",
                ) as verify, mock.patch.object(
                    export_gate_module,
                    "cleanup_qa_lane",
                ) as cleanup, self.assertRaises(type(failure)):
                    export_gate_module.run_export_gate(
                        repo_root=root,
                        godot_executable=root / "unused-godot",
                        output_dir=output,
                    )
                verify.assert_not_called()
                cleanup.assert_not_called()
                marker = json.loads(
                    (output / "pet-battle-export-gate-failure.json").read_text(
                        encoding="utf-8"
                    )
                )
                self.assertEqual(marker["qaLaneDisposition"], "unknown")
                self.assertFalse(marker["qaLanePreserved"])
                self.assertFalse(marker["cleanupTrusted"])
                self.assertTrue(marker["preservationRequired"])

        source = (REPO_ROOT / "tools/run_pet_battle_export_gate.py").read_text(
            encoding="utf-8"
        )
        managed = source[source.index("def _run_export_gate_managed_impl(") :]
        self.assertLess(
            managed.index('lifecycle_context["qaLaneAttempted"] = True'),
            managed.index("qa_lane = prepare_qa_lane("),
        )

    def test_cleanup_returned_then_inspect_failed_is_unknown_not_preserved(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output = root / ".run/evidence/phase404-main-cleanup-inspect-unknown"

            def fail_impl(*, lifecycle_context: dict[str, object], **_kwargs):
                lifecycle_context.update(
                    {
                        "sourceContractPassed": True,
                        "attemptId": "b" * 32,
                        "qaLaneAttempted": True,
                        "qaLane": {"lane": export_gate_module.QA_LANE},
                        "cleanupAttempted": True,
                        "cleanupReturned": True,
                        "cleaned": False,
                    }
                )
                cause = ExportGateError("post-cleanup inspect failed")
                raise export_gate_module.QaLanePreservationRequired(
                    "post-cleanup inspection untrusted",
                    cause=cause,
                ) from cause

            with mock.patch.object(
                export_gate_module,
                "_run_export_gate_managed_impl",
                side_effect=fail_impl,
            ), mock.patch.object(
                export_gate_module,
                "verify_qa_lane_or_preserve",
            ) as verify, mock.patch.object(
                export_gate_module,
                "cleanup_qa_lane",
            ) as cleanup, self.assertRaises(
                export_gate_module.QaLanePreservationRequired
            ):
                export_gate_module.run_export_gate(
                    repo_root=root,
                    godot_executable=root / "unused-godot",
                    output_dir=output,
                )
            verify.assert_not_called()
            cleanup.assert_not_called()
            marker = json.loads(
                (output / "pet-battle-export-gate-failure.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(marker["qaLaneDisposition"], "unknown")
            self.assertFalse(marker["qaLanePreserved"])
            self.assertFalse(marker["cleanupTrusted"])
            self.assertTrue(marker["preservationRequired"])

    def test_cleanup_secondary_keeps_primary_and_publishes_failed_attempt_authority(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output = root / ".run/evidence/phase404-failure-envelope"
            qa_lane = {"lane": export_gate_module.QA_LANE}

            def fail_impl(*, lifecycle_context: dict[str, object], **_kwargs):
                lifecycle_context.update(
                    {
                        "sourceContractPassed": True,
                        "attemptId": "d" * 32,
                        "qaLane": qa_lane,
                        "cleaned": False,
                    }
                )
                raise ExportGateError("primary product failure")

            with mock.patch.object(
                export_gate_module,
                "_run_export_gate_managed_impl",
                side_effect=fail_impl,
            ), mock.patch.object(
                export_gate_module,
                "verify_qa_lane_or_preserve",
                return_value={"status": "verified"},
            ), mock.patch.object(
                export_gate_module,
                "cleanup_qa_lane",
                side_effect=export_gate_module.QaLanePreservationRequired(
                    "cleanup untrusted"
                ),
            ), mock.patch.object(
                export_gate_module,
                "inspect_cleaned_qa_lane",
            ) as inspect, self.assertRaises(ExportGateError) as raised:
                export_gate_module.run_export_gate(
                    repo_root=root,
                    godot_executable=root / "unused-godot",
                    output_dir=output,
                )
            self.assertIn("primary product failure", str(raised.exception))
            self.assertIn("cleanup became untrusted", str(raised.exception))
            self.assertIn("qaLaneDisposition=unknown", str(raised.exception))
            inspect.assert_not_called()
            marker = json.loads(
                (output / "pet-battle-export-gate-failure.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(marker["attemptId"], "d" * 32)
            self.assertEqual(marker["status"], "failed")
            self.assertFalse(marker["qaLanePreserved"])
            self.assertEqual(marker["qaLaneDisposition"], "unknown")
            self.assertFalse(marker["cleanupTrusted"])
            self.assertFalse(marker["preservationRequired"])
            self.assertTrue(marker["passArtifactsInvalidated"])
            self.assertTrue(marker["supersedesPassArtifactsInDirectory"])

    def test_stale_pass_unlink_failure_is_superseded_before_prepare(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output = root / ".run/evidence/phase404-stale-unlink"
            output.mkdir(parents=True)
            stale_final = output / "pet-battle-final-release-attestation.json"
            stale_final.write_text('{"status":"passed"}\n', encoding="utf-8")
            real_unlink = Path.unlink

            def fail_only_stale(path: Path, *args, **kwargs):
                if path.name == stale_final.name:
                    raise OSError("injected unlink denial")
                return real_unlink(path, *args, **kwargs)

            scope = mock.Mock()
            with mock.patch.object(
                export_gate_module,
                "validate_qa_lane_source_contract",
                return_value={"status": "source_contract_passed"},
            ), mock.patch.object(
                export_gate_module,
                "assert_exact_allowlist",
                scope,
            ), mock.patch.object(
                Path,
                "unlink",
                new=fail_only_stale,
            ), self.assertRaises(ExportGateError) as raised:
                export_gate_module.run_export_gate(
                    repo_root=root,
                    godot_executable=root / "unused-godot",
                    output_dir=output,
                )
            self.assertIn("cannot invalidate stale Phase404 authority", str(raised.exception))
            self.assertIn("passArtifactsInvalidated=false", str(raised.exception))
            scope.assert_not_called()
            self.assertTrue(stale_final.is_file())
            marker = json.loads(
                (output / "pet-battle-export-gate-failure.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertFalse(marker["passArtifactsInvalidated"])
            self.assertTrue(marker["supersedesPassArtifactsInDirectory"])

    def test_cleanup_then_inspect_failure_reports_unknown_not_preserved(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output = root / ".run/evidence/phase404-inspect-unknown"

            def fail_impl(*, lifecycle_context: dict[str, object], **_kwargs):
                lifecycle_context.update(
                    {
                        "sourceContractPassed": True,
                        "attemptId": "e" * 32,
                        "qaLane": {"lane": export_gate_module.QA_LANE},
                        "cleaned": False,
                    }
                )
                raise ExportGateError("primary after runtime")

            with mock.patch.object(
                export_gate_module,
                "_run_export_gate_managed_impl",
                side_effect=fail_impl,
            ), mock.patch.object(
                export_gate_module,
                "verify_qa_lane_or_preserve",
                return_value={"status": "verified"},
            ), mock.patch.object(
                export_gate_module,
                "cleanup_qa_lane",
                return_value={"status": "cleaned"},
            ), mock.patch.object(
                export_gate_module,
                "inspect_cleaned_qa_lane",
                side_effect=export_gate_module.QaLanePreservationRequired(
                    "post-cleanup inspect unavailable"
                ),
            ), self.assertRaises(ExportGateError):
                export_gate_module.run_export_gate(
                    repo_root=root,
                    godot_executable=root / "unused-godot",
                    output_dir=output,
                )
            marker = json.loads(
                (output / "pet-battle-export-gate-failure.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(marker["qaLaneDisposition"], "unknown")
            self.assertFalse(marker["qaLanePreserved"])
            self.assertFalse(marker["cleanupTrusted"])
            self.assertFalse(marker["preservationRequired"])

    def test_cleanup_precheck_verify_failure_preserves_without_cleanup_attempt(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output = root / ".run/evidence/phase404-cleanup-precheck-preserve"
            qa_lane = {"lane": export_gate_module.QA_LANE}

            def fail_impl(*, lifecycle_context: dict[str, object], **_kwargs):
                lifecycle_context.update(
                    {
                        "sourceContractPassed": True,
                        "attemptId": "f" * 32,
                        "qaLaneAttempted": True,
                        "qaLane": qa_lane,
                        "cleaned": False,
                    }
                )
                raise ExportGateError("primary product failure")

            verify_error = export_gate_module.QaLanePreservationRequired(
                "cleanup precheck verification drifted"
            )
            cleanup = mock.Mock()
            with mock.patch.object(
                export_gate_module,
                "_run_export_gate_managed_impl",
                side_effect=fail_impl,
            ), mock.patch.object(
                export_gate_module,
                "verify_qa_lane_or_preserve",
                side_effect=verify_error,
            ), mock.patch.object(
                export_gate_module,
                "cleanup_qa_lane",
                cleanup,
            ), self.assertRaisesRegex(ExportGateError, "primary product failure"):
                export_gate_module.run_export_gate(
                    repo_root=root,
                    godot_executable=root / "unused-godot",
                    output_dir=output,
                )
            cleanup.assert_not_called()
            marker = json.loads(
                (output / "pet-battle-export-gate-failure.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(marker["qaLaneDisposition"], "preserved")
            self.assertTrue(marker["qaLanePreserved"])
            self.assertIsNone(marker["cleanupTrusted"])
            self.assertTrue(marker["preservationRequired"])
            self.assertTrue(
                any(
                    "cleanup precheck verification is untrusted" in error
                    for error in marker["secondaryErrors"]
                )
            )

    def test_hostile_exception_formatting_cannot_mask_failure_authority(self) -> None:
        class HostileError(ExportGateError):
            def __str__(self):
                raise RuntimeError("hostile __str__")

            @property
            def args(self):
                raise RuntimeError("hostile args getter")

            @args.setter
            def args(self, _value):
                raise RuntimeError("hostile args setter")

        hostile = HostileError.__new__(HostileError)
        export_gate_module.append_primary_error_context(hostile, ["secondary"])
        self.assertIn(
            "<unprintable HostileError",
            export_gate_module.safe_exception_text(hostile),
        )
        with tempfile.TemporaryDirectory() as temporary:
            marker_path = export_gate_module.write_export_gate_failure_marker(
                Path(temporary),
                attempt_id="a" * 32,
                primary=hostile,
                secondary_errors=["secondary"],
                qa_lane_disposition="unknown",
                cleanup_trusted=False,
                preservation_required=False,
                pass_artifacts_invalidated=True,
            )
            marker = json.loads(marker_path.read_text(encoding="utf-8"))
            self.assertIn("<unprintable HostileError", marker["primaryError"])

    def test_static_audit_and_promotion_never_prepare_a_lane(self) -> None:
        prepare = mock.Mock(side_effect=AssertionError("static path prepared a lane"))
        with mock.patch.object(export_gate_module, "prepare_qa_lane", prepare):
            build_export_expectation(REPO_ROOT)
            promoter_module.promotion_candidate(REPO_ROOT)
        prepare.assert_not_called()

    def test_any_timeout_or_residual_preserves_lane_before_verify(self) -> None:
        qa_lane: dict[str, object] = {}
        for error in (
            ProcessGroupTimeout(["godot"], 1.0, "", ""),
            export_gate_module.ProcessGroupLeak(["godot"], "", ""),
        ):
            verify = mock.Mock()
            with self.subTest(error=type(error).__name__), mock.patch.object(
                export_gate_module,
                "verify_qa_lane_or_preserve",
                verify,
            ), self.assertRaises(type(error)):
                export_gate_module.run_phase_with_qa_lane_verification(
                    Path("/tmp"),
                    qa_lane,
                    "phase",
                    lambda error=error: (_ for _ in ()).throw(error),
                )
            verify.assert_not_called()

    def test_wrapped_containment_errors_are_cycle_safe_and_skip_verify_cleanup(self) -> None:
        timeout = ProcessGroupTimeout(["godot"], 1.0, "partial", "")
        residual = export_gate_module.ProcessGroupLeak(["godot"], "partial", "")
        wrapped_errors: list[BaseException] = []
        for label, containment in (
            ("log write", timeout),
            ("sidecar cleanup", residual),
            ("temporary-root cleanup", timeout),
        ):
            wrapper = ExportGateError(f"{label} failed while unwinding")
            wrapper.__cause__ = containment
            wrapped_errors.append(wrapper)
        cycle_wrapper = ExportGateError("cycle-safe containment lookup")
        cycle_timeout = ProcessGroupTimeout(["godot"], 1.0, "partial", "")
        cycle_wrapper.__cause__ = cycle_timeout
        cycle_wrapper.__context__ = cycle_timeout
        cycle_timeout.__context__ = cycle_wrapper
        self.assertTrue(
            export_gate_module._process_exception_requires_lane_preservation(
                cycle_wrapper
            )
        )
        # Do not raise the deliberately cyclic exception object: CPython's own
        # exception-context normalization may traverse such a user-forged cycle.
        # The production classifier is exercised above; the phase propagation
        # checks below intentionally use ordinary acyclic wrappers.
        cycle_timeout.__context__ = None
        cycle_wrapper.__cause__ = None
        cycle_wrapper.__context__ = None
        for wrapped in wrapped_errors:
            with self.subTest(error=str(wrapped)):
                self.assertTrue(
                    export_gate_module._process_exception_requires_lane_preservation(
                        wrapped
                    )
                )
                verify = mock.Mock()
                with mock.patch.object(
                    export_gate_module,
                    "verify_qa_lane_or_preserve",
                    verify,
                ), self.assertRaises(type(wrapped)):
                    export_gate_module.run_phase_with_qa_lane_verification(
                        Path("/tmp"),
                        {},
                        "phase",
                        lambda wrapped=wrapped: (_ for _ in ()).throw(wrapped),
                    )
                verify.assert_not_called()

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output = root / ".run/evidence/phase404-wrapped-timeout"

            def fail_impl(*, lifecycle_context: dict[str, object], **_kwargs):
                lifecycle_context.update(
                    {
                        "sourceContractPassed": True,
                        "attemptId": "c" * 32,
                        "qaLaneAttempted": True,
                        "qaLane": {"lane": export_gate_module.QA_LANE},
                        "cleaned": False,
                    }
                )
                raise wrapped_errors[0]

            with mock.patch.object(
                export_gate_module,
                "_run_export_gate_managed_impl",
                side_effect=fail_impl,
            ), mock.patch.object(
                export_gate_module,
                "verify_qa_lane_or_preserve",
            ) as verify, mock.patch.object(
                export_gate_module,
                "cleanup_qa_lane",
            ) as cleanup, self.assertRaises(ExportGateError):
                export_gate_module.run_export_gate(
                    repo_root=root,
                    godot_executable=root / "unused-godot",
                    output_dir=output,
                )
            verify.assert_not_called()
            cleanup.assert_not_called()
            marker = json.loads(
                (output / "pet-battle-export-gate-failure.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(marker["qaLaneDisposition"], "preserved")
            self.assertTrue(marker["preservationRequired"])

    def test_logged_timeout_keeps_primary_when_failure_log_write_fails(self) -> None:
        timeout = ProcessGroupTimeout(["godot"], 1.0, "partial stdout", "")
        with tempfile.TemporaryDirectory() as temporary, mock.patch.object(
            export_gate_module,
            "_run_subprocess",
            side_effect=timeout,
        ), mock.patch.object(
            Path,
            "write_text",
            side_effect=OSError("injected evidence write failure"),
        ), self.assertRaises(ProcessGroupTimeout) as raised:
            export_gate_module._run_logged(
                ["godot"],
                cwd=Path(temporary),
                env={},
                log_path=Path(temporary) / "timeout.log",
                timeout_seconds=1.0,
            )
        self.assertIs(raised.exception, timeout)
        self.assertIn("cannot persist settled process failure output", str(timeout))

    def test_logged_product_failures_carry_only_current_settled_stdout(self) -> None:
        current_output = "current invocation output\n"
        cases = (
            ("nonzero", subprocess.CompletedProcess(["godot"], 2, current_output), None),
            (
                "evidence_write",
                subprocess.CompletedProcess(["godot"], 0, current_output),
                OSError("injected current log write failure"),
            ),
            (
                "runtime_diagnostic",
                subprocess.CompletedProcess(["godot"], 0, "ERROR: current failure\n"),
                None,
            ),
        )
        for label, completed, write_error in cases:
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary:
                patches = [
                    mock.patch.object(
                        export_gate_module,
                        "_run_subprocess",
                        return_value=completed,
                    )
                ]
                if write_error is not None:
                    patches.append(
                        mock.patch.object(Path, "write_text", side_effect=write_error)
                    )
                with contextlib.ExitStack() as stack:
                    for patcher in patches:
                        stack.enter_context(patcher)
                    with self.assertRaises(ExportGateError) as raised:
                        export_gate_module._run_logged(
                            ["godot"],
                            cwd=Path(temporary),
                            env={},
                            log_path=Path(temporary) / "current.log",
                            timeout_seconds=1.0,
                        )
                self.assertEqual(
                    getattr(raised.exception, "beastbound_settled_stdout", None),
                    completed.stdout,
                )

    def test_subprocess_base_exception_with_cleanup_error_becomes_residual(self) -> None:
        process = mock.Mock(pid=4242)
        process.communicate.side_effect = KeyboardInterrupt("caller cancellation")
        with mock.patch.object(
            export_gate_module.subprocess,
            "Popen",
            return_value=process,
        ), mock.patch.object(
            export_gate_module,
            "_cleanup_process_group",
            return_value=("partial", "", ["process group still exists"]),
        ), self.assertRaises(export_gate_module.ProcessGroupLeak) as raised:
            export_gate_module._run_subprocess(
                ["mock-godot"],
                cwd=Path("/tmp"),
                timeout_seconds=1.0,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
        self.assertIsInstance(raised.exception.__cause__, KeyboardInterrupt)
        self.assertFalse(raised.exception.group_reaped)

    def test_pck_sandbox_runtime_integrity_mutations_fail_closed(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            sandbox = root / "sandbox-exec"
            touch = root / "touch"
            godot = root / "Godot"
            for path, payload in (
                (sandbox, b"sandbox\n"),
                (touch, b"touch\n"),
                (godot, b"godot\n"),
            ):
                path.write_bytes(payload)
            user_root = root / "app_userdata/MockBeastbound"
            user_root.mkdir(parents=True)
            launch_root = root / "launch"
            launch_root.mkdir()
            with mock.patch.object(
                export_gate_module,
                "SANDBOX_EXECUTABLE",
                sandbox,
            ), mock.patch.object(
                export_gate_module,
                "SANDBOX_TOUCH_EXECUTABLE",
                touch,
            ):
                runtime = export_gate_module.create_pck_sandbox_runtime(
                    godot_executable=godot,
                    real_user_root=user_root,
                    pck_launch_root=launch_root,
                )
            assert_pck_sandbox_runtime_integrity(runtime)
            for label, path in (
                ("sandboxExecutable", sandbox),
                ("touchExecutable", touch),
                ("godotExecutable", godot),
                ("profile", Path(runtime["profilePath"])),
            ):
                with self.subTest(label=label):
                    original = path.read_bytes()
                    path.write_bytes(original + b"mutated\n")
                    with self.assertRaises(ExportGateError):
                        assert_pck_sandbox_runtime_integrity(runtime)
                    path.write_bytes(original)

    def test_sandbox_canary_requires_real_denial_and_launch_write(self) -> None:
        for mode in ("success", "deny_escape", "deny_timeout", "allow_failure"):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                sandbox = root / "sandbox-exec"
                touch = root / "touch"
                godot = root / "Godot"
                for path in (sandbox, touch, godot):
                    path.write_bytes(path.name.encode("utf-8"))
                user_root = root / "app_userdata/MockBeastbound"
                user_root.mkdir(parents=True)
                (user_root / "player_profile.json").write_bytes(b"profile\n")
                launch_root = root / "launch"
                output_dir = root / "evidence"
                launch_root.mkdir()
                output_dir.mkdir()
                with mock.patch.object(
                    export_gate_module,
                    "SANDBOX_EXECUTABLE",
                    sandbox,
                ), mock.patch.object(
                    export_gate_module,
                    "SANDBOX_TOUCH_EXECUTABLE",
                    touch,
                ):
                    runtime = export_gate_module.create_pck_sandbox_runtime(
                        godot_executable=godot,
                        real_user_root=user_root,
                        pck_launch_root=launch_root,
                    )

                def fake_canary(command, **_kwargs):
                    target = Path(command[-1])
                    if target.name == ".beastbound-phase404-sandbox-deny-canary":
                        if mode == "deny_timeout":
                            raise ProcessGroupTimeout(
                                [str(value) for value in command],
                                1.0,
                                "partial timeout output",
                                "",
                            )
                        if mode == "deny_escape":
                            target.touch()
                            return mock.Mock(returncode=0, stdout="")
                        return mock.Mock(returncode=1, stdout="Operation not permitted")
                    if mode == "allow_failure":
                        return mock.Mock(returncode=1, stdout="denied unexpectedly")
                    target.touch()
                    return mock.Mock(returncode=0, stdout="")

                with mock.patch.object(
                    export_gate_module,
                    "_run_subprocess",
                    side_effect=fake_canary,
                ):
                    if mode == "success":
                        report = export_gate_module.run_pck_sandbox_canary(
                            runtime,
                            real_user_root=user_root,
                            output_dir=output_dir,
                            env={},
                        )
                        self.assertTrue(report["passed"])
                        self.assertFalse(report["deniedTargetCreated"])
                        self.assertTrue(report["allowedTargetCreated"])
                    else:
                        with self.assertRaises(ExportGateError):
                            export_gate_module.run_pck_sandbox_canary(
                                runtime,
                                real_user_root=user_root,
                                output_dir=output_dir,
                                env={},
                            )
                        failure_report = output_dir / "02_pck_sandbox_canary.json"
                        if mode == "deny_timeout":
                            self.assertFalse(failure_report.exists())
                        else:
                            self.assertTrue(failure_report.is_file())
                            self.assertFalse(
                                json.loads(failure_report.read_text(encoding="utf-8"))["passed"]
                            )
                denied_target = (
                    user_root.parent
                    / ".beastbound-phase404-sandbox-deny-canary"
                )
                self.assertFalse(denied_target.exists())
                self.assertEqual(
                    (user_root / "player_profile.json").read_bytes(),
                    b"profile\n",
                )

    def test_process_timeout_terminates_and_reaps_new_process_group(self) -> None:
        command = ["mock-command", "--hang"]
        cases = (
            (
                "term_reaps_whole_group",
                [
                    subprocess.TimeoutExpired(command, 1.0),
                    ("terminated output", ""),
                ],
                False,
                [True],
                [mock.call(4242, export_gate_module.signal.SIGTERM)],
                "terminated output",
            ),
            (
                "leader_exits_but_descendant_survives_term",
                [
                    subprocess.TimeoutExpired(command, 1.0),
                    ("leader exited output", ""),
                ],
                True,
                [False, True],
                [
                    mock.call(4242, export_gate_module.signal.SIGTERM),
                    mock.call(4242, export_gate_module.signal.SIGKILL),
                ],
                "leader exited output",
            ),
            (
                "leader_and_group_require_kill",
                [
                    subprocess.TimeoutExpired(command, 1.0),
                    subprocess.TimeoutExpired(command, 5.0),
                    ("killed output", ""),
                ],
                True,
                [False, True],
                [
                    mock.call(4242, export_gate_module.signal.SIGTERM),
                    mock.call(4242, export_gate_module.signal.SIGKILL),
                ],
                "killed output",
            ),
        )
        for (
            label,
            communicate_results,
            group_survives_term,
            wait_results,
            signals,
            expected_output,
        ) in cases:
            with self.subTest(label=label):
                process = mock.Mock(pid=4242, returncode=-15)
                process.communicate.side_effect = communicate_results
                with mock.patch.object(
                    export_gate_module.subprocess,
                    "Popen",
                    return_value=process,
                ) as popen, mock.patch.object(
                    export_gate_module.os,
                    "killpg",
                ) as killpg, mock.patch.object(
                    export_gate_module,
                    "_process_group_exists",
                    return_value=group_survives_term,
                ) as group_exists, mock.patch.object(
                    export_gate_module,
                    "_wait_for_process_group_exit",
                    side_effect=wait_results,
                ) as wait_for_group, self.assertRaises(ProcessGroupTimeout) as raised:
                    export_gate_module._run_subprocess(
                        command,
                        cwd=Path("/tmp"),
                        timeout_seconds=1.0,
                        stdout=subprocess.PIPE,
                        stderr=subprocess.STDOUT,
                        text=True,
                    )
                self.assertTrue(popen.call_args.kwargs["start_new_session"])
                self.assertEqual(killpg.call_args_list, signals)
                self.assertGreaterEqual(group_exists.call_count, 1)
                self.assertEqual(
                    wait_for_group.call_args_list,
                    [
                        mock.call(
                            4242,
                            export_gate_module.PROCESS_GROUP_TERMINATE_GRACE_SECONDS,
                        )
                        for _value in wait_results
                    ],
                )
                self.assertEqual(raised.exception.stdout, expected_output)
                self.assertTrue(raised.exception.group_reaped)

    def test_process_timeout_fails_closed_when_group_survives_repeated_kill(self) -> None:
        command = ["mock-command", "--hang"]
        process = mock.Mock(pid=4242, returncode=-15)
        process.communicate.side_effect = [
            subprocess.TimeoutExpired(command, 1.0),
            ("leader exited output", ""),
        ]
        with mock.patch.object(
            export_gate_module.subprocess,
            "Popen",
            return_value=process,
        ), mock.patch.object(
            export_gate_module.os,
            "killpg",
        ) as killpg, mock.patch.object(
            export_gate_module,
            "_process_group_exists",
            return_value=True,
        ), mock.patch.object(
            export_gate_module,
            "_wait_for_process_group_exit",
            side_effect=[False, False, False],
        ) as wait_for_group, self.assertRaises(ProcessGroupTimeout) as raised:
            export_gate_module._run_subprocess(
                command,
                cwd=Path("/tmp"),
                timeout_seconds=1.0,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
        self.assertEqual(
            killpg.call_args_list,
            [
                mock.call(4242, export_gate_module.signal.SIGTERM),
                mock.call(4242, export_gate_module.signal.SIGKILL),
                mock.call(4242, export_gate_module.signal.SIGKILL),
            ],
        )
        self.assertEqual(wait_for_group.call_count, 3)
        self.assertFalse(raised.exception.group_reaped)
        self.assertIn("still exists after repeated SIGKILL", str(raised.exception))

    def test_caller_exception_still_terminates_and_reaps_process_group(self) -> None:
        command = ["mock-command", "--cancelled"]
        process = mock.Mock(pid=4242, returncode=-15)
        process.communicate.side_effect = [
            KeyboardInterrupt("simulated caller cancellation"),
            ("cleanup output", ""),
        ]
        with mock.patch.object(
            export_gate_module.subprocess,
            "Popen",
            return_value=process,
        ), mock.patch.object(
            export_gate_module.os,
            "killpg",
        ) as killpg, mock.patch.object(
            export_gate_module,
            "_process_group_exists",
            return_value=False,
        ), mock.patch.object(
            export_gate_module,
            "_wait_for_process_group_exit",
            return_value=True,
        ) as wait_for_group, self.assertRaisesRegex(
            KeyboardInterrupt,
            "caller cancellation",
        ):
            export_gate_module._run_subprocess(
                command,
                cwd=Path("/tmp"),
                timeout_seconds=1.0,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
        self.assertEqual(
            killpg.call_args_list,
            [mock.call(4242, export_gate_module.signal.SIGTERM)],
        )
        self.assertEqual(process.communicate.call_count, 2)
        wait_for_group.assert_called_once_with(
            4242,
            export_gate_module.PROCESS_GROUP_TERMINATE_GRACE_SECONDS,
        )

    def test_successful_parent_with_live_background_descendant_is_reaped_and_rejected(self) -> None:
        child_script = r"""
import os
import signal
import time

read_fd, write_fd = os.pipe()
child_pid = os.fork()
if child_pid == 0:
    os.close(read_fd)
    signal.signal(signal.SIGTERM, signal.SIG_IGN)
    for descriptor in (0, 1, 2):
        try:
            os.close(descriptor)
        except OSError:
            pass
    os.write(write_fd, b"ready")
    os.close(write_fd)
    time.sleep(30)
    os._exit(0)
os.close(write_fd)
os.read(read_fd, 5)
os.close(read_fd)
print(os.getpid(), flush=True)
os._exit(0)
"""
        with mock.patch.object(
            export_gate_module,
            "PROCESS_GROUP_TERMINATE_GRACE_SECONDS",
            0.25,
        ), self.assertRaises(export_gate_module.ProcessGroupLeak) as raised:
            export_gate_module._run_subprocess(
                [sys.executable, "-c", child_script],
                cwd=Path("/tmp"),
                timeout_seconds=5.0,
                stdout=subprocess.PIPE,
                stderr=subprocess.STDOUT,
                text=True,
            )
        process_group_id = int(str(raised.exception.stdout).strip())
        self.assertTrue(raised.exception.group_reaped)
        self.assertFalse(export_gate_module._process_group_exists(process_group_id))

    def test_final_atomic_write_removes_stale_and_postcheck_failure_artifacts(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            final_path = root / "final.json"
            qa_path = root / "qa.json"
            final_bytes = b'{"status":"passed"}\n'
            qa_bytes = b'{"status":"passed","qa":true}\n'
            qa_path.write_bytes(qa_bytes)
            qa_sha = hashlib.sha256(qa_bytes).hexdigest()
            final_path.write_bytes(b"stale final\n")
            written_sha = write_final_attestation_atomic(
                final_path,
                final_bytes,
                qa_report_path=qa_path,
                qa_report_sha256=qa_sha,
            )
            self.assertEqual(written_sha, hashlib.sha256(final_bytes).hexdigest())
            self.assertEqual(final_path.read_bytes(), final_bytes)
            self.assertEqual(list(root.glob(".final.json.*.tmp")), [])

            final_path.write_bytes(b"stale again\n")
            with self.assertRaisesRegex(ExportGateError, "changed before"):
                write_final_attestation_atomic(
                    final_path,
                    final_bytes,
                    qa_report_path=qa_path,
                    qa_report_sha256="0" * 64,
                )
            self.assertFalse(final_path.exists())

            qa_path.write_bytes(qa_bytes)
            real_sha256_file = export_gate_module._sha256_file
            qa_hash_calls = 0

            def mutate_qa_before_commit(path: Path) -> str:
                nonlocal qa_hash_calls
                if Path(path) == qa_path:
                    qa_hash_calls += 1
                    if qa_hash_calls == 2:
                        qa_path.write_bytes(b"drifted before commit\n")
                return real_sha256_file(path)

            with mock.patch.object(
                export_gate_module,
                "_sha256_file",
                side_effect=mutate_qa_before_commit,
            ), self.assertRaisesRegex(ExportGateError, "before final commit"):
                write_final_attestation_atomic(
                    final_path,
                    final_bytes,
                    qa_report_path=qa_path,
                    qa_report_sha256=qa_sha,
                )
            self.assertFalse(final_path.exists())
            self.assertEqual(list(root.glob(".final.json.*.tmp")), [])

            qa_path.write_bytes(qa_bytes)
            real_replace = export_gate_module.os.replace

            def publish_then_interrupt(source, destination):
                real_replace(source, destination)
                raise KeyboardInterrupt("injected immediately after publication")

            real_path_unlink = Path.unlink

            def forbid_final_rollback(path: Path, *args, **kwargs):
                if path == final_path:
                    raise AssertionError("committed final must never be rolled back")
                return real_path_unlink(path, *args, **kwargs)

            with mock.patch.object(
                export_gate_module.os,
                "replace",
                side_effect=publish_then_interrupt,
            ), mock.patch.object(Path, "unlink", new=forbid_final_rollback):
                committed_sha = write_final_attestation_atomic(
                    final_path,
                    final_bytes,
                    qa_report_path=qa_path,
                    qa_report_sha256=qa_sha,
                )
            self.assertEqual(committed_sha, hashlib.sha256(final_bytes).hexdigest())
            self.assertEqual(final_path.read_bytes(), final_bytes)
            self.assertEqual(list(root.glob(".final.json.*.tmp")), [])

    def test_outer_gate_recognizes_final_committed_before_managed_return(self) -> None:
        for committed_hint, injected in (
            (True, KeyboardInterrupt("after writer return")),
            (False, MemoryError("during managed success-result construction")),
        ):
            with self.subTest(committed_hint=committed_hint), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                output = (
                    root / ".run/evidence/phase404-final-commit-window"
                ).resolve()
                output.mkdir(parents=True)
                attempt_id = "d" * 32
                qa_report = {
                    "qaLaneLifecycle": {"attemptId": attempt_id},
                    "status": "passed",
                }
                final = {"attemptId": attempt_id, "status": "passed"}
                qa_bytes = json.dumps(qa_report, separators=(",", ":")).encode()
                final_bytes = json.dumps(final, separators=(",", ":")).encode()
                qa_path = output / "pet-battle-export-qa-report.json"
                final_path = output / "pet-battle-final-release-attestation.json"
                qa_path.write_bytes(qa_bytes)
                final_path.write_bytes(final_bytes)
                expected_result = {
                    "qaReport": qa_report,
                    "finalReleaseAttestation": final,
                    "finalReleaseAttestationSha256": sha256_bytes(final_bytes),
                    "outputDir": str(output),
                }

                def fail_after_commit(*, lifecycle_context: dict[str, object], **_kwargs):
                    lifecycle_context.update(
                        {
                            "sourceContractPassed": True,
                            "attemptId": attempt_id,
                            "cleaned": True,
                            "finalCommitCandidate": {
                                "attemptId": attempt_id,
                                "finalPath": str(final_path),
                                "finalBytes": final_bytes,
                                "finalSha256": sha256_bytes(final_bytes),
                                "qaReportPath": str(qa_path),
                                "qaReportBytes": qa_bytes,
                                "qaReportSha256": sha256_bytes(qa_bytes),
                                "result": expected_result,
                                "committed": committed_hint,
                            },
                        }
                    )
                    raise injected

                with mock.patch.object(
                    export_gate_module,
                    "_run_export_gate_managed_impl",
                    side_effect=fail_after_commit,
                ):
                    observed = export_gate_module.run_export_gate(
                        repo_root=root,
                        godot_executable=root / "unused-godot",
                        output_dir=output,
                    )
                self.assertEqual(observed, expected_result)
                self.assertEqual(final_path.read_bytes(), final_bytes)
                self.assertEqual(qa_path.read_bytes(), qa_bytes)
                self.assertFalse(
                    (output / "pet-battle-export-gate-failure.json").exists()
                )

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output = root / ".run/evidence/phase404-final-commit-unverifiable"
            output.mkdir(parents=True)
            attempt_id = "e" * 32
            final_path = output / "pet-battle-final-release-attestation.json"
            qa_path = output / "pet-battle-export-qa-report.json"
            final_bytes = b'{"attemptId":"' + attempt_id.encode() + b'","status":"passed"}'
            qa_bytes = b'{"qaLaneLifecycle":{"attemptId":"' + attempt_id.encode() + b'"}}'
            final_path.write_bytes(final_bytes)
            qa_path.write_bytes(b"untrusted post-commit QA read")
            result = {
                "qaReport": {"qaLaneLifecycle": {"attemptId": attempt_id}},
                "finalReleaseAttestation": {"attemptId": attempt_id},
                "finalReleaseAttestationSha256": sha256_bytes(final_bytes),
                "outputDir": str(output),
            }

            def fail_unverifiable(*, lifecycle_context: dict[str, object], **_kwargs):
                lifecycle_context["finalCommitCandidate"] = {
                    "attemptId": attempt_id,
                    "finalPath": str(final_path),
                    "finalBytes": final_bytes,
                    "finalSha256": sha256_bytes(final_bytes),
                    "qaReportPath": str(qa_path),
                    "qaReportBytes": qa_bytes,
                    "qaReportSha256": sha256_bytes(qa_bytes),
                    "result": result,
                    "committed": True,
                }
                raise KeyboardInterrupt("post-commit QA unavailable")

            with mock.patch.object(
                export_gate_module,
                "_run_export_gate_managed_impl",
                side_effect=fail_unverifiable,
            ), self.assertRaises(KeyboardInterrupt):
                export_gate_module.run_export_gate(
                    repo_root=root,
                    godot_executable=root / "unused-godot",
                    output_dir=output,
                )
            self.assertTrue(final_path.is_file())
            self.assertTrue(qa_path.is_file())
            self.assertFalse((output / "pet-battle-export-gate-failure.json").exists())

    def test_sandboxed_godot_check_rejects_engine_errors_and_user_tree_drift(self) -> None:
        for mode in ("engine_error", "user_drift"):
            with self.subTest(mode=mode), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                sandbox = root / "sandbox-exec"
                touch = root / "touch"
                godot = root / "Godot"
                for path in (sandbox, touch, godot):
                    path.write_bytes(path.name.encode("utf-8"))
                user_root = root / "app_userdata/MockBeastbound"
                user_root.mkdir(parents=True)
                profile = user_root / "player_profile.json"
                profile.write_bytes(b"profile\n")
                launch_root = root / "launch"
                output_dir = root / "evidence"
                launch_root.mkdir()
                output_dir.mkdir()
                pck = root / "battle.pck"
                pck.write_bytes(b"immutable PCK")
                with mock.patch.object(
                    export_gate_module,
                    "SANDBOX_EXECUTABLE",
                    sandbox,
                ), mock.patch.object(
                    export_gate_module,
                    "SANDBOX_TOUCH_EXECUTABLE",
                    touch,
                ):
                    runtime = export_gate_module.create_pck_sandbox_runtime(
                        godot_executable=godot,
                        real_user_root=user_root,
                        pck_launch_root=launch_root,
                    )
                baseline = tree_inventory(user_root)
                qa_lane = {
                    "lane": export_gate_module.QA_LANE,
                    "feature": export_gate_module.QA_LANE_FEATURE,
                    "customUserDirName": export_gate_module.QA_LANE_CUSTOM_USER_DIR_NAME,
                    "godotLaneRoot": str(root / "qa-lane"),
                }

                def fake_run_logged(command, **_kwargs):
                    engine_log = Path(command[command.index("--log-file") + 1])
                    engine_log.write_text(
                        "ERROR: sandboxed engine failure\n"
                        if mode == "engine_error"
                        else "Godot Engine 4.7.mock\n",
                        encoding="utf-8",
                    )
                    if mode == "user_drift":
                        profile.write_bytes(b"mutated profile\n")
                    return export_gate_module.QA_LANE_ATTESTATION_PREFIX + json.dumps(
                        {
                            "customUserDirName": export_gate_module.QA_LANE_CUSTOM_USER_DIR_NAME,
                            "feature": export_gate_module.QA_LANE_FEATURE,
                            "lane": export_gate_module.QA_LANE,
                            "status": "passed",
                            "userDataRoot": str(root / "qa-lane"),
                        },
                        separators=(",", ":"),
                    )

                with mock.patch.object(
                    export_gate_module,
                    "_run_logged",
                    side_effect=fake_run_logged,
                ), self.assertRaises(ExportGateError) as raised:
                    export_gate_module.run_sandboxed_godot_check(
                        runtime,
                        label="preflight",
                        godot_arguments=["--", export_gate_module.QA_LANE_ARG],
                        pck_path=pck,
                        expected_pck_sha256=hashlib.sha256(pck.read_bytes()).hexdigest(),
                        real_user_root=user_root,
                        real_user_baseline=baseline,
                        output_dir=output_dir,
                        env={},
                        qa_lane=qa_lane,
                    )
                expected_fragment = (
                    "strict engine log scan failed"
                    if mode == "engine_error"
                    else "inventory changed"
                )
                self.assertIn(expected_fragment, str(raised.exception))
                self.assertTrue((output_dir / "03_real_user_root_after_preflight.json").is_file())

    def test_nonzero_pck_still_requires_exact_main_lane_attestation(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            sandbox = root / "sandbox-exec"
            touch = root / "touch"
            godot = root / "Godot"
            for path in (sandbox, touch, godot):
                path.write_bytes(path.name.encode("utf-8"))
            real_root = root / "app_userdata/MockBeastbound"
            real_root.mkdir(parents=True)
            launch_root = root / "launch"
            output_dir = root / "evidence"
            launch_root.mkdir()
            output_dir.mkdir()
            pck = root / "battle.pck"
            pck.write_bytes(b"immutable PCK")
            with mock.patch.object(
                export_gate_module,
                "SANDBOX_EXECUTABLE",
                sandbox,
            ), mock.patch.object(
                export_gate_module,
                "SANDBOX_TOUCH_EXECUTABLE",
                touch,
            ):
                runtime = export_gate_module.create_pck_sandbox_runtime(
                    godot_executable=godot,
                    real_user_root=real_root,
                    pck_launch_root=launch_root,
                )
            qa_lane = {
                "lane": export_gate_module.QA_LANE,
                "feature": export_gate_module.QA_LANE_FEATURE,
                "customUserDirName": export_gate_module.QA_LANE_CUSTOM_USER_DIR_NAME,
                "godotLaneRoot": str(root / "qa-lane"),
            }
            exact_marker = export_gate_module.QA_LANE_ATTESTATION_PREFIX + json.dumps(
                {
                    "customUserDirName": export_gate_module.QA_LANE_CUSTOM_USER_DIR_NAME,
                    "feature": export_gate_module.QA_LANE_FEATURE,
                    "lane": export_gate_module.QA_LANE,
                    "status": "passed",
                    "userDataRoot": str(root / "qa-lane"),
                },
                separators=(",", ":"),
            )
            outputs = {
                "exact": exact_marker,
                "missing": "Godot nonzero without marker\n",
                "duplicate": exact_marker + "\n" + exact_marker,
                "mismatch": exact_marker.replace(
                    '"userDataRoot":"',
                    '"userDataRoot":"/wrong',
                ),
            }
            baseline = tree_inventory(real_root)
            real_engine_reader = export_gate_module.read_engine_log_snapshot
            real_tree_inventory = export_gate_module.tree_inventory
            for mode, stdout in outputs.items():
                with self.subTest(mode=mode):

                    def fail_nonzero(command, *, log_path: Path, **_kwargs):
                        log_path.write_text(stdout, encoding="utf-8")
                        engine_log = Path(command[command.index("--log-file") + 1])
                        engine_log.write_text("Godot Engine 4.7.mock\n", encoding="utf-8")
                        failure = ExportGateError("command failed with exit 2")
                        failure.beastbound_settled_stdout = stdout
                        raise failure

                    expected = (
                        ExportGateError
                        if mode == "exact"
                        else export_gate_module.QaLanePreservationRequired
                    )
                    engine_reader = mock.Mock(wraps=real_engine_reader)
                    tree_reader = mock.Mock(wraps=real_tree_inventory)
                    with mock.patch.object(
                        export_gate_module,
                        "_run_logged",
                        side_effect=fail_nonzero,
                    ), mock.patch.object(
                        export_gate_module,
                        "read_engine_log_snapshot",
                        engine_reader,
                    ), mock.patch.object(
                        export_gate_module,
                        "tree_inventory",
                        tree_reader,
                    ), self.assertRaises(expected) as raised:
                        export_gate_module.run_sandboxed_godot_check(
                            runtime,
                            label="preflight",
                            godot_arguments=["--", export_gate_module.QA_LANE_ARG],
                            pck_path=pck,
                            expected_pck_sha256=sha256_bytes(pck.read_bytes()),
                            real_user_root=real_root,
                            real_user_baseline=baseline,
                            output_dir=output_dir,
                            env={},
                            qa_lane=qa_lane,
                        )
                    if mode == "exact":
                        self.assertNotIsInstance(
                            raised.exception,
                            export_gate_module.QaLanePreservationRequired,
                        )
                        engine_reader.assert_called_once()
                        self.assertEqual(tree_reader.call_count, 2)
                    else:
                        engine_reader.assert_not_called()
                        self.assertEqual(tree_reader.call_count, 1)

            stale_output_log = output_dir / "03_pck_preflight.log"
            stale_output_log.write_text(exact_marker, encoding="utf-8")
            engine_reader = mock.Mock(wraps=real_engine_reader)
            tree_reader = mock.Mock(wraps=real_tree_inventory)
            with mock.patch.object(
                export_gate_module,
                "_run_logged",
                side_effect=OSError("current invocation stdout persistence failed"),
            ), mock.patch.object(
                export_gate_module,
                "read_engine_log_snapshot",
                engine_reader,
            ), mock.patch.object(
                export_gate_module,
                "tree_inventory",
                tree_reader,
            ), self.assertRaises(
                export_gate_module.QaLanePreservationRequired
            ) as raised:
                export_gate_module.run_sandboxed_godot_check(
                    runtime,
                    label="preflight",
                    godot_arguments=["--", export_gate_module.QA_LANE_ARG],
                    pck_path=pck,
                    expected_pck_sha256=sha256_bytes(pck.read_bytes()),
                    real_user_root=real_root,
                    real_user_baseline=baseline,
                    output_dir=output_dir,
                    env={},
                    qa_lane=qa_lane,
                )
            self.assertIn("attestation is untrusted", str(raised.exception))
            engine_reader.assert_not_called()
            self.assertEqual(tree_reader.call_count, 1)

    def test_external_expectation_sha_binding_is_required_and_reads_bytes_once(self) -> None:
        payload = json.dumps(
            {"schemaVersion": 1, "expectationId": EXPECTATION_ID},
            separators=(",", ":"),
        ).encode("utf-8")
        expected_sha = sha256_bytes(payload)
        path = Path("/tmp/phase404-expectation.json")
        for invalid in ("", "xyz", "0" * 63, "g" * 64):
            with self.subTest(invalid=invalid), self.assertRaisesRegex(
                ExportGateError,
                "missing or invalid",
            ):
                read_external_expectation_snapshot(path, invalid)
        with mock.patch.object(Path, "read_bytes", return_value=payload):
            with self.assertRaisesRegex(ExportGateError, "does not match"):
                read_external_expectation_snapshot(path, "0" * 64)

        tampered_after_first_read = b'{"tampered":true}'
        with mock.patch.object(
            Path,
            "read_bytes",
            side_effect=[payload, tampered_after_first_read],
        ) as reader:
            snapshot = read_external_expectation_snapshot(path, expected_sha)
        self.assertEqual(reader.call_count, 1)
        self.assertEqual(snapshot["document"]["expectationId"], EXPECTATION_ID)
        self.assertEqual(snapshot["sha256"], expected_sha)

        for duplicate_payload in (
            b'{"schemaVersion":1,"schemaVersion":1}',
            b'{"schemaVersion":1,"nested":{"ok":false,"ok":true}}',
        ):
            with self.subTest(duplicate=duplicate_payload), mock.patch.object(
                Path,
                "read_bytes",
                return_value=duplicate_payload,
            ), self.assertRaisesRegex(ExportGateError, "duplicate JSON key"):
                read_external_expectation_snapshot(
                    path,
                    sha256_bytes(duplicate_payload),
                )

        for noncanonical_numeric_payload in (
            b'{"schemaVersion":1e-999,"expectationId":"underflow"}',
            b'{"schemaVersion":179.9999999999999999999,"expectationId":"rounding"}',
            b'{"schemaVersion":9007199254740992,"expectationId":"unsafe"}',
        ):
            with self.subTest(
                noncanonical_numeric=noncanonical_numeric_payload
            ), mock.patch.object(
                Path,
                "read_bytes",
                return_value=noncanonical_numeric_payload,
            ), self.assertRaises(ExportGateError):
                read_external_expectation_snapshot(
                    path,
                    sha256_bytes(noncanonical_numeric_payload),
                )

        gdscript = (
            REPO_ROOT / "client/godot/scripts/qa/pet_action_asset_check.gd"
        ).read_text(encoding="utf-8")
        start = gdscript.index("static func _read_external_expectation")
        end = gdscript.index("\n\nstatic func", start + 1)
        snapshot_body = gdscript[start:end]
        self.assertEqual(snapshot_body.count("get_buffer("), 1)
        self.assertNotIn("get_file_as_string", snapshot_body)
        self.assertIn("_sha256_bytes(content)", snapshot_body)
        self.assertIn("JSON.parse_string(content.get_string_from_utf8())", snapshot_body)
        self.assertNotIn(
            "get_file_as_string(PetBattleReleaseGate.DATA_PATH)",
            gdscript,
        )
        self.assertNotIn(
            "get_file_as_string(PetBattleReleaseGate.RUNTIME_CACHE_PATH)",
            gdscript,
        )
        self.assertIn('startup_release_summary.get("registryRawSha256", "")', gdscript)
        self.assertIn(
            'startup_release_summary.get("runtimeCacheRawSha256", "")',
            gdscript,
        )
        gate_source = (
            REPO_ROOT / "client/godot/scripts/pet/pet_battle_release_gate.gd"
        ).read_text(encoding="utf-8")
        self.assertIn('"registryRawSha256": _registry_raw_sha256', gate_source)
        self.assertIn(
            '"runtimeCacheRawSha256": _runtime_cache_raw_sha256',
            gate_source,
        )
        gate_snapshot_start = gate_source.index("static func _read_json_snapshot")
        gate_snapshot_end = gate_source.index(
            "\n\nstatic func",
            gate_snapshot_start + 1,
        )
        gate_snapshot_body = gate_source[gate_snapshot_start:gate_snapshot_end]
        self.assertEqual(gate_snapshot_body.count("get_buffer("), 1)
        self.assertNotIn("get_file_as_string", gate_snapshot_body)
        self.assertIn('"sha256": _sha256_bytes(content)', gate_snapshot_body)

    def test_expectation_audits_registry_and_cache_from_one_frozen_raw_snapshot(self) -> None:
        for target_name, relative in (
            ("registry", DEFAULT_REGISTRY),
            ("runtime cache", DEFAULT_RUNTIME_CACHE),
        ):
            with self.subTest(target=target_name), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                registry_path = root / DEFAULT_REGISTRY
                cache_path = root / DEFAULT_RUNTIME_CACHE
                registry_path.parent.mkdir(parents=True, exist_ok=True)
                registry_path.write_bytes(REGISTRY_PATH.read_bytes())
                cache_path.write_bytes(CACHE_PATH.read_bytes())
                registry_before = _read_json(registry_path)
                cache_before = cache_path.read_bytes()

                def audit_then_drift(*_args, **kwargs):
                    registry_snapshot = kwargs["registry_snapshot"]
                    runtime_cache_snapshot = kwargs["runtime_cache_snapshot"]
                    self.assertEqual(registry_snapshot["document"], registry_before)
                    self.assertEqual(
                        registry_snapshot["rawBytes"],
                        registry_path.read_bytes(),
                    )
                    self.assertEqual(runtime_cache_snapshot["rawBytes"], cache_before)
                    target = root / relative
                    target.write_bytes(target.read_bytes() + b" \n")
                    return {"status": "passed", "errors": []}

                with mock.patch.object(
                    export_gate_module,
                    "build_report",
                    side_effect=audit_then_drift,
                ):
                    with self.assertRaisesRegex(
                        ExportGateError,
                        "changed during source expectation audit",
                    ):
                        export_gate_module.build_export_expectation(root)

    def test_generated_import_state_guard_restores_sidecars_on_failure(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            project = Path(temporary) / "client/godot"
            cleanup_report_path = Path(temporary) / "cleanup.json"
            existing = project / "assets/existing.png.import"
            existing.parent.mkdir(parents=True)
            existing.write_bytes(b"frozen\n")
            with self.assertRaisesRegex(RuntimeError, "simulated"):
                with GeneratedImportStateGuard(project, cleanup_report_path):
                    (project / ".godot").mkdir()
                    existing.write_bytes(b"changed\n")
                    generated = project / "assets/generated.png.import"
                    generated.write_bytes(b"generated\n")
                    raise RuntimeError("simulated failure")
            self.assertFalse((project / ".godot").exists())
            self.assertEqual(existing.read_bytes(), b"frozen\n")
            self.assertFalse((project / "assets/generated.png.import").exists())
            cleanup = json.loads(cleanup_report_path.read_text(encoding="utf-8"))
            self.assertEqual(cleanup["generatedSidecarCount"], 1)
            self.assertEqual(cleanup["residualGeneratedSidecarCount"], 0)
            self.assertRegex(cleanup["generatedSidecarAggregateSha256"], r"^[0-9a-f]{64}$")

            (project / ".godot").mkdir()
            with self.assertRaisesRegex(ExportGateError, "requires"):
                with GeneratedImportStateGuard(project):
                    pass

    def test_export_runner_success_cleans_generated_state_before_final(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            final_builder_calls: list[bool] = []
            (
                result,
                calls,
                scope_calls,
                output_dir,
                mocked_expectation,
            ) = self._run_mocked_export_gate(
                root,
                final_builder_calls=final_builder_calls,
            )

            final_path = output_dir / "pet-battle-final-release-attestation.json"
            self.assertTrue(final_path.is_file())
            self.assertEqual(
                json.loads(final_path.read_text(encoding="utf-8")),
                result["finalReleaseAttestation"],
            )
            self.assertEqual(
                hashlib.sha256(final_path.read_bytes()).hexdigest(),
                result["finalReleaseAttestationSha256"],
            )
            cleanup = json.loads(
                (output_dir / "05_generated_sidecar_cleanup.json").read_text(
                    encoding="utf-8"
                )
            )
            self.assertEqual(cleanup["generatedSidecarCount"], 1)
            self.assertEqual(cleanup["residualGeneratedSidecarCount"], 0)
            self.assertEqual(cleanup["errors"], [])
            self.assertEqual(result["qaReport"]["pixelContractId"], PIXEL_CONTRACT_ID)
            self.assertEqual(
                result["finalReleaseAttestation"]["pixelContractId"],
                PIXEL_CONTRACT_ID,
            )
            self.assertEqual(
                mocked_expectation["sourceAuditReportSha256"],
                result["qaReport"]["sourceAuditReport"]["sha256"],
            )
            self.assertEqual(
                result["qaReport"]["sourceAuditReport"]["sha256"],
                result["finalReleaseAttestation"]["sourceAuditReportSha256"],
            )
            self.assertEqual(
                result["qaReport"]["cleanupReportSha256"],
                hashlib.sha256(
                    (output_dir / "05_generated_sidecar_cleanup.json").read_bytes()
                ).hexdigest(),
            )
            self.assertFalse((root / "client/godot/.godot").exists())
            self.assertFalse(
                (root / "client/godot/assets/mock-frame.png.import").exists()
            )
            self.assertEqual(scope_calls, [False, True, True, False])
            self.assertEqual(final_builder_calls, [True])

            pck_calls = [
                call for call in calls if "--main-pack" in call["command"]
            ]
            self.assertEqual(len(pck_calls), 4)
            preflight_calls = [
                call
                for call in pck_calls
                if call["env"].get(export_gate_module.USER_ROOT_PREFLIGHT_ENV)
                == "1"
            ]
            qa_pck_calls = [
                call
                for call in pck_calls
                if "--auto-pet-action-asset-check" in call["command"]
            ]
            self.assertEqual(len(preflight_calls), 1)
            self.assertEqual(len(qa_pck_calls), 3)
            bound_shas = {
                call["env"].get(export_gate_module.EXPECTATION_SHA256_ENV, "")
                for call in pck_calls
            }
            self.assertEqual(len(bound_shas), 1)
            self.assertRegex(next(iter(bound_shas)), r"^[0-9a-f]{64}$")
            engine_log_paths: set[str] = set()
            for call in pck_calls:
                expectation_path = call["env"].get(
                    export_gate_module.EXPECTATION_ENV,
                    "",
                )
                self.assertTrue(Path(expectation_path).is_absolute())
                self.assertFalse(Path(expectation_path).parent.exists())
                self.assertFalse(Path(call["cwd"]).exists())
                self.assertNotIn("--user-data-dir", call["command"])
                self.assertIn("--log-file", call["command"])
                engine_log_path = call["command"][
                    call["command"].index("--log-file") + 1
                ]
                self.assertEqual(Path(engine_log_path).parent, Path(call["cwd"]))
                engine_log_paths.add(engine_log_path)
            self.assertEqual(len(engine_log_paths), 4)
            for item in result["qaReport"]["pckEngineLogs"]:
                evidence_path = Path(item["evidencePath"])
                self.assertTrue(evidence_path.is_file())
                self.assertEqual(
                    hashlib.sha256(evidence_path.read_bytes()).hexdigest(),
                    item["sha256"],
                )
            self.assertEqual(
                [item["run"] for item in result["qaReport"]["pckEngineLogs"]],
                ["preflight", "default_bui", "wuli", "driftfox"],
            )
            self.assertTrue(result["qaReport"]["temporaryRootsCleaned"])
            self.assertEqual(result["qaReport"]["resourceRootObserved"], "")
            self.assertEqual(
                result["qaReport"]["pckWorkingDirectory"],
                result["qaReport"]["preflight"]["workingDir"],
            )
            self.assertEqual(
                result["qaReport"]["repoRootBinding"],
                repo_root_binding(root),
            )
            self.assertTrue(result["qaReport"]["sandboxCanary"]["passed"])
            self.assertEqual(
                [pair["label"] for pair in result["qaReport"]["realUserRootRunInventoryPairs"]],
                [
                    "initial_version",
                    "editor_help",
                    "cold_import",
                    "export_pack",
                    "preflight",
                    "default_bui",
                    "wuli",
                    "driftfox",
                    "final_version",
                ],
            )
            self.assertTrue(
                all(
                    pair["unchanged"] is True
                    for pair in result["qaReport"]["realUserRootRunInventoryPairs"]
                )
            )
            self.assertEqual(
                [item["run"] for item in result["qaReport"]["godotCommandSha256s"]],
                [
                    "initial_version",
                    "editor_help",
                    "cold_import",
                    "export_pack",
                    "preflight",
                    "default_bui",
                    "wuli",
                    "driftfox",
                    "final_version",
                ],
            )
            self.assertEqual(
                [item["run"] for item in result["qaReport"]["sandboxCommandSha256s"]],
                ["preflight", "default_bui", "wuli", "driftfox"],
            )
            self.assertEqual(
                result["finalReleaseAttestation"]["godotInvocationCount"],
                9,
            )
            self.assertEqual(
                result["finalReleaseAttestation"]["sandboxedPckRunCount"],
                4,
            )
            self.assertEqual(
                result["qaReport"]["realUserRootBefore"]["treeSha256"],
                result["qaReport"]["realUserRootAfter"]["treeSha256"],
            )
            self.assertNotEqual(
                result["qaReport"]["qaLaneRoot"],
                result["qaReport"]["realRoot"],
            )
            self.assertEqual(
                result["qaReport"]["qaLaneLifecycle"]["godotPhaseLabels"],
                list(export_gate_module.EXPECTED_GODOT_PHASE_LABELS),
            )
            self.assertEqual(
                result["finalReleaseAttestation"]["qaLaneVerificationCount"],
                10,
            )
            self.assertTrue(
                result["finalReleaseAttestation"]["qaLaneAbsentAfterCleanup"]
            )
            self.assertTrue(
                result["finalReleaseAttestation"]["qaLaneLockAbsentAfterCleanup"]
            )
            self.assertEqual(
                [item["run"] for item in result["qaReport"]["pckQaLaneAttestations"]],
                ["preflight", "default_bui", "wuli", "driftfox"],
            )

    def test_export_runner_cleanup_failure_forbids_final_attestation(self) -> None:
        class FailingCleanupGuard:
            def __init__(self, *_args, **_kwargs) -> None:
                pass

            def __enter__(self):
                return self

            def __exit__(self, _exc_type, _exc, _traceback):
                raise ExportGateError("simulated generated-state cleanup failure")

        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output_dir = root / ".run/evidence/phase404-mocked-export"
            final_builder_calls: list[bool] = []
            with self.assertRaisesRegex(ExportGateError, "cleanup failure"):
                self._run_mocked_export_gate(
                    root,
                    guard_factory=FailingCleanupGuard,
                    final_builder_calls=final_builder_calls,
                )
            self.assertFalse(
                (output_dir / "pet-battle-final-release-attestation.json").exists()
            )
            self.assertFalse((output_dir / "pet-battle-export-qa-report.json").exists())
            self.assertEqual(final_builder_calls, [])

    def test_export_runner_deletes_stale_final_before_new_failed_attempt(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            output_dir = root / ".run/evidence/phase404-stale-final"
            final_path = output_dir / "pet-battle-final-release-attestation.json"
            final_path.parent.mkdir(parents=True)
            final_path.write_text('{"status":"stale"}\n', encoding="utf-8")
            build_expectation = mock.Mock()

            def fail_after_stale_is_removed(*_args, **_kwargs):
                self.assertFalse(final_path.exists())
                raise ExportGateError("simulated new scope failure")

            with mock.patch.object(
                export_gate_module,
                "assert_exact_allowlist",
                side_effect=fail_after_stale_is_removed,
            ), mock.patch.object(
                export_gate_module,
                "validate_qa_lane_source_contract",
                return_value={"status": "source_contract_passed"},
            ), mock.patch.object(
                export_gate_module,
                "build_export_expectation",
                build_expectation,
            ):
                with self.assertRaisesRegex(ExportGateError, "scope failure"):
                    export_gate_module.run_export_gate(
                        repo_root=root,
                        godot_executable=root / "unused-godot",
                        output_dir=output_dir,
                    )
                self.assertFalse(final_path.exists())
                self.assertFalse(final_path.is_symlink())
                final_path.symlink_to(root / "missing-stale-attestation-target")
                self.assertTrue(final_path.is_symlink())
                with self.assertRaisesRegex(ExportGateError, "scope failure"):
                    export_gate_module.run_export_gate(
                        repo_root=root,
                        godot_executable=root / "unused-godot",
                        output_dir=output_dir,
                    )
            self.assertFalse(final_path.exists())
            self.assertFalse(final_path.is_symlink())
            build_expectation.assert_not_called()

    def test_cold_import_scope_only_allows_untracked_unstaged_sidecars(self) -> None:
        with tempfile.TemporaryDirectory() as temporary:
            root = Path(temporary)
            product = root / "product.txt"
            import_sidecar = root / "client/godot/assets/pet.png.import"
            uid_sidecar = root / "client/godot/scripts/model.gd.uid"
            product.parent.mkdir(parents=True, exist_ok=True)
            import_sidecar.parent.mkdir(parents=True, exist_ok=True)
            uid_sidecar.parent.mkdir(parents=True, exist_ok=True)
            product.write_text("product", encoding="utf-8")
            import_sidecar.write_text("import", encoding="utf-8")
            uid_sidecar.write_text("uid", encoding="utf-8")
            baseline = [
                {"status": " M", "path": "product.txt"},
                {"status": "??", "path": "client/godot/assets/pet.png.import"},
                {"status": "??", "path": "client/godot/scripts/model.gd.uid"},
            ]
            report = status_scope_report(
                root,
                baseline,
                allowlist=("product.txt",),
                allow_generated_sidecars=True,
            )
            self.assertTrue(report["ok"], report["errors"])
            self.assertEqual(report["productPaths"], ["product.txt"])
            self.assertEqual(report["generatedSidecarCount"], 2)
            self.assertEqual(
                [entry["path"] for entry in report["generatedSidecars"]],
                [
                    "client/godot/assets/pet.png.import",
                    "client/godot/scripts/model.gd.uid",
                ],
            )
            self.assertRegex(report["generatedSidecarAggregateSha256"], r"^[0-9a-f]{64}$")

            invalid_cases = {
                "sidecar_not_allowed": baseline,
                "non_sidecar": baseline + [
                    {"status": "??", "path": "client/godot/assets/generated.tmp"}
                ],
                "staged_sidecar": [
                    baseline[0],
                    {"status": "A ", "path": "client/godot/assets/pet.png.import"},
                ],
                "product_drift": baseline + [
                    {"status": " M", "path": "client/godot/project.godot"}
                ],
                "staged_product": [{"status": "M ", "path": "product.txt"}],
            }
            for label, entries in invalid_cases.items():
                with self.subTest(label=label):
                    changed = status_scope_report(
                        root,
                        entries,
                        allowlist=("product.txt",),
                        allow_generated_sidecars=label != "sidecar_not_allowed",
                    )
                    self.assertFalse(changed["ok"], changed)

    def test_canonical_frame_facts_have_one_exact_frame_index_field(self) -> None:
        facts = list(
            canonical_frame_facts(
                "wuli_evolved_crystal_earth8_water2",
                "client/godot/assets/pets/wuli_evolved_crystal_earth8_water2",
            )
        )
        self.assertEqual(len(facts), EXPECTED_RUNTIME_FRAME_COUNT)
        self.assertEqual(
            set(facts[0]),
            {"formId", "view", "action", "frameIndex", "repoPath", "resourcePath"},
        )
        self.assertIsInstance(facts[0]["frameIndex"], int)

    def test_pck_result_requires_normal_gate_no_preview_180_and_real_pixel_tree(self) -> None:
        form = self.expectation["forms"][0]
        expectation_sha = "1" * 64
        expected_user_root = Path("/tmp/phase404-pck-user")
        expected_working_dir = Path("/tmp/phase404-pck-launch")
        expected_repo_root = Path("/tmp/phase404-repo")
        expected_repo_root_sha = repo_root_binding(expected_repo_root)["sha256"]
        result = {
            "ok": True,
            "formId": form["formId"],
            "canonicalJsonContractId": CANONICAL_JSON_CONTRACT_ID,
            "exportExpectationId": EXPECTATION_ID,
            "exportExpectationContractId": EXPECTATION_CONTRACT_ID,
            "pixelContractId": PIXEL_CONTRACT_ID,
            "importOracleContractId": IMPORT_ORACLE_ID,
            "importOracleSha256": self.expectation["importOracleSha256"],
            "sourceAuditReportSha256": self.expectation[
                "sourceAuditReportSha256"
            ],
            "expectedGodotVersion": PINNED_GODOT_VERSION,
            "expectedGodotSourceCommit": PINNED_GODOT_SOURCE_COMMIT,
            "expectedGodotExecutableSha256": PINNED_GODOT_EXECUTABLE_SHA256,
            "actualGodotVersion": PINNED_GODOT_VERSION,
            "actualGodotSourceCommit": PINNED_GODOT_SOURCE_COMMIT,
            "importFixAlphaBorder": True,
            "importPremultAlpha": False,
            "exportWorkingDir": str(expected_working_dir),
            "exportUserRoot": str(expected_user_root),
            "exportResourceRoot": "",
            "exportRepoRoot": str(expected_repo_root),
            "exportRepoRootSha256": expected_repo_root_sha,
            "exportExpectationMode": True,
            "exportExpectationPathAbsolute": True,
            "exportExpectationExpectedSha256": expectation_sha,
            "exportExpectationSha256": expectation_sha,
            "exportTextureFrameCount": 180,
            "exportTextureExpectedFrameCount": 180,
            "exportTextureTreeSha256": form["expectedImportedPixelTreeSha256"],
            "exportExpectedImportedPixelTreeSha256": form[
                "expectedImportedPixelTreeSha256"
            ],
            "battleFrameCount": 180,
            "battleViews": len(export_gate_module.FORMAL_VIEWS),
            "battleActions": len(export_gate_module.FORMAL_ACTIONS),
            "battleReleaseMode": form["releaseMode"],
            "battleReleaseFormal": form["formalRelease"],
            "battleNormalRuntimeSupported": True,
            "battleNormalRuntimeWarmed": True,
            "battleNormalRuntimeTextureLoaded": True,
            "battleQaPreviewDisabledBefore": True,
            "battleQaPreviewDisabledAfter": True,
            "battleRuntimeTreeFrameCount": 180,
            "battleRuntimeTreeSha256": form["sourceRuntimeTreeSha256"],
            "battleRuntimeTreeVerificationUsec": 0,
            "battleReleaseRegistry": {
                "ok": True,
                "state": "READY",
                "registryId": export_gate_module.RELEASE_REGISTRY_ID,
                "runtimeCacheId": export_gate_module.RUNTIME_CACHE_ID,
                "registryRawSha256": self.expectation["registrySha256"],
                "runtimeCacheRawSha256": self.expectation["runtimeCacheSha256"],
                "releaseSubjectSha256": self.expectation["releaseSubjectSha256"],
                "formalFormIds": sorted(
                    item["formId"]
                    for item in self.expectation["forms"]
                    if item["formalRelease"] is True
                ),
                "legacyCompatibilityFormIds": sorted(
                    item["formId"]
                    for item in self.expectation["forms"]
                    if item["formalRelease"] is False
                ),
                "errors": [],
            },
            "pckProfileSaveEnabled": False,
            "pckServerAccountSession": False,
            "pckAuthAutoBypass": True,
            "pckWorkingDir": str(expected_working_dir),
            "pckUserRoot": str(expected_user_root),
            "pckResourceRoot": "",
            "pckRepoRoot": str(expected_repo_root),
            "pckRepoRootSha256": expected_repo_root_sha,
            "errors": [],
        }
        validation_kwargs = {
            "release_expectation": self.expectation,
            "expected_user_root": expected_user_root,
            "expected_working_dir": expected_working_dir,
            "expected_repo_root": expected_repo_root,
            "expected_repo_root_sha256": expected_repo_root_sha,
        }
        self.assertEqual(set(result), set(PCK_QA_RESULT_KEYS))
        self.assertEqual(
            set(result["battleReleaseRegistry"]), set(PCK_RELEASE_SUMMARY_KEYS)
        )
        self.assertEqual(
            validate_pck_result(result, form, expectation_sha, **validation_kwargs),
            [],
        )
        for key, value in (
            ("pixelContractId", "beastbound_texture_rgba8_sha256_v1"),
            ("sourceAuditReportSha256", "0" * 64),
            ("exportTextureFrameCount", 179),
            ("battleViews", 1),
            ("battleActions", 7),
            ("battleNormalRuntimeSupported", False),
            ("battleQaPreviewDisabledAfter", False),
            ("exportTextureTreeSha256", "0" * 64),
            ("exportExpectedImportedPixelTreeSha256", "0" * 64),
            ("pckProfileSaveEnabled", 1),
            ("pckServerAccountSession", True),
            ("pckAuthAutoBypass", False),
            ("exportUserRoot", "/tmp/wrong-user"),
            ("exportUserRoot", " " + str(expected_user_root.resolve())),
            ("exportUserRoot", expected_user_root.resolve()),
            ("exportWorkingDir", "/tmp/wrong-working-dir"),
            ("exportResourceRoot", "/tmp/nonempty-resource"),
            ("exportRepoRoot", "/tmp/wrong-repo"),
            ("exportRepoRootSha256", "0" * 64),
            ("pckUserRoot", "relative-user"),
            ("pckWorkingDir", "relative-working-dir"),
            ("pckResourceRoot", "res://"),
            ("pckRepoRoot", "relative-repo"),
            ("pckRepoRootSha256", "0" * 64),
        ):
            changed = copy.deepcopy(result)
            changed[key] = value
            self.assertTrue(
                validate_pck_result(
                    changed,
                    form,
                    expectation_sha,
                    **validation_kwargs,
                )
            )
        extra = copy.deepcopy(result)
        extra["exportSourcePixelTreeSha256"] = "0" * 64
        self.assertTrue(
            validate_pck_result(extra, form, expectation_sha, **validation_kwargs)
        )
        for key, value in (
            ("state", "FAILED"),
            ("registryRawSha256", "0" * 64),
            ("formalFormIds", []),
            ("errors", ["tampered"]),
        ):
            changed = copy.deepcopy(result)
            changed["battleReleaseRegistry"][key] = value
            self.assertTrue(
                validate_pck_result(
                    changed,
                    form,
                    expectation_sha,
                    **validation_kwargs,
                )
            )
        release_extra = copy.deepcopy(result)
        release_extra["battleReleaseRegistry"]["legacyPixelTree"] = "0" * 64
        self.assertTrue(
            validate_pck_result(
                release_extra,
                form,
                expectation_sha,
                **validation_kwargs,
            )
        )
        parsed = extract_godot_result(
            "Godot Engine\npet action asset check ready: "
            + json.dumps(result, separators=(",", ":"))
        )
        self.assertEqual(parsed, result)
        qa_source = (
            REPO_ROOT / "client/godot/scripts/qa/pet_action_asset_check.gd"
        ).read_text(encoding="utf-8")
        qa_function_start = qa_source.index("static func _run_export_expectation(")
        qa_return_start = qa_source.index("\treturn {", qa_function_start)
        qa_return_end = qa_source.index("\n\t}", qa_return_start) + 3
        qa_result_keys = re.findall(
            r'^\t\t"([^"]+)":', qa_source[qa_return_start:qa_return_end], re.MULTILINE
        )
        self.assertEqual(len(qa_result_keys), len(set(qa_result_keys)))
        main_source = (REPO_ROOT / "client/godot/scripts/main.gd").read_text(
            encoding="utf-8"
        )
        main_start = main_source.index("func _run_auto_pet_action_asset_check()")
        main_end = main_source.index("\n\nfunc ", main_start)
        main_result_keys = re.findall(
            r'^\tresult\["([^"]+)"\] =',
            main_source[main_start:main_end],
            re.MULTILINE,
        )
        self.assertEqual(len(main_result_keys), len(set(main_result_keys)))
        self.assertEqual(
            set(qa_result_keys) | set(main_result_keys),
            set(PCK_QA_RESULT_KEYS),
        )

    def test_pck_mutation_or_any_qa_failure_forbids_final_attestation(self) -> None:
        with self.assertRaises(ExportGateError):
            assert_pck_unchanged("1" * 64, "2" * 64)
        inventory_pairs = [
            {
                "label": label,
                "beforeTreeSha256": "b" * 64,
                "afterTreeSha256": "b" * 64,
                "beforeReportSha256": "c" * 64,
                "afterReportSha256": "c" * 64,
                "unchanged": True,
            }
            for label in (
                "initial_version",
                "editor_help",
                "cold_import",
                "export_pack",
                "preflight",
                "default_bui",
                "wuli",
                "driftfox",
                "final_version",
            )
        ]
        qa_lane_root = "/tmp/BeastboundOdysseyQA_Automation"
        real_root = "/tmp/Godot/app_userdata/Beastbound Odyssey - 万兽纪元"
        owner = "a" * 32
        lane_sha = "d" * 64
        real_sha = "e" * 64
        prepare_evidence = {
            "customUserDirName": export_gate_module.QA_LANE_CUSTOM_USER_DIR_NAME,
            "editorCustomFeatures": export_gate_module.QA_LANE_FEATURE,
            "feature": export_gate_module.QA_LANE_FEATURE,
            "godotLaneRoot": qa_lane_root,
            "godotRealRoot": real_root,
            "lane": export_gate_module.QA_LANE,
            "laneEntryCount": 1,
            "laneInventorySha256": lane_sha,
            "laneRoot": qa_lane_root,
            "owner": owner,
            "realEntryCount": 2,
            "realInventorySha256": real_sha,
            "realRoot": real_root,
            "status": "prepared",
        }
        verification = {
            "feature": export_gate_module.QA_LANE_FEATURE,
            "godotLaneRoot": qa_lane_root,
            "lane": export_gate_module.QA_LANE,
            "laneEntryCount": 1,
            "laneInventorySha256": lane_sha,
            "laneRoot": qa_lane_root,
            "owner": owner,
            "realEntryCount": 2,
            "realInventorySha256": real_sha,
            "realRoot": real_root,
            "realUnchanged": True,
            "status": "verified",
        }
        cleanup_evidence = {
            "feature": export_gate_module.QA_LANE_FEATURE,
            "lane": export_gate_module.QA_LANE,
            "laneAbsent": True,
            "laneRoot": qa_lane_root,
            "owner": owner,
            "realInventorySha256": real_sha,
            "realRoot": real_root,
            "realUnchanged": True,
            "removedLaneEntryCount": 1,
            "removedLaneInventorySha256": lane_sha,
            "status": "cleaned",
        }
        inspection_evidence = {
            "feature": export_gate_module.QA_LANE_FEATURE,
            "inspectionSha256": "f" * 64,
            "lane": export_gate_module.QA_LANE,
            "laneEntryCount": 0,
            "laneInventorySha256": "0" * 64,
            "laneRoot": qa_lane_root,
            "laneRootState": "absent",
            "lockedRealInventorySha256": "",
            "owner": owner,
            "ownerCanaryState": "not_applicable",
            "pendingLockPayloadSha256": "",
            "pendingLockState": "absent",
            "pendingLockedRealInventorySha256": "",
            "pendingOwnerPayloadSha256": "",
            "pendingOwnerState": "not_applicable",
            "publishedLockState": "absent",
            "realEntryCount": 2,
            "realInventorySha256": real_sha,
            "realRoot": real_root,
            "status": "inspected",
        }
        qa_lane_evidence = {
            "schemaVersion": 1,
            "contractId": export_gate_module.QA_LANE_LIFECYCLE_CONTRACT_ID,
            "attemptId": "f" * 32,
            "sourceContract": {"status": "source_contract_passed"},
            "lane": export_gate_module.QA_LANE,
            "feature": export_gate_module.QA_LANE_FEATURE,
            "customUserDirName": export_gate_module.QA_LANE_CUSTOM_USER_DIR_NAME,
            "qaLaneRoot": qa_lane_root,
            "realRoot": real_root,
            "homeUnchanged": True,
            "prepare": prepare_evidence,
            "initialVerification": verification,
            "godotPhaseVerifications": [
                {"label": label, "verification": copy.deepcopy(verification)}
                for label in export_gate_module.EXPECTED_GODOT_PHASE_LABELS
            ],
            "godotPhaseLabels": list(export_gate_module.EXPECTED_GODOT_PHASE_LABELS),
            "godotPhaseVerificationCount": 9,
            "cleanup": cleanup_evidence,
            "postCleanupInspection": inspection_evidence,
            "laneAbsentAfterCleanup": True,
            "lockAbsentAfterCleanup": True,
        }
        valid_kwargs = {
            "expectation_sha256": "1" * 64,
            "source_audit_report_sha256": "2" * 64,
            "import_oracle_sha256": godot47_import_oracle_sha256(),
            "import_sidecar_audit_sha256": "7" * 64,
            "import_sidecar_audit_aggregate_sha256": "8" * 64,
            "import_sidecar_audit_evidence_aggregate_sha256": "9" * 64,
            "import_sidecar_audit_frame_count": 540,
            "registry_sha256": "2" * 64,
            "runtime_cache_sha256": "3" * 64,
            "pck_before_sha256": "4" * 64,
            "pck_after_sha256": "4" * 64,
            "git_patch_sha256": "5" * 64,
            "export_preset_name": "macOS",
            "export_preset_sha256": "6" * 64,
            "godot_version": PINNED_GODOT_VERSION,
            "godot_executable_sha256": PINNED_GODOT_EXECUTABLE_SHA256,
            "pck_qa_godot_executable_sha256": PINNED_GODOT_EXECUTABLE_SHA256,
            "sandbox_executable_sha256": "9" * 64,
            "sandbox_touch_executable_sha256": "a" * 64,
            "sandbox_profile_sha256": "d" * 64,
            "sandbox_canary_report_sha256": "e" * 64,
            "sandbox_command_aggregate_sha256": "f" * 64,
            "godot_command_aggregate_sha256": "1" * 64,
            "repo_root_binding_sha256": "0" * 64,
            "pck_working_directory": "/tmp/phase404-pck-launch",
            "real_user_root_run_inventory_pairs": inventory_pairs,
            "real_user_root_inventory_before_sha256": "b" * 64,
            "real_user_root_inventory_after_sha256": "b" * 64,
            "pck_engine_log_aggregate_sha256": "c" * 64,
            "temporary_roots_cleaned": True,
            "qa_lane_evidence": qa_lane_evidence,
            "qa_report_sha256": "8" * 64,
            "qa_form_ids": [
                entry["formId"] for entry in self.runtime_cache["entries"]
            ],
            "qa_passed": True,
        }
        with self.assertRaisesRegex(ExportGateError, "forbidden"):
            build_final_release_attestation(**(valid_kwargs | {"qa_passed": False}))
        attestation = build_final_release_attestation(**valid_kwargs)
        missing_schema = copy.deepcopy(qa_lane_evidence)
        missing_schema.pop("schemaVersion")
        extra_root = copy.deepcopy(qa_lane_evidence)
        extra_root["verificationCountClaim"] = 10
        source_extra = copy.deepcopy(qa_lane_evidence)
        source_extra["sourceContract"]["trusted"] = True
        prepare_missing = copy.deepcopy(qa_lane_evidence)
        prepare_missing["prepare"].pop("owner")
        initial_extra = copy.deepcopy(qa_lane_evidence)
        initial_extra["initialVerification"]["trusted"] = True
        phase_missing = copy.deepcopy(qa_lane_evidence)
        phase_missing["godotPhaseVerifications"] = phase_missing[
            "godotPhaseVerifications"
        ][:-1]
        phase_item_extra = copy.deepcopy(qa_lane_evidence)
        phase_item_extra["godotPhaseVerifications"][0]["trusted"] = True
        nested_verification_missing = copy.deepcopy(qa_lane_evidence)
        nested_verification_missing["godotPhaseVerifications"][0][
            "verification"
        ].pop("owner")
        for label, mutation in (
            ("qa_int", {"qa_passed": 1}),
            ("cleanup_int", {"temporary_roots_cleaned": 1}),
            ("hash_int", {"expectation_sha256": 1}),
            ("source_audit_hash", {"source_audit_report_sha256": "0" * 63}),
            ("godot_sha", {"pck_qa_godot_executable_sha256": "d" * 64}),
            ("oracle_sha", {"import_oracle_sha256": "d" * 64}),
            ("sidecar_count", {"import_sidecar_audit_frame_count": 539}),
            (
                "inventory_pair_drift",
                {
                    "real_user_root_run_inventory_pairs": [
                        *inventory_pairs[:-1],
                        inventory_pairs[-1] | {"afterTreeSha256": "d" * 64},
                    ]
                },
            ),
            ("inventory_pair_bool", {"real_user_root_run_inventory_pairs": [inventory_pairs[0] | {"unchanged": 1}, *inventory_pairs[1:]]}),
            ("inventory_pair_order", {"real_user_root_run_inventory_pairs": list(reversed(inventory_pairs))}),
            ("real_user_drift", {"real_user_root_inventory_after_sha256": "d" * 64}),
            ("working_dir_relative", {"pck_working_directory": "relative"}),
            ("empty_preset", {"export_preset_name": ""}),
            ("wrong_godot_version", {"godot_version": "4.6.stable"}),
            (
                "qa_lane_not_absent",
                {
                    "qa_lane_evidence": qa_lane_evidence
                    | {"laneAbsentAfterCleanup": False}
                },
            ),
            ("lifecycle_missing_schema", {"qa_lane_evidence": missing_schema}),
            ("lifecycle_extra_root", {"qa_lane_evidence": extra_root}),
            ("lifecycle_source_extra", {"qa_lane_evidence": source_extra}),
            ("lifecycle_prepare_missing", {"qa_lane_evidence": prepare_missing}),
            ("lifecycle_initial_extra", {"qa_lane_evidence": initial_extra}),
            ("lifecycle_phase_missing", {"qa_lane_evidence": phase_missing}),
            ("lifecycle_phase_item_extra", {"qa_lane_evidence": phase_item_extra}),
            (
                "lifecycle_nested_verification_missing",
                {"qa_lane_evidence": nested_verification_missing},
            ),
        ):
            with self.subTest(label=label), self.assertRaises(ExportGateError):
                build_final_release_attestation(**(valid_kwargs | mutation))
        self.assertEqual(attestation["attestationId"], FINAL_ATTESTATION_ID)
        self.assertEqual(
            attestation["canonicalJsonContractId"],
            CANONICAL_JSON_CONTRACT_ID,
        )
        self.assertEqual(attestation["pixelContractId"], PIXEL_CONTRACT_ID)
        self.assertEqual(attestation["contractId"], FINAL_ATTESTATION_CONTRACT_ID)
        self.assertEqual(attestation["expectationId"], EXPECTATION_ID)
        self.assertEqual(attestation["expectationContractId"], EXPECTATION_CONTRACT_ID)
        self.assertEqual(
            attestation["sourceAuditReportSha256"],
            valid_kwargs["source_audit_report_sha256"],
        )
        self.assertEqual(attestation["qaReportId"], QA_REPORT_ID)
        self.assertEqual(attestation["qaReportContractId"], QA_REPORT_CONTRACT_ID)
        self.assertEqual(attestation["importOracleContractId"], IMPORT_ORACLE_ID)
        self.assertEqual(
            attestation["importSidecarAuditContractId"], IMPORT_SIDECAR_AUDIT_ID
        )
        self.assertEqual(attestation["godotSourceCommit"], PINNED_GODOT_SOURCE_COMMIT)
        self.assertEqual(attestation["status"], "passed")
        self.assertEqual(
            attestation["repoRootBindingContractId"],
            export_gate_module.REPO_ROOT_BINDING_CONTRACT_ID,
        )
        self.assertEqual(
            attestation["pckWorkingDirectoryContractId"],
            export_gate_module.PCK_WORKING_DIRECTORY_CONTRACT_ID,
        )
        for key in (
            "expectationSha256",
            "registrySha256",
            "runtimeCacheSha256",
            "pckSha256",
            "gitPatchSha256",
            "exportPresetSha256",
            "godotExecutableSha256",
            "pckQaGodotExecutableSha256",
            "sandboxExecutableSha256",
            "sandboxTouchExecutableSha256",
            "sandboxProfileSha256",
            "sandboxCanaryReportSha256",
            "sandboxCommandAggregateSha256",
            "godotCommandAggregateSha256",
            "repoRootBindingSha256",
            "pckWorkingDirectorySha256",
            "realUserRootRunInventoryAggregateSha256",
            "realUserRootInventoryBeforeSha256",
            "realUserRootInventoryAfterSha256",
            "pckEngineLogAggregateSha256",
            "qaReportSha256",
            "qaLaneLifecycleSha256",
        ):
            self.assertRegex(attestation[key], r"^[0-9a-f]{64}$")

    def test_exact_twenty_path_freeze_and_patch_digest_are_deterministic(self) -> None:
        self.assertEqual(len(PHASE404_PATH_ALLOWLIST), 20)
        self.assertEqual(len(set(PHASE404_PATH_ALLOWLIST)), 20)
        self.assertEqual(
            set(PHASE404_PATH_ALLOWLIST),
            {
                "client/godot/data/pet_battle_release_registry_v1.json",
                "client/godot/data/pet_battle_release_runtime_cache_v1.json",
                "client/godot/project.godot",
                "client/godot/scripts/main.gd",
                "client/godot/scripts/pet/pet_action_asset_catalog.gd",
                "client/godot/scripts/pet/pet_battle_release_gate.gd",
                "client/godot/scripts/qa/auto_check_coordinator.gd",
                "client/godot/scripts/qa/battle_layout_owner_review_capture.gd",
                "client/godot/scripts/qa/pet_action_asset_check.gd",
                "client/godot/scripts/qa/pet_codex_awakened_owner_review_capture.gd",
                "docs/phase_404_pet_battle_exact_form_release_gate.md",
                "tools/audit_pet_battle_release_gate.py",
                "tools/godot_qa_user_data_lane.py",
                "tools/promote_pet_battle_release_cache.py",
                "tools/run_pet_battle_export_gate.py",
                "tools/run_godot_auto_checks.mjs",
                "tools/test/test_audit_pet_battle_release_gate.py",
                "tools/test/test_godot_qa_user_data_lane.py",
                "tools/test/test_pet_battle_export_gate.py",
                "tools/test/run_godot_auto_checks.test.mjs",
            },
        )
        self.assertEqual(
            set(changed_paths(REPO_ROOT)),
            set(PHASE404_PATH_ALLOWLIST),
        )
        first = git_patch_bytes(REPO_ROOT)
        second = git_patch_bytes(REPO_ROOT)
        self.assertEqual(first, second)
        self.assertEqual(sha256_bytes(first), sha256_bytes(second))

    def test_runner_source_has_no_duplicate_literal_dictionary_keys(self) -> None:
        source_path = REPO_ROOT / "tools/run_pet_battle_export_gate.py"
        syntax = ast.parse(source_path.read_text(encoding="utf-8"))
        duplicates: list[tuple[int, str]] = []
        for node in ast.walk(syntax):
            if not isinstance(node, ast.Dict):
                continue
            seen: set[object] = set()
            for key_node in node.keys:
                if not isinstance(key_node, ast.Constant):
                    continue
                key = key_node.value
                if key in seen:
                    duplicates.append((node.lineno, repr(key)))
                seen.add(key)
        self.assertEqual(duplicates, [])

    def test_expectation_contract_ids_and_source_tree_are_bound(self) -> None:
        self.assertEqual(self.expectation["expectationId"], EXPECTATION_ID)
        self.assertEqual(
            self.expectation["canonicalJsonContractId"],
            CANONICAL_JSON_CONTRACT_ID,
        )
        self.assertEqual(self.expectation["pixelContractId"], PIXEL_CONTRACT_ID)
        self.assertEqual(
            self.expectation["releaseSubjectSha256"],
            self.runtime_cache["releaseSubjectSha256"],
        )
        self.assertEqual(
            canonical_json_sha256(self.expectation),
            canonical_json_sha256(copy.deepcopy(self.expectation)),
        )


if __name__ == "__main__":
    unittest.main()
