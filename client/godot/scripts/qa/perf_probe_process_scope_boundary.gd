extends Node

const PHASE_BEGIN := "begin"
const PHASE_END := "end"
const BEGIN_PROCESS_PRIORITY := -1000000
const END_PROCESS_PRIORITY := 1000000

var host
var phase: String = ""


func configure(host_ref, phase_id: String) -> bool:
	if host_ref == null or phase_id not in [PHASE_BEGIN, PHASE_END]:
		return false
	host = host_ref
	phase = phase_id
	process_priority = (
		BEGIN_PROCESS_PRIORITY if phase == PHASE_BEGIN else END_PROCESS_PRIORITY
	)
	return true


func _process(_delta: float) -> void:
	if host == null or not is_instance_valid(host):
		return
	if phase == PHASE_BEGIN:
		host.call("_perf_probe_process_scope_begin")
	elif phase == PHASE_END:
		host.call("_perf_probe_process_scope_end")
