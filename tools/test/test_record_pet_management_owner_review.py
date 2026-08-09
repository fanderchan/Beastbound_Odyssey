#!/usr/bin/env python3
"""Focused static and mocked lifecycle tests for owner-review recorders."""

from __future__ import annotations

import importlib.util
import copy
import json
import os
import signal
import subprocess
import tempfile
import unittest
from unittest import mock
from pathlib import Path


REPO_ROOT = Path(__file__).resolve().parents[2]
TOOL_PATH = REPO_ROOT / "tools" / "record_pet_management_owner_review.py"
CODEX_PATH = REPO_ROOT / "tools" / "record_pet_codex_awakened_owner_review.py"
BATTLE_LAYOUT_PATH = REPO_ROOT / "tools" / "record_battle_layout_owner_review.py"
BATTLE_LAYOUT_PERF_PATH = REPO_ROOT / "tools" / "capture_battle_layout_perf.py"
SPEC = importlib.util.spec_from_file_location(
    "record_pet_management_owner_review_test_target",
    TOOL_PATH,
)
assert SPEC is not None and SPEC.loader is not None
TOOL = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(TOOL)


class _FakeProcess:
    def __init__(self, result: int | BaseException, pid: int = 43100) -> None:
        self.pid = pid
        self._result = result

    def wait(self, timeout: float) -> int:
        del timeout
        if isinstance(self._result, BaseException):
            raise self._result
        return self._result


class _FakeLaneHelper:
    def __init__(self, *, fail_verify_call: int = 0, fail_cleanup: bool = False) -> None:
        self.calls: list[str] = []
        self.verify_calls = 0
        self.fail_verify_call = fail_verify_call
        self.fail_cleanup = fail_cleanup
        self.real_sha = "c" * 64
        self.lane_sha = "a" * 64

    def validate_repository_contract(self, root: Path) -> None:
        self.calls.append("source")
        if root != REPO_ROOT:
            raise AssertionError(root)

    def prepare_lane(self, lane: str, features: str, owner: str) -> dict:
        self.calls.append("prepare")
        if lane != TOOL.QA_LANE or features != "existing_feature":
            raise AssertionError((lane, features))
        return {
            "status": "prepared",
            "lane": lane,
            "owner": owner,
            "feature": TOOL.QA_LANE_FEATURE,
            "customUserDirName": TOOL.QA_LANE_CUSTOM_USER_DIR_NAME,
            "laneRoot": "/tmp/lane",
            "godotLaneRoot": "/tmp/lane",
            "realRoot": "/tmp/real",
            "godotRealRoot": "/tmp/real",
            "realInventorySha256": self.real_sha,
            "realEntryCount": 3,
            "laneInventorySha256": self.lane_sha,
            "laneEntryCount": 1,
            "editorCustomFeatures": f"existing_feature,{TOOL.QA_LANE_FEATURE}",
        }

    def verify_lane(self, lane: str, owner: str, real_sha: str) -> dict:
        del owner
        self.calls.append("verify")
        self.verify_calls += 1
        if self.verify_calls == self.fail_verify_call:
            raise RuntimeError("verify drift")
        if lane != TOOL.QA_LANE or real_sha != self.real_sha:
            raise AssertionError((lane, real_sha))
        self.lane_sha = chr(ord("a") + self.verify_calls) * 64
        return {
            "status": "verified",
            "lane": TOOL.QA_LANE,
            "owner": "1" * 32,
            "feature": TOOL.QA_LANE_FEATURE,
            "laneRoot": "/tmp/lane",
            "godotLaneRoot": "/tmp/lane",
            "realRoot": "/tmp/real",
            "realInventorySha256": self.real_sha,
            "realEntryCount": 3,
            "realUnchanged": True,
            "laneInventorySha256": self.lane_sha,
            "laneEntryCount": 1,
        }

    def cleanup_lane(self, lane: str, owner: str, real_sha: str) -> dict:
        self.calls.append("cleanup")
        if self.fail_cleanup:
            raise RuntimeError("cleanup failed")
        return {
            "status": "cleaned",
            "lane": lane,
            "owner": owner,
            "feature": TOOL.QA_LANE_FEATURE,
            "laneRoot": "/tmp/lane",
            "laneAbsent": True,
            "removedLaneInventorySha256": self.lane_sha,
            "removedLaneEntryCount": 1,
            "realRoot": "/tmp/real",
            "realInventorySha256": real_sha,
            "realUnchanged": True,
        }

    def inspect_lane(self, lane: str, owner: str) -> dict:
        self.calls.append("inspect")
        report = {
            "status": "inspected",
            "lane": lane,
            "owner": owner,
            "feature": TOOL.QA_LANE_FEATURE,
            "laneRoot": "/tmp/lane",
            "realRoot": "/tmp/real",
            "pendingLockPayloadSha256": "",
            "pendingLockedRealInventorySha256": "",
            "laneRootState": "absent",
            "ownerCanaryState": "not_applicable",
            "pendingOwnerState": "not_applicable",
            "pendingOwnerPayloadSha256": "",
            "publishedLockState": "absent",
            "pendingLockState": "absent",
            "lockedRealInventorySha256": "",
            "laneInventorySha256": TOOL.hashlib.sha256(b"absent\n").hexdigest(),
            "laneEntryCount": 0,
            "realInventorySha256": self.real_sha,
            "realEntryCount": 3,
        }
        return {
            **report,
            "inspectionSha256": TOOL.hashlib.sha256(
                json.dumps(
                    report,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                ).encode()
            ).hexdigest(),
        }


def _canonical_attestation(root: str = "/tmp/lane") -> str:
    payload = {
        "customUserDirName": TOOL.QA_LANE_CUSTOM_USER_DIR_NAME,
        "feature": TOOL.QA_LANE_FEATURE,
        "lane": TOOL.QA_LANE,
        "status": "passed",
        "userDataRoot": root,
    }
    return TOOL.QA_ATTESTATION_PREFIX + json.dumps(
        payload,
        ensure_ascii=False,
        sort_keys=True,
        separators=(",", ":"),
    )


def _clean_process(phase: str) -> dict:
    return {
        "phase": phase,
        "containmentScope": TOOL.CONTAINMENT_SCOPE,
        "command": ["godot"],
        "exitCode": 0,
        "leaderReaped": True,
        "timedOut": False,
        "signalOrError": "",
        "processGroupClosed": True,
        "processGroupResidualObserved": False,
        "processGroupTermSent": False,
        "processGroupKillSent": False,
    }


def _tools_help() -> str:
    return (
        "\x1b[92m-e, --editor  Start the editor.\x1b[0m\n"
        "\x1b[92m-p, --project-manager  Start project manager.\x1b[0m\n"
    )


