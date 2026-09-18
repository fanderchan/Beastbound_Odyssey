extends RefCounted

const RuntimeExitCleanup := preload("res://scripts/qa/runtime_exit_cleanup.gd")

var host


func _init(host_ref) -> void:
	host = host_ref


func finish_after_measurement_frames(
	frame_count: int,
	requested_exit_code: int = 0,
	measurement_mode: String = "fixed_process_frames"
) -> void:
	while int(host.get("perf_probe_warmup_frames_remaining")) > 0:
		await host.get_tree().process_frame
	while int(host.get("perf_probe_measurement_frames_total")) < frame_count:
		await host.get_tree().process_frame
	if int(host.get("perf_probe_sample_frames")) > 0:
		# The late process-priority boundary closes the exact final frame after
		# Main has staged it.  Never complete or start audio cleanup until all
		# process-scope windows have been queued and emitted.
		while not bool(host.get("perf_probe_measurement_scope_complete")):
			await host.get_tree().process_frame
	var measurement_ok := bool(
		host.call(
			"_complete_perf_probe_measurement",
			measurement_mode,
			frame_count
		)
	)
	await finish(requested_exit_code if measurement_ok else 1)


func finish(requested_exit_code: int) -> void:
	var cleanup: Dictionary = await RuntimeExitCleanup.drain_audio(host)
	cleanup["requestedExitCode"] = requested_exit_code
	print("perf probe clean exit: %s" % JSON.stringify(cleanup))
	var final_exit_code := requested_exit_code
	if str(cleanup.get("status", "")) != "passed":
		final_exit_code = 1
	var tree := host.get_tree() as SceneTree
	var tree_script := tree.get_script() as Script
	if tree_script != null and tree_script.resource_path == "res://scripts/qa/map_performance_batch.gd":
		# The isolated batch owns the native window; each real Main still drains
		# its audio and returns its actual exit status before being released.
		tree.call("complete_map_performance_sample", host, final_exit_code)
		return
	tree.quit(final_exit_code)
