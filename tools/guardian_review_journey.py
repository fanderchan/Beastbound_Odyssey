"""Cross-check an automated cave return against Main samples and server battles."""
import json
import math
from pathlib import Path

RETURN_MAPS = ["earth_vein_cave_f4", "earth_vein_cave_f3", "earth_vein_cave_f2",
    "earth_vein_cave", "firebud_village_gate"]


def _camera_zoom_matches(value) -> bool:
    # Vector2 components are float32; JSON can preserve 1.51999998092651.
    return isinstance(value, list) and len(value) == 2 and all(
        isinstance(axis, (int, float)) and math.isclose(axis, 1.52, rel_tol=0, abs_tol=1e-6)
        for axis in value)


def validate_cave_journey(run: Path) -> dict:
    report = json.loads((run / "autoplay.json").read_text())
    states = [json.loads(line) for line in (run / "states.ndjson").read_text().splitlines()]
    events = [json.loads(line)["event"] for line in
        (run / "backend/battle-events.ndjson").read_text().splitlines()]
    if (report.get("status") != "passed" or report.get("errors") != []
            or report.get("kind") != "automated_cave_journey_viewport_input"
            or report.get("computerUse") is not False or report.get("performanceEvidence") is not False
            or report.get("earthRingsGranted") != 1 or report.get("endMap") != RETURN_MAPS[-1]):
        raise RuntimeError("Cave journey did not complete its disclosed automated scope")
    route = report.get("route", [])
    observed_maps = []
    for state in states:
        if not observed_maps or observed_maps[-1] != state.get("map"):
            observed_maps.append(state.get("map"))
    if [row.get("map") for row in route] != RETURN_MAPS or observed_maps != RETURN_MAPS:
        raise RuntimeError("Cave journey skipped or repeated a required return floor")
    if any(right.get("frame", -1) <= left.get("frame", -1) for left, right in zip(route, route[1:])):
        raise RuntimeError("Cave journey return frames are not increasing")
    for row in route:
        if row.get("serverSession") is not True or row.get("saving") is not False or row.get("groundVisible") is not True:
            raise RuntimeError("Cave journey lost authoritative presentation or ground")
        if row["map"].startswith("earth_vein_cave") and (
                row.get("artPreview") is not True or row.get("mapVisualActive") is not True
                or row.get("bundleId") != "earth_vein_cave_visual_v1"
                or not _camera_zoom_matches(row.get("zoom"))):
            raise RuntimeError("Cave journey restored a grid or changed actor camera scale")
    inputs = report.get("inputs", [])
    if not inputs or any(row.get("frameSeparated") is not True
            or row.get("releaseFrame", -1) <= row.get("pressFrame", -1) for row in inputs):
        raise RuntimeError("Cave journey requires actual frame-separated viewport input")
    closed = {event["room"]["roomId"]: event["room"] for event in events
        if event["type"] == "battle.room_closed"}
    ordinary = report.get("ordinaryBattles", [])
    room_ids = [row.get("roomId") for row in ordinary]
    if not ordinary or len(set(room_ids)) != len(room_ids) or len(closed) != len(ordinary) + 1:
        raise RuntimeError("Cave journey did not settle guardian and distinct ordinary encounters")
    guardians = [room for room_id, room in closed.items() if room_id not in room_ids]
    if len(guardians) != 1 or guardians[0].get("entry", {}).get("mapId") != RETURN_MAPS[0]:
        raise RuntimeError("Cave journey did not identify its authoritative guardian room")
    for row in ordinary:
        room = closed.get(row.get("roomId"), {})
        if row.get("map") not in RETURN_MAPS[1:4] or room.get("entry", {}).get("mapId") != row["map"]:
            raise RuntimeError("Cave journey encounter does not match its authoritative map")
    for room in closed.values():
        result = room.get("battle", {}).get("result", {})
        if (room.get("status") != "closed" or room.get("closeReason") != "defeat"
                or result.get("winnerAccountId") not in room.get("participantAccountIds", [])
                or result.get("loserAccountIds") != []):
            raise RuntimeError("Cave journey includes an escaped, lost or timed-out battle")
    return {"status": "passed", "computerUse": False, "performanceEvidence": False,
        "maps": observed_maps, "ordinaryBattles": len(ordinary), "completedRooms": len(closed),
        "inputs": len(inputs), "scope": "automated viewport input, observed Main transitions and server results; owner review remains pending"}