class PetManagementOfficialLaneTest(unittest.TestCase):
    def _run_dir(self) -> tempfile.TemporaryDirectory[str]:
        evidence_root = REPO_ROOT / ".run" / "evidence"
        evidence_root.mkdir(parents=True, exist_ok=True)
        return tempfile.TemporaryDirectory(dir=evidence_root)

    def test_commands_have_one_lane_marker_and_no_bad_user_data_flag(self) -> None:
        movie = TOOL._build_godot_command(
            godot="godot",
            avi_path=Path("/tmp/review.avi"),
            capture_flag="--capture",
        )
        native = TOOL._build_native_godot_command(
            godot="godot",
            capture_flag="--capture",
        )
        for command in (movie, native):
            self.assertNotIn("--user-data-dir", command)
            self.assertEqual(command.count(TOOL.QA_LANE_ARGUMENT), 1)
            self.assertGreater(command.index(TOOL.QA_LANE_ARGUMENT), command.index("--"))
        with self.assertRaises(TOOL.PetManagementRecordingError):
            TOOL._build_godot_command(
                godot="godot",
                avi_path=Path("/tmp/review.avi"),
                capture_flag="--capture",
                review_args=("--beastbound-qa-user-data-lane=client1",),
            )

    def test_lane_environment_preserves_home_xdg_and_rejects_reserved_conflict(self) -> None:
        base = {
            "HOME": "/home/player",
            "XDG_DATA_HOME": "/data/player",
            "GODOT_EDITOR_CUSTOM_FEATURES": "existing_feature",
        }
        prepared = {
            "editorCustomFeatures": f"existing_feature,{TOOL.QA_LANE_FEATURE}",
            "godotLaneRoot": "/tmp/lane",
        }
        environment = TOOL._build_lane_environment(base, prepared)
        self.assertEqual(environment["HOME"], base["HOME"])
        self.assertEqual(environment["XDG_DATA_HOME"], base["XDG_DATA_HOME"])
        self.assertEqual(
            set(environment) - set(base),
            {"BEASTBOUND_QA_USER_DATA_LANE", "BEASTBOUND_QA_EXPECTED_USER_DATA_ROOT"},
        )
        with self.assertRaises(TOOL.LANE_HELPER.LaneSafetyError):
            TOOL.LANE_HELPER.merge_editor_custom_features(
                "beastbound_qa_client1",
                TOOL.QA_LANE_FEATURE,
            )

    def test_exact_attestation_accepts_only_one_column_zero_canonical_report(self) -> None:
        session = {"godotLaneRoot": "/tmp/lane"}
        with self._run_dir() as directory:
            log = Path(directory) / "godot.log"
            log.write_text(_canonical_attestation() + "\n", encoding="utf-8")
            self.assertEqual(
                TOOL._parse_exact_qa_lane_attestation(log, session)["status"],
                "passed",
            )
            invalid = [
                "",
                " " + _canonical_attestation(),
                _canonical_attestation() + "\n" + _canonical_attestation(),
                _canonical_attestation("/tmp/wrong"),
                _canonical_attestation().replace('"status":"passed"', '"status":"failed"'),
                _canonical_attestation().replace("{", '{"extra":true,', 1),
            ]
            for value in invalid:
                with self.subTest(value=value[:40]):
                    log.write_text(value + "\n", encoding="utf-8")
                    with self.assertRaises(TOOL.PetManagementRecordingError):
                        TOOL._parse_exact_qa_lane_attestation(log, session)
            for separator in ("\r", "\v", "\f", "\u0085", "\u2028", "\u2029"):
                with self.subTest(separator=repr(separator)):
                    with log.open("w", encoding="utf-8", newline="") as stream:
                        stream.write("not-column-zero" + separator + _canonical_attestation())
                    with self.assertRaises(TOOL.PetManagementRecordingError):
                        TOOL._parse_exact_qa_lane_attestation(log, session)
            with log.open("w", encoding="utf-8", newline="") as stream:
                stream.write(_canonical_attestation() + "\r\n")
            self.assertEqual(
                TOOL._parse_exact_qa_lane_attestation(log, session)["status"],
                "passed",
            )

    def test_godot_settlement_natural_nonzero_residual_timeout_and_baseexception(self) -> None:
        with self._run_dir() as directory:
            root = Path(directory)
            clean = TOOL._run_godot_with_settlement(
                ["godot"], phase="clean", log_path=root / "clean.log",
                timeout_seconds=1.0, environment={},
                dependencies={
                    "popen": lambda *args, **kwargs: _FakeProcess(0, 43101),
                    "settlement_dependencies": {"process_group_exists": lambda _pgid: False},
                },
            )
            self.assertTrue(clean["processGroupClosed"])
            nonzero = TOOL._run_godot_with_settlement(
                ["godot"], phase="nonzero", log_path=root / "nonzero.log",
                timeout_seconds=1.0, environment={},
                dependencies={
                    "popen": lambda *args, **kwargs: _FakeProcess(7, 43102),
                    "settlement_dependencies": {"process_group_exists": lambda _pgid: False},
                },
            )
            self.assertEqual(nonzero["exitCode"], 7)

            states = iter((True, False))
            kills: list[int] = []
            with self.assertRaises(TOOL.GodotLanePreservationError) as residual:
                TOOL._run_godot_with_settlement(
                    ["godot"], phase="residual", log_path=root / "residual.log",
                    timeout_seconds=1.0, environment={},
                    dependencies={
                        "popen": lambda *args, **kwargs: _FakeProcess(0, 43103),
                        "settlement_dependencies": {
                            "process_group_exists": lambda _pgid: next(states),
                            "killpg": lambda _pgid, sent: kills.append(sent),
                        },
                    },
                )
            self.assertTrue(residual.exception.evidence["processGroupClosed"])
            self.assertTrue(residual.exception.evidence["processGroupResidualObserved"])
            self.assertIn(signal.SIGTERM, kills)

            timeout = subprocess.TimeoutExpired(["godot"], 0.01)
            timeout_states = iter((True, False))
            with self.assertRaises(TOOL.GodotLanePreservationError) as timed:
                TOOL._run_godot_with_settlement(
                    ["godot"], phase="timeout", log_path=root / "timeout.log",
                    timeout_seconds=0.01, environment={},
                    dependencies={
                        "popen": lambda *args, **kwargs: _FakeProcess(timeout, 43104),
                        "settlement_dependencies": {
                            "process_group_exists": lambda _pgid: next(timeout_states),
                            "killpg": lambda _pgid, _sent: None,
                        },
                    },
                )
            self.assertTrue(timed.exception.evidence["timedOut"])

            class _Unreadable(Exception):
                def __str__(self) -> str:
                    raise RuntimeError("bad diagnostic")

            with self.assertRaises(TOOL.GodotLanePreservationError) as setup:
                TOOL._run_godot_with_settlement(
                    ["godot"], phase="setup", log_path=root / "setup.log",
                    timeout_seconds=1.0, environment={},
                    dependencies={
                        "popen": lambda *args, **kwargs: _FakeProcess(0, 43105),
                        "after_spawn": lambda _process: (_ for _ in ()).throw(_Unreadable()),
                        "settlement_dependencies": {"process_group_exists": lambda _pgid: False},
                    },
                )
            self.assertIn("setup_or_wait_error", setup.exception.reason)
            for signum in (signal.SIGINT, signal.SIGTERM, signal.SIGHUP):
                with self.subTest(signum=signum):
                    with self.assertRaises(TOOL.GodotRecorderSignal) as interrupted:
                        TOOL._raise_godot_recorder_signal(signum, None)
                    self.assertEqual(interrupted.exception.signum, signum)

    def test_help_and_version_preflight_use_raw_exact_grammar(self) -> None:
        self.assertTrue(TOOL._godot_help_has_exact_tools_options(_tools_help()))
        self.assertTrue(TOOL._is_exact_godot_47_version("4.7.stable.official"))
        self.assertTrue(TOOL._is_exact_godot_47_version("4.7.stable.official\r"))
        self.assertFalse(TOOL._is_exact_godot_47_version("4.7.\nextra"))
        for value in (
            "\n4.7.stable.official",
            "4.7.stable.official\n",
            " 4.7.stable.official",
            "4.7.stable.official ",
            "\r4.7.stable.official",
            "\v4.7.stable.official",
            "\f4.7.stable.official",
            "\u00854.7.stable.official",
            "\u00a04.7.stable.official",
            "\u20284.7.stable.official",
            "\u20294.7.stable.official",
        ):
            with self.subTest(version=repr(value)):
                self.assertFalse(TOOL._is_exact_godot_47_version(value))
        invalid_help = (
            "Implies --editor\nImplies --project-manager",
            "--editor-pseudolocalization\n--project-manager-disabled",
            "\r-e, --editor\r-p, --project-manager",
            "--editor\rdescription\n--project-manager",
            "\x00-e, --editor\n-p, --project-manager",
            "\u009b92m-e, --editor\n-p, --project-manager",
            "\u00a0-e, --editor\n-p, --project-manager",
            "\u2028-e, --editor\n-p, --project-manager",
            "\u202e-e, --editor\n-p, --project-manager",
            "-e, --edi\x1b[92mtor\n-p, --project-manager",
            "\x1b[?92m-e, --editor\n-p, --project-manager",
            "-e, --editor\n",
        )
        for value in invalid_help:
            with self.subTest(value=repr(value)):
                self.assertFalse(TOOL._godot_help_has_exact_tools_options(value))
        with self._run_dir() as directory:
            log = Path(directory) / "help.log"
            log.write_bytes(("$ godot --help\r\n" + _tools_help().replace("\n", "\r\n")).encode())
            self.assertTrue(
                TOOL._godot_help_has_exact_tools_options(TOOL._godot_log_output(log))
            )
            log.write_bytes(
                b"$ godot --help\n\r-e, --editor\r-p, --project-manager\n"
            )
            self.assertFalse(
                TOOL._godot_help_has_exact_tools_options(TOOL._godot_log_output(log))
            )

    def test_prepare_verify_cleanup_and_inspect_payloads_are_exact(self) -> None:
        base = {
            "HOME": "/home/player",
            "GODOT_EDITOR_CUSTOM_FEATURES": "existing_feature",
        }
        owner = "1" * 32
        template = _FakeLaneHelper().prepare_lane(
            TOOL.QA_LANE,
            "existing_feature",
            owner,
        )

        class PreparePayload:
            def __init__(self, payload: dict) -> None:
                self.payload = payload

            def prepare_lane(self, *_args: object) -> dict:
                return copy.deepcopy(self.payload)

        mutations: list[dict] = []
        for field, value in (
            ("realEntryCount", True),
            ("laneInventorySha256", "A" * 64),
            ("godotLaneRoot", "/tmp/other"),
            ("editorCustomFeatures", f"existing_feature,{TOOL.QA_LANE_FEATURE},{TOOL.QA_LANE_FEATURE}"),
        ):
            mutated = copy.deepcopy(template)
            mutated[field] = value
            mutations.append(mutated)
        intersecting = copy.deepcopy(template)
        intersecting.update(
            {
                "laneRoot": "/tmp/real/lane",
                "godotLaneRoot": "/tmp/real/lane",
                "realRoot": "/tmp/real",
                "godotRealRoot": "/tmp/real",
            }
        )
        mutations.append(intersecting)
        extra = copy.deepcopy(template)
        extra["extra"] = True
        mutations.append(extra)
        for payload in mutations:
            with self.subTest(payload=payload):
                with self.assertRaises(TOOL.PetManagementRecordingError):
                    TOOL._prepare_automation_lane(base, owner, PreparePayload(payload))

        helper = _FakeLaneHelper()
        session = TOOL._prepare_automation_lane(base, owner, helper)
        valid_verify = helper.verify_lane(TOOL.QA_LANE, owner, helper.real_sha)

        class VerifyPayload:
            def __init__(self, payload: dict) -> None:
                self.payload = payload

            def verify_lane(self, *_args: object) -> dict:
                return copy.deepcopy(self.payload)

        for field, value in (
            ("realEntryCount", True),
            ("laneEntryCount", -1),
            ("laneRoot", "/tmp/wrong"),
            ("laneInventorySha256", "B" * 64),
        ):
            mutated = copy.deepcopy(valid_verify)
            mutated[field] = value
            with self.subTest(field=field):
                with self.assertRaises(TOOL.PetManagementRecordingError):
                    TOOL._verify_automation_lane(session, VerifyPayload(mutated))

        TOOL._verify_automation_lane(session, VerifyPayload(valid_verify))
        valid_cleanup = {
            "status": "cleaned",
            "lane": TOOL.QA_LANE,
            "owner": owner,
            "feature": TOOL.QA_LANE_FEATURE,
            "laneRoot": session["laneRoot"],
            "laneAbsent": True,
            "removedLaneInventorySha256": session["lastLaneInventorySha256"],
            "removedLaneEntryCount": session["lastLaneEntryCount"],
            "realRoot": session["realRoot"],
            "realInventorySha256": session["realInventorySha256"],
            "realUnchanged": True,
        }

        class CleanupPayload:
            def __init__(self, payload: dict) -> None:
                self.payload = payload

            def cleanup_lane(self, *_args: object) -> dict:
                return copy.deepcopy(self.payload)

        cleanup_mutations = []
        for field, value in (
            ("laneAbsent", 1),
            ("feature", "beastbound_qa_client1"),
            ("laneRoot", "/tmp/wrong"),
            ("removedLaneEntryCount", True),
            ("removedLaneInventorySha256", "A" * 64),
        ):
            mutated = copy.deepcopy(valid_cleanup)
            mutated[field] = value
            cleanup_mutations.append(mutated)
        extra_cleanup = copy.deepcopy(valid_cleanup)
        extra_cleanup["extra"] = True
        cleanup_mutations.append(extra_cleanup)
        for payload in cleanup_mutations:
            with self.subTest(cleanup=payload):
                with self.assertRaises(TOOL.PetManagementRecordingError):
                    TOOL._cleanup_automation_lane(session, CleanupPayload(payload))

        class InspectPayload:
            def __init__(self, payload: dict) -> None:
                self.payload = payload

            def inspect_lane(self, *_args: object) -> dict:
                return copy.deepcopy(self.payload)

        valid_inspect = helper.inspect_lane(TOOL.QA_LANE, owner)
        inspect_mutations = []
        for field, value in (
            ("laneEntryCount", 99),
            ("laneInventorySha256", "f" * 64),
            ("inspectionSha256", "e" * 64),
        ):
            mutated = copy.deepcopy(valid_inspect)
            mutated[field] = value
            inspect_mutations.append(mutated)
        extra_inspect = copy.deepcopy(valid_inspect)
        extra_inspect["extra"] = True
        inspect_mutations.append(extra_inspect)
        for payload in inspect_mutations:
            with self.subTest(inspect=payload):
                with self.assertRaises(TOOL.PetManagementRecordingError):
                    TOOL._inspect_clean_automation_lane(session, InspectPayload(payload))

        class NativeLookingString(str):
            pass

        string_fields = (
            "status", "lane", "owner", "feature", "laneRoot", "realRoot",
            "pendingLockState", "pendingLockPayloadSha256",
            "pendingLockedRealInventorySha256", "publishedLockState",
            "lockedRealInventorySha256", "laneRootState", "ownerCanaryState",
            "pendingOwnerState", "pendingOwnerPayloadSha256",
            "laneInventorySha256", "realInventorySha256",
        )
        for field in string_fields:
            mutated = copy.deepcopy(valid_inspect)
            mutated[field] = NativeLookingString(mutated[field])
            report = dict(mutated)
            report.pop("inspectionSha256")
            mutated["inspectionSha256"] = TOOL.hashlib.sha256(
                json.dumps(
                    report,
                    ensure_ascii=False,
                    sort_keys=True,
                    separators=(",", ":"),
                ).encode("utf-8")
            ).hexdigest()
            with self.subTest(inspect_string_subclass=field):
                with self.assertRaises(TOOL.PetManagementRecordingError):
                    TOOL._inspect_clean_automation_lane(session, InspectPayload(mutated))
        mutated = copy.deepcopy(valid_inspect)
        mutated["inspectionSha256"] = NativeLookingString(
            mutated["inspectionSha256"]
        )
        with self.assertRaises(TOOL.PetManagementRecordingError):
            TOOL._inspect_clean_automation_lane(session, InspectPayload(mutated))

    def test_prepare_ambiguous_has_durable_owner_and_never_cleans(self) -> None:
        class AmbiguousHelper(_FakeLaneHelper):
            def prepare_lane(self, lane: str, features: str, owner: str) -> dict:
                super().prepare_lane(lane, features, owner)
                raise RuntimeError("prepare result lost")

        helper = AmbiguousHelper()
        with self._run_dir() as directory:
            root = Path(directory)
            with self.assertRaises(TOOL.GodotLanePreservationError) as caught:
                TOOL._run_official_lane_godot_sequence(
                    run_dir=root,
                    godot="godot",
                    base_environment={
                        "HOME": "/home",
                        "GODOT_EDITOR_CUSTOM_FEATURES": "existing_feature",
                    },
                    native_command=["godot"],
                    movie_command=["godot"],
                    native_log=root / "native.log",
                    movie_log=root / "movie.log",
                    timeout_seconds=1.0,
                    native_log_validator=lambda _path: {"status": "passed"},
                    movie_log_validator=lambda _path: {"status": "passed"},
                    dependencies={
                        "lane_helper": helper,
                        "owner_factory": lambda: "1" * 32,
                        "godot_runner": lambda *_args, **_kwargs: self.fail("Godot runner reached"),
                    },
                )
            self.assertEqual(caught.exception.reason, "prepare_ambiguous")
            self.assertTrue((root / "qa-lane-owner.json").is_file())
            lifecycle = json.loads((root / "qa-lane-lifecycle.json").read_text())
            self.assertEqual(lifecycle["status"], "prepare_ambiguous")
            self.assertTrue(lifecycle["qaLanePreserved"])
            self.assertNotIn("cleanup", helper.calls)

    def test_source_and_authority_failures_stop_before_unsafe_work(self) -> None:
        with self._run_dir() as directory:
            root = Path(directory)
            helper = _FakeLaneHelper()
            with self.assertRaises(TOOL.PetManagementRecordingError):
                TOOL._run_official_lane_godot_sequence(
                    run_dir=root,
                    godot="godot",
                    base_environment={"GODOT_EDITOR_CUSTOM_FEATURES": "existing_feature"},
                    native_command=["godot"], movie_command=["godot"],
                    native_log=root / "native.log", movie_log=root / "movie.log",
                    timeout_seconds=1.0,
                    native_log_validator=lambda _path: {}, movie_log_validator=lambda _path: {},
                    dependencies={
                        "lane_helper": helper,
                        "source_checker": lambda _helper: {},
                        "godot_runner": lambda *_args, **_kwargs: self.fail("Godot runner reached"),
                    },
                )
            self.assertNotIn("prepare", helper.calls)
            self.assertFalse((root / "qa-lane-owner.json").exists())

        helper = _FakeLaneHelper()
        writes: list[str] = []

        def authority_writer(path: Path, value: dict) -> None:
            writes.append(str(value.get("status")))
            if value.get("status") == "trusted_product_failure_before_media":
                raise OSError("authority disk failure")
            TOOL._write_secure_json(path, value)

        def runner(command: list[str], *, phase: str, log_path: Path, **kwargs: object) -> dict:
            del command, kwargs
            if phase == "version":
                log_path.write_text("4.7.stable.official\n")
            elif phase == "help":
                log_path.write_text(_tools_help())
            else:
                log_path.write_text(_canonical_attestation() + "\n")
            result = _clean_process(phase)
            if phase == "native":
                result["exitCode"] = 7
            return result

        with self._run_dir() as directory:
            root = Path(directory)
            with self.assertRaises(TOOL.GodotLanePreservationError) as caught:
                TOOL._run_official_lane_godot_sequence(
                    run_dir=root, godot="godot",
                    base_environment={"GODOT_EDITOR_CUSTOM_FEATURES": "existing_feature"},
                    native_command=["godot"], movie_command=["godot"],
                    native_log=root / "native.log", movie_log=root / "movie.log",
                    timeout_seconds=1.0,
                    native_log_validator=lambda _path: {"status": "passed"},
                    movie_log_validator=lambda _path: {"status": "passed"},
                    dependencies={
                        "lane_helper": helper, "godot_runner": runner,
                        "owner_factory": lambda: "1" * 32,
                        "lifecycle_writer": authority_writer,
                    },
                )
            self.assertEqual(caught.exception.reason, "authority_write_failed")
            self.assertIn("native exit=7", caught.exception.evidence["originalError"])
            self.assertNotIn("cleanup", helper.calls)

    def test_log_setup_and_timeout_reap_fail_closed(self) -> None:
        with self._run_dir() as directory:
            root = Path(directory)
            with mock.patch.object(TOOL.os, "open", side_effect=OSError("log denied")):
                with self.assertRaises(TOOL.GodotLanePreservationError) as opened:
                    TOOL._run_godot_with_settlement(
                        ["godot"], phase="log", log_path=root / "log.txt",
                        timeout_seconds=1.0, environment={},
                    )
            self.assertEqual(opened.exception.reason, "log_setup_or_wait_error")
            self.assertFalse(opened.exception.evidence["processGroupClosed"])

            class TimedThenReaped:
                pid = 43200

                def __init__(self) -> None:
                    self.calls = 0

                def wait(self, timeout: float) -> int:
                    del timeout
                    self.calls += 1
                    if self.calls == 1:
                        raise subprocess.TimeoutExpired(["godot"], 0.01)
                    return -signal.SIGTERM

            states = iter((True, False))
            process = TimedThenReaped()
            with self.assertRaises(TOOL.GodotLanePreservationError) as timed:
                TOOL._run_godot_with_settlement(
                    ["godot"], phase="timeout-reap", log_path=root / "timeout-reap.log",
                    timeout_seconds=0.1, environment={},
                    dependencies={
                        "popen": lambda *_args, **_kwargs: process,
                        "settlement_dependencies": {
                            "process_group_exists": lambda _pgid: next(states),
                            "killpg": lambda _pgid, _sent: None,
                        },
                    },
                )
            self.assertTrue(timed.exception.evidence["leaderReaped"])
            self.assertTrue(timed.exception.evidence["processGroupClosed"])
            self.assertTrue(timed.exception.evidence["timedOut"])

    def test_full_sequence_orders_four_godot_phases_then_cleans_before_media(self) -> None:
        helper = _FakeLaneHelper()
        runs: list[str] = []
        lifecycle_snapshots: list[dict] = []

        def lifecycle_writer(path: Path, value: dict) -> None:
            lifecycle_snapshots.append(copy.deepcopy(value))
            TOOL._write_secure_json(path, value)

        def runner(command: list[str], *, phase: str, log_path: Path, **kwargs: object) -> dict:
            del command, kwargs
            runs.append(phase)
            if phase == "version":
                log_path.write_text("4.7.stable.official\n", encoding="utf-8")
            elif phase == "help":
                log_path.write_text(_tools_help(), encoding="utf-8")
            else:
                log_path.write_text(_canonical_attestation() + "\n", encoding="utf-8")
            return _clean_process(phase)

        with self._run_dir() as directory:
            result = TOOL._run_official_lane_godot_sequence(
                run_dir=Path(directory), godot="godot",
                base_environment={"HOME": "/home", "GODOT_EDITOR_CUSTOM_FEATURES": "existing_feature"},
                native_command=["godot", TOOL.QA_LANE_ARGUMENT],
                movie_command=["godot", TOOL.QA_LANE_ARGUMENT],
                native_log=Path(directory) / "native.log",
                movie_log=Path(directory) / "movie.log",
                timeout_seconds=1.0,
                native_log_validator=lambda _path: {"status": "passed"},
                movie_log_validator=lambda _path: {"status": "passed"},
                dependencies={
                    "lane_helper": helper,
                    "godot_runner": runner,
                    "owner_factory": lambda: "1" * 32,
                    "lifecycle_writer": lifecycle_writer,
                },
            )
            self.assertEqual(runs, ["version", "help", "native", "movie"])
            self.assertEqual(
                helper.calls,
                ["source", "prepare", "verify", "verify", "verify", "verify", "verify", "cleanup", "inspect"],
            )
            self.assertEqual(result["cleanup"]["status"], "cleaned")
            self.assertEqual(
                result["preflight"]["version"]["normalizedVersion"],
                "4.7.stable.official",
            )
            lifecycle = json.loads(result["lifecyclePath"].read_text(encoding="utf-8"))
            self.assertEqual(lifecycle["status"], "cleaned_before_media")
            self.assertFalse(lifecycle["qaLanePreserved"])
            self.assertIsNone(lifecycle_snapshots[0]["qaLanePreserved"])
            self.assertTrue(
                all(snapshot["qaLanePreserved"] is not False for snapshot in lifecycle_snapshots[:-1])
            )
            self.assertFalse(lifecycle_snapshots[-1]["qaLanePreserved"])

    def test_native_only_sequence_has_equal_settlement_and_cleanup(self) -> None:
        helper = _FakeLaneHelper()
        runs: list[str] = []

        def runner(
            command: list[str],
            *,
            phase: str,
            log_path: Path,
            **kwargs: object,
        ) -> dict:
            del command, kwargs
            runs.append(phase)
            if phase == "version":
                log_path.write_text("4.7.stable.official\n", encoding="utf-8")
            elif phase == "help":
                log_path.write_text(_tools_help(), encoding="utf-8")
            else:
                log_path.write_text(
                    _canonical_attestation() + "\n",
                    encoding="utf-8",
                )
            return _clean_process(phase)

        with self._run_dir() as directory:
            root = Path(directory)
            result = TOOL._run_official_lane_godot_sequence(
                run_dir=root,
                godot="godot",
                base_environment={
                    "HOME": "/home",
                    "GODOT_EDITOR_CUSTOM_FEATURES": "existing_feature",
                },
                native_command=["godot", TOOL.QA_LANE_ARGUMENT],
                native_log=root / "native.log",
                timeout_seconds=1.0,
                native_log_validator=lambda _path: {"status": "passed"},
                dependencies={
                    "lane_helper": helper,
                    "godot_runner": runner,
                    "owner_factory": lambda: "1" * 32,
                },
            )
            self.assertEqual(runs, ["version", "help", "native"])
            self.assertEqual(
                helper.calls,
                [
                    "source",
                    "prepare",
                    "verify",
                    "verify",
                    "verify",
                    "verify",
                    "cleanup",
                    "inspect",
                ],
            )
            self.assertNotIn("movie", result)
            lifecycle = json.loads(
                result["lifecyclePath"].read_text(encoding="utf-8")
            )
            self.assertEqual(
                set(lifecycle["phases"]),
                {"version", "help", "native"},
            )
            self.assertEqual(
                lifecycle["lastTrustedVerification"],
                lifecycle["phases"]["native"]["postVerify"],
            )
            self.assertEqual(lifecycle["status"], "cleaned_before_media")
            self.assertFalse(lifecycle["qaLanePreserved"])

    def test_partial_movie_contract_is_rejected_before_owner_or_prepare(self) -> None:
        optional_values = {
            "movie_command": ["godot", TOOL.QA_LANE_ARGUMENT],
            "movie_log": Path("movie.log"),
            "movie_log_validator": lambda _path: {"status": "passed"},
        }
        names = tuple(optional_values)
        for mask in range(1, (1 << len(names)) - 1):
            with self.subTest(mask=mask), self._run_dir() as directory:
                helper = _FakeLaneHelper()
                root = Path(directory)
                partial = {
                    name: optional_values[name]
                    for index, name in enumerate(names)
                    if mask & (1 << index)
                }
                if "movie_log" in partial:
                    partial["movie_log"] = root / "movie.log"
                with self.assertRaisesRegex(
                    TOOL.PetManagementRecordingError,
                    "必须全有或全无",
                ):
                    TOOL._run_official_lane_godot_sequence(
                        run_dir=root,
                        godot="godot",
                        base_environment={
                            "GODOT_EDITOR_CUSTOM_FEATURES": "existing_feature"
                        },
                        native_command=["godot", TOOL.QA_LANE_ARGUMENT],
                        native_log=root / "native.log",
                        timeout_seconds=1.0,
                        native_log_validator=lambda _path: {
                            "status": "passed"
                        },
                        dependencies={"lane_helper": helper},
                        **partial,
                    )
                self.assertEqual(helper.calls, [])
                self.assertFalse((root / "qa-lane-owner.json").exists())
                self.assertFalse((root / "qa-lane-lifecycle.json").exists())

    def test_sequence_signal_is_ambiguous_and_is_not_swallowed_by_validator_or_cleanup(self) -> None:
        helper = _FakeLaneHelper()

        def runner(
            command: list[str], *, phase: str, log_path: Path, **kwargs: object
        ) -> dict:
            del command, kwargs
            if phase == "version":
                log_path.write_text("4.7.stable.official\n", encoding="utf-8")
            elif phase == "help":
                log_path.write_text(_tools_help(), encoding="utf-8")
            else:
                log_path.write_text(_canonical_attestation() + "\n", encoding="utf-8")
            return _clean_process(phase)

        with self._run_dir() as directory:
            root = Path(directory)

            def interrupted_validator(_path: Path) -> dict:
                TOOL._mark_active_lane_signal(
                    root / "qa-lane-lifecycle.json", signal.SIGTERM
                )
                raise TOOL.GodotRecorderSignal(signal.SIGTERM)

            with self.assertRaises(TOOL.GodotRecorderSignal):
                TOOL._run_official_lane_godot_sequence(
                    run_dir=root,
                    godot="godot",
                    base_environment={
                        "HOME": "/home",
                        "GODOT_EDITOR_CUSTOM_FEATURES": "existing_feature",
                    },
                    native_command=["godot", TOOL.QA_LANE_ARGUMENT],
                    movie_command=["godot", TOOL.QA_LANE_ARGUMENT],
                    native_log=root / "native.log",
                    movie_log=root / "movie.log",
                    timeout_seconds=1.0,
                    native_log_validator=interrupted_validator,
                    movie_log_validator=lambda _path: {"status": "passed"},
                    dependencies={
                        "lane_helper": helper,
                        "godot_runner": runner,
                        "owner_factory": lambda: "1" * 32,
                    },
                )
            lifecycle = json.loads(
                (root / "qa-lane-lifecycle.json").read_text(encoding="utf-8")
            )
            self.assertIsNone(lifecycle["qaLanePreserved"])
            self.assertEqual(lifecycle["laneState"], "ambiguous_after_signal")
            self.assertEqual(
                lifecycle["status"], "interrupted_with_ambiguous_lane_state"
            )
            self.assertNotIn("cleanup", helper.calls)

        with self._run_dir() as directory:
            root = Path(directory)
            lifecycle_path = root / "qa-lane-lifecycle.json"
            TOOL._write_secure_json(
                lifecycle_path,
                {
                    "status": "cleaned_before_media",
                    "qaLanePreserved": False,
                    "lanePreservationReason": None,
                },
            )
            TOOL._mark_active_lane_signal(lifecycle_path, signal.SIGHUP)
            lifecycle = json.loads(lifecycle_path.read_text(encoding="utf-8"))
            self.assertIsNone(lifecycle["qaLanePreserved"])
            self.assertEqual(lifecycle["laneState"], "ambiguous_after_signal")

    def test_failure_summary_survives_bad_lifecycle_and_supersedes_passed_summary(self) -> None:
        with self._run_dir() as directory:
            root = Path(directory)
            (root / "qa-lane-lifecycle.json").write_text("{broken", encoding="utf-8")
            TOOL._write_json(root / "summary.json", {"status": "passed"})
            original = RuntimeError("original recorder failure")
            self.assertTrue(
                TOOL._write_failure_summary(
                    root, run_id="failure-authority", error=original
                )
            )
            failure = json.loads(
                (root / "failure-summary.json").read_text(encoding="utf-8")
            )
            self.assertTrue(failure["finalStatusAuthority"])
            self.assertEqual(failure["status"], "failed")
            self.assertIsNone(failure["qaLane"])
            self.assertEqual(failure["qaLaneReadError"]["errorType"], "JSONDecodeError")
            self.assertGreater(failure["supersedesSummary"]["sizeBytes"], 0)
            self.assertRegex(failure["supersedesSummary"]["sha256"], r"^[0-9a-f]{64}$")
            self.assertTrue(
                failure["sha256Manifest"]["successNotClaimedByFailureSummary"]
            )

        with self._run_dir() as directory:
            root = Path(directory)
            (root / "qa-lane-lifecycle.json").write_text("[]", encoding="utf-8")
            self.assertTrue(
                TOOL._write_failure_summary(
                    root,
                    run_id="non-object-lifecycle",
                    error=RuntimeError("original recorder failure"),
                )
            )
            failure = json.loads(
                (root / "failure-summary.json").read_text(encoding="utf-8")
            )
            self.assertIsNone(failure["qaLane"])
            self.assertEqual(failure["qaLaneReadError"]["errorType"], "ValueError")

        with self._run_dir() as directory:
            with mock.patch.object(
                TOOL, "_write_secure_json", side_effect=OSError("failure authority full")
            ):
                self.assertFalse(
                    TOOL._write_failure_summary(
                        Path(directory),
                        run_id="failure-authority-write-failed",
                        error=RuntimeError("original recorder failure"),
                    )
                )

        with self._run_dir() as directory:
            output_root = Path(directory)
            args = type(
                "Args",
                (),
                {"run_id": "manifest-failure", "output_root": output_root},
            )()
            manifest_error = OSError("manifest disk failure")
            original_manifest = TOOL._write_sha256_manifest
            manifest_calls = 0

            def flaky_manifest(run_dir: Path, paths: list[Path]) -> Path:
                nonlocal manifest_calls
                manifest_calls += 1
                if manifest_calls == 1:
                    raise manifest_error
                return original_manifest(run_dir, paths)

            def fail_after_summary(*, run_dir: Path, **_kwargs: object) -> Path:
                summary_path = run_dir / "summary.json"
                TOOL._write_json(
                    summary_path,
                    {
                        "status": "passed",
                        "finalStatusAuthority": True,
                        "finalStatusAuthorityRequires": {
                            "artifact": TOOL._repo_relative(run_dir / "SHA256SUMS"),
                            "writtenAfterSummary": True,
                            "coversThisSummary": True,
                            "failureSummaryAbsent": True,
                        },
                    },
                )
                TOOL._write_sha256_manifest(run_dir, [summary_path])
                return summary_path

            with mock.patch.object(TOOL, "_record_into", side_effect=fail_after_summary):
                with mock.patch.object(
                    TOOL, "_write_sha256_manifest", side_effect=flaky_manifest
                ):
                    with self.assertRaises(OSError) as caught:
                        TOOL._record(args)
            self.assertIs(caught.exception, manifest_error)
            run_dir = output_root / "manifest-failure"
            failure_path = run_dir / "failure-summary.json"
            failure = json.loads(
                failure_path.read_text(encoding="utf-8")
            )
            self.assertTrue(failure["finalStatusAuthority"])
            self.assertIsNotNone(failure["supersedesSummary"])
            self.assertFalse(
                failure["sha256Manifest"].get("coversAllRetainedEvidenceFiles", False)
            )
            passed = json.loads((run_dir / "summary.json").read_text(encoding="utf-8"))
            self.assertTrue(
                passed["finalStatusAuthorityRequires"]["failureSummaryAbsent"]
            )
            self.assertTrue(failure_path.is_file())
            manifest = (run_dir / "SHA256SUMS").read_text(encoding="utf-8")
            self.assertIn("failure-summary.json", manifest)
            self.assertEqual(manifest_calls, 2)

        with self._run_dir() as directory:
            output_root = Path(directory)
            args = type(
                "Args",
                (),
                {"run_id": "failure-writer-failed", "output_root": output_root},
            )()
            primary = RuntimeError("primary after stale success manifest")

            def stale_success(*, run_dir: Path, **_kwargs: object) -> Path:
                TOOL._write_json(run_dir / "summary.json", {"status": "passed"})
                (run_dir / "SHA256SUMS").write_text(
                    "stale-valid-looking-manifest\n", encoding="utf-8"
                )
                raise primary

            with mock.patch.object(TOOL, "_record_into", side_effect=stale_success):
                with mock.patch.object(TOOL, "_write_failure_summary", return_value=False):
                    with mock.patch.object(
                        Path,
                        "rglob",
                        side_effect=AssertionError("must not retry failure manifest"),
                    ):
                        with self.assertRaises(RuntimeError) as caught:
                            TOOL._record(args)
            self.assertIs(caught.exception, primary)
            self.assertFalse(
                (output_root / "failure-writer-failed" / "SHA256SUMS").exists()
            )

    def test_failure_evidence_enumeration_never_replaces_primary_exception(self) -> None:
        with self._run_dir() as directory:
            output_root = Path(directory)
            args = type(
                "Args",
                (),
                {"run_id": "retained-enumeration-failure", "output_root": output_root},
            )()
            primary = RuntimeError("primary recorder failure")
            with mock.patch.object(TOOL, "_record_into", side_effect=primary):
                with mock.patch.object(
                    Path, "rglob", side_effect=OSError("secondary enumeration failure")
                ):
                    with self.assertRaises(RuntimeError) as caught:
                        TOOL._record(args)
            self.assertIs(caught.exception, primary)

    def test_manifest_atomic_commit_has_no_postcommit_failure_path(self) -> None:
        with self._run_dir() as directory:
            output_root = Path(directory)
            args = type(
                "Args",
                (),
                {"run_id": "atomic-manifest-commit", "output_root": output_root},
            )()
            original_replace = TOOL.os.replace

            def committed_then_reported_error(source: object, target: object) -> None:
                original_replace(source, target)
                raise OSError("replace reported error after commit")

            def committed_record(*, run_dir: Path, **_kwargs: object) -> Path:
                summary_path = run_dir / "summary.json"
                TOOL._write_json(summary_path, {"status": "passed"})
                with mock.patch.object(
                    TOOL.os,
                    "replace",
                    side_effect=committed_then_reported_error,
                ):
                    with mock.patch.object(
                        TOOL,
                        "_fsync_parent_directory",
                        side_effect=OSError("postcommit parent fsync diagnostic"),
                    ):
                        with mock.patch.object(
                            Path,
                            "unlink",
                            side_effect=OSError("postcommit temp cleanup diagnostic"),
                        ):
                            manifest = TOOL._write_sha256_manifest(
                                run_dir, [summary_path]
                            )
                self.assertEqual(manifest, run_dir / "SHA256SUMS")
                return summary_path

            with mock.patch.object(TOOL, "_record_into", side_effect=committed_record):
                with mock.patch.object(
                    TOOL,
                    "_write_failure_summary",
                    side_effect=AssertionError("committed manifest must not fail run"),
                ):
                    result = TOOL._record(args)
            run_dir = output_root / "atomic-manifest-commit"
            self.assertEqual(result, run_dir / "summary.json")
            manifest_path = run_dir / "SHA256SUMS"
            self.assertTrue(manifest_path.is_file())
            self.assertEqual(manifest_path.stat().st_mode & 0o777, 0o600)
            self.assertIn("summary.json", manifest_path.read_text(encoding="utf-8"))
            self.assertEqual(list(run_dir.glob(".SHA256SUMS.*.tmp")), [])

        with self._run_dir() as directory:
            root = Path(directory)
            evidence = root / "summary.json"
            TOOL._write_json(evidence, {"status": "passed"})
            with mock.patch.object(
                TOOL.os, "replace", side_effect=OSError("precommit replace failed")
            ):
                with self.assertRaises(OSError):
                    TOOL._write_sha256_manifest(root, [evidence])
            self.assertFalse((root / "SHA256SUMS").exists())
            self.assertEqual(list(root.glob(".SHA256SUMS.*.tmp")), [])

    def test_product_failure_cleans_but_residual_verify_and_cleanup_failures_preserve(self) -> None:
        def run_case(kind: str) -> tuple[_FakeLaneHelper, list[str], Path]:
            helper = _FakeLaneHelper(
                fail_verify_call=4 if kind == "verify" else 0,
                fail_cleanup=kind == "cleanup",
            )
            runs: list[str] = []
            directory = tempfile.mkdtemp(dir=REPO_ROOT / ".run" / "evidence")
            root = Path(directory)

            def runner(command: list[str], *, phase: str, log_path: Path, **kwargs: object) -> dict:
                del command, kwargs
                runs.append(phase)
                if phase == "version":
                    log_path.write_text("4.7.stable.official\n", encoding="utf-8")
                elif phase == "help":
                    log_path.write_text(_tools_help(), encoding="utf-8")
                else:
                    log_path.write_text(_canonical_attestation() + "\n", encoding="utf-8")
                if kind == "residual" and phase == "native":
                    evidence = _clean_process(phase)
                    evidence["processGroupResidualObserved"] = True
                    raise TOOL.GodotLanePreservationError(
                        "residual", reason="native_process_group_residual", evidence=evidence
                    )
                result = _clean_process(phase)
                if kind == "product" and phase == "native":
                    result["exitCode"] = 7
                return result

            with self.assertRaises(TOOL.PetManagementRecordingError):
                TOOL._run_official_lane_godot_sequence(
                    run_dir=root, godot="godot",
                    base_environment={"HOME": "/home", "GODOT_EDITOR_CUSTOM_FEATURES": "existing_feature"},
                    native_command=["godot", TOOL.QA_LANE_ARGUMENT],
                    movie_command=["godot", TOOL.QA_LANE_ARGUMENT],
                    native_log=root / "native.log", movie_log=root / "movie.log",
                    timeout_seconds=1.0,
                    native_log_validator=lambda _path: {"status": "passed"},
                    movie_log_validator=lambda _path: {"status": "passed"},
                    dependencies={"lane_helper": helper, "godot_runner": runner, "owner_factory": lambda: "1" * 32},
                )
            return helper, runs, root

        product, product_runs, product_root = run_case("product")
        self.assertEqual(product_runs, ["version", "help", "native"])
        self.assertIn("cleanup", product.calls)
        self.assertIn("inspect", product.calls)
        for kind in ("residual", "verify", "cleanup"):
            helper, _runs, root = run_case(kind)
            lifecycle = json.loads((root / "qa-lane-lifecycle.json").read_text(encoding="utf-8"))
            self.assertTrue(lifecycle["qaLanePreserved"])
            if kind in ("residual", "verify"):
                self.assertNotIn("cleanup", helper.calls)
            self.assertIn("manualInspectGuidance", lifecycle)

    def test_product_and_attestation_failures_are_classified_independently(self) -> None:
        def run_case(
            *,
            attestation_kind: str,
            product_kind: str,
            exit_code: int = 0,
        ) -> tuple[BaseException, _FakeLaneHelper, list[str], dict[str, object]]:
            helper = _FakeLaneHelper()
            runs: list[str] = []
            with self._run_dir() as directory:
                root = Path(directory)

                def runner(
                    command: list[str],
                    *,
                    phase: str,
                    log_path: Path,
                    **kwargs: object,
                ) -> dict:
                    del command, kwargs
                    runs.append(phase)
                    if phase == "version":
                        log_path.write_text("4.7.stable.official\n", encoding="utf-8")
                    elif phase == "help":
                        log_path.write_text(_tools_help(), encoding="utf-8")
                    elif attestation_kind == "valid":
                        log_path.write_text(_canonical_attestation() + "\n", encoding="utf-8")
                    elif attestation_kind == "duplicate":
                        line = _canonical_attestation()
                        log_path.write_text(line + "\n" + line + "\n", encoding="utf-8")
                    else:
                        log_path.write_text("product output without attestation\n", encoding="utf-8")
                    result = _clean_process(phase)
                    if phase == "native":
                        result["exitCode"] = exit_code
                    return result

                def native_validator(_path: Path) -> dict[str, str]:
                    if product_kind == "focus":
                        raise TOOL.PetManagementRecordingError(
                            "native 性能窗口没有进入玩家前台焦点态"
                        )
                    return {"status": "passed"}

                try:
                    TOOL._run_official_lane_godot_sequence(
                        run_dir=root,
                        godot="godot",
                        base_environment={
                            "HOME": "/home",
                            "GODOT_EDITOR_CUSTOM_FEATURES": "existing_feature",
                        },
                        native_command=["godot", TOOL.QA_LANE_ARGUMENT],
                        movie_command=["godot", TOOL.QA_LANE_ARGUMENT],
                        native_log=root / "native.log",
                        movie_log=root / "movie.log",
                        timeout_seconds=1.0,
                        native_log_validator=native_validator,
                        movie_log_validator=lambda _path: {"status": "passed"},
                        dependencies={
                            "lane_helper": helper,
                            "source_checker": lambda _helper: {
                                "status": "source_contract_passed"
                            },
                            "godot_runner": runner,
                            "owner_factory": lambda: "1" * 32,
                        },
                    )
                except BaseException as error:
                    caught = error
                else:
                    self.fail("classification case unexpectedly passed")
                lifecycle = json.loads(
                    (root / "qa-lane-lifecycle.json").read_text(encoding="utf-8")
                )
                return caught, helper, runs, lifecycle

        for attestation_kind in ("missing", "duplicate"):
            with self.subTest(attestation=attestation_kind, product="focus"):
                error, helper, runs, lifecycle = run_case(
                    attestation_kind=attestation_kind,
                    product_kind="focus",
                )
                self.assertIsInstance(error, TOOL.GodotLanePreservationError)
                self.assertEqual(error.reason, "native_attestation_failed")
                self.assertEqual(runs, ["version", "help", "native"])
                self.assertNotIn("cleanup", helper.calls)
                self.assertTrue(lifecycle["qaLanePreserved"])
                self.assertEqual(
                    lifecycle["productFailure"]["error"],
                    "native 性能窗口没有进入玩家前台焦点态",
                )
                self.assertEqual(
                    lifecycle["attestationFailure"]["phase"], "native"
                )
                self.assertIn("postVerify", lifecycle["phases"]["native"])

        error, helper, runs, lifecycle = run_case(
            attestation_kind="valid",
            product_kind="focus",
        )
        self.assertIsInstance(error, TOOL.PetManagementRecordingError)
        self.assertIn("没有进入玩家前台焦点态", str(error))
        self.assertEqual(runs, ["version", "help", "native"])
        self.assertIn("cleanup", helper.calls)
        self.assertIn("inspect", helper.calls)
        self.assertFalse(lifecycle["qaLanePreserved"])
        self.assertNotIn("attestationFailure", lifecycle)

        error, helper, runs, lifecycle = run_case(
            attestation_kind="missing",
            product_kind="passed",
        )
        self.assertIsInstance(error, TOOL.GodotLanePreservationError)
        self.assertEqual(error.reason, "native_attestation_failed")
        self.assertNotIn("cleanup", helper.calls)
        self.assertNotIn("productFailure", lifecycle)

        error, helper, runs, lifecycle = run_case(
            attestation_kind="valid",
            product_kind="passed",
            exit_code=7,
        )
        self.assertIsInstance(error, TOOL.PetManagementRecordingError)
        self.assertIn("Godot native exit=7", str(error))
        self.assertIn("cleanup", helper.calls)
        self.assertIn("inspect", helper.calls)
        self.assertFalse(lifecycle["qaLanePreserved"])
        self.assertNotIn("attestationFailure", lifecycle)

    def test_product_failure_composes_with_verify_cleanup_and_containment(self) -> None:
        for kind in ("verify", "cleanup", "residual"):
            with self.subTest(kind=kind), self._run_dir() as directory:
                helper = _FakeLaneHelper(
                    fail_verify_call=4 if kind == "verify" else 0,
                    fail_cleanup=kind == "cleanup",
                )
                root = Path(directory)
                validator_calls: list[str] = []

                def runner(
                    command: list[str],
                    *,
                    phase: str,
                    log_path: Path,
                    **kwargs: object,
                ) -> dict:
                    del command, kwargs
                    if phase == "version":
                        log_path.write_text("4.7.stable.official\n", encoding="utf-8")
                    elif phase == "help":
                        log_path.write_text(_tools_help(), encoding="utf-8")
                    else:
                        log_path.write_text(
                            _canonical_attestation() + "\n", encoding="utf-8"
                        )
                    if kind == "residual" and phase == "native":
                        evidence = _clean_process(phase)
                        evidence["processGroupResidualObserved"] = True
                        raise TOOL.GodotLanePreservationError(
                            "residual",
                            reason="native_process_group_residual",
                            evidence=evidence,
                        )
                    return _clean_process(phase)

                def validator(_path: Path) -> dict[str, str]:
                    validator_calls.append("native")
                    raise TOOL.PetManagementRecordingError(
                        "native 性能窗口没有进入玩家前台焦点态"
                    )

                with self.assertRaises(TOOL.GodotLanePreservationError) as caught:
                    TOOL._run_official_lane_godot_sequence(
                        run_dir=root,
                        godot="godot",
                        base_environment={
                            "HOME": "/home",
                            "GODOT_EDITOR_CUSTOM_FEATURES": "existing_feature",
                        },
                        native_command=["godot", TOOL.QA_LANE_ARGUMENT],
                        movie_command=["godot", TOOL.QA_LANE_ARGUMENT],
                        native_log=root / "native.log",
                        movie_log=root / "movie.log",
                        timeout_seconds=1.0,
                        native_log_validator=validator,
                        movie_log_validator=lambda _path: {"status": "passed"},
                        dependencies={
                            "lane_helper": helper,
                            "source_checker": lambda _helper: {
                                "status": "source_contract_passed"
                            },
                            "godot_runner": runner,
                            "owner_factory": lambda: "1" * 32,
                        },
                    )
                lifecycle = json.loads(
                    (root / "qa-lane-lifecycle.json").read_text(encoding="utf-8")
                )
                self.assertTrue(lifecycle["qaLanePreserved"])
                self.assertNotIn("inspect", helper.calls)
                if kind == "residual":
                    self.assertEqual(
                        caught.exception.reason,
                        "native_process_group_residual",
                    )
                    self.assertEqual(validator_calls, [])
                    self.assertNotIn("productFailure", lifecycle)
                    self.assertNotIn("native", lifecycle["phases"])
                    self.assertNotIn("cleanup", helper.calls)
                else:
                    expected_reason = (
                        "native_verify_failed" if kind == "verify" else "cleanup_failed"
                    )
                    self.assertEqual(caught.exception.reason, expected_reason)
                    self.assertEqual(validator_calls, ["native"])
                    self.assertEqual(
                        lifecycle["productFailure"]["error"],
                        "native 性能窗口没有进入玩家前台焦点态",
                    )
                    if kind == "verify":
                        self.assertNotIn("cleanup", helper.calls)
                    else:
                        self.assertIn("cleanup", helper.calls)

    def test_core_manifest_order_and_phase403_registry_are_explicit(self) -> None:
        management = TOOL_PATH.read_text(encoding="utf-8")
        codex = CODEX_PATH.read_text(encoding="utf-8")
        self.assertNotIn('"--user-data-dir",', management)
        self.assertNotIn('"--user-data-dir",', codex)
        self.assertIn("PET_CODEX_RECORDER_PATH", management)
        self.assertIn("BATTLE_LAYOUT_RECORDER_PATH", management)
        self.assertIn("BATTLE_LAYOUT_PERF_PATH", management)
        self.assertIn("_validate_lane_source_contract", management)
        self.assertIn("_persist_lane_owner", management)
        self.assertIn("_parse_exact_qa_lane_attestation", management)
        management_record = management[
            management.index("def _record_into("):
            management.index("def _write_failure_summary(")
        ]
        self.assertLess(
            management_record.index("_write_json(summary_path, summary)"),
            management_record.index("_write_sha256_manifest(run_dir, hash_paths)"),
        )
        self.assertLess(
            management_record.rindex("print("),
            management_record.index("_write_sha256_manifest(run_dir, hash_paths)"),
        )
        self.assertIn("flush=True", management_record)
        codex_record = codex[
            codex.index("def _record_into("):
            codex.index("def _write_failure_summary(")
        ]
        self.assertLess(
            codex_record.index("CORE._write_json(summary_path, summary)"),
            codex_record.index("CORE._write_sha256_manifest(run_dir, hash_paths)"),
        )
        self.assertLess(
            codex_record.rindex("print("),
            codex_record.index("CORE._write_sha256_manifest(run_dir, hash_paths)"),
        )
        self.assertIn("flush=True", codex_record)

    def test_recorder_source_contract_rejects_semantic_mutations(self) -> None:
        management = TOOL_PATH.read_text(encoding="utf-8")
        codex = CODEX_PATH.read_text(encoding="utf-8")
        battle = BATTLE_LAYOUT_PATH.read_text(encoding="utf-8")
        perf = BATTLE_LAYOUT_PERF_PATH.read_text(encoding="utf-8")
        expected_management = {
            "_build_godot_command", "_build_lane_environment",
            "_build_native_godot_command", "_cleanup_automation_lane",
            "_failure_envelope", "_godot_help_has_exact_tools_options",
            "_inspect_clean_automation_lane", "_is_exact_godot_47_version",
            "_load_lane_helper", "_mark_active_lane_signal",
            "_parse_exact_qa_lane_attestation",
            "_prepare_automation_lane", "_record", "_record_into",
            "_require_contained_godot_process", "_run_godot_with_settlement",
            "_run_official_lane_godot_sequence",
            "_run_official_lane_godot_sequence_active",
            "_settle_godot_process_group", "_top_level_contract_source",
            "_validate_lane_source_contract",
            "_validate_recorder_source_contract", "_verify_automation_lane",
            "_write_failure_summary", "_write_lifecycle_authority",
            "_write_secure_json", "_write_sha256_manifest",
        }
        expected_battle = {
            "_build_godot_command", "_build_native_godot_command", "_parser",
            "_parse_attack_input_json", "_parse_fields",
            "_phase403_capture_contract", "_record", "_record_into",
            "_require_main_flag_wiring", "_strict_json_loads",
            "_validate_godot_log",
            "_write_failure_summary", "main",
        }
        expected_codex = {
            "_build_godot_command", "_build_native_perf_command",
            "_load_media_core", "_parser", "_record", "_record_into",
            "_require_main_hosted_capture_wiring", "_validate_godot_log",
            "_write_failure_summary",
        }
        expected_perf = {
            "_build_godot_command", "_capture", "_capture_into", "_parser",
            "_parse_fields", "_parse_json_marker", "_parse_number",
            "_require_perf_wiring",
            "_strict_json_loads", "_validate_godot_log",
            "_write_failure_summary", "_write_manifest", "main",
        }
        self.assertEqual(
            set(TOOL.MANAGEMENT_RECORDER_CONTRACT_FUNCTION_SHA256),
            expected_management,
        )
        self.assertEqual(
            set(TOOL.CODEX_RECORDER_CONTRACT_FUNCTION_SHA256),
            expected_codex,
        )
        self.assertEqual(
            set(TOOL.BATTLE_LAYOUT_RECORDER_CONTRACT_FUNCTION_SHA256),
            expected_battle,
        )
        self.assertEqual(
            set(TOOL.BATTLE_LAYOUT_PERF_CONTRACT_FUNCTION_SHA256),
            expected_perf,
        )
        self.assertEqual(
            set(TOOL.RECORDER_TOP_LEVEL_CONTRACT_SHA256),
            {
                "management recorder",
                "pet codex recorder",
                "battle layout recorder",
                "battle layout perf",
            },
        )
        for digest in (
            *TOOL.MANAGEMENT_RECORDER_CONTRACT_FUNCTION_SHA256.values(),
            *TOOL.CODEX_RECORDER_CONTRACT_FUNCTION_SHA256.values(),
            *TOOL.BATTLE_LAYOUT_RECORDER_CONTRACT_FUNCTION_SHA256.values(),
            *TOOL.BATTLE_LAYOUT_PERF_CONTRACT_FUNCTION_SHA256.values(),
            *TOOL.RECORDER_TOP_LEVEL_CONTRACT_SHA256.values(),
        ):
            self.assertRegex(digest, r"^[0-9a-f]{64}$")
            self.assertNotEqual(digest, "0" * 64)
        TOOL._validate_recorder_source_contract(management, codex, battle, perf)
        guard = 'if __name__ == "__main__":'
        mutations = [
            (
                management.replace(
                    "start_new_session=True", "start_new_session=False", 1
                ),
                codex,
                battle,
                perf,
            ),
            (
                management,
                codex.replace("CORE.QA_LANE_ARGUMENT,", '"--wrong-lane",', 1),
                battle,
                perf,
            ),
            (
                management,
                codex,
                battle.replace(
                    'CAPTURE_FLAG = "--phase403-battle-layout-owner-review-capture"',
                    'CAPTURE_FLAG = "--wrong-battle-layout-capture"',
                    1,
                ),
                perf,
            ),
            (
                management,
                codex,
                battle,
                perf.replace(
                    'PERF_CAPTURE_FLAG = "--phase403-battle-layout-perf"',
                    'PERF_CAPTURE_FLAG = "--wrong-battle-layout-perf"',
                    1,
                ),
            ),
            (management.rsplit(guard, 1)[0], codex, battle, perf),
            (management, codex.rsplit(guard, 1)[0], battle, perf),
            (management, codex, battle.rsplit(guard, 1)[0], perf),
            (management, codex, battle, perf.rsplit(guard, 1)[0]),
            (
                management.replace(
                    guard,
                    '_record = lambda *_args, **_kwargs: None\n\n' + guard,
                    1,
                ),
                codex,
                battle,
                perf,
            ),
            (
                management.replace(
                    "def _run_godot_with_settlement(",
                    "@staticmethod\ndef _run_godot_with_settlement(",
                    1,
                ),
                codex,
                battle,
                perf,
            ),
            (
                management,
                codex.replace(
                    "class PetCodexRecordingError",
                    "@(lambda cls: RuntimeError)\nclass PetCodexRecordingError",
                    1,
                ),
                battle,
                perf,
            ),
            (
                management,
                codex,
                battle.replace(
                    "class Phase403BattleLayoutRecordingError",
                    "@(lambda cls: RuntimeError)\n"
                    "class Phase403BattleLayoutRecordingError",
                    1,
                ),
                perf,
            ),
            (
                management,
                codex,
                battle,
                perf.replace(
                    "class Phase403BattleLayoutPerfError",
                    "@(lambda cls: RuntimeError)\n"
                    "class Phase403BattleLayoutPerfError",
                    1,
                ),
            ),
            (
                management,
                codex,
                battle.replace(
                    "object_pairs_hook=reject_duplicate_object",
                    "object_pairs_hook=None",
                    1,
                ),
                perf,
            ),
            (
                management,
                codex,
                battle,
                perf.replace(
                    "object_pairs_hook=reject_duplicate_object",
                    "object_pairs_hook=None",
                    1,
                ),
            ),
            (
                management.replace(
                    'REPO_ROOT / "tools" / "record_pet_codex_awakened_owner_review.py"',
                    'REPO_ROOT / "tools" / "wrong_codex.py"',
                    1,
                ),
                codex,
                battle,
                perf,
            ),
            (
                management.replace(
                    'REPO_ROOT / "tools" / "record_battle_layout_owner_review.py"',
                    'REPO_ROOT / "tools" / "wrong_owner.py"',
                    1,
                ),
                codex,
                battle,
                perf,
            ),
        ]
        for (
            mutated_management,
            mutated_codex,
            mutated_battle,
            mutated_perf,
        ) in mutations:
            self.assertTrue(
                mutated_management != management
                or mutated_codex != codex
                or mutated_battle != battle
                or mutated_perf != perf
            )
            with self.assertRaises(TOOL.PetManagementRecordingError):
                TOOL._validate_recorder_source_contract(
                    mutated_management,
                    mutated_codex,
                    mutated_battle,
                    mutated_perf,
                )


if __name__ == "__main__":
    unittest.main()
