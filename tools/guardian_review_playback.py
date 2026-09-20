"""Compare real Main playback boundaries with authoritative completed battles."""
import json
from pathlib import Path


def validate_turn_playback(run: Path) -> dict:
    def rows(path):
        return [json.loads(line) for line in path.read_text().splitlines()] if path.exists() else []

    events = [row["event"] for row in rows(run / "backend/battle-events.ndjson")]
    closed = {event["room"]["roomId"] for event in events if event["type"] == "battle.room_closed"}
    turns = [event["turn"] for event in events if event["type"] == "battle.turn_resolved"]
    records = rows(run / "turn-playback.ndjson")
    if not closed:
        return {"status": "not_completed" if turns else "not_observed", "completedRooms": 0, "turns": 0}

    def key(turn):
        return (turn["roomId"], turn["round"], turn["turnSeq"])

    expected = [(stage, *key(turn)) for turn in turns if turn["roomId"] in closed
        for stage in ("started", "finished")]
    actual = [(row["stage"], *key(row)) for row in records if row["roomId"] in closed]
    # A room may legitimately time out before its first resolved turn.
    if actual != expected or any(row.get("skippedTurns", -1) != 0 for row in records):
        raise RuntimeError(f"Battle playback differs from server turns: expected {len(expected)} boundaries, observed {len(actual)}")
    completed = [row for row in records if row["roomId"] in closed]
    if any(right["frame"] < left["frame"] for left, right in zip(completed, completed[1:])):
        raise RuntimeError("Battle playback frame order regressed")
    return {"status": "passed", "completedRooms": len(closed), "turns": len(expected) // 2,
        "started": len(actual) // 2, "finished": len(actual) // 2,
        "scope": "actual Main turn start and animation-completion boundaries; not subjective visual acceptance"}
