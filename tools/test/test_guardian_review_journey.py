from copy import deepcopy
import json
from pathlib import Path
import sys
import tempfile
import unittest

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
from guardian_review_journey import RETURN_MAPS, validate_cave_journey


class CaveJourneyTests(unittest.TestCase):
    def test_cross_checks_floors_input_art_and_authoritative_wins(self):
        route = [{"map": map_id, "frame": index + 1, "serverSession": True,
            "saving": False, "groundVisible": True, "artPreview": True, "mapVisualActive": True,
            "bundleId": "earth_vein_cave_visual_v1", "zoom": [1.52, 1.52]}
            for index, map_id in enumerate(RETURN_MAPS)]
        report = {"status": "passed", "errors": [], "computerUse": False, "performanceEvidence": False,
            "kind": "automated_cave_journey_viewport_input", "endMap": RETURN_MAPS[-1],
            "earthRingsGranted": 1, "route": route,
            "inputs": [{"pressFrame": 1, "releaseFrame": 2, "frameSeparated": True}],
            "ordinaryBattles": [{"roomId": "ordinary", "map": RETURN_MAPS[1]}]}
        events = [{"event": {"type": "battle.room_closed", "room": {"roomId": room_id,
            "entry": {"mapId": map_id}, "status": "closed", "closeReason": "defeat",
            "participantAccountIds": ["leader"],
            "battle": {"result": {"winnerAccountId": "leader", "loserAccountIds": []}}}}}
            for room_id, map_id in [("guardian", RETURN_MAPS[0]), ("ordinary", RETURN_MAPS[1])]]
        states = [{"map": map_id} for map_id in RETURN_MAPS]
        with tempfile.TemporaryDirectory() as directory:
            run = Path(directory)
            (run / "backend").mkdir()

            def check(r, s, e):
                (run / "autoplay.json").write_text(json.dumps(r))
                (run / "states.ndjson").write_text("\n".join(map(json.dumps, s)))
                (run / "backend/battle-events.ndjson").write_text("\n".join(map(json.dumps, e)))
                return validate_cave_journey(run)

            self.assertEqual(check(report, states, events)["completedRooms"], 2)
            float32_report = deepcopy(report)
            for row in float32_report["route"]:
                row["zoom"] = [1.51999998092651, 1.51999998092651]
            self.assertEqual(check(float32_report, states, events)["status"], "passed")
            mutations = [
                lambda r, s, e: r.update(computerUse=True),
                lambda r, s, e: r.update(earthRingsGranted=0),
                lambda r, s, e: r["route"].pop(2),
                lambda r, s, e: s.pop(2),
                lambda r, s, e: r["route"][2].update(frame=1),
                lambda r, s, e: r["route"][2].update(saving=True),
                lambda r, s, e: r["route"][2].update(mapVisualActive=False),
                lambda r, s, e: r["route"][2].update(zoom=[1, 1]),
                lambda r, s, e: r["route"][2].update(zoom=[1.5201, 1.52]),
                lambda r, s, e: r["route"][2].update(zoom=[float("nan"), 1.52]),
                lambda r, s, e: r["route"][2].update(zoom=None),
                lambda r, s, e: r["inputs"][0].update(releaseFrame=1),
                lambda r, s, e: r.update(ordinaryBattles=[]),
                lambda r, s, e: r["ordinaryBattles"].append(deepcopy(r["ordinaryBattles"][0])),
                lambda r, s, e: e[0]["event"]["room"]["entry"].update(mapId=RETURN_MAPS[2]),
                lambda r, s, e: e[1]["event"]["room"]["entry"].update(mapId=RETURN_MAPS[2]),
                lambda r, s, e: e[1]["event"]["room"].update(closeReason="timeout"),
                lambda r, s, e: e[1]["event"]["room"]["battle"]["result"].update(winnerAccountId=""),
                lambda r, s, e: e[1]["event"]["room"]["battle"]["result"].update(loserAccountIds=["leader"]),
            ]
            for index, mutate in enumerate(mutations):
                with self.subTest(case=index):
                    values = deepcopy((report, states, events))
                    mutate(*values)
                    with self.assertRaises(RuntimeError):
                        check(*values)


if __name__ == "__main__":
    unittest.main()
