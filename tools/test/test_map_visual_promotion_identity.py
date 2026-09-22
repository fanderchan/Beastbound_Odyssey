from contextlib import ExitStack
import json
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest import mock

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import map_visual_evidence_builder as builder
import map_visual_promotion_identity as identity


class CatalogPromotionIdentityTests(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.root = Path(self.stack.enter_context(tempfile.TemporaryDirectory()))
        self.godot = self.root / "client/godot"
        self.godot.mkdir(parents=True)
        (self.godot / "project.godot").write_text('config_version=5\n[application]\nconfig/name="QA"\n')
        for relative in builder.RUNTIME_IDENTITY_FILES:
            path = self.godot / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text("unchanged runtime\n")
        self.bundles = {}
        self.entries = []
        for map_id in ("stable", "candidate"):
            bundle_id = map_id + "_visual_v1"
            relative = "assets/maps/" + bundle_id
            bundle = self.godot / relative
            (bundle / "bindings").mkdir(parents=True)
            (bundle / "runtime").mkdir()
            (bundle / "bindings" / f"{map_id}.json").write_text(json.dumps({"mapId": map_id}))
            (bundle / "runtime/ground.png").write_bytes(b"unchanged fixture pixels")
            (bundle / "map-visual-bundle.json").write_text(json.dumps({
                "schemaVersion": 1, "bundleId": bundle_id, "mapIds": [map_id],
                "status": "owner_review_pending", "releaseApproved": False,
            }))
            self.bundles[bundle_id] = (relative, [map_id])
            self.entries.append({"mapId": map_id,
                "bundleManifest": "res://" + relative + "/map-visual-bundle.json",
                "bindingPath": "res://" + relative + f"/bindings/{map_id}.json"})
        self.write_catalog(identity.PRIMARY, self.entries[:1])
        self.write_catalog(identity.REVIEW, self.entries)
        self.write_registry(self.entries[:1])
        self.stack.enter_context(mock.patch.object(builder, "REPO_ROOT", self.root))
        self.stack.enter_context(mock.patch.object(builder, "GODOT_ROOT", self.godot))
        self.stack.enter_context(mock.patch.object(builder, "MAP_BUNDLES", self.bundles))
        self.stack.enter_context(mock.patch.object(identity, "_load_builder", return_value=builder))
        self.git("init", "--quiet")
        self.git("add", ".")
        self.git("commit", "--quiet", "-m", "freeze candidate")
        self.captured = builder.build_identity()

    def git(self, *args):
        return subprocess.run(["git", "-c", "user.name=QA", "-c",
            "user.email=qa@example.invalid", *args], cwd=self.root, check=True,
            capture_output=True, text=True).stdout.strip()

    def write_catalog(self, relative, entries):
        (self.godot / relative).write_text(json.dumps({"schemaVersion": 1, "entries": entries}) + "\n")

    def write_registry(self, entries):
        ids = [entry["mapId"] for entry in entries]
        bindings = {entry["mapId"]: entry["bindingPath"] for entry in entries}
        bundles = {key: value[1] for key, value in self.bundles.items() if value[1][0] in ids}
        (self.godot / identity.CHECK).write_text(
            "extends SceneTree\nconst EXPECTED_MAP_IDS: Array[String] = " + json.dumps(ids, indent=2)
            + "\nconst BINDING_PATHS := " + json.dumps(bindings, indent=2)
            + "\nconst BUNDLE_MAP_IDS := " + json.dumps(bundles, indent=2)
            + "\nfunc check():\n\treturn true\n")

    def promote(self, *, update_registry=True):
        self.write_catalog(identity.PRIMARY, self.entries)
        if update_registry:
            self.write_registry(self.entries)
        self.git("add", ".")
        self.git("commit", "--quiet", "-m", "promote only catalog registration")

    def matches(self):
        return identity.matches_catalog_promotion(self.captured, builder.build_identity(), self.root)

    def test_reconstruction_exactly_matches_frozen_v2_algorithm(self):
        self.assertEqual(self.captured.rsplit(":", 1)[1], identity._runtime_surface(self.root, builder, {}))
        with self.assertRaises(ValueError):
            identity._runtime_surface(self.root, builder, {"scripts/main.gd": b"replacement"})

    def test_promotion_survives_registration_update_without_changing_capture(self):
        self.promote(update_registry=False)
        self.assertTrue(self.matches())
        self.write_registry(self.entries)
        self.assertTrue(self.matches())
        manifest = self.godot / self.entries[1]["bundleManifest"][6:]
        value = json.loads(manifest.read_bytes())
        value.update(status="released", ownerReviewStatus="approved", releaseApproved=True, runtimeEnabled=True)
        manifest.write_text(json.dumps(value))
        self.assertTrue(self.matches())

    def test_promotion_cannot_hide_any_other_runtime_change(self):
        self.promote()
        self.assertTrue(self.matches())
        for relative in ("scripts/main.gd", "scripts/world/map_visual_renderer.gd",
                "data/earth_vein_cave_map.json", identity.REVIEW, identity.CHECK, identity.GROUND_CHECK,
                "assets/maps/candidate_visual_v1/runtime/ground.png",
                "assets/maps/candidate_visual_v1/bindings/candidate.json"):
            with self.subTest(relative=relative):
                path = self.godot / relative
                original = path.read_bytes()
                path.write_bytes(original + b"\nchanged\n")
                self.assertFalse(self.matches())
                path.write_bytes(original)

    def test_only_the_promoted_fallback_fixture_may_change(self):
        old = b'checks before\n\thost.map_art_review_preview = false\n\thost._load_map("candidate")\nassertions after\n'
        new = old.replace(b'"candidate"', b'"pending"')
        args = ({"candidate"}, {"candidate": {}}, {"candidate": {}, "pending": {}})
        self.assertTrue(identity._fallback_fixture_matches(old, new, *args))
        for invalid in [new + b"extra", new.replace(b"assertions", b"return"),
                new.replace(b'"pending"', b'"candidate"') + b"extra"]:
            self.assertFalse(identity._fallback_fixture_matches(old, invalid, *args))
        self.assertFalse(identity._fallback_fixture_matches(old, new, set(), args[1], args[2]))
        self.assertFalse(identity._fallback_fixture_matches(old, new, args[0], args[2], args[2]))
        self.assertFalse(identity._fallback_fixture_matches(old, new, args[0], args[1], args[1]))

    def test_unregistered_or_partial_promotion_fails(self):
        self.promote()
        self.assertTrue(self.matches())
        self.write_catalog(identity.PRIMARY, self.entries[1:])
        self.assertFalse(self.matches())
        self.write_catalog(identity.PRIMARY, self.entries + [dict(self.entries[1], mapId="unreviewed")])
        self.assertFalse(self.matches())
        self.write_catalog(identity.PRIMARY, self.entries)
        manifest = self.godot / self.entries[1]["bundleManifest"][6:]
        value = json.loads(manifest.read_bytes())
        value["mapIds"].append("missing_floor")
        manifest.write_text(json.dumps(value))
        self.assertFalse(self.matches())

    def test_registry_paths_and_real_git_ancestry_remain_required(self):
        self.promote()
        self.assertTrue(self.matches())
        current = builder.build_identity()
        unknown = "git:" + "0" * 40 + "+" + self.captured.split("+", 1)[1]
        self.assertFalse(identity.matches_catalog_promotion(unknown, current, self.root))
        false_digest = self.captured[:-1] + ("0" if self.captured[-1] != "0" else "1")
        self.assertFalse(identity.matches_catalog_promotion(false_digest, current, self.root))
        changed = [*self.entries[:1], dict(self.entries[1], bindingPath="res://wrong.json")]
        self.write_registry(changed)
        self.assertFalse(self.matches())


if __name__ == "__main__":
    unittest.main()
