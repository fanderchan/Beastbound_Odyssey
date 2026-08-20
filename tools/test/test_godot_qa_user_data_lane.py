from __future__ import annotations

import ast
from contextlib import ExitStack
import hashlib
import os
import re
import signal
import stat
import sys
import tempfile
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest import mock

from tools.godot_qa_user_data_lane import (
    AUTO_CHECK_CONTRACT_FUNCTION_SHA256,
    EDITOR_CUSTOM_FEATURES_ENV,
    HELPER_CONTRACT_FUNCTION_SHA256,
    LOCK_CANARY_PREFIX,
    MAIN_CONTRACT_FUNCTION_SHA256,
    OWNER_CANARY_NAME,
    RECOVERY_NO_PROCESS_CONFIRMATION,
    REAL_PROJECT_DIR_NAME,
    RESERVED_FEATURES,
    RUNNER_CONTRACT_FUNCTION_SHA256,
    RUNNER_SOURCE_SHA256,
    LANES,
    LanePaths,
    LaneSafetyError,
    _is_link_or_reparse,
    _open_current_data_base,
    _require_posix_lane_lifecycle,
    _runner_process_identity,
    _runner_process_state,
    _write_all,
    _write_owner_exclusive,
    cleanup_lane,
    inspect_lane,
    inspect_stale_lane,
    merge_editor_custom_features,
    platform_lane_paths,
    prepare_lane,
    recover_lane,
    recover_stale_lane,
    validate_repository_sources,
    verify_lane,
)


EXPECTED_HELPER_CONTRACT_FUNCTIONS = frozenset("""
_absent_inventory _assert_no_symlink_components _canonical_current_paths
_current_environment_anchor _directory_has_identity _directory_open_flags
_file_open_flags _file_sha256_no_follow _inspection_sha256 _inventory_result
_inventory_tree_path _inventory_tree_posix _is_link_or_reparse _lane_record
_lock_name _lock_payload _lock_real_inventory_sha256 _lock_record _lock_temp_name
_open_current_data_base _open_descendant_directory _open_directory_no_follow
_owner_payload _owner_record _owner_temp_name _parser _path_is_link_or_reparse
_project_contract_lines _publish_regular_file_exclusive _raw_named_function_sources
_read_bounded_regular_payload _read_descriptor_payload _read_lock _read_owner
_read_owner_payload _read_published_authority_payload _read_recoverable_lock
_discover_lock_record
_relative_directory_components _remove_created_regular_file
_remove_directory_contents_posix _remove_empty_directory_posix
_remove_incomplete_lane_for_recovery
_remove_lock_exact _remove_owner_canary_exact _remove_pending_lock
_remove_pending_owner _remove_regular_file_posix _remove_tree_no_follow _remove_tree_path _remove_tree_posix
_require_posix_lane_lifecycle _same_identity _sha256_from_descriptor
_recover_lane_from_inspection _runner_process_identity _runner_process_record
_runner_process_state
_stable_stat_tuple _top_level_assignment_sources _validate_helper_constant_contract
_validate_helper_function_contract _validate_named_function_contract
_validated_owner_token _validated_runner_record _write_all _write_lock_exclusive _write_owner_exclusive
cleanup_lane inspect_lane inspect_stale_lane inventory_tree main merge_editor_custom_features
platform_lane_paths prepare_lane recover_lane recover_stale_lane validate_repository_contract
validate_repository_sources verify_lane
""".split())

EXPECTED_MAIN_CONTRACT_FUNCTIONS = frozenset("""
_active_qa_user_data_features _apply_preview_window_args
_attest_qa_user_data_lane_or_exit _dev_entrypoint_arg _qa_user_data_root_text
_ready _reject_qa_user_data_lane _run_auto_pet_action_asset_check
_run_battle_layout_owner_review_capture
_run_pet_battle_user_root_preflight_if_requested
_run_pet_codex_awakened_owner_review_capture _startup_auth_cli_arg
""".split())

EXPECTED_RUNNER_CONTRACT_FUNCTIONS = frozenset("""
assertExactPayloadKeys assertExistingPathComponentsAreDirectoriesWithoutLinks
assertHex assertJsonKeysUnique assertNonNegativeInteger assertPreflightProbeContained
authenticatedJson autoCheckCompletionContract buildCheck buildGodotLaneEnvironment buildQaLaneSummary
buildRunSummary cleanupQaLane createLanePreservationError createSynchronousLog delay descendantProcessIds
discoverAutoCheckFlags ensureProcessGroupClosed ensureStartupLoginAccount escapeRegExp
evaluatePerformanceResult
expectedAutoCompletionPrefix extraUserArgsForFlag filterFlags gitSha
godotCompileFailureDiagnostic godotHelpHasOption inferQuitAfter isEqualOrDescendantPath
main makeResult markLaneVerificationFailure markProcessGroupResidual normalizeGodotPath
nowStamp parseArgs parseAutoCheckCompletion parseLaneHelperOutput parseQaLaneAttestation
parsePerformanceBoolean parsePerformanceMetric parsePerformanceNumber parseTextAutoCompletionFields
pathsIntersect percentile performanceStats performanceStatusEvidence postAuthJson
preflightGodotEditorBinary prepareCheck prepareQaLane
printSummary processGroupClosureEvidence processGroupExists requestGracefulShutdown
reclaimStaleQaLane runCheck runGodotPreflightProbe runQaLaneHelper safeErrorText safeThrowableProperty splitFlags terminateProcessGroup
terminateWindowsProcessIds usage validateCleanedLanePayload validatePreparedLanePayload
validateQaOutputDirectory validateRecoveredLanePayload validateVerifiedLanePayload
validateStaleLaneInspectionPayload validateStaleLaneRecoveryPayload
validateQaLaneSourceContract verifyQaLane verifyQaLaneOrPreserve windowsProcessRecords writeExclusiveFile
writeLogOrThrow writeProcessEvidence
""".split())


