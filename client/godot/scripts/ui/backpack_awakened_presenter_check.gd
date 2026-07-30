extends SceneTree

const BackpackAwakenedPresenter := preload("res://scripts/ui/backpack_awakened_presenter.gd")


func _init() -> void:
	var result := BackpackAwakenedPresenter.self_check()
	print("BACKPACK_AWAKENED_PRESENTER_CHECK: %s" % JSON.stringify(result))
	quit(0 if bool(result.get("ok", false)) else 1)
