extends SceneTree

const HangMatchmakingClientModel := preload(
	"res://scripts/net/hang_matchmaking_client_model.gd"
)


func _init() -> void:
	var report := HangMatchmakingClientModel.debug_self_check()
	if bool(report.get("ok", false)):
		print("HANG_MATCHMAKING_CLIENT_CHECK_OK ", JSON.stringify(report.get("checks", {})))
		quit(0)
		return
	push_error("HANG_MATCHMAKING_CLIENT_CHECK_FAILED %s" % JSON.stringify(report))
	quit(1)
