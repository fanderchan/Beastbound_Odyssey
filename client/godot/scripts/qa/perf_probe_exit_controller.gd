extends RefCounted

const RuntimeExitCleanup := preload("res://scripts/qa/runtime_exit_cleanup.gd")

var host


func _init(host_ref) -> void:
	host = host_ref


func finish_after_frames(frame_count: int, requested_exit_code: int = 0) -> void:
	for _frame_index in range(frame_count):
		await host.get_tree().process_frame
	await finish(requested_exit_code)


func finish(requested_exit_code: int) -> void:
	var cleanup: Dictionary = await RuntimeExitCleanup.drain_audio(host)
	cleanup["requestedExitCode"] = requested_exit_code
	print("perf probe clean exit: %s" % JSON.stringify(cleanup))
	var final_exit_code := requested_exit_code
	if str(cleanup.get("status", "")) != "passed":
		final_exit_code = 1
	host.get_tree().quit(final_exit_code)
