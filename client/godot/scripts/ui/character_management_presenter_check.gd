extends SceneTree

const CharacterManagementPresenter := preload(
	"res://scripts/ui/character_management_presenter.gd"
)


func _initialize() -> void:
	call_deferred("_execute")


func _execute() -> void:
	var result := CharacterManagementPresenter.self_check()
	print("CHARACTER_MANAGEMENT_PRESENTER_CHECK: %s" % JSON.stringify(result))
	quit(0 if bool(result.get("ok", false)) else 1)
