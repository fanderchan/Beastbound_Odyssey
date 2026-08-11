#!/usr/bin/env python3
"""Focused tests for the exact-form pet battle release gate audit."""

from __future__ import annotations

import ast
import copy
import hashlib
import json
import shutil
import struct
import sys
import tempfile
import unittest
from pathlib import Path
import re
from unittest import mock


REPO_ROOT = Path(__file__).resolve().parents[2]
sys.path.insert(0, str(REPO_ROOT / "tools"))

from audit_pet_battle_release_gate import (  # noqa: E402
    COVERAGE_CONTRACT_KEYS,
    FORMAL_ENTRY_KEYS,
    LEGACY_ENTRY_KEYS,
    LEGACY_FORM_ID,
    MODE_FORMAL,
    MODE_LEGACY,
    MODE_PLACEHOLDER,
    RELEASE_AUTHORITY_REFERENCE_KEYS,
    RUNTIME_CACHE_REFERENCE_KEYS,
    _authority_status,
    _bind_json_snapshot,
    _json_snapshot_from_bytes,
    _read_json,
    _read_json_snapshot,
    _registry_errors,
    _sha256_file,
    build_report,
    derive_formal_wild_training_forms,
    resolve_documents,
    runtime_tree_snapshot,
)


CATALOG_PATH = REPO_ROOT / "client/godot/data/pet_art_catalog.json"
REGISTRY_PATH = REPO_ROOT / "client/godot/data/pet_battle_release_registry_v1.json"


def _catalog_form(form_id: str) -> dict:
    catalog = _read_json(CATALOG_PATH)
    return next(form for form in catalog["forms"] if form["formId"] == form_id)


def _metadata_for(form: dict) -> tuple[dict, str]:
    path = REPO_ROOT / form["pet"]["metadataPath"]
    return _read_json(path), _sha256_file(path)


def _png_dimensions(path: Path) -> tuple[int, int]:
    header = path.read_bytes()[:24]
    if len(header) != 24 or header[:8] != b"\x89PNG\r\n\x1a\n":
        raise AssertionError(f"not a PNG fixture: {path}")
    return struct.unpack(">II", header[16:24])