class GodotQaLanePathTests(unittest.TestCase):
    def test_cross_platform_path_vectors(self) -> None:
        mac = platform_lane_paths("automation", platform_name="darwin", environment={"HOME": "/Users/qa"})
        self.assertEqual(mac.data_base, "/Users/qa/Library/Application Support")
        self.assertEqual(mac.lane_root, "/Users/qa/Library/Application Support/BeastboundOdysseyQA_Automation")
        self.assertEqual(
            mac.real_root,
            "/Users/qa/Library/Application Support/Godot/app_userdata/Beastbound Odyssey - 万兽纪元",
        )

        linux_xdg = platform_lane_paths(
            "client1",
            platform_name="linux",
            environment={"HOME": "/home/qa", "XDG_DATA_HOME": "/srv/qa-data"},
        )
        self.assertEqual(linux_xdg.lane_root, "/srv/qa-data/BeastboundOdysseyQA_Client1")
        self.assertEqual(
            linux_xdg.real_root,
            "/srv/qa-data/godot/app_userdata/Beastbound Odyssey - 万兽纪元",
        )

        linux_fallback = platform_lane_paths(
            "client2",
            platform_name="linux",
            environment={"HOME": "/home/qa", "XDG_DATA_HOME": "relative-is-unsafe"},
        )
        self.assertEqual(linux_fallback.data_base, "/home/qa/.local/share")

        windows = platform_lane_paths(
            "automation",
            platform_name="win32",
            environment={"APPDATA": r"C:\Users\qa\AppData\Roaming"},
        )
        self.assertEqual(
            windows.lane_root,
            r"C:\Users\qa\AppData\Roaming\BeastboundOdysseyQA_Automation",
        )
        self.assertEqual(
            windows.real_root,
            r"C:\Users\qa\AppData\Roaming\Godot\app_userdata\Beastbound Odyssey - 万兽纪元",
        )
        self.assertEqual(
            windows.godot_lane_root,
            "C:/Users/qa/AppData/Roaming/BeastboundOdysseyQA_Automation",
        )

    def test_unknown_lane_and_missing_absolute_roots_fail_closed(self) -> None:
        with self.assertRaisesRegex(LaneSafetyError, "unknown"):
            platform_lane_paths("surprise", platform_name="darwin", environment={"HOME": "/tmp"})
        with self.assertRaisesRegex(LaneSafetyError, "absolute HOME"):
            platform_lane_paths("automation", platform_name="darwin", environment={"HOME": "relative"})
        with self.assertRaisesRegex(LaneSafetyError, "absolute APPDATA"):
            platform_lane_paths("automation", platform_name="win32", environment={"APPDATA": "relative"})

    def test_existing_features_are_preserved_and_target_is_unique_last(self) -> None:
        target = LANES["automation"]["feature"]
        merged = merge_editor_custom_features(f"editor_foo,{target},editor_bar,{target}", target)
        self.assertEqual(merged, f"editor_foo,editor_bar,{target}")
        with self.assertRaisesRegex(LaneSafetyError, "conflicting"):
            merge_editor_custom_features(LANES["client1"]["feature"], target)
        with self.assertRaisesRegex(LaneSafetyError, "invalid"):
            merge_editor_custom_features("editor_foo,evil feature", target)

    def test_windows_reparse_attribute_is_treated_as_a_link(self) -> None:
        ordinary = SimpleNamespace(st_mode=stat.S_IFDIR, st_file_attributes=0, st_reparse_tag=0)
        junction = SimpleNamespace(st_mode=stat.S_IFDIR, st_file_attributes=0x400, st_reparse_tag=0)
        tagged = SimpleNamespace(st_mode=stat.S_IFDIR, st_file_attributes=0, st_reparse_tag=0xA0000003)
        self.assertFalse(_is_link_or_reparse(ordinary))
        self.assertTrue(_is_link_or_reparse(junction))
        self.assertTrue(_is_link_or_reparse(tagged))

    def test_windows_lane_lifecycle_is_fail_closed_before_mutation(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        entrypoints = (
            lambda: prepare_lane("automation", owner="1" * 32),
            lambda: verify_lane("automation", "1" * 32, "a" * 64),
            lambda: cleanup_lane("automation", "1" * 32, "a" * 64),
            lambda: inspect_lane("automation", "1" * 32),
            lambda: recover_lane(
                "automation",
                "1" * 32,
                "a" * 64,
                RECOVERY_NO_PROCESS_CONFIRMATION,
            ),
        )
        with ExitStack() as stack:
            stack.enter_context(mock.patch("tools.godot_qa_user_data_lane.os.name", "nt"))
            paths = stack.enter_context(mock.patch.object(helper, "_canonical_current_paths"))
            inventory = stack.enter_context(mock.patch.object(helper, "inventory_tree"))
            mutators = []
            for owner_object, name in (
                (helper.os, "open"),
                (helper.os, "mkdir"),
                (helper.os, "link"),
                (helper.os, "unlink"),
                (helper.os, "rmdir"),
                (helper.os, "rename"),
                (helper.os, "replace"),
                (Path, "mkdir"),
                (Path, "unlink"),
                (Path, "rmdir"),
                (Path, "rename"),
                (Path, "replace"),
            ):
                mutators.append(stack.enter_context(mock.patch.object(
                    owner_object,
                    name,
                    side_effect=AssertionError(f"non-POSIX mutator reached: {name}"),
                )))
            for entrypoint in entrypoints:
                with self.assertRaisesRegex(LaneSafetyError, "fail-closed on Windows"):
                    entrypoint()
            paths.assert_not_called()
            inventory.assert_not_called()
            for mutator in mutators:
                mutator.assert_not_called()

    def test_lane_names_are_exact_catalog_keys_before_all_lifecycle_work(self) -> None:
        for invalid_lane in (" automation ", "Automation"):
            entrypoints = (
                lambda: prepare_lane(invalid_lane, owner="1" * 32),
                lambda: verify_lane(invalid_lane, "1" * 32, "a" * 64),
                lambda: cleanup_lane(invalid_lane, "1" * 32, "a" * 64),
                lambda: inspect_lane(invalid_lane, "1" * 32),
                lambda: recover_lane(
                    invalid_lane,
                    "1" * 32,
                    "a" * 64,
                    RECOVERY_NO_PROCESS_CONFIRMATION,
                ),
            )
            for entrypoint in entrypoints:
                with self.subTest(invalid_lane=invalid_lane, entrypoint=entrypoint):
                    with self.assertRaisesRegex(LaneSafetyError, "unknown QA user-data lane"):
                        entrypoint()

    def test_missing_posix_authority_capability_fails_before_path_or_mutation(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        with (
            mock.patch.object(os, "supports_dir_fd", set()),
            mock.patch.object(helper, "_canonical_current_paths") as paths,
        ):
            with self.assertRaisesRegex(LaneSafetyError, "dir_fd"):
                prepare_lane("automation", owner="1" * 32)
            paths.assert_not_called()


@unittest.skipUnless(os.name == "posix", "safe lane lifecycle currently requires POSIX openat authority")
class GodotQaLaneLifecycleTests(unittest.TestCase):
    def setUp(self) -> None:
        self.temporary = tempfile.TemporaryDirectory()
        temporary_root = Path(self.temporary.name)
        self.home = temporary_root / "home"
        if sys.platform.startswith("win"):
            self.environment = {"APPDATA": str(temporary_root / "AppData" / "Roaming")}
        elif sys.platform == "darwin":
            self.environment = {"HOME": str(self.home)}
        else:
            self.environment = {
                "HOME": str(self.home),
                "XDG_DATA_HOME": str(temporary_root / "xdg-data"),
            }
        current_paths = platform_lane_paths("automation", environment=self.environment)
        self.data_base = Path(current_paths.data_base)
        self.real_root = Path(current_paths.real_root)
        self.data_base.mkdir(parents=True)
        self.environment_patch = mock.patch.dict(os.environ, self.environment, clear=True)
        self.environment_patch.start()
        self.owner_sequence = 0

    def tearDown(self) -> None:
        self.environment_patch.stop()
        self.temporary.cleanup()

    def _symlink_or_skip(self, target: Path, link: Path, *, target_is_directory: bool = False) -> None:
        try:
            link.symlink_to(target, target_is_directory=target_is_directory)
        except OSError as error:
            self.skipTest(f"symbolic-link permission is unavailable: {error}")

    def _recover_after_inspection(self, lane: str, owner: str) -> dict[str, object]:
        inspected = inspect_lane(lane, owner)
        return recover_lane(
            lane,
            owner,
            str(inspected["inspectionSha256"]),
            RECOVERY_NO_PROCESS_CONFIRMATION,
        )

    def _prepare(self, existing_features: str = "") -> dict[str, object]:
        self.owner_sequence += 1
        return prepare_lane(
            "automation",
            existing_features,
            owner=f"{self.owner_sequence:032x}",
        )

    def test_prepare_is_mutually_exclusive_and_cleanup_is_exact(self) -> None:
        original_home = os.environ.get("HOME")
        prepared = self._prepare("existing_feature")
        lane_root = Path(str(prepared["laneRoot"]))
        self.assertTrue(lane_root.is_dir())
        self.assertEqual(os.environ.get("HOME"), original_home)
        self.assertEqual(
            prepared["editorCustomFeatures"],
            "existing_feature,beastbound_qa_automation",
        )
        with self.assertRaisesRegex(LaneSafetyError, "already owned"):
            self._prepare()
        verified = verify_lane(
            "automation",
            str(prepared["owner"]),
            str(prepared["realInventorySha256"]),
        )
        self.assertTrue(verified["realUnchanged"])
        cleaned = cleanup_lane(
            "automation",
            str(prepared["owner"]),
            str(prepared["realInventorySha256"]),
        )
        self.assertTrue(cleaned["laneAbsent"])
        self.assertFalse(lane_root.exists())
        self.assertTrue(self.data_base.is_dir())

    def test_regular_residual_rename_swap_is_detected_and_preserves_lock(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        prepared = self._prepare()
        owner = str(prepared["owner"])
        baseline = str(prepared["realInventorySha256"])
        lane_root = Path(str(prepared["laneRoot"]))
        residual = lane_root / "residual.bin"
        escaped = self.data_base / "escaped-residual.bin"
        replacement = self.data_base / "outside-sentinel.bin"
        lock = self.data_base / ".beastbound_qa_lane_lock_automation.json"
        residual.write_bytes(b"lane-payload")
        replacement.write_bytes(b"outside-sentinel")
        original_unlink = helper.os.unlink
        swapped = False

        def swap_inside_unlink(path: object, *args: object, **kwargs: object) -> None:
            nonlocal swapped
            if not swapped and str(path) == residual.name:
                swapped = True
                os.rename(residual, escaped)
                os.rename(replacement, residual)
            original_unlink(path, *args, **kwargs)

        with mock.patch.object(helper.os, "unlink", side_effect=swap_inside_unlink):
            with self.assertRaisesRegex(LaneSafetyError, "renamed or replaced"):
                cleanup_lane("automation", owner, baseline)
        self.assertTrue(swapped)
        self.assertTrue(lock.is_file())
        self.assertTrue(lane_root.is_dir())
        self.assertTrue(escaped.is_file())
        self.assertFalse(residual.exists())
        escaped.replace(residual)
        cleanup_lane("automation", owner, baseline)

    def test_prepare_owner_failure_root_swap_is_detected_and_preserves_lock(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        owner = "a" * 32
        lane_root = self.data_base / "BeastboundOdysseyQA_Automation"
        escaped_root = self.data_base / "escaped-automation-root"
        lock = self.data_base / ".beastbound_qa_lane_lock_automation.json"
        original_rmdir = helper.os.rmdir
        swapped = False

        def swap_inside_rmdir(path: object, *args: object, **kwargs: object) -> None:
            nonlocal swapped
            if not swapped and str(path) == lane_root.name:
                swapped = True
                os.rename(lane_root, escaped_root)
                lane_root.mkdir(mode=0o700)
            original_rmdir(path, *args, **kwargs)

        with (
            mock.patch.object(helper, "_write_owner_exclusive", side_effect=RuntimeError("owner publish failed")),
            mock.patch.object(helper.os, "rmdir", side_effect=swap_inside_rmdir),
        ):
            with self.assertRaisesRegex(LaneSafetyError, "exact rollback could not be proven"):
                prepare_lane("automation", owner=owner)
        self.assertTrue(swapped)
        self.assertTrue(lock.is_file())
        self.assertTrue(escaped_root.is_dir())
        self.assertFalse(lane_root.exists())
        escaped_root.rename(lane_root)
        recovered = self._recover_after_inspection("automation", owner)
        self.assertEqual(recovered["status"], "recovered")
        self.assertFalse(lane_root.exists())
        self.assertFalse(lock.exists())

    def test_prepare_requires_an_explicit_recoverable_owner_token(self) -> None:
        lane_root = self.data_base / "BeastboundOdysseyQA_Automation"
        with self.assertRaisesRegex(LaneSafetyError, "owner token"):
            prepare_lane("automation")
        self.assertFalse(lane_root.exists())
        self.assertFalse((self.data_base / ".beastbound_qa_lane_lock_automation.json").exists())

    def test_schema_v2_lock_binds_live_runner_and_refuses_active_recovery(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        runner_pid = os.getpid()
        runner_identity = _runner_process_identity(runner_pid)
        self.assertEqual(
            _runner_process_state({"pid": runner_pid, "startIdentitySha256": runner_identity}),
            "active",
        )
        with mock.patch.object(helper.os, "getppid", return_value=runner_pid):
            prepared = prepare_lane(
                "automation",
                owner="7" * 32,
                runner_pid=runner_pid,
            )
        self.assertEqual(prepared["lockSchemaVersion"], 2)
        self.assertEqual(prepared["runnerPid"], runner_pid)
        self.assertEqual(prepared["runnerStartIdentitySha256"], runner_identity)
        inspected = inspect_stale_lane("automation")
        self.assertEqual(inspected["status"], "active")
        with self.assertRaisesRegex(LaneSafetyError, "active"):
            recover_stale_lane("automation", str(inspected["inspectionSha256"]))
        with self.assertRaisesRegex(LaneSafetyError, "active"):
            recover_lane(
                "automation",
                str(prepared["owner"]),
                str(inspect_lane("automation", str(prepared["owner"]))["inspectionSha256"]),
                RECOVERY_NO_PROCESS_CONFIRMATION,
            )
        cleanup_lane(
            "automation",
            str(prepared["owner"]),
            str(prepared["realInventorySha256"]),
        )

    def test_schema_v2_dead_or_reused_runner_is_stale_and_reclaims_after_real_root_drift(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        runner_pid = os.getpid()
        fake_start_identity = "a" * 64
        with (
            mock.patch.object(helper.os, "getppid", return_value=runner_pid),
            mock.patch.object(helper, "_runner_process_identity", return_value=fake_start_identity),
        ):
            prepared = prepare_lane(
                "automation",
                owner="8" * 32,
                runner_pid=runner_pid,
            )
        self.real_root.mkdir(parents=True)
        player_change = self.real_root / "unrelated-player-change.bin"
        player_change.write_bytes(b"preserve-me")
        inspected = inspect_stale_lane("automation")
        real_before_sha256 = str(inspected["realInventorySha256"])
        self.assertEqual(inspected["status"], "stale")
        self.assertNotEqual(
            inspected["realInventorySha256"],
            prepared["realInventorySha256"],
        )
        recovered = recover_stale_lane(
            "automation",
            str(inspected["inspectionSha256"]),
        )
        self.assertEqual(recovered["status"], "recovered")
        self.assertEqual(recovered["priorStatus"], "stale")
        self.assertEqual(
            inspect_stale_lane("automation")["realInventorySha256"],
            real_before_sha256,
        )
        self.assertEqual(player_change.read_bytes(), b"preserve-me")
        self.assertFalse(Path(str(prepared["laneRoot"])).exists())

    def test_stale_recovery_is_bound_to_exact_inspection(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        runner_pid = os.getpid()
        with (
            mock.patch.object(helper.os, "getppid", return_value=runner_pid),
            mock.patch.object(helper, "_runner_process_identity", return_value="b" * 64),
        ):
            prepared = prepare_lane(
                "automation",
                owner="9" * 32,
                runner_pid=runner_pid,
            )
        inspected = inspect_stale_lane("automation")
        residual = Path(str(prepared["laneRoot"])) / "changed-after-stale-inspection.bin"
        residual.write_bytes(b"changed")
        with self.assertRaisesRegex(LaneSafetyError, "changed after inspection"):
            recover_stale_lane("automation", str(inspected["inspectionSha256"]))
        residual.unlink()
        cleanup_lane(
            "automation",
            str(prepared["owner"]),
            str(prepared["realInventorySha256"]),
        )

    def test_legacy_recovery_requires_explicit_confirmation_but_allows_prior_real_drift(self) -> None:
        prepared = prepare_lane("automation", owner="a" * 32)
        self.real_root.mkdir(parents=True)
        player_change = self.real_root / "post-lock-player-change.bin"
        player_change.write_bytes(b"preserve-me")
        inspected = inspect_stale_lane("automation")
        real_before_sha256 = str(inspected["realInventorySha256"])
        self.assertEqual(inspected["status"], "legacy")
        with self.assertRaisesRegex(LaneSafetyError, "explicit no-matching-runner"):
            recover_stale_lane("automation", str(inspected["inspectionSha256"]))
        recovered = recover_stale_lane(
            "automation",
            str(inspected["inspectionSha256"]),
            RECOVERY_NO_PROCESS_CONFIRMATION,
        )
        self.assertEqual(recovered["priorStatus"], "legacy")
        self.assertEqual(
            inspect_stale_lane("automation")["realInventorySha256"],
            real_before_sha256,
        )
        self.assertEqual(player_change.read_bytes(), b"preserve-me")
        self.assertFalse(Path(str(prepared["laneRoot"])).exists())

    def test_runner_identity_mismatch_and_absence_are_stale(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        runner = {"pid": 12345, "startIdentitySha256": "c" * 64}
        with mock.patch.object(helper, "_runner_process_identity", return_value="c" * 64):
            self.assertEqual(_runner_process_state(runner), "active")
        with mock.patch.object(helper, "_runner_process_identity", return_value="d" * 64):
            self.assertEqual(_runner_process_state(runner), "stale")
        with mock.patch.object(helper, "_runner_process_identity", return_value=""):
            self.assertEqual(_runner_process_state(runner), "stale")

    def test_lane_without_lock_is_unsafe_and_preserved(self) -> None:
        lane_root = self.data_base / "BeastboundOdysseyQA_Automation"
        lane_root.mkdir(mode=0o700)
        inspected = inspect_stale_lane("automation")
        self.assertEqual(inspected["status"], "unsafe")
        with self.assertRaisesRegex(LaneSafetyError, "unsafe or ambiguous"):
            recover_stale_lane("automation", str(inspected["inspectionSha256"]))
        self.assertTrue(lane_root.is_dir())
        lane_root.rmdir()

    def test_owner_canary_itself_uses_exclusive_creation(self) -> None:
        lane_root = self.data_base / "BeastboundOdysseyQA_Automation"
        lane_root.mkdir()
        if os.name == "posix":
            data_base_fd, _data_base_stat = _open_current_data_base(self.data_base)
        else:
            data_base_fd = None
        try:
            _write_owner_exclusive(
                lane_root,
                "automation",
                "1" * 32,
                authority_root=self.data_base,
                authority_fd=data_base_fd,
            )
            with self.assertRaises(FileExistsError):
                _write_owner_exclusive(
                    lane_root,
                    "automation",
                    "2" * 32,
                    authority_root=self.data_base,
                    authority_fd=data_base_fd,
                )
        finally:
            if data_base_fd is not None:
                os.close(data_base_fd)

    def test_owner_canary_short_writes_are_completed(self) -> None:
        written_chunks: list[bytes] = []

        def partial_write(_descriptor: int, payload: memoryview) -> int:
            chunk = bytes(payload[:2])
            written_chunks.append(chunk)
            return len(chunk)

        with mock.patch("tools.godot_qa_user_data_lane.os.write", side_effect=partial_write):
            _write_all(123, b"abcdef")
        self.assertEqual(b"".join(written_chunks), b"abcdef")

    def test_cleanup_keeps_sibling_sentinel_unchanged(self) -> None:
        sentinel = self.data_base / "real-player-sentinel.txt"
        sentinel.write_text("do-not-touch", encoding="utf-8")
        prepared = self._prepare()
        cleanup_lane("automation", str(prepared["owner"]), str(prepared["realInventorySha256"]))
        self.assertEqual(sentinel.read_text(encoding="utf-8"), "do-not-touch")

    def test_cleanup_removes_every_residual_before_exact_owner_last(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        prepared = self._prepare()
        lane_root = Path(str(prepared["laneRoot"]))
        (lane_root / "!before-owner.txt").write_text("before", encoding="utf-8")
        (lane_root / "zz-after-owner.txt").write_text("after", encoding="utf-8")
        nested = lane_root / "nested"
        nested.mkdir()
        (nested / "payload.txt").write_text("nested", encoding="utf-8")
        original_remove_owner = helper._remove_owner_canary_exact
        observed: list[list[str]] = []

        def assert_owner_last(lane_root_fd: int, lane: str, owner: str) -> None:
            with os.scandir(lane_root_fd) as iterator:
                observed.append(sorted(entry.name for entry in iterator))
            original_remove_owner(lane_root_fd, lane, owner)

        with mock.patch.object(helper, "_remove_owner_canary_exact", side_effect=assert_owner_last):
            cleanup_lane("automation", str(prepared["owner"]), str(prepared["realInventorySha256"]))
        self.assertEqual(observed, [[".beastbound_qa_lane_owner.json"]])

    def test_final_rmdir_rejects_renamed_original_and_replacement(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        prepared = self._prepare()
        lane_root = Path(str(prepared["laneRoot"]))
        renamed_name = f"{lane_root.name}.renamed-during-rmdir"
        original_rmdir = os.rmdir
        swapped = False

        def replace_before_rmdir(path: str | Path, *args: object, **kwargs: object) -> None:
            nonlocal swapped
            dir_fd = kwargs.get("dir_fd")
            if str(path) == lane_root.name and dir_fd is not None and not swapped:
                swapped = True
                os.rename(
                    lane_root.name,
                    renamed_name,
                    src_dir_fd=dir_fd,
                    dst_dir_fd=dir_fd,
                )
                os.mkdir(lane_root.name, mode=0o700, dir_fd=dir_fd)
            original_rmdir(path, *args, **kwargs)

        with mock.patch.object(helper.os, "rmdir", side_effect=replace_before_rmdir):
            with self.assertRaisesRegex(LaneSafetyError, "renamed or replaced"):
                cleanup_lane("automation", str(prepared["owner"]), str(prepared["realInventorySha256"]))
        self.assertTrue((self.data_base / renamed_name).is_dir())
        self.assertTrue((self.data_base / ".beastbound_qa_lane_lock_automation.json").exists())

    def test_final_rmdir_rejects_original_renamed_beneath_nested_sibling(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        prepared = self._prepare()
        lane_root = Path(str(prepared["laneRoot"]))
        original_rmdir = os.rmdir
        swapped = False

        def nest_before_rmdir(path: str | Path, *args: object, **kwargs: object) -> None:
            nonlocal swapped
            dir_fd = kwargs.get("dir_fd")
            if str(path) == lane_root.name and dir_fd is not None and not swapped:
                swapped = True
                os.mkdir("nested-stash", mode=0o700, dir_fd=dir_fd)
                stash_fd = os.open("nested-stash", os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW, dir_fd=dir_fd)
                try:
                    os.rename(
                        lane_root.name,
                        "original",
                        src_dir_fd=dir_fd,
                        dst_dir_fd=stash_fd,
                    )
                finally:
                    os.close(stash_fd)
                os.mkdir(lane_root.name, mode=0o700, dir_fd=dir_fd)
            original_rmdir(path, *args, **kwargs)

        with mock.patch.object(helper.os, "rmdir", side_effect=nest_before_rmdir):
            with self.assertRaisesRegex(LaneSafetyError, "renamed or replaced"):
                cleanup_lane("automation", str(prepared["owner"]), str(prepared["realInventorySha256"]))
        self.assertTrue((self.data_base / "nested-stash" / "original").is_dir())
        self.assertTrue((self.data_base / ".beastbound_qa_lane_lock_automation.json").exists())

    def test_incomplete_recovery_rmdir_rejects_nested_original_rename(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        prepared = self._prepare()
        lane_root = Path(str(prepared["laneRoot"]))
        owner = str(prepared["owner"])
        (lane_root / ".beastbound_qa_lane_owner.json").unlink()
        inspected = inspect_lane("automation", owner)
        original_rmdir = os.rmdir
        swapped = False

        def nest_before_rmdir(path: str | Path, *args: object, **kwargs: object) -> None:
            nonlocal swapped
            dir_fd = kwargs.get("dir_fd")
            if str(path) == lane_root.name and dir_fd is not None and not swapped:
                swapped = True
                os.mkdir("recovery-nested-stash", mode=0o700, dir_fd=dir_fd)
                stash_fd = os.open(
                    "recovery-nested-stash",
                    os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW,
                    dir_fd=dir_fd,
                )
                try:
                    os.rename(
                        lane_root.name,
                        "original",
                        src_dir_fd=dir_fd,
                        dst_dir_fd=stash_fd,
                    )
                finally:
                    os.close(stash_fd)
                os.mkdir(lane_root.name, mode=0o700, dir_fd=dir_fd)
            original_rmdir(path, *args, **kwargs)

        with mock.patch.object(helper.os, "rmdir", side_effect=nest_before_rmdir):
            with self.assertRaisesRegex(LaneSafetyError, "renamed or replaced"):
                recover_lane(
                    "automation",
                    owner,
                    str(inspected["inspectionSha256"]),
                    RECOVERY_NO_PROCESS_CONFIRMATION,
                )
        self.assertTrue((self.data_base / "recovery-nested-stash" / "original").is_dir())
        self.assertTrue((self.data_base / ".beastbound_qa_lane_lock_automation.json").exists())

    def test_invalid_or_conflicting_features_leave_no_lane(self) -> None:
        lane_root = self.data_base / "BeastboundOdysseyQA_Automation"
        for features in ("invalid feature", "beastbound_qa_client1"):
            with self.subTest(features=features):
                with self.assertRaises(LaneSafetyError):
                    self._prepare(features)
                self.assertFalse(lane_root.exists())

    def test_prepare_failure_after_owner_creation_rolls_back_exact_lane(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        lane_root = self.data_base / "BeastboundOdysseyQA_Automation"
        original_inventory = helper.inventory_tree

        def fail_lane_inventory(root: Path, *args: object, **kwargs: object) -> dict[str, object]:
            if Path(root) == lane_root:
                raise LaneSafetyError("injected lane inventory failure")
            return original_inventory(root, *args, **kwargs)

        with mock.patch.object(helper, "inventory_tree", side_effect=fail_lane_inventory):
            with self.assertRaisesRegex(LaneSafetyError, "injected"):
                self._prepare()
        self.assertFalse(lane_root.exists())
        self.assertFalse((self.data_base / ".beastbound_qa_lane_lock_automation.json").exists())
        prepared = self._prepare()
        cleanup_lane("automation", str(prepared["owner"]), str(prepared["realInventorySha256"]))

    def test_partial_lock_or_owner_write_rolls_back_every_created_path(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        lane_root = self.data_base / "BeastboundOdysseyQA_Automation"
        lock_path = self.data_base / ".beastbound_qa_lane_lock_automation.json"
        original_write_all = helper._write_all

        with mock.patch.object(helper, "_write_all", side_effect=LaneSafetyError("injected lock write failure")):
            with self.assertRaisesRegex(LaneSafetyError, "injected lock"):
                self._prepare()
        self.assertFalse(lock_path.exists())
        self.assertFalse(lane_root.exists())

        calls = 0

        def fail_owner_write(descriptor: int, payload: bytes) -> None:
            nonlocal calls
            calls += 1
            if calls == 2:
                os.write(descriptor, payload[:3])
                raise LaneSafetyError("injected owner write failure")
            original_write_all(descriptor, payload)

        with mock.patch.object(helper, "_write_all", side_effect=fail_owner_write):
            with self.assertRaisesRegex(LaneSafetyError, "injected owner"):
                self._prepare()
        self.assertFalse(lock_path.exists())
        self.assertFalse(lane_root.exists())

    def test_lock_and_owner_publish_keep_one_inode_until_pending_unlink(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        original_link = os.link
        observed: list[tuple[str, str]] = []

        def observed_link(source: str, target: str, *args: object, **kwargs: object) -> None:
            original_link(source, target, *args, **kwargs)
            source_stat = os.stat(source, dir_fd=kwargs.get("src_dir_fd"), follow_symlinks=False)
            target_stat = os.stat(target, dir_fd=kwargs.get("dst_dir_fd"), follow_symlinks=False)
            self.assertEqual((source_stat.st_dev, source_stat.st_ino), (target_stat.st_dev, target_stat.st_ino))
            observed.append((str(source), str(target)))

        with mock.patch.object(helper.os, "link", side_effect=observed_link):
            prepared = self._prepare()
        self.assertEqual(len(observed), 2)
        self.assertTrue(any(target == ".beastbound_qa_lane_lock_automation.json" for _source, target in observed))
        self.assertTrue(any(target == ".beastbound_qa_lane_owner.json" for _source, target in observed))
        for source, _target in observed:
            self.assertFalse((self.data_base / source).exists())
            self.assertFalse((Path(str(prepared["laneRoot"])) / source).exists())
        cleanup_lane("automation", str(prepared["owner"]), str(prepared["realInventorySha256"]))

    def test_pending_swap_during_lock_publish_is_rejected(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        owner = "7" * 32
        original_link = os.link

        def swap_before_link(source: str, target: str, *args: object, **kwargs: object) -> None:
            source_fd = kwargs.get("src_dir_fd")
            os.unlink(source, dir_fd=source_fd)
            replacement = os.open(
                source,
                os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW,
                0o600,
                dir_fd=source_fd,
            )
            try:
                os.write(replacement, b"replacement")
            finally:
                os.close(replacement)
            original_link(source, target, *args, **kwargs)

        with mock.patch.object(helper.os, "link", side_effect=swap_before_link):
            with self.assertRaisesRegex(LaneSafetyError, "canonical inode"):
                prepare_lane("automation", owner=owner)
        lock = self.data_base / ".beastbound_qa_lane_lock_automation.json"
        pending = self.data_base / ".beastbound_qa_lane_lock_automation.json.pending"
        self.assertTrue(lock.exists())
        self.assertTrue(pending.exists())
        lock.unlink()
        pending.unlink()

    def test_extra_hardlink_during_lock_publish_is_rejected(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        owner = "9" * 32
        original_link = os.link
        extra_name = ".beastbound_qa_lane_lock_automation.extra"

        def add_extra_link(source: str, target: str, *args: object, **kwargs: object) -> None:
            original_link(source, target, *args, **kwargs)
            original_link(
                source,
                extra_name,
                src_dir_fd=kwargs.get("src_dir_fd"),
                dst_dir_fd=kwargs.get("dst_dir_fd"),
                follow_symlinks=False,
            )

        with mock.patch.object(helper.os, "link", side_effect=add_extra_link):
            with self.assertRaisesRegex(LaneSafetyError, "canonical inode"):
                prepare_lane("automation", owner=owner)
        for name in (
            ".beastbound_qa_lane_lock_automation.json",
            ".beastbound_qa_lane_lock_automation.json.pending",
            extra_name,
        ):
            (self.data_base / name).unlink()

    @unittest.skipUnless(hasattr(os, "fork"), "hard-kill publication test requires POSIX fork")
    def test_kill_before_lock_link_blocks_all_owners_until_exact_manual_recovery(self) -> None:
        owner = "1" * 32
        foreign_owner = "2" * 32
        pending_lock = self.data_base / ".beastbound_qa_lane_lock_automation.json.pending"
        published_lock = self.data_base / ".beastbound_qa_lane_lock_automation.json"
        lane_root = self.data_base / "BeastboundOdysseyQA_Automation"
        child_pid = os.fork()
        if child_pid == 0:
            from tools import godot_qa_user_data_lane as child_helper

            def kill_before_link(*_args: object, **_kwargs: object) -> None:
                os.kill(os.getpid(), signal.SIGKILL)

            child_helper.os.link = kill_before_link
            child_helper.prepare_lane("automation", owner=owner)
            os._exit(99)
        waited_pid, status = os.waitpid(child_pid, 0)
        self.assertEqual(waited_pid, child_pid)
        self.assertTrue(os.WIFSIGNALED(status))
        self.assertEqual(os.WTERMSIG(status), signal.SIGKILL)
        self.assertTrue(pending_lock.is_file())
        self.assertFalse(published_lock.exists())
        self.assertFalse(lane_root.exists())
        original_payload = pending_lock.read_bytes()
        original_stat = pending_lock.stat()

        for blocked_owner in (owner, foreign_owner):
            with self.subTest(blocked_owner=blocked_owner):
                with self.assertRaisesRegex(LaneSafetyError, "already owned, locked, or has residual"):
                    prepare_lane("automation", owner=blocked_owner)
                current_stat = pending_lock.stat()
                self.assertEqual(
                    (current_stat.st_dev, current_stat.st_ino, current_stat.st_nlink),
                    (original_stat.st_dev, original_stat.st_ino, original_stat.st_nlink),
                )
                self.assertEqual(pending_lock.read_bytes(), original_payload)
                self.assertFalse(published_lock.exists())
                self.assertFalse(lane_root.exists())

        foreign_inspection = inspect_lane("automation", foreign_owner)
        self.assertEqual(foreign_inspection["pendingLockState"], "invalid")
        with self.assertRaisesRegex(LaneSafetyError, "unsafe or foreign"):
            recover_lane(
                "automation",
                foreign_owner,
                str(foreign_inspection["inspectionSha256"]),
                RECOVERY_NO_PROCESS_CONFIRMATION,
            )
        owner_inspection = inspect_lane("automation", owner)
        self.assertEqual(owner_inspection["pendingLockState"], "canonical")
        recovered = recover_lane(
            "automation",
            owner,
            str(owner_inspection["inspectionSha256"]),
            RECOVERY_NO_PROCESS_CONFIRMATION,
        )
        self.assertEqual(recovered["status"], "absent")
        self.assertFalse(pending_lock.exists())

    def test_pending_lock_payload_is_bound_to_the_exact_inspection(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        owner = "3" * 32
        pending_lock = self.data_base / ".beastbound_qa_lane_lock_automation.json.pending"
        baseline = str(helper._absent_inventory()["sha256"])
        original_payload = helper._lock_payload("automation", owner, baseline)
        swapped_payload = helper._lock_payload("automation", owner, "2" * 64)
        descriptor = os.open(
            pending_lock,
            os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW,
            0o600,
        )
        try:
            _write_all(descriptor, original_payload)
            os.fsync(descriptor)
        finally:
            os.close(descriptor)
        inspected = inspect_lane("automation", owner)
        self.assertEqual(inspected["pendingLockState"], "canonical")
        self.assertEqual(
            inspected["pendingLockPayloadSha256"],
            hashlib.sha256(original_payload).hexdigest(),
        )
        pending_lock.write_bytes(swapped_payload)
        swapped = inspect_lane("automation", owner)
        self.assertNotEqual(
            swapped["pendingLockPayloadSha256"],
            inspected["pendingLockPayloadSha256"],
        )
        self.assertNotEqual(swapped["inspectionSha256"], inspected["inspectionSha256"])
        with self.assertRaisesRegex(LaneSafetyError, "changed after inspection"):
            recover_lane(
                "automation",
                owner,
                str(inspected["inspectionSha256"]),
                RECOVERY_NO_PROCESS_CONFIRMATION,
            )
        self.assertTrue(pending_lock.exists())
        pending_lock.write_bytes(original_payload)
        recovered = recover_lane(
            "automation",
            owner,
            str(inspected["inspectionSha256"]),
            RECOVERY_NO_PROCESS_CONFIRMATION,
        )
        self.assertEqual(recovered["status"], "absent")
        self.assertFalse(pending_lock.exists())

    def test_pending_lock_unlink_hardlink_race_is_detected_and_preserved(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        owner = "4" * 32
        pending_name = ".beastbound_qa_lane_lock_automation.json.pending"
        pending_lock = self.data_base / pending_name
        escaped_lock = self.data_base / ".beastbound_qa_lane_lock_automation.escaped"
        baseline = str(helper._absent_inventory()["sha256"])
        pending_lock.write_bytes(helper._lock_payload("automation", owner, baseline))
        pending_lock.chmod(0o600)
        inspected = inspect_lane("automation", owner)
        original_unlink = os.unlink

        def escape_before_unlink(path: object, *args: object, **kwargs: object) -> None:
            if str(path) == pending_name:
                os.link(
                    pending_name,
                    escaped_lock.name,
                    src_dir_fd=kwargs.get("dir_fd"),
                    dst_dir_fd=kwargs.get("dir_fd"),
                    follow_symlinks=False,
                )
            original_unlink(path, *args, **kwargs)

        with mock.patch.object(helper.os, "unlink", side_effect=escape_before_unlink):
            with self.assertRaisesRegex(LaneSafetyError, "unexpected hard link"):
                recover_lane(
                    "automation",
                    owner,
                    str(inspected["inspectionSha256"]),
                    RECOVERY_NO_PROCESS_CONFIRMATION,
                )
        self.assertTrue(escaped_lock.exists())
        self.assertFalse(pending_lock.exists())
        escaped_lock.unlink()

    def test_pending_lock_rename_before_removal_is_detected_and_preserved(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        owner = "5" * 32
        pending_lock = self.data_base / ".beastbound_qa_lane_lock_automation.json.pending"
        escaped_lock = self.data_base / ".beastbound_qa_lane_lock_automation.renamed"
        baseline = str(helper._absent_inventory()["sha256"])
        pending_lock.write_bytes(helper._lock_payload("automation", owner, baseline))
        pending_lock.chmod(0o600)
        inspected = inspect_lane("automation", owner)
        original_remove = helper._remove_created_regular_file

        def rename_before_remove(path: object, **kwargs: object) -> None:
            os.rename(
                path,
                escaped_lock.name,
                src_dir_fd=kwargs["dir_fd"],
                dst_dir_fd=kwargs["dir_fd"],
            )
            original_remove(path, **kwargs)

        with mock.patch.object(helper, "_remove_created_regular_file", side_effect=rename_before_remove):
            with self.assertRaisesRegex(LaneSafetyError, "disappeared"):
                recover_lane(
                    "automation",
                    owner,
                    str(inspected["inspectionSha256"]),
                    RECOVERY_NO_PROCESS_CONFIRMATION,
                )
        self.assertFalse(pending_lock.exists())
        self.assertTrue(escaped_lock.exists())
        escaped_lock.unlink()

    def test_external_hardlinks_cannot_extend_published_authorities(self) -> None:
        prepared = self._prepare()
        owner = str(prepared["owner"])
        baseline = str(prepared["realInventorySha256"])
        lane_root = Path(str(prepared["laneRoot"]))
        published_lock = self.data_base / ".beastbound_qa_lane_lock_automation.json"
        published_owner = lane_root / ".beastbound_qa_lane_owner.json"
        extra_lock = self.data_base / ".beastbound_qa_lane_lock_automation.external"
        extra_owner = self.data_base / ".beastbound_qa_lane_owner.external"

        os.link(published_lock, extra_lock)
        with self.assertRaisesRegex(LaneSafetyError, "hard-link count"):
            cleanup_lane("automation", owner, baseline)
        self.assertTrue(lane_root.is_dir())
        self.assertTrue(published_lock.is_file())
        extra_lock.unlink()

        os.link(published_owner, extra_owner)
        with self.assertRaisesRegex(LaneSafetyError, "hard-link count"):
            cleanup_lane("automation", owner, baseline)
        self.assertTrue(lane_root.is_dir())
        self.assertTrue(published_owner.is_file())
        extra_owner.unlink()
        cleanup_lane("automation", owner, baseline)

    def test_pending_swap_during_owner_publish_is_rejected(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        owner = "8" * 32
        lane_root = self.data_base / "BeastboundOdysseyQA_Automation"
        lane_root.mkdir()
        data_base_fd, _data_base_stat = _open_current_data_base(self.data_base)
        original_link = os.link

        def swap_before_link(source: str, target: str, *args: object, **kwargs: object) -> None:
            source_fd = kwargs.get("src_dir_fd")
            os.unlink(source, dir_fd=source_fd)
            replacement = os.open(
                source,
                os.O_CREAT | os.O_EXCL | os.O_WRONLY | os.O_NOFOLLOW,
                0o600,
                dir_fd=source_fd,
            )
            try:
                os.write(replacement, b"replacement")
            finally:
                os.close(replacement)
            original_link(source, target, *args, **kwargs)

        try:
            with mock.patch.object(helper.os, "link", side_effect=swap_before_link):
                with self.assertRaisesRegex(LaneSafetyError, "canonical inode"):
                    _write_owner_exclusive(
                        lane_root,
                        "automation",
                        owner,
                        authority_root=self.data_base,
                        authority_fd=data_base_fd,
                    )
        finally:
            os.close(data_base_fd)
        (lane_root / ".beastbound_qa_lane_owner.json").unlink()
        (lane_root / f".beastbound_qa_lane_owner.json.{owner}.pending").unlink()
        lane_root.rmdir()

    def test_ambiguous_prepare_recovery_requires_exact_owner(self) -> None:
        owner = "a" * 32
        prepared = prepare_lane("automation", owner=owner)
        lane_root = Path(str(prepared["laneRoot"]))
        wrong_inspection = inspect_lane("automation", "b" * 32)
        with self.assertRaises(LaneSafetyError):
            recover_lane(
                "automation",
                "b" * 32,
                str(wrong_inspection["inspectionSha256"]),
                RECOVERY_NO_PROCESS_CONFIRMATION,
            )
        self.assertTrue(lane_root.exists())
        recovered = self._recover_after_inspection("automation", owner)
        self.assertEqual(recovered["status"], "recovered")
        self.assertTrue(recovered["laneAbsent"])
        self.assertFalse(lane_root.exists())
        absent = self._recover_after_inspection("automation", "c" * 32)
        self.assertEqual(absent["status"], "absent")

    def test_manual_recovery_requires_confirmation_and_current_inspection(self) -> None:
        prepared = self._prepare()
        owner = str(prepared["owner"])
        inspected = inspect_lane("automation", owner)
        with self.assertRaisesRegex(LaneSafetyError, "no-matching-runner"):
            recover_lane("automation", owner, str(inspected["inspectionSha256"]), "not-confirmed")
        residual = Path(str(prepared["laneRoot"])) / "changed-after-inspection.txt"
        residual.write_text("changed", encoding="utf-8")
        with self.assertRaisesRegex(LaneSafetyError, "changed after inspection"):
            recover_lane(
                "automation",
                owner,
                str(inspected["inspectionSha256"]),
                RECOVERY_NO_PROCESS_CONFIRMATION,
            )
        residual.unlink()
        cleanup_lane("automation", owner, str(prepared["realInventorySha256"]))

    def test_crash_after_owner_last_unlink_is_manually_recoverable(self) -> None:
        prepared = self._prepare()
        lane_root = Path(str(prepared["laneRoot"]))
        (lane_root / ".beastbound_qa_lane_owner.json").unlink()
        inspected = inspect_lane("automation", str(prepared["owner"]))
        self.assertEqual(inspected["laneRootState"], "directory")
        self.assertEqual(inspected["ownerCanaryState"], "absent")
        recovered = self._recover_after_inspection("automation", str(prepared["owner"]))
        self.assertEqual(recovered["status"], "recovered")
        self.assertFalse(lane_root.exists())

    @unittest.skipUnless(hasattr(os, "fork"), "hard-kill owner publication test requires POSIX fork")
    def test_kill_during_owner_write_is_bound_and_manually_recoverable(self) -> None:
        owner = "6" * 32
        lane_root = self.data_base / "BeastboundOdysseyQA_Automation"
        pending_owner = lane_root / f".beastbound_qa_lane_owner.json.{owner}.pending"
        published_owner = lane_root / ".beastbound_qa_lane_owner.json"
        published_lock = self.data_base / ".beastbound_qa_lane_lock_automation.json"
        child_pid = os.fork()
        if child_pid == 0:
            from tools import godot_qa_user_data_lane as child_helper

            original_write_all = child_helper._write_all
            call_count = 0

            def kill_mid_owner_write(descriptor: int, payload: bytes) -> None:
                nonlocal call_count
                call_count += 1
                if call_count == 2:
                    os.write(descriptor, b"{pa")
                    os.fsync(descriptor)
                    os.kill(os.getpid(), signal.SIGKILL)
                original_write_all(descriptor, payload)

            child_helper._write_all = kill_mid_owner_write
            child_helper.prepare_lane("automation", owner=owner)
            os._exit(99)
        waited_pid, status = os.waitpid(child_pid, 0)
        self.assertEqual(waited_pid, child_pid)
        self.assertTrue(os.WIFSIGNALED(status))
        self.assertEqual(os.WTERMSIG(status), signal.SIGKILL)
        self.assertTrue(published_lock.is_file())
        self.assertTrue(lane_root.is_dir())
        self.assertTrue(pending_owner.is_file())
        self.assertFalse(published_owner.exists())
        inspected = inspect_lane("automation", owner)
        self.assertEqual(inspected["publishedLockState"], "canonical")
        self.assertEqual(inspected["ownerCanaryState"], "absent")
        self.assertEqual(inspected["pendingOwnerState"], "regular")
        self.assertRegex(str(inspected["pendingOwnerPayloadSha256"]), r"^[0-9a-f]{64}$")
        recovered = recover_lane(
            "automation",
            owner,
            str(inspected["inspectionSha256"]),
            RECOVERY_NO_PROCESS_CONFIRMATION,
        )
        self.assertEqual(recovered["status"], "recovered")
        self.assertFalse(lane_root.exists())
        self.assertFalse(published_lock.exists())

    def test_invalid_published_owner_is_preserved(self) -> None:
        prepared = self._prepare()
        owner = str(prepared["owner"])
        owner_canary = Path(str(prepared["laneRoot"])) / ".beastbound_qa_lane_owner.json"
        canonical = owner_canary.read_bytes()
        owner_canary.write_bytes(b"invalid")
        inspected = inspect_lane("automation", owner)
        self.assertEqual(inspected["ownerCanaryState"], "invalid")
        with self.assertRaisesRegex(LaneSafetyError, "invalid owner canary"):
            recover_lane(
                "automation",
                owner,
                str(inspected["inspectionSha256"]),
                RECOVERY_NO_PROCESS_CONFIRMATION,
            )
        self.assertTrue(owner_canary.exists())
        owner_canary.write_bytes(canonical)
        cleanup_lane("automation", owner, str(prepared["realInventorySha256"]))

    def test_ambiguous_prepare_recovery_preserves_invalid_lock_and_removes_partial_owner(self) -> None:
        pending_owner = "d" * 32
        pending_lock = self.data_base / ".beastbound_qa_lane_lock_automation.json.pending"
        pending_lock.write_bytes(b"{partial")
        invalid_inspection = inspect_lane("automation", pending_owner)
        self.assertEqual(invalid_inspection["pendingLockState"], "invalid")
        with self.assertRaisesRegex(LaneSafetyError, "unsafe or foreign"):
            recover_lane(
                "automation",
                pending_owner,
                str(invalid_inspection["inspectionSha256"]),
                RECOVERY_NO_PROCESS_CONFIRMATION,
            )
        self.assertTrue(pending_lock.exists())
        pending_lock.unlink()

        prepared_owner = "e" * 32
        prepared = prepare_lane("automation", owner=prepared_owner)
        lane_root = Path(str(prepared["laneRoot"]))
        owner_canary = lane_root / ".beastbound_qa_lane_owner.json"
        pending_owner_canary = lane_root / f".beastbound_qa_lane_owner.json.{prepared_owner}.pending"
        os.link(owner_canary, pending_owner_canary)
        owner_canary.unlink()
        interrupted = inspect_lane("automation", prepared_owner)
        self.assertEqual(interrupted["publishedLockState"], "canonical")
        self.assertEqual(interrupted["laneRootState"], "directory")
        self.assertEqual(interrupted["ownerCanaryState"], "absent")
        self.assertEqual(interrupted["pendingOwnerState"], "regular")
        recovered = self._recover_after_inspection("automation", prepared_owner)
        self.assertEqual(recovered["status"], "recovered")
        self.assertTrue(recovered["laneAbsent"])
        self.assertFalse(Path(str(prepared["laneRoot"])).exists())

    def test_manual_recovery_converges_published_plus_pending_hardlink_stage(self) -> None:
        owner = "f" * 32
        prepared = prepare_lane("automation", owner=owner)
        lane_root = Path(str(prepared["laneRoot"]))
        published_lock = self.data_base / ".beastbound_qa_lane_lock_automation.json"
        pending_lock = self.data_base / ".beastbound_qa_lane_lock_automation.json.pending"
        published_owner = lane_root / ".beastbound_qa_lane_owner.json"
        pending_owner = lane_root / f".beastbound_qa_lane_owner.json.{owner}.pending"
        os.link(published_lock, pending_lock)
        os.link(published_owner, pending_owner)
        inspected = inspect_lane("automation", owner)
        self.assertEqual(inspected["publishedLockState"], "canonical")
        self.assertEqual(inspected["pendingLockState"], "canonical")
        self.assertEqual(inspected["ownerCanaryState"], "canonical")
        self.assertEqual(inspected["pendingOwnerState"], "regular")
        recovered = self._recover_after_inspection("automation", owner)
        self.assertEqual(recovered["status"], "recovered")
        self.assertFalse(lane_root.exists())
        self.assertFalse(published_lock.exists())
        self.assertFalse(pending_lock.exists())

    def test_wrong_owner_rejects_without_deleting_lane(self) -> None:
        prepared = self._prepare()
        lane_root = Path(str(prepared["laneRoot"]))
        with self.assertRaisesRegex(LaneSafetyError, "owner"):
            cleanup_lane("automation", "wrong-owner", str(prepared["realInventorySha256"]))
        self.assertTrue(lane_root.is_dir())
        cleanup_lane("automation", str(prepared["owner"]), str(prepared["realInventorySha256"]))

    def test_real_root_change_is_detected_and_preserves_owned_lane(self) -> None:
        real_root = self.real_root
        real_root.mkdir(parents=True)
        (real_root / "settings.json").write_text("before", encoding="utf-8")
        original_settings_stat = (real_root / "settings.json").stat()
        prepared = self._prepare()
        (real_root / "settings.json").write_text("after", encoding="utf-8")
        with self.assertRaisesRegex(LaneSafetyError, "real Godot user-data root changed"):
            verify_lane("automation", str(prepared["owner"]), str(prepared["realInventorySha256"]))
        with self.assertRaises(LaneSafetyError):
            cleanup_lane("automation", str(prepared["owner"]), str(prepared["realInventorySha256"]))
        self.assertTrue(Path(str(prepared["laneRoot"])).exists())
        self.assertEqual((real_root / "settings.json").read_text(encoding="utf-8"), "after")
        (real_root / "settings.json").write_text("before", encoding="utf-8")
        os.utime(
            real_root / "settings.json",
            ns=(original_settings_stat.st_atime_ns, original_settings_stat.st_mtime_ns),
        )
        cleanup_lane("automation", str(prepared["owner"]), str(prepared["realInventorySha256"]))

    def test_real_root_drift_before_cleanup_performs_zero_removal(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        self.real_root.mkdir(parents=True)
        settings = self.real_root / "settings.json"
        settings.write_text("before", encoding="utf-8")
        original_settings_stat = settings.stat()
        prepared = self._prepare()
        settings.write_text("after", encoding="utf-8")
        with (
            mock.patch.object(helper, "_remove_tree_no_follow") as remove_tree,
            mock.patch.object(helper, "_remove_lock_exact") as remove_lock,
        ):
            with self.assertRaisesRegex(LaneSafetyError, "before cleanup"):
                cleanup_lane("automation", str(prepared["owner"]), str(prepared["realInventorySha256"]))
            remove_tree.assert_not_called()
            remove_lock.assert_not_called()
        settings.write_text("before", encoding="utf-8")
        os.utime(settings, ns=(original_settings_stat.st_atime_ns, original_settings_stat.st_mtime_ns))
        cleanup_lane("automation", str(prepared["owner"]), str(prepared["realInventorySha256"]))

    def test_real_root_drift_during_tree_cleanup_preserves_external_lock(self) -> None:
        from tools import godot_qa_user_data_lane as helper

        self.real_root.mkdir(parents=True)
        settings = self.real_root / "settings.json"
        settings.write_text("before", encoding="utf-8")
        original_settings_stat = settings.stat()
        prepared = self._prepare()
        original_remove_tree = helper._remove_tree_no_follow

        def remove_then_drift(*args: object, **kwargs: object) -> None:
            original_remove_tree(*args, **kwargs)
            settings.write_text("after", encoding="utf-8")

        with mock.patch.object(helper, "_remove_tree_no_follow", side_effect=remove_then_drift):
            with self.assertRaisesRegex(LaneSafetyError, "external lock preserved"):
                cleanup_lane("automation", str(prepared["owner"]), str(prepared["realInventorySha256"]))
        lock_path = self.data_base / ".beastbound_qa_lane_lock_automation.json"
        self.assertTrue(lock_path.exists())
        self.assertFalse(Path(str(prepared["laneRoot"])).exists())
        settings.write_text("before", encoding="utf-8")
        os.utime(settings, ns=(original_settings_stat.st_atime_ns, original_settings_stat.st_mtime_ns))
        recovered = self._recover_after_inspection("automation", str(prepared["owner"]))
        self.assertEqual(recovered["status"], "recovered")
        self.assertFalse(lock_path.exists())

    @unittest.skipUnless(hasattr(os, "symlink"), "symbolic links are unavailable")
    def test_symlink_residual_is_never_followed_or_removed(self) -> None:
        prepared = self._prepare()
        lane_root = Path(str(prepared["laneRoot"]))
        outside = Path(self.temporary.name) / "outside.txt"
        outside.write_text("keep", encoding="utf-8")
        link = lane_root / "escape"
        self._symlink_or_skip(outside, link)
        with self.assertRaisesRegex(LaneSafetyError, "symbolic link"):
            cleanup_lane("automation", str(prepared["owner"]), str(prepared["realInventorySha256"]))
        self.assertEqual(outside.read_text(encoding="utf-8"), "keep")
        link.unlink()
        cleanup_lane("automation", str(prepared["owner"]), str(prepared["realInventorySha256"]))

    @unittest.skipUnless(hasattr(os, "symlink"), "symbolic links are unavailable")
    def test_real_root_inventory_does_not_follow_symlink_targets(self) -> None:
        real_root = self.real_root
        real_root.mkdir(parents=True)
        outside = Path(self.temporary.name) / "outside-player-data.txt"
        outside.write_text("before", encoding="utf-8")
        self._symlink_or_skip(outside, real_root / "external-reference")
        prepared = self._prepare()
        outside.write_text("after", encoding="utf-8")
        verified = verify_lane(
            "automation",
            str(prepared["owner"]),
            str(prepared["realInventorySha256"]),
        )
        self.assertTrue(verified["realUnchanged"])
        cleanup_lane("automation", str(prepared["owner"]), str(prepared["realInventorySha256"]))

    def test_executable_residual_blocks_cleanup(self) -> None:
        prepared = self._prepare()
        lane_root = Path(str(prepared["laneRoot"]))
        residual = lane_root / "unexpected-tool"
        residual.write_text("not executable content", encoding="utf-8")
        residual.chmod(0o700)
        with self.assertRaisesRegex(LaneSafetyError, "executable residual"):
            cleanup_lane("automation", str(prepared["owner"]), str(prepared["realInventorySha256"]))
        residual.chmod(0o600)
        cleanup_lane("automation", str(prepared["owner"]), str(prepared["realInventorySha256"]))

    @unittest.skipUnless(hasattr(os, "symlink") and sys.platform == "darwin", "macOS HOME symlink vector only")
    def test_symlinked_ancestor_is_rejected_before_lane_creation(self) -> None:
        real_home = Path(self.temporary.name) / "real-home"
        (real_home / "Library" / "Application Support").mkdir(parents=True)
        linked_home = Path(self.temporary.name) / "linked-home"
        self._symlink_or_skip(real_home, linked_home, target_is_directory=True)
        with mock.patch.dict(os.environ, {"HOME": str(linked_home)}, clear=True):
            with self.assertRaisesRegex(LaneSafetyError, "ancestor"):
                self._prepare()

    @unittest.skipUnless(hasattr(os, "symlink"), "symbolic links are unavailable")
    def test_real_root_intermediate_symlink_is_rejected(self) -> None:
        outside = Path(self.temporary.name) / "outside-godot"
        outside.mkdir()
        self._symlink_or_skip(outside, self.real_root.parents[1], target_is_directory=True)
        with self.assertRaisesRegex(LaneSafetyError, "ancestor"):
            self._prepare()

    @unittest.skipUnless(os.name == "posix" and hasattr(os, "symlink"), "POSIX openat race vector only")
    def test_intermediate_ancestor_swap_after_static_check_is_rejected_by_openat(self) -> None:
        godot_root = self.real_root.parents[1]
        godot_root.mkdir()
        preserved_root = godot_root.with_name(f"{godot_root.name}-preserved")
        outside = Path(self.temporary.name) / "outside-godot-race"
        outside.mkdir()
        from tools import godot_qa_user_data_lane as helper

        original_assertion = helper._assert_no_symlink_components
        call_count = 0

        def swap_after_final_check(path: Path, anchor: Path) -> None:
            nonlocal call_count
            original_assertion(path, anchor)
            call_count += 1
            if call_count == 3:
                godot_root.rename(preserved_root)
                self._symlink_or_skip(outside, godot_root, target_is_directory=True)

        with mock.patch.object(helper, "_assert_no_symlink_components", side_effect=swap_after_final_check):
            with self.assertRaises(LaneSafetyError):
                self._prepare()
        self.assertFalse((self.data_base / "BeastboundOdysseyQA_Automation").exists())

    def test_broad_or_ancestor_lane_path_is_rejected(self) -> None:
        unsafe = LanePaths(
            lane="automation",
            feature="beastbound_qa_automation",
            custom_user_dir_name="BeastboundOdysseyQA_Automation",
            data_base=str(self.data_base),
            lane_root=str(self.data_base),
            real_root=str(self.real_root),
        )
        with mock.patch("tools.godot_qa_user_data_lane.platform_lane_paths", return_value=unsafe):
            with self.assertRaisesRegex(LaneSafetyError, "direct child"):
                self._prepare()


class GodotQaLaneSourceContractTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.repo_root = Path(__file__).resolve().parents[2]
        cls.project_text = (cls.repo_root / "client/godot/project.godot").read_text(encoding="utf-8")
        cls.main_text = (cls.repo_root / "client/godot/scripts/main.gd").read_text(encoding="utf-8")
        cls.runner_text = (cls.repo_root / "tools/run_godot_auto_checks.mjs").read_text(encoding="utf-8")
        cls.helper_text = (cls.repo_root / "tools/godot_qa_user_data_lane.py").read_text(encoding="utf-8")
        cls.auto_check_text = (
            cls.repo_root / "client/godot/scripts/qa/auto_check_coordinator.gd"
        ).read_text(encoding="utf-8")

    def _validate(
        self,
        project: str | None = None,
        main: str | None = None,
        runner: str | None = None,
        helper: str | None = None,
        auto_check: str | None = None,
    ) -> None:
        validate_repository_sources(
            self.project_text if project is None else project,
            self.main_text if main is None else main,
            self.runner_text if runner is None else runner,
            self.helper_text if helper is None else helper,
            self.auto_check_text if auto_check is None else auto_check,
        )

    def test_current_repository_source_contract_passes(self) -> None:
        self._validate()

    def test_contract_function_keysets_and_critical_constants_are_independent_oracles(self) -> None:
        helper_module = ast.parse(self.helper_text)
        helper_functions = {
            node.name
            for node in helper_module.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
        runner_functions = set(re.findall(
            r"(?m)^(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)\s*\(",
            self.runner_text,
        ))
        self.assertEqual(set(HELPER_CONTRACT_FUNCTION_SHA256), EXPECTED_HELPER_CONTRACT_FUNCTIONS)
        self.assertEqual(helper_functions, EXPECTED_HELPER_CONTRACT_FUNCTIONS)
        self.assertEqual(set(MAIN_CONTRACT_FUNCTION_SHA256), EXPECTED_MAIN_CONTRACT_FUNCTIONS)
        self.assertEqual(set(RUNNER_CONTRACT_FUNCTION_SHA256), EXPECTED_RUNNER_CONTRACT_FUNCTIONS)
        self.assertEqual(runner_functions, EXPECTED_RUNNER_CONTRACT_FUNCTIONS)
        self.assertEqual(set(AUTO_CHECK_CONTRACT_FUNCTION_SHA256), {"_run_auto_auth_check"})
        self.assertEqual(OWNER_CANARY_NAME, ".beastbound_qa_lane_owner.json")
        self.assertEqual(LOCK_CANARY_PREFIX, ".beastbound_qa_lane_lock_")
        self.assertEqual(EDITOR_CUSTOM_FEATURES_ENV, "GODOT_EDITOR_CUSTOM_FEATURES")
        self.assertEqual(REAL_PROJECT_DIR_NAME, "Beastbound Odyssey - 万兽纪元")
        self.assertEqual(
            RECOVERY_NO_PROCESS_CONFIRMATION,
            "I_CONFIRMED_NO_MATCHING_QA_AUTOMATION_RUNNER_PROCESS",
        )
        self.assertEqual(LANES, {
            "automation": {
                "feature": "beastbound_qa_automation",
                "customUserDirName": "BeastboundOdysseyQA_Automation",
            },
            "client1": {
                "feature": "beastbound_qa_client1",
                "customUserDirName": "BeastboundOdysseyQA_Client1",
            },
            "client2": {
                "feature": "beastbound_qa_client2",
                "customUserDirName": "BeastboundOdysseyQA_Client2",
            },
        })
        self.assertEqual(RESERVED_FEATURES, frozenset({
            "beastbound_qa_automation",
            "beastbound_qa_client1",
            "beastbound_qa_client2",
        }))
        self.assertEqual(
            RUNNER_SOURCE_SHA256,
            "3af2a5613475778c8cf0817daed76d9c5beb8ef713b5a53b8347c80734c691ea",
        )

    def test_lane_paths_class_and_helper_entrypoint_bindings_are_exact(self) -> None:
        lane_safety_class = "\nclass LaneSafetyError(RuntimeError):"
        self.assertEqual(self.helper_text.count(lane_safety_class), 1)
        decorated_lane_safety = self.helper_text.replace(
            lane_safety_class,
            "\n@(lambda cls: RuntimeError)\nclass LaneSafetyError(RuntimeError):",
            1,
        )
        with self.assertRaisesRegex(LaneSafetyError, "decorated.*LaneSafetyError"):
            self._validate(helper=decorated_lane_safety)

        lane_paths_decorator = "@dataclass(frozen=True)\nclass LanePaths:"
        self.assertEqual(self.helper_text.count(lane_paths_decorator), 1)
        for replacement in (
            "class LanePaths:",
            "@dataclass\nclass LanePaths:",
            "@(lambda cls: cls)\n@dataclass(frozen=True)\nclass LanePaths:",
        ):
            with self.subTest(lane_paths_decorator=replacement.splitlines()[0]):
                with self.assertRaises(LaneSafetyError):
                    self._validate(helper=self.helper_text.replace(
                        lane_paths_decorator,
                        replacement,
                        1,
                    ))

        property_line = '        return self.lane_root.replace("\\\\", "/").rstrip("/")'
        self.assertIn(property_line, self.helper_text)
        with self.assertRaises(LaneSafetyError):
            self._validate(helper=self.helper_text.replace(
                property_line,
                '        return self.real_root.replace("\\\\", "/").rstrip("/")',
                1,
            ))

        function_line = "def prepare_lane(\n    lane: str,"
        self.assertIn(function_line, self.helper_text)
        decorated = self.helper_text.replace(
            function_line,
            '@lambda original: (lambda *args, **kwargs: {"status": "forged"})\n' + function_line,
            1,
        )
        with self.assertRaisesRegex(LaneSafetyError, "decorated"):
            self._validate(helper=decorated)

        rebound = self.helper_text + '\nprepare_lane = lambda *args, **kwargs: {"status": "forged"}\n'
        with self.assertRaises(LaneSafetyError):
            self._validate(helper=rebound)
        class_rebound = self.helper_text + '\nLanePaths = dict\n'
        with self.assertRaises(LaneSafetyError):
            self._validate(helper=class_rebound)
        tuple_rebound = self.helper_text + '\n(prepare_lane,) = (lambda: None,)\n'
        with self.assertRaises(LaneSafetyError):
            self._validate(helper=tuple_rebound)

    def test_helper_top_level_shape_and_runner_whole_source_are_exact(self) -> None:
        guard = 'if __name__ == "__main__":\n    raise SystemExit(main())\n'
        self.assertEqual(self.helper_text.count(guard), 1)
        guard_index = self.helper_text.index(guard)
        for injected in (
            'globals()["prepare_lane"] = lambda *args, **kwargs: {"status": "forged"}\n',
            'if True:\n    prepare_lane = lambda *args, **kwargs: {"status": "forged"}\n',
            'globals().__setitem__("prepare_lane", lambda *args, **kwargs: {"status": "forged"})\n',
            'if __name__ == "__main__":\n    raise SystemExit(0)\n',
        ):
            with self.subTest(injected=injected.splitlines()[0]):
                mutated = self.helper_text[:guard_index] + injected + self.helper_text[guard_index:]
                with self.assertRaises(LaneSafetyError):
                    self._validate(helper=mutated)
        for replacement in (
            'if __name__ == "__main__":\n    print({"status": "source_contract_passed"})\n',
            "",
            guard + guard,
        ):
            mutated = self.helper_text.replace(guard, replacement, 1)
            with self.assertRaises(LaneSafetyError):
                self._validate(helper=mutated)

        first_runner_function = self.runner_text.index("\nfunction ") + 1
        runner_rebound = (
            self.runner_text[:first_runner_function]
            + 'prepareQaLane = () => ({status: "forged"});\n'
            + self.runner_text[first_runner_function:]
        )
        with self.assertRaisesRegex(LaneSafetyError, "whole-source"):
            self._validate(runner=runner_rebound)
        boundary = "Reject accidental Slice A source drift, not malicious same-UID synchronized rewrites."
        self.assertEqual(self.helper_text.count(boundary), 1)
        with self.assertRaises(LaneSafetyError):
            self._validate(helper=self.helper_text.replace(boundary, "Claim adversarial integrity.", 1))

    def test_reserved_feature_catalog_is_exact_and_conflicts_fail_closed(self) -> None:
        assignment = 'RESERVED_FEATURES = frozenset(record["feature"] for record in LANES.values())'
        self.assertEqual(self.helper_text.splitlines().count(assignment), 1)
        mutated = self.helper_text.replace(
            assignment,
            'RESERVED_FEATURES = frozenset({"beastbound_qa_automation"})',
            1,
        )
        with self.assertRaises(LaneSafetyError):
            self._validate(helper=mutated)
        with self.assertRaises(LaneSafetyError):
            merge_editor_custom_features("beastbound_qa_client1", "beastbound_qa_automation")

    def test_each_mapped_main_and_auto_function_deletion_is_a_lane_safety_error(self) -> None:
        for language, source, names in (
            ("Main", self.main_text, EXPECTED_MAIN_CONTRACT_FUNCTIONS),
            ("Auto", self.auto_check_text, frozenset({"_run_auto_auth_check"})),
        ):
            for name in sorted(names):
                with self.subTest(language=language, name=name):
                    start = source.index(f"func {name}(")
                    next_function = source.find("\nfunc ", start + 1)
                    end = len(source) if next_function < 0 else next_function + 1
                    mutated = source[:start] + source[end:]
                    with self.assertRaises(LaneSafetyError):
                        if language == "Main":
                            self._validate(main=mutated)
                        else:
                            self._validate(auto_check=mutated)

    def test_auth_completion_failed_token_is_function_hash_bound(self) -> None:
        function_start = self.auto_check_text.index("func _run_auto_auth_check() -> void:")
        function_end = self.auto_check_text.index("\nfunc ", function_start + 1)
        function_text = self.auto_check_text[function_start:function_end]
        marker = 'var status = "ok" if player_session_ok'
        self.assertEqual(function_text.count(marker), 1)
        status_start = function_text.index(marker)
        status_end = function_text.index("\n", status_start)
        status_line = function_text[status_start:status_end]
        self.assertTrue(status_line.endswith(' else "failed"'))
        mutated_line = status_line[:-len(' else "failed"')] + ' else "fail"'
        mutated = self.auto_check_text.replace(status_line, mutated_line, 1)
        with self.assertRaises(LaneSafetyError):
            self._validate(auto_check=mutated)

    def test_all_three_project_feature_overrides_are_required(self) -> None:
        for lane_record in LANES.values():
            for line in (
                f'config/use_custom_user_dir.{lane_record["feature"]}=true',
                f'config/custom_user_dir_name.{lane_record["feature"]}="{lane_record["customUserDirName"]}"',
            ):
                with self.subTest(line=line):
                    with self.assertRaises(LaneSafetyError):
                        self._validate(project=self.project_text.replace(f"{line}\n", "", 1))

    def test_reserved_lane_features_cannot_enter_project_base_features(self) -> None:
        base_features = 'config/features=PackedStringArray("4.7", "Mobile")'
        self.assertEqual(self.project_text.count(base_features), 1)
        for lane_record in LANES.values():
            feature = lane_record["feature"]
            with self.subTest(feature=feature):
                mutated = self.project_text.replace(
                    base_features,
                    f'config/features=PackedStringArray("4.7", "Mobile", "{feature}")',
                    1,
                )
                mutated += f"\n; retained old literal: {base_features}\n"
                with self.assertRaises(LaneSafetyError):
                    self._validate(project=mutated)

    def test_missing_feature_or_exact_root_fail_branches_are_rejected(self) -> None:
        mutations = (
            "if not OS.has_feature(expected_feature):",
            'return _reject_qa_user_data_lane("missing_feature")',
            "if actual_root != expected_root:",
            'return _reject_qa_user_data_lane("user_data_root_mismatch",',
            'ProjectSettings.globalize_path("user://")',
        )
        for fragment in mutations:
            with self.subTest(fragment=fragment):
                with self.assertRaises(LaneSafetyError):
                    self._validate(main=self.main_text.replace(fragment, "", 1))

    def test_startup_login_cannot_relaunch_or_continue_without_lane(self) -> None:
        for obsolete in (
            "--user-data-dir",
            "OS.create_process",
            "_restart_with_startup_login_user_data_dir_if_needed",
        ):
            with self.subTest(obsolete=obsolete):
                with self.assertRaises(LaneSafetyError):
                    self._validate(main=f"{self.main_text}\n# {obsolete}\n")
        for required in (
            "if startup_auth_login_arg_present or auto_startup_login_check:",
            'return _reject_qa_user_data_lane("startup_login_requires_lane")',
        ):
            with self.subTest(required=required):
                mutated = self.main_text.replace(required, "", 1)
                self.assertNotEqual(mutated, self.main_text)
                with self.assertRaises(LaneSafetyError):
                    self._validate(main=mutated)

    def test_attestation_capture_preflight_and_phase404_gate_order_is_bound(self) -> None:
        original = (
            "\tif _run_pet_battle_user_root_preflight_if_requested():\n"
            "\t\treturn\n"
            "\tPetBattleReleaseGate.initialize()\n"
            "\t_configure_runtime_performance()"
        )
        moved = self.main_text.replace(
            original,
            (
                "\tPetBattleReleaseGate.initialize()\n"
                "\tif _run_pet_battle_user_root_preflight_if_requested():\n"
                "\t\treturn\n"
                "\t_configure_runtime_performance()"
            ),
            1,
        )
        self.assertNotEqual(moved, self.main_text)
        with self.assertRaises(LaneSafetyError):
            self._validate(main=moved)

    def test_pet_codex_main_host_wiring_is_source_contract_bound(self) -> None:
        preload = (
            "const PetCodexAwakenedOwnerReviewCapture := preload(\n"
            '\t"res://scripts/qa/pet_codex_awakened_owner_review_capture.gd"\n'
            ")\n"
        )
        pet_auth_block = (
            "\t\t# Formal owner review uses an isolated player session, never the generic\n"
            "\t\t# dev-GM bypass that other QA entrypoints may select above.\n"
            "\t\tauth_auto_bypass = false\n"
        )
        mutations = (
            self.main_text.replace(
                preload,
                preload.replace("pet_codex", "changed_pet_codex"),
                1,
            ),
            self.main_text.replace(
                "var pet_codex_awakened_owner_review_capture: bool = false",
                "var pet_codex_awakened_owner_review_capture: bool = true",
                1,
            ),
            self.main_text.replace(
                "or PetCodexAwakenedOwnerReviewCapture.is_flag(normalized)",
                "or false",
                1,
            ),
            self.main_text.replace(
                "elif arg == PetCodexAwakenedOwnerReviewCapture.CAPTURE_FLAG:",
                "elif false:",
                1,
            ),
            self.main_text.replace(pet_auth_block, "", 1),
            self.main_text.replace(
                "\t\tand not pet_codex_awakened_owner_review_capture\n",
                "",
                1,
            ),
            self.main_text.replace(
                "\t\t\tor pet_codex_awakened_owner_review_capture\n",
                "",
                1,
            ),
            self.main_text.replace(
                '\t\tcall_deferred("_run_pet_codex_awakened_owner_review_capture")\n',
                "",
                1,
            ),
            self.main_text.replace(
                "await PetCodexAwakenedOwnerReviewCapture.new(self).run()",
                "await PetCodexAwakenedOwnerReviewCapture.new(null).run()",
                1,
            ),
        )
        for mutated in mutations:
            with self.subTest(mutated_sha=hashlib.sha256(mutated.encode()).hexdigest()):
                self.assertNotEqual(mutated, self.main_text)
                with self.assertRaises(LaneSafetyError):
                    self._validate(main=mutated)

    def test_battle_layout_main_host_wiring_is_source_contract_bound(self) -> None:
        preload = (
            "const BattleLayoutOwnerReviewCapture := preload(\n"
            '\t"res://scripts/qa/battle_layout_owner_review_capture.gd"\n'
            ")\n"
        )
        battle_auth_block = (
            "\t\t# Formal Phase403 evidence uses an isolated player session, never the\n"
            "\t\t# generic dev-GM bypass selected by ordinary QA entrypoints.\n"
            "\t\tauth_auto_bypass = false\n"
        )
        capture_branch = (
            "\t\telif arg == BattleLayoutOwnerReviewCapture.CAPTURE_FLAG:\n"
            "\t\t\tbattle_layout_owner_review_capture = true\n"
            "\t\t\tbattle_layout_owner_review_capture_arg_count += 1\n"
        )
        perf_branch = (
            "\t\telif arg == BattleLayoutOwnerReviewCapture.PERF_CAPTURE_FLAG:\n"
            "\t\t\tbattle_layout_owner_review_capture = true\n"
            "\t\t\tbattle_layout_perf_arg_count += 1\n"
        )
        mutations = (
            self.main_text.replace(
                preload,
                preload.replace("battle_layout", "changed_battle_layout"),
                1,
            ),
            self.main_text.replace(
                "var battle_layout_owner_review_capture: bool = false",
                "var battle_layout_owner_review_capture: bool = true",
                1,
            ),
            self.main_text.replace(
                "or BattleLayoutOwnerReviewCapture.is_flag(normalized)",
                "or false",
                1,
            ),
            self.main_text.replace(
                capture_branch,
                capture_branch.replace(
                    "battle_layout_owner_review_capture_arg_count += 1",
                    "battle_layout_owner_review_capture_arg_count += 2",
                ),
                1,
            ),
            self.main_text.replace(
                perf_branch,
                perf_branch.replace(
                    "battle_layout_owner_review_capture = true",
                    "battle_layout_owner_review_capture = false",
                ),
                1,
            ),
            self.main_text.replace(battle_auth_block, "", 1),
            self.main_text.replace(
                "\t\tand not battle_layout_owner_review_capture\n",
                "",
                1,
            ),
            self.main_text.replace(
                "\t\t\tor battle_layout_owner_review_capture\n",
                "",
                1,
            ),
            self.main_text.replace(
                '\t\tcall_deferred("_run_battle_layout_owner_review_capture")\n',
                "",
                1,
            ),
            self.main_text.replace(
                "await BattleLayoutOwnerReviewCapture.new(self).run()",
                "await BattleLayoutOwnerReviewCapture.new(null).run()",
                1,
            ),
        )
        for mutated in mutations:
            with self.subTest(mutated_sha=hashlib.sha256(mutated.encode()).hexdigest()):
                self.assertNotEqual(mutated, self.main_text)
                with self.assertRaises(LaneSafetyError):
                    self._validate(main=mutated)

    def test_pet_and_battle_capture_entrypoints_are_mutually_exclusive(self) -> None:
        cross_contract = (
            "\tif (\n"
            "\t\t(\n"
            "\t\t\tpet_codex_awakened_owner_review_capture_arg_count > 0\n"
            "\t\t\tor pet_codex_awakened_owner_review_native_perf_arg_count > 0\n"
            "\t\t)\n"
            "\t\tand (\n"
            "\t\t\tbattle_layout_owner_review_capture_arg_count > 0\n"
            "\t\t\tor battle_layout_perf_arg_count > 0\n"
            "\t\t)\n"
            "\t):\n"
            "\t\tvar cross_capture_error := \"图鉴验收与战斗布局验收入口不可同时启用\"\n"
            "\t\tpet_codex_awakened_owner_review_parse_error = cross_capture_error\n"
            "\t\tbattle_layout_owner_review_parse_error = cross_capture_error\n"
        )
        self.assertEqual(self.main_text.count(cross_contract), 1)
        changed_contracts = (
            cross_contract.replace(
                "pet_codex_awakened_owner_review_capture_arg_count > 0",
                "false",
                1,
            ),
            cross_contract.replace(
                "pet_codex_awakened_owner_review_native_perf_arg_count > 0",
                "false",
                1,
            ),
            cross_contract.replace(
                "battle_layout_owner_review_capture_arg_count > 0",
                "false",
                1,
            ),
            cross_contract.replace("battle_layout_perf_arg_count > 0", "false", 1),
            cross_contract.replace("\t\tand (\n", "\t\tor (\n", 1),
            cross_contract.replace(
                "\t\tpet_codex_awakened_owner_review_parse_error = cross_capture_error\n",
                "",
                1,
            ),
            cross_contract.replace(
                "\t\tbattle_layout_owner_review_parse_error = cross_capture_error\n",
                "",
                1,
            ),
            cross_contract.replace(
                "\t\tbattle_layout_owner_review_parse_error = cross_capture_error",
                '\t\tbattle_layout_owner_review_parse_error = "changed"',
                1,
            ),
        )
        for changed_contract in changed_contracts:
            mutated = self.main_text.replace(cross_contract, changed_contract, 1)
            with self.subTest(mutated_sha=hashlib.sha256(mutated.encode()).hexdigest()):
                self.assertNotEqual(mutated, self.main_text)
                with self.assertRaises(LaneSafetyError):
                    self._validate(main=mutated)

    def test_phase404_release_gate_preflight_and_pck_bindings_are_source_contract_bound(self) -> None:
        mutations = (
            self.main_text.replace(
                'const PetBattleReleaseGate := preload("res://scripts/pet/pet_battle_release_gate.gd")',
                'const PetBattleReleaseGate := preload("res://scripts/pet/pet_action_asset_catalog.gd")',
                1,
            ),
            self.main_text.replace(
                'const PET_BATTLE_USER_ROOT_PREFLIGHT_ENV := "BEASTBOUND_PET_BATTLE_USER_ROOT_PREFLIGHT"',
                'const PET_BATTLE_USER_ROOT_PREFLIGHT_ENV := "CHANGED_PREFLIGHT"',
                1,
            ),
            self.main_text.replace(
                'const PET_BATTLE_REPO_ROOT_SHA256_ENV := "BEASTBOUND_PET_BATTLE_REPO_ROOT_SHA256"',
                'const PET_BATTLE_REPO_ROOT_SHA256_ENV := "CHANGED_REPO_SHA256"',
                1,
            ),
            self.main_text.replace(
                "\tPetBattleReleaseGate.initialize()",
                "\tpass # release gate removed",
                1,
            ),
            self.main_text.replace(
                "\tif _run_pet_battle_user_root_preflight_if_requested():\n\t\treturn\n",
                "",
                1,
            ),
            self.main_text.replace(
                'result["pckProfileSaveEnabled"] = profile_save_enabled',
                'result["pckProfileSaveEnabled"] = true',
                1,
            ),
            self.main_text.replace(
                'result["pckRepoRootSha256"] = OS.get_environment(PET_BATTLE_REPO_ROOT_SHA256_ENV)',
                'result["pckRepoRootSha256"] = ""',
                1,
            ),
        )
        for mutated in mutations:
            with self.subTest(mutated_sha=hashlib.sha256(mutated.encode()).hexdigest()):
                self.assertNotEqual(mutated, self.main_text)
                with self.assertRaises(LaneSafetyError):
                    self._validate(main=mutated)

    def test_local_world_debug_requires_lane_but_server_url_alone_does_not(self) -> None:
        local_marker = 'or normalized == "--local-world-move"'
        mutated = self.main_text.replace(local_marker, "", 1)
        self.assertNotEqual(mutated, self.main_text)
        with self.assertRaises(LaneSafetyError):
            self._validate(main=mutated)

        function_start = self.main_text.index("func _dev_entrypoint_arg(arg: String) -> bool:")
        function_end = self.main_text.index("\nfunc ", function_start + 1)
        server_url_mutation = (
            self.main_text[:function_end]
            + '\n\t\tor normalized == "--server-url"'
            + self.main_text[function_end:]
        )
        with self.assertRaises(LaneSafetyError):
            self._validate(main=server_url_mutation)

    def test_main_lane_constants_are_exact_top_level_assignments(self) -> None:
        mutations = (
            ("beastbound_qa_automation", "beastbound_qa_automation_changed"),
            ("BeastboundOdysseyQA_Automation", "BeastboundOdysseyQA_AutomationChanged"),
            ("beastbound_qa_client1", "beastbound_qa_client1_changed"),
            ("BeastboundOdysseyQA_Client1", "BeastboundOdysseyQA_Client1Changed"),
            ("beastbound_qa_client2", "beastbound_qa_client2_changed"),
            ("BeastboundOdysseyQA_Client2", "BeastboundOdysseyQA_Client2Changed"),
            (
                'const QA_USER_DATA_LANE_ARG_PREFIX := "--beastbound-qa-user-data-lane="',
                'const QA_USER_DATA_LANE_ARG_PREFIX := "--changed-lane="',
            ),
            (
                'const QA_USER_DATA_LANE_ENV := "BEASTBOUND_QA_USER_DATA_LANE"',
                'const QA_USER_DATA_LANE_ENV := "CHANGED_QA_USER_DATA_LANE"',
            ),
            (
                'const QA_USER_DATA_ROOT_ENV := "BEASTBOUND_QA_EXPECTED_USER_DATA_ROOT"',
                'const QA_USER_DATA_ROOT_ENV := "CHANGED_QA_EXPECTED_USER_DATA_ROOT"',
            ),
            (
                'const QA_USER_DATA_ATTESTATION_PREFIX := "BEASTBOUND_QA_USER_DATA_ATTESTATION: "',
                'const QA_USER_DATA_ATTESTATION_PREFIX := "CHANGED_QA_ATTESTATION: "',
            ),
        )
        for original, replacement in mutations:
            with self.subTest(original=original):
                self.assertIn(original, self.main_text)
                mutated = self.main_text.replace(original, replacement, 1)
                mutated += f"\n# retained old literal: {original}\n"
                with self.assertRaises(LaneSafetyError):
                    self._validate(main=mutated)

        client2_block = (
            '\t"client2": {\n'
            '\t\t"feature": "beastbound_qa_client2",\n'
            '\t\t"customUserDirName": "BeastboundOdysseyQA_Client2",\n'
            "\t},\n"
        )
        self.assertIn(client2_block, self.main_text)
        with self.assertRaises(LaneSafetyError):
            self._validate(main=self.main_text.replace(client2_block, "", 1))

    def test_runner_verify_cleanup_attestation_and_process_group_are_required(self) -> None:
        for fragment in (
            "verifyQaLane",
            "cleanupQaLane",
            "parseQaLaneAttestation",
            "terminateProcessGroup",
            'const QA_LANE_ARG = "--beastbound-qa-user-data-lane=automation";',
        ):
            with self.subTest(fragment=fragment):
                with self.assertRaises(LaneSafetyError):
                    self._validate(runner=self.runner_text.replace(fragment, "deleted_contract", 1))

    def test_runner_safety_constants_are_exact_top_level_assignments(self) -> None:
        mutations = (
            ('const MAIN_GD = path.join(REPO_ROOT, "client/godot/scripts/main.gd");',
             'const MAIN_GD = path.join(REPO_ROOT, "changed/main.gd");'),
            ('const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, ".run/godot_auto_checks");',
             'const DEFAULT_OUTPUT_DIR = path.join(REPO_ROOT, ".run/changed");'),
            ('(process.platform === "win32" ? "python" : "/usr/bin/python3");',
             '(process.platform === "win32" ? "python" : "python3");'),
            ("const MAX_CHECK_OUTPUT_BYTES = 32 * 1024 * 1024;",
             "const MAX_CHECK_OUTPUT_BYTES = Number.MAX_SAFE_INTEGER;"),
            ("const PROCESS_GROUP_CLOSE_TIMEOUT_MS = 10000;",
             "const PROCESS_GROUP_CLOSE_TIMEOUT_MS = 0;"),
            ('const CONTAINMENT_SCOPE = "cooperative_inherited_pgid";',
             'const CONTAINMENT_SCOPE = "absolute_all_descendants";'),
            ('const PARSE_CHECK_NAME = "godot-parse";', 'const PARSE_CHECK_NAME = "changed";'),
            ('const QA_LANE = "automation";', 'const QA_LANE = "client1";'),
            ('const QA_LANE_FEATURE = "beastbound_qa_automation";',
             'const QA_LANE_FEATURE = "beastbound_qa_client1";'),
            ('const QA_LANE_CUSTOM_USER_DIR_NAME = "BeastboundOdysseyQA_Automation";',
             'const QA_LANE_CUSTOM_USER_DIR_NAME = "BeastboundOdysseyQA_Client1";'),
            ('const QA_LANE_ARG = "--beastbound-qa-user-data-lane=automation";',
             'const QA_LANE_ARG = "--beastbound-qa-user-data-lane=client1";'),
            ('const QA_ATTESTATION_PREFIX = "BEASTBOUND_QA_USER_DATA_ATTESTATION: ";',
             'const QA_ATTESTATION_PREFIX = "CHANGED: ";'),
            ('const QA_LANE_HELPER = path.join(REPO_ROOT, "tools/godot_qa_user_data_lane.py");',
             'const QA_LANE_HELPER = path.join(REPO_ROOT, "tools/changed.py");'),
        )
        for original, replacement in mutations:
            with self.subTest(original=original):
                self.assertIn(original, self.runner_text)
                mutated = self.runner_text.replace(original, replacement, 1)
                mutated += f"\n// retained old literal: {original}\n"
                with self.assertRaises(LaneSafetyError):
                    self._validate(runner=mutated)

    def test_runner_owner_order_preservation_and_summary_contracts_are_required(self) -> None:
        for fragment in (
            'writeProcessEvidence(`qa_lane_prepare_owner_sha256=${qaLaneOwnerSha256}\\n`);',
            "validateQaLaneSourceContract();",
            "qaLaneReclaim = reclaimStaleQaLane();",
            "qaLane = prepareQaLane(process.env, qaLaneOwner);",
            'qaLane.initialVerification = verifyQaLaneOrPreserve(qaLane, "initial_lane_verification");',
            "assertPreflightProbeContained(preflight.versionProbe, \"version\");",
            "if (result.processGroupClosed === false || result.processGroupResidualObserved === true) {",
            ': "process_group_residual_reaped";',
            "function buildRunSummary({",
            "processGroupResidualObserved: closure.residualObserved,",
        ):
            with self.subTest(fragment=fragment):
                mutated = self.runner_text.replace(fragment, "deleted_contract", 1)
                self.assertNotEqual(mutated, self.runner_text)
                with self.assertRaises(LaneSafetyError):
                    self._validate(runner=mutated)

        owner_line = 'writeProcessEvidence(`qa_lane_prepare_owner_sha256=${qaLaneOwnerSha256}\\n`);'
        prepare_line = "qaLane = prepareQaLane(process.env, qaLaneOwner);"
        moved = self.runner_text.replace(owner_line, "", 1).replace(
            prepare_line,
            f"{prepare_line}\n    {owner_line}",
            1,
        )
        with self.assertRaises(LaneSafetyError):
            self._validate(runner=moved)

        with self.assertRaises(LaneSafetyError):
            self._validate(runner=f'{self.runner_text}\nrunQaLaneHelper("recover", []);\n')

    def test_runner_text_completion_top_level_scanner_is_exact(self) -> None:
        for fragment in (
            "function parseTextAutoCompletionFields(sourceText, flag) {",
            '|| (codePoint >= 0x7f && codePoint <= 0x9f)',
            'if (stack.length === 0 || stack.at(-1) !== expectedOpening) {',
            'const atBoundary = index === 0 || source[index - 1] === " " || source[index - 1] === "\\t";',
            'if (evidence.has(field.key)) {',
            'fields[0].start !== 0 || fields[0].key !== "status"',
        ):
            with self.subTest(fragment=fragment):
                self.assertIn(fragment, self.runner_text)
                mutated = self.runner_text.replace(fragment, "deleted_contract", 1)
                with self.assertRaises(LaneSafetyError):
                    self._validate(runner=mutated)

    def test_capability_gate_and_atomic_authority_functions_cannot_be_nooped(self) -> None:
        module = ast.parse(self.helper_text)
        functions = {
            node.name: node
            for node in module.body
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef))
        }
        for name in (
            "_require_posix_lane_lifecycle",
            "_publish_regular_file_exclusive",
            "_read_published_authority_payload",
            "_remove_created_regular_file",
            "_remove_tree_posix",
        ):
            with self.subTest(name=name):
                lines = self.helper_text.splitlines(keepends=True)
                insert_at = functions[name].body[0].lineno - 1
                lines.insert(insert_at, "    return\n")
                mutated = "".join(lines)
                self.assertNotEqual(mutated, self.helper_text)
                with self.assertRaises(LaneSafetyError):
                    self._validate(helper=mutated)

    def test_helper_owner_no_follow_real_hash_and_exact_cleanup_are_required(self) -> None:
        for fragment, replacement in (
            (
                "flags = os.O_CREAT | os.O_EXCL | os.O_RDWR | os.O_NOFOLLOW",
                "flags = os.O_CREAT | os.O_EXCL | os.O_RDWR",
            ),
            ("or current_stat.st_nlink != expected_nlink", "or False"),
            (
                "os.link(\n            pending_name,",
                "os.link(\n            published_name,",
            ),
            ("entry.stat(follow_symlinks=False)", "entry.stat(follow_symlinks=True)"),
            ("reject_executables=True", "reject_executables=False"),
            (
                'raise LaneSafetyError("QA lane owner canary does not match the requested owner")',
                "return",
            ),
            (
                "        _remove_tree_no_follow(\n            lane_root,\n            lane,\n            owner,",
                "        inventory_tree(\n            lane_root,\n            lane,\n            owner,",
            ),
        ):
            with self.subTest(fragment=fragment):
                mutated = self.helper_text.replace(fragment, replacement, 1)
                self.assertNotEqual(mutated, self.helper_text)
                with self.assertRaises(LaneSafetyError):
                    self._validate(helper=mutated)

if __name__ == "__main__":
    unittest.main()
