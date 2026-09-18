extends RefCounted

const DrawOrder := preload("res://scripts/battle/battle_draw_order.gd")


static func validation_errors() -> Array[String]:
	var errors: Array[String] = []
	var rng := RandomNumberGenerator.new()
	rng.seed = 548
	for count in [0, 1, 2, 10, 20]:
		for sample in range(20):
			var actors: Array = []
			var positions := {}
			for index in range(count):
				var slot := str(index)
				positions[slot] = Vector2(0, rng.randi_range(-3, 3))
				actors.append({"id": slot, "slotId": slot, "hp": 10, "status": {"turns": [1, 2]}})
			var original := actors.duplicate(true)
			var calls := [0]
			var position := func(slot: String) -> Vector2:
				calls[0] += 1
				return positions[slot]
			var ordered := DrawOrder.sorted_actors(actors, position)
			if calls[0] != count or ordered != _legacy_order(actors, positions):
				errors.append("draw/picking order or linear depth reads changed: %d/%d" % [count, sample])
			if actors != original:
				errors.append("ordering mutated authoritative actors")
			if count > 0:
				# New snapshots, slot moves and camera changes are observed immediately.
				positions["0"] = Vector2(0, 100)
				actors[0] = {"id": "replacement", "slotId": "0", "hp": 3}
				var refreshed := DrawOrder.sorted_actors(actors, position)
				if refreshed != _legacy_order(actors, positions) or refreshed.back().hp != 3:
					errors.append("ordering retained old positions or an old server snapshot")
			ordered.clear()
			if actors.size() != count:
				errors.append("result array aliases input array")
	print("battle draw order check: cases=100 status=%s errors=%s" % ["passed" if errors.is_empty() else "failed", str(errors)])
	return errors


static func _legacy_order(actors: Array, positions: Dictionary) -> Array:
	var ordered := actors.duplicate(true)
	for index in range(ordered.size()):
		for next_index in range(index + 1, ordered.size()):
			if positions[ordered[next_index].slotId].y < positions[ordered[index].slotId].y:
				var actor = ordered[index]
				ordered[index] = ordered[next_index]
				ordered[next_index] = actor
	return ordered
