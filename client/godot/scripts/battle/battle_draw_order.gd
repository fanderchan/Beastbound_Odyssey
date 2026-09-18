extends RefCounted


# Return a new ordering of read-only actor references. Resolve depth once per
# actor on every call, so camera/layout and replacement server snapshots cannot
# leave a stale order behind. Drawing owns its visual overrides, not these actors.
static func sorted_actors(actors: Array, slot_position: Callable) -> Array:
	var ordered := actors.duplicate()
	var depths := PackedFloat64Array()
	for actor in ordered:
		var position: Vector2 = slot_position.call(str((actor as Dictionary).get("slotId", "")))
		depths.append(position.y)
	# Keep the original pairwise exchange order, including its equal-depth ties.
	# A generic sort may choose a different topmost actor for drawing and picking.
	for index in range(ordered.size()):
		for next_index in range(index + 1, ordered.size()):
			if depths[next_index] < depths[index]:
				var actor = ordered[index]
				ordered[index] = ordered[next_index]
				ordered[next_index] = actor
				var depth := depths[index]
				depths[index] = depths[next_index]
				depths[next_index] = depth
	return ordered
