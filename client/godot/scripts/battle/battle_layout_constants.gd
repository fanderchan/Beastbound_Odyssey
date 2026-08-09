extends RefCounted

const GRID_TEMPLATE_SIZE := Vector2(1280.0, 720.0)
# Phase 403 keeps the original lane separation and vertical rhythm, but shifts
# the five-position diagonal span left and down just enough to clear the formal
# Phase 397 HUD and viewport edges at 1280x720. Slot ids and lane/rank semantics
# do not change; only their presentation anchors do.
const GRID_TEMPLATE_ORIGIN := Vector2(94.0, 340.4)
const GRID_TEMPLATE_LANE_STEP := Vector2(152.0, 52.0)
const GRID_TEMPLATE_RANK_STEP := Vector2(64.0, -48.0)