class AuditPetBattleReleaseGateTests(unittest.TestCase):
    def test_real_report_reads_each_json_path_once_in_one_shared_snapshot_store(self) -> None:
        real_read_bytes = Path.read_bytes
        read_counts: dict[Path, int] = {}

        def counted_read_bytes(path: Path) -> bytes:
            resolved = path.resolve()
            read_counts[resolved] = read_counts.get(resolved, 0) + 1
            return real_read_bytes(path)

        with mock.patch.object(Path, "read_bytes", new=counted_read_bytes):
            report = build_report(REPO_ROOT)
        self.assertEqual(report["status"], "passed", report["errors"])
        self.assertTrue(read_counts)
        self.assertEqual(max(read_counts.values()), 1, read_counts)
        authority_path = (
            REPO_ROOT / "client/godot/data/pet_evolution_release_attestation_v1.json"
        ).resolve()
        self.assertEqual(read_counts[authority_path], 1)

    def test_real_report_covers_all_36_and_derives_exact_13(self) -> None:
        report = build_report(REPO_ROOT)
        registry = _read_json(REGISTRY_PATH)
        coverage = registry["coverageContract"]

        self.assertEqual(report["status"], "passed", report["errors"])
        self.assertEqual(report["catalogFormCount"], 36)
        self.assertEqual(report["formalWildTrainingFormCount"], 13)
        self.assertEqual(
            report["formalWildTrainingDerivation"]["derivedSetSha256"],
            coverage["formalWildTrainingDerivedSetSha256"],
        )
        self.assertEqual(
            {row["formId"] for row in report["forms"] if row["formalWildTraining"]},
            set(report["formalWildTrainingForms"]),
        )

    def test_runtime_candidates_are_two_formal_plus_one_visible_legacy_exception(self) -> None:
        report = build_report(REPO_ROOT)
        modes = {entry["formId"]: entry["releaseMode"] for entry in report["runtimeCandidates"]}

        self.assertEqual(report["runtimeCandidateCount"], 3)
        self.assertEqual(report["formalReleaseCount"], 2)
        self.assertEqual(report["legacyCompatibilityExceptionCount"], 1)
        self.assertEqual(modes[LEGACY_FORM_ID], MODE_LEGACY)
        self.assertEqual(list(modes.values()).count(MODE_FORMAL), 2)

    def test_build_report_rejects_metadata_only_tree_with_zero_runtime_pngs(self) -> None:
        catalog = _read_json(CATALOG_PATH)
        registry = _read_json(REGISTRY_PATH)
        relative_paths = {
            Path("client/godot/data/pet_art_catalog.json"),
            Path("client/godot/data/pet_battle_release_registry_v1.json"),
            Path("client/godot/data/balance/progression_zones.json"),
            Path("client/godot/data/pet_evolution_release_attestation_v1.json"),
            *(path.relative_to(REPO_ROOT) for path in (REPO_ROOT / "client/godot/data").glob("*_map.json")),
            *(Path(form["pet"]["metadataPath"]) for form in catalog["forms"]),
            *(
                Path(entry["petRoot"]) / "source/battle/install-manifest.json"
                for entry in (
                    registry["formalReleaseEntries"]
                    + registry["legacyCompatibilityExceptions"]
                )
            ),
        }
        with tempfile.TemporaryDirectory() as temporary:
            temporary_root = Path(temporary)
            for relative in relative_paths:
                source = REPO_ROOT / relative
                destination = temporary_root / relative
                destination.parent.mkdir(parents=True, exist_ok=True)
                shutil.copyfile(source, destination)
            report = build_report(temporary_root)

        self.assertEqual(report["status"], "failed")
        self.assertEqual(report["formalReleaseCount"], 0)
        self.assertEqual(report["legacyCompatibilityExceptionCount"], 0)
        self.assertTrue(
            any("runtime frames missing or unsafe" in error for row in report["forms"] for error in row["errors"]),
            report["errors"],
        )

    def test_formal_release_fails_closed_on_every_exact_identity_mismatch(self) -> None:
        registry = _read_json(REGISTRY_PATH)
        form_id = "wuli_evolved_crystal_earth8_water2"
        catalog = _catalog_form(form_id)
        metadata, metadata_sha = _metadata_for(catalog)
        entry = next(item for item in registry["formalReleaseEntries"] if item["formId"] == form_id)
        authority = _authority_status(REPO_ROOT, entry)
        runtime_tree = runtime_tree_snapshot(REPO_ROOT, catalog, metadata)
        baseline = resolve_documents(
            form_id,
            catalog,
            metadata,
            metadata_sha,
            registry,
            authority,
            runtime_tree,
        )
        self.assertEqual(baseline["releaseMode"], MODE_FORMAL, baseline["errors"])

        mutations = {
            "catalog_status": lambda c, _m: c.__setitem__("status", "in_production"),
            "catalog_runtime_bool_as_int": lambda c, _m: c.__setitem__(
                "runtimeEnabled", 1
            ),
            "catalog_skeleton": lambda c, _m: c.__setitem__("artSkeletonId", "wuli_normal_low_armored_v1"),
            "catalog_root": lambda c, _m: c["pet"].__setitem__("root", "client/godot/assets/pets/wuli_normal_fast_wind10"),
            "metadata_status": lambda _c, m: m.__setitem__("ownerReviewStatus", "pending"),
            "metadata_runtime_bool_as_int": lambda _c, m: m.__setitem__(
                "runtimeEnabled", 1
            ),
            "metadata_form": lambda _c, m: m.__setitem__("formId", "wuli_normal_fast_wind10"),
            "battle_visual_status": lambda _c, m: m["battleVisual"].__setitem__("status", "owner_review_pending"),
            "battle_runtime_bool_as_int": lambda _c, m: m["battleVisual"].__setitem__(
                "runtimeEnabled", 1
            ),
            "nested_flip_bool_as_int": lambda _c, m: m["battleViewMapping"][
                "enemy"
            ].__setitem__("flipH", 1),
            "battle_root": lambda _c, m: m["battleVisual"].__setitem__("runtimeRoot", "../sibling/views"),
            "bundle_digest": lambda _c, m: m["battleVisual"].__setitem__("bundleDigest", "0" * 64),
            "runtime_digest": lambda _c, m: m["battleVisual"].__setitem__("runtimeBundleDigest", "f" * 64),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                changed_catalog = copy.deepcopy(catalog)
                changed_metadata = copy.deepcopy(metadata)
                mutate(changed_catalog, changed_metadata)
                decision = resolve_documents(
                    form_id,
                    changed_catalog,
                    changed_metadata,
                    metadata_sha,
                    registry,
                    authority,
                    runtime_tree,
                )
                self.assertFalse(decision["normalRuntimeAllowed"])
                self.assertEqual(decision["releaseMode"], MODE_PLACEHOLDER)
                self.assertIsNone(decision["assetFormId"])
                self.assertEqual(decision["placeholderFormId"], form_id)

        metadata_sha_drift = resolve_documents(
            form_id,
            catalog,
            metadata,
            "0" * 64,
            registry,
            authority,
            runtime_tree,
        )
        self.assertEqual(metadata_sha_drift["releaseMode"], MODE_PLACEHOLDER)

    def test_missing_deleted_or_replaced_runtime_png_fails_closed(self) -> None:
        registry = _read_json(REGISTRY_PATH)
        form_id = "wuli_evolved_crystal_earth8_water2"
        catalog = _catalog_form(form_id)
        metadata, metadata_sha = _metadata_for(catalog)
        entry = next(item for item in registry["formalReleaseEntries"] if item["formId"] == form_id)
        authority = _authority_status(REPO_ROOT, entry)
        source_root = REPO_ROOT / catalog["pet"]["root"]

        with tempfile.TemporaryDirectory() as temporary:
            temporary_root = Path(temporary)
            copied_root = temporary_root / "bundle"
            shutil.copytree(source_root / "views", copied_root / "views")
            manifest_destination = copied_root / "source/battle/install-manifest.json"
            manifest_destination.parent.mkdir(parents=True)
            shutil.copyfile(
                source_root / "source/battle/install-manifest.json",
                manifest_destination,
            )
            copied_catalog = copy.deepcopy(catalog)
            copied_catalog["pet"]["root"] = "bundle"
            baseline_tree = runtime_tree_snapshot(
                temporary_root,
                copied_catalog,
                metadata,
            )
            self.assertTrue(baseline_tree["ok"], baseline_tree["errors"])
            self.assertEqual(
                baseline_tree["sha256"],
                entry["battleRuntimeTreeSha256"],
            )

            original_manifest = manifest_destination.read_bytes()
            manifest_destination.write_text("{}\n", encoding="utf-8")
            empty_manifest_tree = runtime_tree_snapshot(
                temporary_root,
                copied_catalog,
                metadata,
            )
            self.assertFalse(empty_manifest_tree["ok"])
            self.assertTrue(
                any(
                    "installedFileHashes is missing" in error
                    for error in empty_manifest_tree["errors"]
                ),
                empty_manifest_tree,
            )
            manifest_destination.write_bytes(original_manifest)

            empty_root = temporary_root / "empty_bundle/source/battle"
            empty_root.mkdir(parents=True)
            shutil.copyfile(
                source_root / "source/battle/install-manifest.json",
                empty_root / "install-manifest.json",
            )
            empty_catalog = copy.deepcopy(catalog)
            empty_catalog["pet"]["root"] = "empty_bundle"
            empty_tree = runtime_tree_snapshot(temporary_root, empty_catalog, metadata)
            self.assertFalse(empty_tree["ok"])
            self.assertEqual(empty_tree["frameCount"], 0)

            target = copied_root / "views/front_3quarter_sw/attack/attack-1.png"
            original = target.read_bytes()
            target.unlink()
            deleted_tree = runtime_tree_snapshot(temporary_root, copied_catalog, metadata)
            self.assertFalse(deleted_tree["ok"])
            self.assertEqual(deleted_tree["frameCount"], 179)
            target.write_bytes(original)

            replacement = copied_root / "views/front_3quarter_sw/attack/attack-2.png"
            self.assertEqual(_png_dimensions(target), (256, 256))
            self.assertEqual(_png_dimensions(replacement), (256, 256))
            shutil.copyfile(replacement, target)
            replaced_tree = runtime_tree_snapshot(temporary_root, copied_catalog, metadata)
            self.assertFalse(replaced_tree["ok"])
            self.assertTrue(
                any("runtime frame SHA-256 drift" in error for error in replaced_tree["errors"]),
                replaced_tree["errors"],
            )
            decision = resolve_documents(
                form_id,
                copied_catalog,
                metadata,
                metadata_sha,
                registry,
                authority,
                replaced_tree,
            )
            self.assertFalse(decision["normalRuntimeAllowed"])
            self.assertEqual(decision["releaseMode"], MODE_PLACEHOLDER)
            self.assertIsNone(decision["assetFormId"])
            self.assertEqual(decision["placeholderFormId"], form_id)

    def test_in_production_runtime_switch_without_attestation_stays_procedural(self) -> None:
        registry = _read_json(REGISTRY_PATH)
        form_id = "wuli_normal_orange_fire10"
        catalog = copy.deepcopy(_catalog_form(form_id))
        metadata, metadata_sha = _metadata_for(catalog)
        catalog["runtimeEnabled"] = True
        metadata["runtimeEnabled"] = True
        metadata["battleVisual"]["runtimeEnabled"] = True

        decision = resolve_documents(
            form_id,
            catalog,
            metadata,
            metadata_sha,
            registry,
        )
        self.assertFalse(decision["normalRuntimeAllowed"])
        self.assertEqual(decision["releaseMode"], MODE_PLACEHOLDER)
        self.assertEqual(decision["placeholderFormId"], form_id)

    def test_shared_skeleton_sibling_and_unknown_tamper_never_borrow_asset(self) -> None:
        source_id = "wuli_normal_orange_fire10"
        sibling_id = "wuli_normal_fast_wind10"
        source = _catalog_form(source_id)
        sibling = _catalog_form(sibling_id)
        self.assertEqual(source["artSkeletonId"], sibling["artSkeletonId"])
        sibling_metadata, sibling_sha = _metadata_for(sibling)
        synthetic_registry = {
            "formalReleaseEntries": [
                {
                    "formId": source_id,
                    "artSkeletonId": source["artSkeletonId"],
                }
            ],
            "legacyCompatibilityExceptions": [],
        }

        sibling_decision = resolve_documents(
            sibling_id,
            sibling,
            sibling_metadata,
            sibling_sha,
            synthetic_registry,
            {"ok": True, "formIds": [source_id]},
        )
        self.assertEqual(sibling_decision["releaseMode"], MODE_PLACEHOLDER)
        self.assertIsNone(sibling_decision["assetFormId"])
        self.assertEqual(sibling_decision["placeholderFormId"], sibling_id)

        unknown_id = "unknown_form_tamper"
        unknown_decision = resolve_documents(
            unknown_id,
            {},
            {},
            "",
            synthetic_registry,
        )
        self.assertEqual(unknown_decision["releaseMode"], MODE_PLACEHOLDER)
        self.assertIsNone(unknown_decision["assetFormId"])
        self.assertEqual(unknown_decision["placeholderFormId"], unknown_id)

    def test_legacy_exception_cannot_be_expanded(self) -> None:
        registry = _read_json(REGISTRY_PATH)
        expanded = copy.deepcopy(registry)
        clone = copy.deepcopy(expanded["legacyCompatibilityExceptions"][0])
        clone["formId"] = "wuli_normal_orange_fire10"
        expanded["legacyCompatibilityExceptions"].append(clone)

        errors = _registry_errors(expanded)
        self.assertTrue(any("exactly one" in error for error in errors), errors)

    def test_registry_nested_release_schemas_reject_shadow_fields_and_match_gdscript(self) -> None:
        registry = _read_json(REGISTRY_PATH)
        self.assertEqual(_registry_errors(registry), [])
        self.assertEqual(set(registry["coverageContract"]), set(COVERAGE_CONTRACT_KEYS))
        self.assertTrue(
            all(
                set(entry) == set(FORMAL_ENTRY_KEYS)
                and set(entry["releaseAuthority"])
                == set(RELEASE_AUTHORITY_REFERENCE_KEYS)
                for entry in registry["formalReleaseEntries"]
            )
        )
        self.assertEqual(
            set(registry["legacyCompatibilityExceptions"][0]),
            set(LEGACY_ENTRY_KEYS),
        )
        self.assertEqual(
            set(registry["runtimeCache"]),
            set(RUNTIME_CACHE_REFERENCE_KEYS),
        )
        registry_without_cache_pin = copy.deepcopy(registry)
        registry_without_cache_pin.pop("runtimeCache")
        self.assertEqual(_registry_errors(registry_without_cache_pin), [])

        mutations = {
            "coverage_extra": lambda value: value["coverageContract"].__setitem__(
                "legacySource", "untrusted"
            ),
            "formal_shadow_pixel_digests": lambda value: value[
                "formalReleaseEntries"
            ][0].update(
                {
                    "expectedImportedRgba8RawSha256": "0" * 64,
                    "expectedImportedPixelContractSha256": "1" * 64,
                }
            ),
            "formal_missing_runtime_digest": lambda value: value[
                "formalReleaseEntries"
            ][0].pop("battleRuntimeDigest"),
            "release_authority_extra": lambda value: value[
                "formalReleaseEntries"
            ][0]["releaseAuthority"].__setitem__("runtimeEnabled", True),
            "legacy_extra": lambda value: value[
                "legacyCompatibilityExceptions"
            ][0].__setitem__("formalPixelContract", "shadow"),
            "runtime_cache_not_object": lambda value: value.__setitem__(
                "runtimeCache", []
            ),
            "runtime_cache_extra": lambda value: value["runtimeCache"].__setitem__(
                "expectationSha256", "0" * 64
            ),
            "runtime_cache_missing": lambda value: value["runtimeCache"].pop("sha256"),
            "runtime_cache_wrong_contract": lambda value: value[
                "runtimeCache"
            ].__setitem__("contractId", "shadow_runtime_cache_v1"),
            "runtime_cache_wrong_path": lambda value: value[
                "runtimeCache"
            ].__setitem__("path", "client/godot/data/shadow_cache.json"),
            "runtime_cache_invalid_sha": lambda value: value[
                "runtimeCache"
            ].__setitem__("sha256", "A" * 64),
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label):
                changed = copy.deepcopy(registry)
                mutate(changed)
                self.assertTrue(_registry_errors(changed))

        gdscript = (
            REPO_ROOT / "client/godot/scripts/pet/pet_battle_release_gate.gd"
        ).read_text(encoding="utf-8")

        def gdscript_string_array(name: str) -> list[str]:
            match = re.search(
                rf"const {name}: Array\[String\] = (\[.*?\n\])",
                gdscript,
                re.DOTALL,
            )
            self.assertIsNotNone(match, name)
            values = ast.literal_eval(match.group(1))
            self.assertEqual(len(values), len(set(values)), name)
            return values

        self.assertEqual(
            set(gdscript_string_array("COVERAGE_CONTRACT_KEYS")),
            set(COVERAGE_CONTRACT_KEYS),
        )
        self.assertEqual(
            set(gdscript_string_array("FORMAL_ENTRY_KEYS")),
            set(FORMAL_ENTRY_KEYS),
        )
        self.assertEqual(
            set(gdscript_string_array("LEGACY_ENTRY_KEYS")),
            set(LEGACY_ENTRY_KEYS),
        )
        self.assertEqual(
            set(gdscript_string_array("RELEASE_AUTHORITY_REFERENCE_KEYS")),
            set(RELEASE_AUTHORITY_REFERENCE_KEYS),
        )

    def test_legacy_boolean_fields_cannot_be_replaced_by_integers(self) -> None:
        registry = _read_json(REGISTRY_PATH)
        form_id = LEGACY_FORM_ID
        catalog = _catalog_form(form_id)
        metadata, metadata_sha = _metadata_for(catalog)
        runtime_tree = runtime_tree_snapshot(REPO_ROOT, catalog, metadata)
        for key, value in (("formalRelease", 0), ("compatibilityOnly", 1)):
            with self.subTest(key=key):
                changed = copy.deepcopy(registry)
                changed["legacyCompatibilityExceptions"][0][key] = value
                decision = resolve_documents(
                    form_id,
                    catalog,
                    metadata,
                    metadata_sha,
                    changed,
                    {},
                    runtime_tree,
                )
                self.assertFalse(decision["normalRuntimeAllowed"], decision)
                self.assertEqual(decision["releaseMode"], MODE_PLACEHOLDER)

        for value in (False, 0, 1):
            with self.subTest(metadata_release_attestation=value):
                changed_metadata = copy.deepcopy(metadata)
                changed_metadata["releaseAttestation"] = value
                decision = resolve_documents(
                    form_id,
                    catalog,
                    changed_metadata,
                    metadata_sha,
                    registry,
                    {},
                    runtime_tree,
                )
                self.assertFalse(decision["normalRuntimeAllowed"], decision)
                self.assertEqual(decision["releaseMode"], MODE_PLACEHOLDER)

    def test_json_snapshot_hashes_and_parses_the_same_single_byte_read(self) -> None:
        first = b'{"value":"audited"}\n'
        later = b'{"value":"tampered-after-read"}\n'
        with mock.patch.object(Path, "read_bytes", side_effect=[first, later]) as reader:
            snapshot = _read_json_snapshot(Path("/tmp/phase404-snapshot.json"))
        self.assertEqual(reader.call_count, 1)
        self.assertEqual(snapshot["document"], {"value": "audited"})
        self.assertEqual(
            snapshot["sha256"],
            hashlib.sha256(first).hexdigest(),
        )
        self.assertEqual(snapshot["rawBytes"], first)
        for invalid in (b"\xff", b"[]"):
            with self.subTest(invalid=invalid), self.assertRaises(RuntimeError):
                _json_snapshot_from_bytes(Path("/tmp/phase404-invalid.json"), invalid)

        fractional = b'{"encounterRate":0.25,"weight":1.5}\n'
        non_release = _json_snapshot_from_bytes(
            Path("/tmp/phase404-map-fixture.json"),
            fractional,
        )
        self.assertEqual(non_release["document"]["encounterRate"], 0.25)
        self.assertEqual(non_release["document"]["weight"], 1.5)

        bound_path = Path("/tmp/phase404-bound-release.json")
        bool_raw = b'{"schemaVersion":true}\n'
        bool_snapshot = {
            "path": bound_path.resolve(),
            "document": {"schemaVersion": 1},
            "rawBytes": bool_raw,
            "sha256": hashlib.sha256(bool_raw).hexdigest(),
        }
        with self.assertRaisesRegex(RuntimeError, "differs from raw bytes"):
            _bind_json_snapshot(bound_path, bool_snapshot, {})

        integral_raw = b'{"schemaVersion":1.0}\n'
        integral_snapshot = {
            "path": bound_path.resolve(),
            "document": {"schemaVersion": 1},
            "rawBytes": integral_raw,
            "sha256": hashlib.sha256(integral_raw).hexdigest(),
        }
        bound = _bind_json_snapshot(bound_path, integral_snapshot, {})
        self.assertEqual(bound["document"], {"schemaVersion": 1})

    def test_progression_and_authority_object_arrays_reject_null_or_junk(self) -> None:
        catalog_form_ids = {
            form["formId"] for form in _read_json(CATALOG_PATH)["forms"]
        }
        progression_path = REPO_ROOT / "client/godot/data/balance/progression_zones.json"
        baseline_progression = _read_json(progression_path)
        def append_junk_map_id(value: dict) -> None:
            training_zone = next(
                zone
                for zone in value["progressions"][0]["zones"]
                if zone.get("contentType") == "wild_training"
            )
            training_zone["mapIds"].append(None)

        mutations = {
            "progressions": lambda value: value["progressions"].append(None),
            "active_zones": lambda value: value["progressions"][0]["zones"].append(None),
            "map_ids": append_junk_map_id,
        }
        for label, mutate in mutations.items():
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary:
                changed = copy.deepcopy(baseline_progression)
                mutate(changed)
                changed_path = Path(temporary) / "progression_zones.json"
                changed_path.write_text(
                    json.dumps(changed, ensure_ascii=False),
                    encoding="utf-8",
                )
                coverage = derive_formal_wild_training_forms(
                    REPO_ROOT,
                    changed_path,
                    catalog_form_ids,
                )
                self.assertTrue(
                    any(
                        "object-only array" in error or "string-only array" in error
                        for error in coverage["errors"]
                    ),
                    coverage,
                )

        active = baseline_progression["progressions"][0]
        training_zone = next(
            zone for zone in active["zones"] if zone.get("contentType") == "wild_training"
        )
        target_map_id = training_zone["mapIds"][0]
        target_group_id = training_zone["encounterGroupId"]
        map_sources = sorted((REPO_ROOT / "client/godot/data").glob("*_map.json"))
        target_source = next(
            path for path in map_sources if _read_json(path).get("id") == target_map_id
        )
        for label in ("encounter_zones", "wild_pet_pool"):
            with self.subTest(label=label), tempfile.TemporaryDirectory() as temporary:
                root = Path(temporary)
                data_root = root / "client/godot/data"
                data_root.mkdir(parents=True)
                for source in map_sources:
                    shutil.copyfile(source, data_root / source.name)
                target = data_root / target_source.name
                target_document = _read_json(target)
                if label == "encounter_zones":
                    target_document["encounterZones"].append(None)
                else:
                    encounter = next(
                        value
                        for value in target_document["encounterZones"]
                        if value.get("encounterGroupId") == target_group_id
                        and value.get("manualOnly") is not True
                    )
                    encounter["wildPetPool"].append(None)
                target.write_text(
                    json.dumps(target_document, ensure_ascii=False),
                    encoding="utf-8",
                )
                coverage = derive_formal_wild_training_forms(
                    root,
                    progression_path,
                    catalog_form_ids,
                )
                self.assertTrue(
                    any("object-only array" in error for error in coverage["errors"]),
                    coverage,
                )

        registry = _read_json(REGISTRY_PATH)
        formal_entry = copy.deepcopy(registry["formalReleaseEntries"][0])
        authority_relative = Path(formal_entry["releaseAuthority"]["path"])
        baseline_authority = _read_json(REPO_ROOT / authority_relative)
        authority_mutations = {
            "empty_document": lambda value: value.clear(),
            "null": lambda value: value.__setitem__("forms", None),
            "junk": lambda value: value["forms"].append(None),
            "empty": lambda value: value.__setitem__("forms", []),
            "empty_form_id": lambda value: value["forms"][0].__setitem__(
                "formId", ""
            ),
            "non_string_form_id": lambda value: value["forms"][0].__setitem__(
                "formId", 404
            ),
            "duplicate_form_id": lambda value: value["forms"].append(
                copy.deepcopy(value["forms"][0])
            ),
        }
        for label, mutate in authority_mutations.items():
            with self.subTest(authority=label), tempfile.TemporaryDirectory() as temporary:
                authority = copy.deepcopy(baseline_authority)
                mutate(authority)
                authority_bytes = (
                    json.dumps(authority, ensure_ascii=False, indent=2) + "\n"
                ).encode("utf-8")
                entry = copy.deepcopy(formal_entry)
                entry["releaseAuthority"]["sha256"] = hashlib.sha256(
                    authority_bytes
                ).hexdigest()
                root = Path(temporary)
                path = root / authority_relative
                path.parent.mkdir(parents=True, exist_ok=True)
                path.write_bytes(authority_bytes)
                status = _authority_status(root, entry)
                self.assertFalse(status["ok"], status)
                self.assertTrue(
                    any(
                        "object-only array" in error
                        or "empty or duplicated" in error
                        for error in status["errors"]
                    ),
                    status,
                )


if __name__ == "__main__":
    unittest.main()
