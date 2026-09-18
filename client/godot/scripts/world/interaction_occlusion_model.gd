extends RefCounted

# Keep the controlled character visible behind an interactive prop while retaining
# the existing foot-based depth order. This never changes collision or click targets.
const OBSCURING_ALPHA := 0.28


static func alpha_for(subject_rect: Rect2, subject_depth: float, object_rect: Rect2, object_depth: float) -> float:
	if subject_rect.size.x <= 0.0 or subject_rect.size.y <= 0.0:
		return 1.0
	if subject_depth > object_depth or not object_rect.intersects(subject_rect):
		return 1.0
	return OBSCURING_ALPHA
