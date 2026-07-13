import assert from "node:assert/strict";
import {execFile} from "node:child_process";
import os from "node:os";
import path from "node:path";
import process from "node:process";
import {performance} from "node:perf_hooks";
import {fileURLToPath} from "node:url";

const FILE = fileURLToPath(import.meta.url);
const MIB = 1024 * 1024;
const MAX_PROBE_ERRORS = 32;
const MAX_CPU_SAMPLES = 7_200;
const MAX_SLOW_SAMPLES = 128;
const DEFAULT_COMMAND_TIMEOUT_MS = 2_000;
const DEFAULT_COMMAND_MAX_BUFFER_BYTES = 64 * 1024;
const DEFAULT_CPU_SAMPLE_INTERVAL_MS = 1_000;
const DEFAULT_VM_SAMPLE_INTERVAL_MS = 60_000;
const DEFAULT_PRESSURE_SAMPLE_INTERVAL_MS = 5 * 60_000;
const DEFAULT_PREFLIGHT_DURATION_MS = 10_000;
const DEFAULT_PREFLIGHT_SAMPLE_INTERVAL_MS = 1_000;

export const MACOS_HOST_EVIDENCE_SCHEMA_VERSION = 1;

export const DEFAULT_HOST_ENVIRONMENT_THRESHOLDS = Object.freeze({
  preflightCpuWarningPct: 25,
  preflightCpuInvalidPct: 50,
  preflightCpuBurstPct: 70,
  preflightCpuBurstSamples: 5,
  memoryPressureWarningPct: 20,
  memoryPressureInvalidPct: 10,
  staticSwapWarningRatio: 0.8,
  pagingWarningMiBPerSecond: 1,
  pagingInvalidMiBPerSecond: 16,
  runtimePagingSpikeInvalidMiBPerSecond: 64,
  runtimePagingSustainedInvalidMiBPerSecond: 16,
  runtimePagingSustainedSamples: 2,
  runtimeExternalBusyInvalidPct: 50,
  runtimeExternalBurstInvalidPct: 70,
  runtimeExternalBurstSeconds: 30,
  minimumEvidenceCoverageRatio: 0.9,
  lowBatteryInvalidPct: 10,
  kernelAndLoopbackCpuAllowancePct: 5,
});

const PROBE_SPECS = Object.freeze({
  osVersion: Object.freeze({
    file: "/usr/bin/sw_vers",
    args: Object.freeze([]),
    parse: parseSwVers,
  }),
  hardware: Object.freeze({
    file: "/usr/sbin/sysctl",
    args: Object.freeze([
      "hw.model",
      "hw.memsize",
      "hw.physicalcpu",
      "hw.logicalcpu",
      "machdep.cpu.brand_string",
    ]),
    parse: parseHardwareSysctl,
  }),
  vmStat: Object.freeze({
    file: "/usr/bin/vm_stat",
    args: Object.freeze([]),
    parse: parseVmStat,
  }),
  memoryPressure: Object.freeze({
    file: "/usr/bin/memory_pressure",
    args: Object.freeze(["-Q"]),
    parse: parseMemoryPressure,
  }),
  swapUsage: Object.freeze({
    file: "/usr/sbin/sysctl",
    args: Object.freeze(["vm.swapusage"]),
    parse: parseSwapUsage,
  }),
  battery: Object.freeze({
    file: "/usr/bin/pmset",
    args: Object.freeze(["-g", "batt"]),
    parse: parsePmsetBattery,
  }),
  thermal: Object.freeze({
    file: "/usr/bin/pmset",
    args: Object.freeze(["-g", "therm"]),
    parse: parsePmsetTherm,
  }),
  powerConfig: Object.freeze({
    file: "/usr/bin/pmset",
    args: Object.freeze(["-g", "custom"]),
    parse: parsePmsetCustom,
  }),
});

const STATIC_PROBES = Object.freeze(["osVersion", "hardware"]);
const DYNAMIC_PROBES = Object.freeze([
  "vmStat",
  "memoryPressure",
  "swapUsage",
  "battery",
  "thermal",
  "powerConfig",
]);

export function parseSwVers(value) {
  const text = String(value || "");
  const productName = safeText(capture(text, /^ProductName:\s*(.+)$/im), 32);
  const productVersion = safeText(capture(text, /^ProductVersion:\s*(.+)$/im), 32);
  const buildVersion = safeText(capture(text, /^BuildVersion:\s*(.+)$/im), 32);
  if (!productName || !productVersion || !buildVersion) {
    return null;
  }
  return {productName, productVersion, buildVersion};
}

export function parseHardwareSysctl(value) {
  const rows = parseColonKeyValues(value);
  const model = safeText(rows.get("hw.model"), 64);
  const cpuModel = safeText(rows.get("machdep.cpu.brand_string"), 96);
  const memoryBytes = finiteInteger(rows.get("hw.memsize"));
  const physicalCores = finiteInteger(rows.get("hw.physicalcpu"));
  const logicalCores = finiteInteger(rows.get("hw.logicalcpu"));
  if (!model || !cpuModel || memoryBytes <= 0 || physicalCores <= 0 || logicalCores <= 0) {
    return null;
  }
  return {model, cpuModel, memoryBytes, physicalCores, logicalCores};
}

export function parseVmStat(value) {
  const text = String(value || "");
  const pageSizeBytes = finiteInteger(capture(text, /page size of\s+([0-9,]+)\s+bytes/i));
  const rows = new Map();
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^\s*"?([^":]+)"?\s*:\s*([0-9][0-9,.]*)\.?\s*$/);
    if (!match) {
      continue;
    }
    rows.set(normalizeVmLabel(match[1]), finiteInteger(match[2]));
  }
  const parsed = {
    pageSizeBytes,
    pagesFree: rows.get("pages_free"),
    pagesActive: rows.get("pages_active"),
    pagesInactive: rows.get("pages_inactive"),
    pagesSpeculative: rows.get("pages_speculative"),
    pagesThrottled: rows.get("pages_throttled"),
    pagesWired: rows.get("pages_wired_down"),
    pagesPurgeable: rows.get("pages_purgeable"),
    pagesStoredInCompressor: rows.get("pages_stored_in_compressor"),
    pagesOccupiedByCompressor: rows.get("pages_occupied_by_compressor"),
    decompressions: rows.get("decompressions"),
    compressions: rows.get("compressions"),
    pageins: rows.get("pageins"),
    pageouts: rows.get("pageouts"),
    swapins: rows.get("swapins"),
    swapouts: rows.get("swapouts"),
  };
  if (parsed.pageSizeBytes <= 0 || !Number.isFinite(parsed.pageouts) || !Number.isFinite(parsed.swapouts)) {
    return null;
  }
  return nullSafeNumericObject(parsed);
}

export function parseMemoryPressure(value) {
  const text = String(value || "");
  const memoryBytes = finiteInteger(capture(text, /system has\s+([0-9,]+)\s*\(/i));
  const pageCount = finiteInteger(capture(text, /\(([0-9,]+)\s+pages/i));
  const pageSizeBytes = finiteInteger(capture(text, /page size of\s+([0-9,]+)/i));
  const freePercent = finiteNumber(capture(text, /memory free percentage:\s*([0-9]+(?:\.[0-9]+)?)%/i));
  if (memoryBytes <= 0 || pageCount <= 0 || pageSizeBytes <= 0 || !Number.isFinite(freePercent)) {
    return null;
  }
  return {memoryBytes, pageCount, pageSizeBytes, freePercent: round(freePercent)};
}

export function parseSwapUsage(value) {
  const text = String(value || "");
  const match = text.match(/total\s*=\s*([0-9.]+)([KMG])\s+used\s*=\s*([0-9.]+)([KMG])\s+free\s*=\s*([0-9.]+)([KMG])/i);
  if (!match) {
    return null;
  }
  const totalBytes = binaryUnitBytes(match[1], match[2]);
  const usedBytes = binaryUnitBytes(match[3], match[4]);
  const freeBytes = binaryUnitBytes(match[5], match[6]);
  if (![totalBytes, usedBytes, freeBytes].every(Number.isFinite) || totalBytes <= 0) {
    return null;
  }
  return {
    totalBytes: Math.round(totalBytes),
    usedBytes: Math.round(usedBytes),
    freeBytes: Math.round(freeBytes),
    usedRatio: round(usedBytes / totalBytes, 6),
    encrypted: /\(encrypted\)/i.test(text),
  };
}

export function parsePmsetBattery(value) {
  const text = String(value || "");
  const sourceText = safeText(capture(text, /Now drawing from\s+'([^']+)'/i), 32).toLowerCase();
  const source = sourceText.includes("ac")
    ? "ac"
    : (sourceText.includes("battery") ? "battery" : (sourceText.includes("ups") ? "ups" : "unknown"));
  const batteryPercent = finiteInteger(capture(text, /\b([0-9]{1,3})%;/));
  const hasBatteryRow = /-InternalBattery-/i.test(text) || Number.isFinite(batteryPercent);
  if (source === "unknown" && !hasBatteryRow) {
    return null;
  }
  const acAttached = /\bAC attached\b/i.test(text)
    ? true
    : (source === "battery" ? false : null);
  const charging = /;\s*charging\b/i.test(text)
    ? true
    : (/;\s*not charging\b/i.test(text) ? false : null);
  return {
    source,
    batteryPercent: Number.isFinite(batteryPercent) ? clamp(batteryPercent, 0, 100) : null,
    acAttached,
    charging,
  };
}

export function parsePmsetTherm(value) {
  const text = String(value || "");
  if (!text.trim()) {
    return null;
  }
  const schedulerLimitPct = pmsetNumericValue(text, "CPU_Scheduler_Limit");
  const availableCpus = pmsetNumericValue(text, "CPU_Available_CPUs");
  const speedLimitPct = pmsetNumericValue(text, "CPU_Speed_Limit");
  const thermalWarningLevel = pmsetStatusValue(text, "thermal warning level");
  const performanceWarningLevel = pmsetStatusValue(text, "performance warning level");
  const cpuPowerStatus = pmsetStatusValue(text, "CPU power status");
  const noThermalWarning = /No thermal warning level has been recorded/i.test(text);
  const noPerformanceWarning = /No performance warning level has been recorded/i.test(text);
  const noCpuPowerStatus = /No CPU power status has been recorded/i.test(text);
  const hasKnownText = noThermalWarning
    || noPerformanceWarning
    || noCpuPowerStatus
    || [
      schedulerLimitPct,
      availableCpus,
      speedLimitPct,
      thermalWarningLevel,
      performanceWarningLevel,
      cpuPowerStatus,
    ].some(Number.isFinite);
  if (!hasKnownText) {
    return null;
  }
  const throttled = (Number.isFinite(schedulerLimitPct) && schedulerLimitPct < 100)
    || (Number.isFinite(speedLimitPct) && speedLimitPct < 100);
  return {
    thermalWarningRecorded: noThermalWarning ? false : (Number.isFinite(thermalWarningLevel) ? thermalWarningLevel > 0 : null),
    performanceWarningRecorded: noPerformanceWarning
      ? false
      : (Number.isFinite(performanceWarningLevel) ? performanceWarningLevel > 0 : null),
    cpuPowerStatusRecorded: noCpuPowerStatus ? false : Number.isFinite(cpuPowerStatus),
    thermalWarningLevel: finiteOrNull(thermalWarningLevel),
    performanceWarningLevel: finiteOrNull(performanceWarningLevel),
    cpuPowerStatus: finiteOrNull(cpuPowerStatus),
    schedulerLimitPct: finiteOrNull(schedulerLimitPct),
    availableCpus: finiteOrNull(availableCpus),
    speedLimitPct: finiteOrNull(speedLimitPct),
    throttled,
  };
}

export function parsePmsetCustom(value) {
  const text = String(value || "");
  let section = "";
  const result = {battery: {lowPowerMode: null}, ac: {lowPowerMode: null}};
  for (const line of text.split(/\r?\n/)) {
    if (/^Battery Power:/i.test(line.trim())) {
      section = "battery";
      continue;
    }
    if (/^AC Power:/i.test(line.trim())) {
      section = "ac";
      continue;
    }
    const match = line.match(/^\s*lowpowermode\s+([01])\s*$/i);
    if (match && section) {
      result[section].lowPowerMode = Number(match[1]);
    }
  }
  if (result.battery.lowPowerMode === null && result.ac.lowPowerMode === null) {
    return null;
  }
  return result;
}

export function cpuTimesSnapshot(cpusValue = os.cpus()) {
  if (!Array.isArray(cpusValue) || cpusValue.length === 0) {
    return null;
  }
  const rows = [];
  for (const cpu of cpusValue) {
    const times = cpu && cpu.times;
    const row = {
      user: finiteNumber(times && times.user),
      nice: finiteNumber(times && times.nice),
      sys: finiteNumber(times && times.sys),
      idle: finiteNumber(times && times.idle),
      irq: finiteNumber(times && times.irq),
    };
    if (!Object.values(row).every(Number.isFinite)) {
      return null;
    }
    rows.push(row);
  }
  return rows;
}

export function cpuUsageBetween(startValue, endValue) {
  if (!Array.isArray(startValue) || !Array.isArray(endValue) || startValue.length !== endValue.length || startValue.length === 0) {
    return null;
  }
  let user = 0;
  let nice = 0;
  let sys = 0;
  let idle = 0;
  let irq = 0;
  for (let index = 0; index < startValue.length; index += 1) {
    for (const field of ["user", "nice", "sys", "idle", "irq"]) {
      const delta = Number(endValue[index] && endValue[index][field]) - Number(startValue[index] && startValue[index][field]);
      if (!Number.isFinite(delta) || delta < 0) {
        return null;
      }
      if (field === "user") user += delta;
      else if (field === "nice") nice += delta;
      else if (field === "sys") sys += delta;
      else if (field === "idle") idle += delta;
      else irq += delta;
    }
  }
  const total = user + nice + sys + idle + irq;
  if (total <= 0) {
    return null;
  }
  const busy = total - idle;
  return {
    logicalCores: startValue.length,
    busyPct: round(busy / total * 100),
    userPct: round((user + nice) / total * 100),
    systemPct: round((sys + irq) / total * 100),
    idlePct: round(idle / total * 100),
  };
}

export function processCpuPercentBetween(startValue, endValue, durationMs) {
  const elapsed = Number(durationMs);
  const user = Number(endValue && endValue.user) - Number(startValue && startValue.user);
  const system = Number(endValue && endValue.system) - Number(startValue && startValue.system);
  if (![elapsed, user, system].every(Number.isFinite) || elapsed <= 0 || user < 0 || system < 0) {
    return null;
  }
  return round(((user + system) / 1000) / elapsed * 100);
}

export function summarizeCpuSamples(rowsValue, thresholds = DEFAULT_HOST_ENVIRONMENT_THRESHOLDS) {
  const rows = Array.isArray(rowsValue) ? rowsValue : [];
  const busy = rows.map((row) => Number(row && row.hostBusyPct)).filter(Number.isFinite);
  const gaps = rows.map((row) => Number(row && row.sampleGapMs)).filter(Number.isFinite);
  const external = rows.map((row) => Number(row && row.externalBusyApproxPct)).filter(Number.isFinite);
  const burstThreshold = Number(thresholds.preflightCpuBurstPct);
  return {
    sampleCount: rows.length,
    validSampleCount: busy.length,
    hostBusyP50Pct: percentile(busy, 0.5),
    hostBusyP95Pct: percentile(busy, 0.95),
    hostBusyMaxPct: busy.length > 0 ? round(Math.max(...busy)) : null,
    maxSampleGapMs: gaps.length > 0 ? round(Math.max(...gaps)) : null,
    samplesAboveBurstThreshold: busy.filter((value) => value > burstThreshold).length,
    maxConsecutiveAboveBurstThreshold: maxConsecutive(rows, (row) => Number(row && row.hostBusyPct) > burstThreshold),
    externalBusySampleCount: external.length,
    externalBusyP50Pct: percentile(external, 0.5),
    externalBusyP95Pct: percentile(external, 0.95),
    externalBusyMaxPct: external.length > 0 ? round(Math.max(...external)) : null,
    maxConsecutiveExternalAboveBurstThreshold: maxConsecutive(
      rows,
      (row) => Number(row && row.externalBusyApproxPct) > Number(thresholds.runtimeExternalBurstInvalidPct),
    ),
  };
}

export function vmStatDelta(startValue, endValue, durationMs) {
  const start = startValue && typeof startValue === "object" ? startValue : null;
  const end = endValue && typeof endValue === "object" ? endValue : null;
  const elapsedSeconds = Number(durationMs) / 1000;
  if (!start || !end || !Number.isFinite(elapsedSeconds) || elapsedSeconds <= 0) {
    return null;
  }
  const pageSizeBytes = Number(end.pageSizeBytes || start.pageSizeBytes);
  if (!Number.isFinite(pageSizeBytes) || pageSizeBytes <= 0) {
    return null;
  }
  const result = {durationMs: round(Number(durationMs)), pageSizeBytes};
  for (const field of ["decompressions", "compressions", "pageins", "pageouts", "swapins", "swapouts"]) {
    const deltaPages = Number(end[field]) - Number(start[field]);
    if (!Number.isFinite(deltaPages) || deltaPages < 0) {
      result[`${field}Pages`] = null;
      result[`${field}MiBPerSecond`] = null;
      continue;
    }
    result[`${field}Pages`] = Math.round(deltaPages);
    result[`${field}MiBPerSecond`] = round(deltaPages * pageSizeBytes / MIB / elapsedSeconds);
  }
  const throttledDeltaPages = Number(end.pagesThrottled) - Number(start.pagesThrottled);
  result.pagesThrottledDeltaPages = Number.isFinite(throttledDeltaPages) && throttledDeltaPages >= 0
    ? Math.round(throttledDeltaPages)
    : null;
  result.pagesThrottledMiBPerSecond = Number.isFinite(throttledDeltaPages) && throttledDeltaPages >= 0
    ? round(throttledDeltaPages * pageSizeBytes / MIB / elapsedSeconds)
    : null;
  // Context only: this is a boot-lifetime counter, not proof that the current
  // preflight or workload was throttled.
  result.pagesThrottledMax = finiteMax(start.pagesThrottled, end.pagesThrottled);
  return result;
}

export function classifyMacosHostPreflight(value, thresholds = DEFAULT_HOST_ENVIRONMENT_THRESHOLDS) {
  const preflight = value && typeof value === "object" ? value : {};
  const invalidReasons = [];
  const warnings = [];
  if (preflight.supported === false) {
    return classification("unsupported", ["host_evidence_unsupported"], []);
  }
  if (preflight.evidenceComplete !== true) {
    invalidReasons.push("host_evidence_incomplete");
  }
  const cpu = preflight.cpu || {};
  if (Number(cpu.validSampleCount || 0) < Number(preflight.expectedCpuSamples || 0) * Number(thresholds.minimumEvidenceCoverageRatio)) {
    invalidReasons.push("preflight_cpu_coverage_low");
  }
  if (Number(cpu.hostBusyP50Pct) > Number(thresholds.preflightCpuInvalidPct)) {
    invalidReasons.push("preflight_cpu_sustained_busy");
  } else if (Number(cpu.hostBusyP50Pct) > Number(thresholds.preflightCpuWarningPct)) {
    warnings.push("preflight_cpu_background_load");
  }
  if (Number(cpu.maxConsecutiveAboveBurstThreshold || 0) >= Number(thresholds.preflightCpuBurstSamples)) {
    invalidReasons.push("preflight_cpu_burst_sustained");
  }
  const pressureMin = finiteMin(
    preflight.start && preflight.start.memoryPressure && preflight.start.memoryPressure.freePercent,
    preflight.end && preflight.end.memoryPressure && preflight.end.memoryPressure.freePercent,
  );
  if (Number.isFinite(pressureMin) && pressureMin < Number(thresholds.memoryPressureInvalidPct)) {
    invalidReasons.push("preflight_memory_pressure_critical");
  } else if (Number.isFinite(pressureMin) && pressureMin < Number(thresholds.memoryPressureWarningPct)) {
    warnings.push("preflight_memory_pressure_low");
  }
  const pagingRate = finiteMax(
    preflight.vmDelta && preflight.vmDelta.pageoutsMiBPerSecond,
    preflight.vmDelta && preflight.vmDelta.swapoutsMiBPerSecond,
  );
  if (Number.isFinite(pagingRate) && pagingRate >= Number(thresholds.pagingInvalidMiBPerSecond)) {
    invalidReasons.push("preflight_active_paging_high");
  } else if (Number.isFinite(pagingRate) && pagingRate >= Number(thresholds.pagingWarningMiBPerSecond)) {
    warnings.push("preflight_active_paging");
  }
  if (Number(preflight.vmDelta && preflight.vmDelta.pagesThrottledDeltaPages || 0) > 0) {
    invalidReasons.push("preflight_pages_throttled");
  }
  const swapRatio = finiteMax(
    preflight.start && preflight.start.swapUsage && preflight.start.swapUsage.usedRatio,
    preflight.end && preflight.end.swapUsage && preflight.end.swapUsage.usedRatio,
  );
  if (Number.isFinite(swapRatio) && swapRatio >= Number(thresholds.staticSwapWarningRatio)) {
    warnings.push("preflight_static_swap_high");
  }
  for (const snapshot of [preflight.start, preflight.end]) {
    if (!snapshot) continue;
    if (selectedLowPowerMode(snapshot) === 1) {
      invalidReasons.push("preflight_low_power_mode");
    }
    if (thermalIsCurrentlyLimited(snapshot.thermal, preflight.hardware)) {
      invalidReasons.push("preflight_thermal_or_performance_limit");
    } else if (thermalHistoryRecorded(snapshot.thermal)) {
      warnings.push("preflight_thermal_or_performance_history");
    }
    const battery = snapshot.battery || {};
    if (battery.source === "battery" && battery.acAttached !== true) {
      if (Number(battery.batteryPercent) <= Number(thresholds.lowBatteryInvalidPct)) {
        invalidReasons.push("preflight_battery_critical");
      } else {
        warnings.push("preflight_on_battery");
      }
    }
  }
  return classificationFromReasons(invalidReasons, warnings);
}

export function classifyMacosRuntimeEnvironment(value, thresholds = DEFAULT_HOST_ENVIRONMENT_THRESHOLDS) {
  const runtime = value && typeof value === "object" ? value : {};
  const invalidReasons = [];
  const warnings = [];
  if (runtime.supported === false) {
    return classification("unsupported", ["host_evidence_unsupported"], []);
  }
  if (runtime.evidenceComplete !== true) {
    invalidReasons.push("runtime_host_evidence_incomplete");
  }
  const cpu = runtime.cpu || {};
  if (Number(cpu.externalBusySampleCount || 0) > 0) {
    if (Number(cpu.externalBusyP50Pct) > Number(thresholds.runtimeExternalBusyInvalidPct)) {
      invalidReasons.push("runtime_external_cpu_sustained");
    }
    const requiredSamples = Math.ceil(Number(thresholds.runtimeExternalBurstSeconds) * 1000 / Math.max(1, Number(runtime.cpuSampleIntervalMs || 1000)));
    if (Number(cpu.maxConsecutiveExternalAboveBurstThreshold || 0) >= requiredSamples) {
      invalidReasons.push("runtime_external_cpu_burst_sustained");
    }
  } else if (Number(cpu.hostBusyP95Pct) > Number(thresholds.runtimeExternalBurstInvalidPct)) {
    warnings.push("runtime_host_cpu_busy_requires_attribution");
  }
  const vm = runtime.vm || {};
  if (Number(vm.pagesThrottledDeltaPages || 0) > 0) {
    invalidReasons.push("runtime_pages_throttled");
  }
  const pagingPeak = finiteMax(vm.pageoutPeakMiBPerSecond, vm.swapoutPeakMiBPerSecond);
  if (Number.isFinite(pagingPeak) && pagingPeak >= Number(thresholds.runtimePagingSpikeInvalidMiBPerSecond)) {
    invalidReasons.push("runtime_paging_spike");
  }
  if (Number(vm.consecutivePagingAboveSustainedThreshold || 0) >= Number(thresholds.runtimePagingSustainedSamples)) {
    invalidReasons.push("runtime_paging_sustained");
  }
  const pressureMin = runtime.memoryPressure && runtime.memoryPressure.minimumFreePercent;
  if (Number.isFinite(Number(pressureMin)) && Number(pressureMin) < Number(thresholds.memoryPressureInvalidPct)) {
    invalidReasons.push("runtime_memory_pressure_critical");
  } else if (Number.isFinite(Number(pressureMin)) && Number(pressureMin) < Number(thresholds.memoryPressureWarningPct)) {
    warnings.push("runtime_memory_pressure_low");
  }
  for (const snapshot of [runtime.start, runtime.end]) {
    if (!snapshot) continue;
    if (selectedLowPowerMode(snapshot) === 1) {
      invalidReasons.push("runtime_low_power_mode");
    }
    if (thermalIsCurrentlyLimited(snapshot.thermal, runtime.hardware)) {
      invalidReasons.push("runtime_thermal_or_performance_limit");
    } else if (thermalHistoryRecorded(snapshot.thermal)) {
      warnings.push("runtime_thermal_or_performance_history");
    }
  }
  return classificationFromReasons(invalidReasons, warnings);
}

export function classifyMacosHostEvidence(value, thresholds = DEFAULT_HOST_ENVIRONMENT_THRESHOLDS) {
  const evidence = value && typeof value === "object" ? value : {};
  if (evidence.supported === false) {
    return classification("unsupported", ["host_evidence_unsupported"], []);
  }
  const parts = [];
  if (evidence.preflight) {
    parts.push(classifyMacosHostPreflight(evidence.preflight, thresholds));
  }
  if (evidence.runtime) {
    parts.push(classifyMacosRuntimeEnvironment(evidence.runtime, thresholds));
  }
  if (parts.length === 0) {
    return classification("invalid", ["host_evidence_missing"], []);
  }
  return classificationFromReasons(
    parts.flatMap((entry) => entry.invalidReasons || []),
    parts.flatMap((entry) => entry.warnings || []),
  );
}

export class MacosHostEvidenceCollector {
  constructor(options = {}) {
    this.platform = String(options.platform || process.platform);
    this.arch = String(options.arch || process.arch);
    this.supported = this.platform === "darwin";
    this.commandTimeoutMs = positiveInteger(options.commandTimeoutMs, DEFAULT_COMMAND_TIMEOUT_MS);
    this.commandMaxBufferBytes = positiveInteger(options.commandMaxBufferBytes, DEFAULT_COMMAND_MAX_BUFFER_BYTES);
    this.cpuSampleIntervalMs = Math.max(100, positiveInteger(options.cpuSampleIntervalMs, DEFAULT_CPU_SAMPLE_INTERVAL_MS));
    this.vmSampleIntervalMs = normalizedSlowInterval(options.vmSampleIntervalMs, DEFAULT_VM_SAMPLE_INTERVAL_MS, 30_000);
    this.pressureSampleIntervalMs = normalizedSlowInterval(
      options.pressureSampleIntervalMs,
      DEFAULT_PRESSURE_SAMPLE_INTERVAL_MS,
      60_000,
    );
    this.thresholds = Object.freeze({...DEFAULT_HOST_ENVIRONMENT_THRESHOLDS, ...(options.thresholds || {})});
    this.execRunner = typeof options.execRunner === "function" ? options.execRunner : defaultExecRunner;
    this.cpuProvider = typeof options.cpuProvider === "function" ? options.cpuProvider : os.cpus.bind(os);
    this.processCpuProvider = typeof options.processCpuProvider === "function" ? options.processCpuProvider : process.cpuUsage.bind(process);
    this.loadAverageProvider = typeof options.loadAverageProvider === "function" ? options.loadAverageProvider : os.loadavg.bind(os);
    this.wallNow = typeof options.wallNow === "function" ? options.wallNow : Date.now;
    this.monotonicNow = typeof options.monotonicNow === "function" ? options.monotonicNow : performance.now.bind(performance);
    this.sleep = typeof options.sleep === "function" ? options.sleep : delay;
    this.state = "idle";
    this.preflightResult = null;
    this.hardware = null;
    this.osVersion = null;
    this.runtimeStartSnapshot = null;
    this.runtimeEndSnapshot = null;
    this.runtimeStartedAt = null;
    this.runtimeFinishedAt = null;
    this.runtimeStartedMono = null;
    this.runtimeFinishedMono = null;
    this.previousCpuSnapshot = null;
    this.previousProcessCpu = null;
    this.previousCpuAt = null;
    this.cpuSamples = [];
    this.vmSamples = [];
    this.pressureSamples = [];
    this.latestWorkloadSample = null;
    this.cpuTimer = null;
    this.vmTimer = null;
    this.pressureTimer = null;
    this.inflight = new Set();
    this.periodicBusy = new Set();
    this.collectorStats = {
      probeAttempts: 0,
      probeSucceeded: 0,
      probeFailed: 0,
      probeTimedOut: 0,
      probeParseFailed: 0,
      periodicSkipped: 0,
      maxProbeDurationMs: 0,
      maxCpuSampleDurationMs: 0,
      errors: [],
    };
  }

  async preflight(options = {}) {
    if (this.state === "running" || this.state === "stopping") {
      throw new Error("macOS host preflight cannot run while collection is active");
    }
    const durationMs = Math.max(1, positiveInteger(options.durationMs, DEFAULT_PREFLIGHT_DURATION_MS));
    const sampleIntervalMs = Math.max(1, positiveInteger(options.sampleIntervalMs, DEFAULT_PREFLIGHT_SAMPLE_INTERVAL_MS));
    const expectedCpuSamples = Math.max(1, Math.ceil(durationMs / sampleIntervalMs));
    const startedAt = new Date(this.wallNow()).toISOString();
    if (!this.supported) {
      const unsupported = {
        supported: false,
        startedAt,
        finishedAt: new Date(this.wallNow()).toISOString(),
        requestedDurationMs: durationMs,
        actualDurationMs: 0,
        expectedCpuSamples,
        hardware: null,
        osVersion: null,
        start: null,
        end: null,
        cpu: summarizeCpuSamples([], this.thresholds),
        vmDelta: null,
        evidenceComplete: false,
      };
      unsupported.classification = classifyMacosHostPreflight(unsupported, this.thresholds);
      this.preflightResult = unsupported;
      return this.preflightResult;
    }
    const start = await this._captureSnapshot({includeStatic: true, includeDynamic: true});
    this.hardware ||= start.hardware;
    this.osVersion ||= start.osVersion;
    const cpuRows = [];
    let previousCpu = cpuTimesSnapshot(this.cpuProvider());
    let previousAt = this.monotonicNow();
    const measurementStartedAt = previousAt;
    for (let index = 0; index < expectedCpuSamples; index += 1) {
      const targetAt = measurementStartedAt + Math.min(durationMs, (index + 1) * sampleIntervalMs);
      await this.sleep(Math.max(0, targetAt - this.monotonicNow()));
      const sampleStartedAt = this.monotonicNow();
      const currentCpu = cpuTimesSnapshot(this.cpuProvider());
      const sampledAt = this.monotonicNow();
      const usage = cpuUsageBetween(previousCpu, currentCpu);
      if (usage) {
        cpuRows.push({
          elapsedMs: round(sampledAt - measurementStartedAt),
          sampleGapMs: round(sampledAt - previousAt),
          hostBusyPct: usage.busyPct,
          hostUserPct: usage.userPct,
          hostSystemPct: usage.systemPct,
          load1PerCore: normalizedLoadPerCore(this.loadAverageProvider(), usage.logicalCores),
          sampleDurationMs: round(sampledAt - sampleStartedAt),
        });
      }
      previousCpu = currentCpu;
      previousAt = sampledAt;
    }
    const measurementFinishedAt = this.monotonicNow();
    const end = await this._captureSnapshot({includeStatic: false, includeDynamic: true});
    const result = {
      supported: true,
      startedAt,
      finishedAt: new Date(this.wallNow()).toISOString(),
      requestedDurationMs: durationMs,
      actualDurationMs: round(measurementFinishedAt - measurementStartedAt),
      expectedCpuSamples,
      hardware: this.hardware,
      osVersion: this.osVersion,
      start: dynamicSnapshot(start),
      end: dynamicSnapshot(end),
      cpu: summarizeCpuSamples(cpuRows, this.thresholds),
      vmDelta: vmStatDelta(start.vmStat, end.vmStat, measurementFinishedAt - measurementStartedAt),
      evidenceComplete: snapshotComplete(start, true) && snapshotComplete(end, false),
    };
    result.classification = classifyMacosHostPreflight(result, this.thresholds);
    this.preflightResult = result;
    return result;
  }

  async start() {
    if (this.state !== "idle") {
      throw new Error(`macOS host evidence collector cannot start from ${this.state}`);
    }
    if (!this.supported) {
      this.state = "running";
      this.runtimeStartedAt = new Date(this.wallNow()).toISOString();
      this.runtimeStartedMono = this.monotonicNow();
      return this.report();
    }
    const snapshot = await this._captureSnapshot({includeStatic: true, includeDynamic: true});
    this.hardware = snapshot.hardware;
    this.osVersion = snapshot.osVersion;
    this.runtimeStartSnapshot = dynamicSnapshot(snapshot);
    this.vmSamples.push(runtimeSample(0, snapshot.vmStat));
    this.pressureSamples.push(runtimePressureSample(0, snapshot.memoryPressure, snapshot.swapUsage));
    this.runtimeStartedAt = new Date(this.wallNow()).toISOString();
    this.runtimeStartedMono = this.monotonicNow();
    this.previousCpuSnapshot = cpuTimesSnapshot(this.cpuProvider());
    this.previousProcessCpu = this.processCpuProvider();
    this.previousCpuAt = this.runtimeStartedMono;
    this.state = "running";
    this.cpuTimer = setInterval(() => this._sampleRuntimeCpu(), this.cpuSampleIntervalMs);
    this.cpuTimer.unref?.();
    if (this.vmSampleIntervalMs > 0) {
      this.vmTimer = setInterval(() => this._schedulePeriodic("vmStat"), this.vmSampleIntervalMs);
      this.vmTimer.unref?.();
    }
    if (this.pressureSampleIntervalMs > 0) {
      this.pressureTimer = setInterval(() => this._schedulePeriodic("pressure"), this.pressureSampleIntervalMs);
      this.pressureTimer.unref?.();
    }
    return this.report();
  }

  recordWorkloadSample(value = {}) {
    const serverCpuPercentOneCore = finiteOrNull(Number(value.serverCpuPercentOneCore));
    const atElapsedMs = finiteOrNull(Number(value.elapsedMs));
    if (serverCpuPercentOneCore === null) {
      this.latestWorkloadSample = null;
      return;
    }
    this.latestWorkloadSample = {
      serverCpuPercentOneCore: Math.max(0, serverCpuPercentOneCore),
      elapsedMs: atElapsedMs,
      recordedAtMono: this.monotonicNow(),
    };
  }

  latestCpuSample() {
    const row = this.cpuSamples.at(-1);
    return row ? {...row} : null;
  }

  async stop() {
    if (this.state === "stopped") {
      return this.report();
    }
    if (this.state !== "running") {
      throw new Error(`macOS host evidence collector cannot stop from ${this.state}`);
    }
    this.state = "stopping";
    clearInterval(this.cpuTimer);
    clearInterval(this.vmTimer);
    clearInterval(this.pressureTimer);
    this.cpuTimer = null;
    this.vmTimer = null;
    this.pressureTimer = null;
    this._sampleRuntimeCpu();
    await Promise.allSettled([...this.inflight]);
    this.runtimeFinishedMono = this.monotonicNow();
    this.runtimeFinishedAt = new Date(this.wallNow()).toISOString();
    if (this.supported) {
      const snapshot = await this._captureSnapshot({includeStatic: false, includeDynamic: true});
      this.runtimeEndSnapshot = dynamicSnapshot(snapshot);
      const elapsedMs = Math.max(0, this.runtimeFinishedMono - this.runtimeStartedMono);
      this.vmSamples.push(runtimeSample(elapsedMs, snapshot.vmStat));
      this.pressureSamples.push(runtimePressureSample(elapsedMs, snapshot.memoryPressure, snapshot.swapUsage));
    }
    this.state = "stopped";
    return this.report();
  }

  report() {
    const runtime = this._runtimeReport();
    const report = {
      schemaVersion: MACOS_HOST_EVIDENCE_SCHEMA_VERSION,
      supported: this.supported,
      platform: this.platform,
      arch: this.arch,
      state: this.state,
      osVersion: this.osVersion,
      hardware: this.hardware,
      preflight: this.preflightResult,
      runtime,
      collector: this._collectorReport(),
    };
    report.classification = classifyMacosHostEvidence(report, this.thresholds);
    return report;
  }

  _sampleRuntimeCpu() {
    if (this.state !== "running" && this.state !== "stopping") {
      return;
    }
    const sampleStartedAt = this.monotonicNow();
    if (
      this.state === "stopping"
      && this.previousCpuAt !== null
      && sampleStartedAt - this.previousCpuAt < this.cpuSampleIntervalMs * 0.5
    ) {
      return;
    }
    const cpuSnapshot = cpuTimesSnapshot(this.cpuProvider());
    const processCpuSnapshot = this.processCpuProvider();
    const sampledAt = this.monotonicNow();
    const usage = cpuUsageBetween(this.previousCpuSnapshot, cpuSnapshot);
    const gapMs = sampledAt - Number(this.previousCpuAt || sampledAt);
    const driverCpuPercentOneCore = processCpuPercentBetween(this.previousProcessCpu, processCpuSnapshot, gapMs);
    if (usage && this.runtimeStartedMono !== null) {
      const elapsedMs = Math.max(0, sampledAt - this.runtimeStartedMono);
      const workloadFresh = this.latestWorkloadSample
        && sampledAt - Number(this.latestWorkloadSample.recordedAtMono) <= Math.max(2_000, this.cpuSampleIntervalMs * 2.5);
      const serverCpuPercentOneCore = workloadFresh ? this.latestWorkloadSample.serverCpuPercentOneCore : null;
      const externalBusyApproxPct = Number.isFinite(serverCpuPercentOneCore)
        ? round(Math.max(
          0,
          usage.busyPct
            - (serverCpuPercentOneCore + Number(driverCpuPercentOneCore || 0)) / Math.max(1, usage.logicalCores)
            - Number(this.thresholds.kernelAndLoopbackCpuAllowancePct),
        ))
        : null;
      boundedPush(this.cpuSamples, {
        elapsedMs: round(elapsedMs),
        sampleGapMs: round(gapMs),
        hostBusyPct: usage.busyPct,
        hostUserPct: usage.userPct,
        hostSystemPct: usage.systemPct,
        driverCpuPercentOneCore,
        serverCpuPercentOneCore,
        externalBusyApproxPct,
        load1PerCore: normalizedLoadPerCore(this.loadAverageProvider(), usage.logicalCores),
        sampleDurationMs: round(sampledAt - sampleStartedAt),
      }, MAX_CPU_SAMPLES);
      this.collectorStats.maxCpuSampleDurationMs = Math.max(
        this.collectorStats.maxCpuSampleDurationMs,
        sampledAt - sampleStartedAt,
      );
    }
    this.previousCpuSnapshot = cpuSnapshot;
    this.previousProcessCpu = processCpuSnapshot;
    this.previousCpuAt = sampledAt;
  }

  _schedulePeriodic(kind) {
    if (this.state !== "running" || this.periodicBusy.has(kind)) {
      if (this.periodicBusy.has(kind)) {
        this.collectorStats.periodicSkipped += 1;
      }
      return;
    }
    this.periodicBusy.add(kind);
    const promise = (kind === "vmStat" ? this._capturePeriodicVm() : this._capturePeriodicPressure())
      .finally(() => {
        this.periodicBusy.delete(kind);
        this.inflight.delete(promise);
      });
    this.inflight.add(promise);
  }

  async _capturePeriodicVm() {
    const result = await this._runProbe("vmStat");
    if (result.data && this.runtimeStartedMono !== null) {
      boundedPush(this.vmSamples, runtimeSample(this.monotonicNow() - this.runtimeStartedMono, result.data), MAX_SLOW_SAMPLES);
    }
  }

  async _capturePeriodicPressure() {
    const [pressure, swap] = await Promise.all([
      this._runProbe("memoryPressure"),
      this._runProbe("swapUsage"),
    ]);
    if (this.runtimeStartedMono !== null) {
      boundedPush(
        this.pressureSamples,
        runtimePressureSample(this.monotonicNow() - this.runtimeStartedMono, pressure.data, swap.data),
        MAX_SLOW_SAMPLES,
      );
    }
  }

  async _captureSnapshot(options = {}) {
    if (!this.supported) {
      return {capturedAt: new Date(this.wallNow()).toISOString(), probeStatus: {}};
    }
    const names = [
      ...(options.includeStatic === true ? STATIC_PROBES : []),
      ...(options.includeDynamic === true ? DYNAMIC_PROBES : []),
    ];
    const results = await Promise.all(names.map(async (name) => [name, await this._runProbe(name)]));
    const snapshot = {capturedAt: new Date(this.wallNow()).toISOString(), probeStatus: {}};
    for (const [name, result] of results) {
      snapshot[name] = result.data;
      snapshot.probeStatus[name] = result.status;
    }
    return snapshot;
  }

  async _runProbe(name) {
    const spec = PROBE_SPECS[name];
    if (!spec) {
      throw new Error(`unknown macOS host probe ${name}`);
    }
    this.collectorStats.probeAttempts += 1;
    const startedAt = this.monotonicNow();
    let execution;
    try {
      execution = await this.execRunner(spec.file, [...spec.args], {
        timeoutMs: this.commandTimeoutMs,
        maxBufferBytes: this.commandMaxBufferBytes,
      });
    } catch (error) {
      execution = {ok: false, code: sanitizedExecutionErrorCode(error)};
    }
    const durationMs = Math.max(0, this.monotonicNow() - startedAt);
    this.collectorStats.maxProbeDurationMs = Math.max(this.collectorStats.maxProbeDurationMs, durationMs);
    if (!execution || execution.ok !== true) {
      const code = safeProbeCode(execution && execution.code);
      this.collectorStats.probeFailed += 1;
      if (code === "TIMEOUT") this.collectorStats.probeTimedOut += 1;
      this._recordProbeError(name, code);
      return {data: null, status: {ok: false, code, durationMs: round(durationMs)}};
    }
    let data = null;
    try {
      data = spec.parse(String(execution.stdout || ""));
    } catch {
      data = null;
    }
    if (!data) {
      this.collectorStats.probeFailed += 1;
      this.collectorStats.probeParseFailed += 1;
      this._recordProbeError(name, "PARSE_FAILED");
      return {data: null, status: {ok: false, code: "PARSE_FAILED", durationMs: round(durationMs)}};
    }
    this.collectorStats.probeSucceeded += 1;
    return {data, status: {ok: true, code: "OK", durationMs: round(durationMs)}};
  }

  _recordProbeError(probe, code) {
    boundedPush(this.collectorStats.errors, {probe: safeProbeName(probe), code: safeProbeCode(code)}, MAX_PROBE_ERRORS);
  }

  _runtimeReport() {
    if (this.runtimeStartedMono === null) {
      return null;
    }
    const finishedMono = this.runtimeFinishedMono ?? this.monotonicNow();
    const durationMs = Math.max(0, finishedMono - this.runtimeStartedMono);
    const cpu = summarizeCpuSamples(this.cpuSamples, this.thresholds);
    const vm = summarizeRuntimeVm(this.vmSamples, this.thresholds);
    const memoryPressure = summarizeRuntimePressure(this.pressureSamples);
    const expectedCpuSamples = Math.floor(durationMs / this.cpuSampleIntervalMs);
    const evidenceComplete = this.supported
      && snapshotDynamicComplete(this.runtimeStartSnapshot)
      && (this.state !== "stopped" || snapshotDynamicComplete(this.runtimeEndSnapshot))
      && cpu.validSampleCount >= expectedCpuSamples * Number(this.thresholds.minimumEvidenceCoverageRatio);
    const report = {
      supported: this.supported,
      startedAt: this.runtimeStartedAt,
      finishedAt: this.runtimeFinishedAt,
      durationMs: round(durationMs),
      cpuSampleIntervalMs: this.cpuSampleIntervalMs,
      expectedCpuSamples,
      hardware: this.hardware,
      start: this.runtimeStartSnapshot,
      end: this.runtimeEndSnapshot,
      cpu,
      vm,
      memoryPressure,
      cpuTimeline: compactCpuTimeline(this.cpuSamples),
      cpuHotspots: cpuHotspots(this.cpuSamples),
      evidenceComplete,
    };
    report.classification = classifyMacosRuntimeEnvironment(report, this.thresholds);
    return report;
  }

  _collectorReport() {
    return {
      cpuSamplingApi: "node:os.cpus",
      cpuSampleIntervalMs: this.cpuSampleIntervalMs,
      vmProbeIntervalMs: this.vmSampleIntervalMs,
      pressureProbeIntervalMs: this.pressureSampleIntervalMs,
      commandTimeoutMs: this.commandTimeoutMs,
      commandMaxBufferBytes: this.commandMaxBufferBytes,
      perSecondProcessSpawn: false,
      usesSudo: false,
      probeAttempts: this.collectorStats.probeAttempts,
      probeSucceeded: this.collectorStats.probeSucceeded,
      probeFailed: this.collectorStats.probeFailed,
      probeTimedOut: this.collectorStats.probeTimedOut,
      probeParseFailed: this.collectorStats.probeParseFailed,
      periodicSkipped: this.collectorStats.periodicSkipped,
      maxProbeDurationMs: round(this.collectorStats.maxProbeDurationMs),
      maxCpuSampleDurationMs: round(this.collectorStats.maxCpuSampleDurationMs),
      errors: this.collectorStats.errors.map((entry) => ({...entry})),
    };
  }
}

export function createMacosHostEvidenceCollector(options = {}) {
  return new MacosHostEvidenceCollector(options);
}

export async function runMacosHostPreflight(options = {}) {
  const collector = createMacosHostEvidenceCollector(options);
  return collector.preflight({
    durationMs: options.durationMs ?? DEFAULT_PREFLIGHT_DURATION_MS,
    sampleIntervalMs: options.sampleIntervalMs ?? DEFAULT_PREFLIGHT_SAMPLE_INTERVAL_MS,
  });
}

export async function runMacosHostEvidenceSelfTest() {
  let assertions = 0;
  const check = (condition, message) => {
    assertions += 1;
    assert.ok(condition, message);
  };
  const equal = (actual, expected, message) => {
    assertions += 1;
    assert.deepEqual(actual, expected, message);
  };

  equal(parseSwVers("ProductName:\tmacOS\nProductVersion:\t26.5\nBuildVersion:\t25F71\n"), {
    productName: "macOS",
    productVersion: "26.5",
    buildVersion: "25F71",
  }, "sw_vers parser");
  equal(parseHardwareSysctl([
    "hw.model: Mac17,4",
    "hw.memsize: 17179869184",
    "hw.physicalcpu: 10",
    "hw.logicalcpu: 10",
    "machdep.cpu.brand_string: Apple M5",
  ].join("\n")), {
    model: "Mac17,4",
    cpuModel: "Apple M5",
    memoryBytes: 17179869184,
    physicalCores: 10,
    logicalCores: 10,
  }, "hardware parser");
  const vmStart = parseVmStat(vmFixture({pageouts: 100, swapouts: 50, throttled: 0}));
  const vmEnd = parseVmStat(vmFixture({pageouts: 1124, swapouts: 1074, throttled: 0}));
  check(vmStart && vmStart.pageSizeBytes === 16384, "vm_stat parser");
  equal(parseMemoryPressure("The system has 17179869184 (1048576 pages with a page size of 16384).\nSystem-wide memory free percentage: 44%\n"), {
    memoryBytes: 17179869184,
    pageCount: 1048576,
    pageSizeBytes: 16384,
    freePercent: 44,
  }, "memory pressure parser");
  const swap = parseSwapUsage("vm.swapusage: total = 9216.00M  used = 7843.19M  free = 1372.81M  (encrypted)");
  check(swap && swap.usedRatio > 0.85 && swap.encrypted === true, "swap parser");
  equal(parsePmsetBattery("Now drawing from 'AC Power'\n -InternalBattery-0\t80%; AC attached; not charging present: true\n"), {
    source: "ac",
    batteryPercent: 80,
    acAttached: true,
    charging: false,
  }, "battery parser");
  const thermal = parsePmsetTherm("Note: No thermal warning level has been recorded\nNote: No performance warning level has been recorded\nNote: No CPU power status has been recorded\n");
  check(thermal && thermal.throttled === false && thermal.thermalWarningRecorded === false, "thermal parser");
  equal(parsePmsetCustom("Battery Power:\n lowpowermode 1\nAC Power:\n lowpowermode 0\n"), {
    battery: {lowPowerMode: 1},
    ac: {lowPowerMode: 0},
  }, "power config parser");
  const cpuStart = cpuTimesSnapshot(cpuFixture(100, 900));
  const cpuEnd = cpuTimesSnapshot(cpuFixture(200, 1800));
  const cpu = cpuUsageBetween(cpuStart, cpuEnd);
  check(cpu && cpu.busyPct === 10 && cpu.logicalCores === 2, "CPU delta parser");
  check(processCpuPercentBetween({user: 0, system: 0}, {user: 50_000, system: 50_000}, 1000) === 10, "process CPU units");
  const vmDelta = vmStatDelta(vmStart, vmEnd, 1000);
  check(
    vmDelta
      && vmDelta.pageoutsMiBPerSecond === 16
      && vmDelta.swapoutsMiBPerSecond === 16
      && vmDelta.pagesThrottledDeltaPages === 0,
    "VM rates",
  );

  const cleanPreflight = preflightFixture();
  check(classifyMacosHostPreflight(cleanPreflight).status === "valid", "clean preflight classification");
  const staticSwapOnly = preflightFixture();
  staticSwapOnly.start.swapUsage.usedRatio = 0.9;
  staticSwapOnly.end.swapUsage.usedRatio = 0.9;
  const staticSwapClassification = classifyMacosHostPreflight(staticSwapOnly);
  check(staticSwapClassification.status === "warning" && staticSwapClassification.environmentValid, "static swap warns without invalidating");
  const lowPower = preflightFixture();
  lowPower.start.powerConfig.ac.lowPowerMode = 1;
  check(classifyMacosHostPreflight(lowPower).invalidReasons.includes("preflight_low_power_mode"), "low power invalidates");
  const busy = preflightFixture();
  busy.cpu.hostBusyP50Pct = 60;
  check(classifyMacosHostPreflight(busy).invalidReasons.includes("preflight_cpu_sustained_busy"), "sustained CPU invalidates");
  const missing = preflightFixture();
  missing.evidenceComplete = false;
  check(classifyMacosHostPreflight(missing).invalidReasons.includes("host_evidence_incomplete"), "missing evidence invalidates");
  const historicalThrottle = preflightFixture();
  historicalThrottle.start.vmStat.pagesThrottled = 7;
  historicalThrottle.end.vmStat.pagesThrottled = 7;
  historicalThrottle.vmDelta = vmStatDelta(
    historicalThrottle.start.vmStat,
    historicalThrottle.end.vmStat,
    10_000,
  );
  check(
    !classifyMacosHostPreflight(historicalThrottle).invalidReasons.includes("preflight_pages_throttled"),
    "historical throttling does not invalidate a recovered preflight",
  );
  const historicalThermal = preflightFixture();
  historicalThermal.start.thermal.thermalWarningRecorded = true;
  const historicalThermalClassification = classifyMacosHostPreflight(historicalThermal);
  check(
    historicalThermalClassification.environmentValid
      && historicalThermalClassification.warnings.includes("preflight_thermal_or_performance_history"),
    "historical thermal records warn without invalidating",
  );

  const unsupportedCollector = createMacosHostEvidenceCollector({platform: "linux"});
  const unsupported = await unsupportedCollector.preflight({durationMs: 1, sampleIntervalMs: 1});
  check(unsupported.supported === false && unsupported.classification.status === "unsupported", "non-macOS is explicit");

  const fakeRunner = createFakeProbeRunner();
  let cpuTick = 0;
  const collector = createMacosHostEvidenceCollector({
    platform: "darwin",
    execRunner: fakeRunner,
    cpuProvider: () => cpuFixture(100 + (++cpuTick * 10), 900 + (cpuTick * 90)),
    cpuSampleIntervalMs: 100,
    vmSampleIntervalMs: 0,
    pressureSampleIntervalMs: 0,
  });
  const preflight = await collector.preflight({durationMs: 4, sampleIntervalMs: 1});
  check(preflight.cpu.validSampleCount === 4, "collector preflight samples CPU without spawning per sample");
  const attemptsAfterPreflight = collector.report().collector.probeAttempts;
  check(attemptsAfterPreflight === 14, "preflight executes only start/end probes");
  await collector.start();
  await delay(220);
  collector.recordWorkloadSample({serverCpuPercentOneCore: 20});
  await delay(120);
  const report = await collector.stop();
  check(report.state === "stopped" && report.runtime.cpu.sampleCount >= 2, "collector start/stop/report lifecycle");
  check(report.runtime.classification.environmentValid === true, "runtime report carries its own classification");
  check(report.collector.perSecondProcessSpawn === false && report.collector.usesSudo === false, "collector contract is safe");
  check(report.collector.probeAttempts === attemptsAfterPreflight + 14, "runtime only probes at start and stop when periodic probes are disabled");
  check(!JSON.stringify(report).includes("stderr") && !JSON.stringify(report).includes("/Users/"), "report excludes raw diagnostics and user paths");

  return {ok: true, assertions};
}

function defaultExecRunner(file, args, options = {}) {
  return new Promise((resolve) => {
    execFile(file, args, {
      encoding: "utf8",
      timeout: positiveInteger(options.timeoutMs, DEFAULT_COMMAND_TIMEOUT_MS),
      maxBuffer: positiveInteger(options.maxBufferBytes, DEFAULT_COMMAND_MAX_BUFFER_BYTES),
      killSignal: "SIGTERM",
      windowsHide: true,
    }, (error, stdout) => {
      if (error) {
        resolve({ok: false, code: sanitizedExecutionErrorCode(error)});
        return;
      }
      resolve({ok: true, stdout: String(stdout || "")});
    });
  });
}

function sanitizedExecutionErrorCode(error) {
  if (error && (error.killed === true || error.signal === "SIGTERM") && error.code !== "ENOENT") {
    return "TIMEOUT";
  }
  if (error && error.code === "ENOENT") {
    return "COMMAND_MISSING";
  }
  if (error && (error.code === "ERR_CHILD_PROCESS_STDIO_MAXBUFFER" || /maxBuffer/i.test(String(error.code || "")))) {
    return "OUTPUT_LIMIT";
  }
  return "EXEC_FAILED";
}

function safeProbeCode(value) {
  const code = String(value || "EXEC_FAILED").toUpperCase();
  return new Set(["OK", "TIMEOUT", "COMMAND_MISSING", "OUTPUT_LIMIT", "EXEC_FAILED", "PARSE_FAILED"]).has(code)
    ? code
    : "EXEC_FAILED";
}

function safeProbeName(value) {
  const name = String(value || "unknown");
  return Object.hasOwn(PROBE_SPECS, name) ? name : "unknown";
}

function parseColonKeyValues(value) {
  const rows = new Map();
  for (const line of String(value || "").split(/\r?\n/)) {
    const match = line.match(/^\s*([A-Za-z0-9_.-]+)\s*:\s*(.*?)\s*$/);
    if (match) {
      rows.set(match[1], match[2]);
    }
  }
  return rows;
}

function normalizeVmLabel(value) {
  return String(value || "").trim().toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "");
}

function nullSafeNumericObject(value) {
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, Number.isFinite(entry) ? entry : null]));
}

function capture(text, pattern) {
  const match = String(text || "").match(pattern);
  return match ? match[1] : "";
}

function safeText(value, maxLength) {
  return String(value || "").replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim().slice(0, maxLength);
}

function finiteNumber(value) {
  const number = Number(String(value ?? "").replace(/,/g, "").replace(/\.$/, ""));
  return Number.isFinite(number) ? number : Number.NaN;
}

function finiteInteger(value) {
  const number = finiteNumber(value);
  return Number.isFinite(number) ? Math.trunc(number) : Number.NaN;
}

function finiteOrNull(value) {
  return Number.isFinite(value) ? round(value) : null;
}

function finiteMin(...values) {
  const rows = values.filter(hasNumericValue).map(Number).filter(Number.isFinite);
  return rows.length > 0 ? Math.min(...rows) : null;
}

function finiteMax(...values) {
  const rows = values.filter(hasNumericValue).map(Number).filter(Number.isFinite);
  return rows.length > 0 ? Math.max(...rows) : null;
}

function sumFinite(values) {
  const rows = values.map(Number).filter(Number.isFinite);
  return rows.length > 0 ? rows.reduce((total, value) => total + value, 0) : null;
}

function hasNumericValue(value) {
  return value !== null && value !== undefined && value !== "";
}

function binaryUnitBytes(value, unit) {
  const number = Number(value);
  const power = {K: 10, M: 20, G: 30}[String(unit || "").toUpperCase()];
  return Number.isFinite(number) && Number.isInteger(power) ? number * (2 ** power) : Number.NaN;
}

function pmsetNumericValue(text, key) {
  const escaped = key.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(text || "").match(new RegExp(`${escaped}\\s*=\\s*([0-9]+(?:\\.[0-9]+)?)`, "i"));
  return match ? finiteNumber(match[1]) : Number.NaN;
}

function pmsetStatusValue(text, label) {
  const escaped = label.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const match = String(text || "").match(new RegExp(`${escaped}\\s*[:=]\\s*([0-9]+(?:\\.[0-9]+)?)`, "i"));
  return match ? finiteNumber(match[1]) : Number.NaN;
}

function normalizedLoadPerCore(loadAverage, logicalCores) {
  const oneMinute = Number(Array.isArray(loadAverage) ? loadAverage[0] : 0);
  return Number.isFinite(oneMinute) && logicalCores > 0 ? round(oneMinute / logicalCores) : null;
}

function percentile(values, quantile) {
  const rows = (Array.isArray(values) ? values : []).map(Number).filter(Number.isFinite).sort((left, right) => left - right);
  if (rows.length === 0) {
    return null;
  }
  const index = Math.max(0, Math.min(rows.length - 1, Math.ceil(quantile * rows.length) - 1));
  return round(rows[index]);
}

function maxConsecutive(rows, predicate) {
  let current = 0;
  let maximum = 0;
  for (const row of rows) {
    current = predicate(row) ? current + 1 : 0;
    maximum = Math.max(maximum, current);
  }
  return maximum;
}

function selectedLowPowerMode(snapshot) {
  const power = snapshot && snapshot.powerConfig;
  const source = snapshot && snapshot.battery && snapshot.battery.source;
  if (!power) return null;
  if (source === "ac") return power.ac && power.ac.lowPowerMode;
  if (source === "battery") return power.battery && power.battery.lowPowerMode;
  return finiteMax(power.ac && power.ac.lowPowerMode, power.battery && power.battery.lowPowerMode);
}

function thermalIsCurrentlyLimited(value, hardware = null) {
  const thermal = value && typeof value === "object" ? value : {};
  return thermal.throttled === true
    || (Number.isFinite(thermal.availableCpus)
      && Number.isFinite(hardware && hardware.logicalCores)
      && Number(thermal.availableCpus) < Number(hardware.logicalCores));
}

function thermalHistoryRecorded(value) {
  const thermal = value && typeof value === "object" ? value : {};
  return thermal.thermalWarningRecorded === true
    || thermal.performanceWarningRecorded === true;
}

function classificationFromReasons(invalidReasons, warnings) {
  const invalid = [...new Set((invalidReasons || []).map(String))].sort();
  const warningRows = [...new Set((warnings || []).map(String))].sort();
  return classification(invalid.length > 0 ? "invalid" : (warningRows.length > 0 ? "warning" : "valid"), invalid, warningRows);
}

function classification(status, invalidReasons, warnings) {
  return {
    status,
    environmentValid: status === "valid" || status === "warning",
    invalidReasons: [...invalidReasons],
    warnings: [...warnings],
  };
}

function dynamicSnapshot(value) {
  if (!value) return null;
  return {
    capturedAt: value.capturedAt || null,
    vmStat: value.vmStat || null,
    memoryPressure: value.memoryPressure || null,
    swapUsage: value.swapUsage || null,
    battery: value.battery || null,
    thermal: value.thermal || null,
    powerConfig: value.powerConfig || null,
    probeStatus: Object.fromEntries(DYNAMIC_PROBES.map((name) => [name, value.probeStatus && value.probeStatus[name] || null])),
  };
}

function snapshotComplete(value, includeStatic) {
  if (!value) return false;
  if (includeStatic && (!value.osVersion || !value.hardware)) return false;
  return DYNAMIC_PROBES.every((name) => value[name]);
}

function snapshotDynamicComplete(value) {
  return Boolean(value && DYNAMIC_PROBES.every((name) => value[name]));
}

function runtimeSample(elapsedMs, value) {
  return {elapsedMs: round(Math.max(0, Number(elapsedMs || 0))), value: value || null};
}

function runtimePressureSample(elapsedMs, pressure, swap) {
  return {
    elapsedMs: round(Math.max(0, Number(elapsedMs || 0))),
    memoryPressure: pressure || null,
    swapUsage: swap || null,
  };
}

function summarizeRuntimeVm(samplesValue, thresholds) {
  const samples = (Array.isArray(samplesValue) ? samplesValue : []).filter((row) => row && row.value);
  const deltas = [];
  for (let index = 1; index < samples.length; index += 1) {
    const delta = vmStatDelta(samples[index - 1].value, samples[index].value, samples[index].elapsedMs - samples[index - 1].elapsedMs);
    if (delta) deltas.push({...delta, elapsedMs: samples[index].elapsedMs});
  }
  const pageoutRates = deltas.map((row) => row.pageoutsMiBPerSecond).filter(Number.isFinite);
  const swapoutRates = deltas.map((row) => row.swapoutsMiBPerSecond).filter(Number.isFinite);
  const sustainedThreshold = Number(thresholds.runtimePagingSustainedInvalidMiBPerSecond);
  return {
    sampleCount: samples.length,
    deltaCount: deltas.length,
    pageoutPeakMiBPerSecond: pageoutRates.length > 0 ? round(Math.max(...pageoutRates)) : null,
    swapoutPeakMiBPerSecond: swapoutRates.length > 0 ? round(Math.max(...swapoutRates)) : null,
    pagesThrottledDeltaPages: sumFinite(deltas.map((row) => row.pagesThrottledDeltaPages)),
    pagesThrottledMax: finiteMax(...samples.map((row) => row.value.pagesThrottled)),
    consecutivePagingAboveSustainedThreshold: maxConsecutive(deltas, (row) => (
      finiteMax(row.pageoutsMiBPerSecond, row.swapoutsMiBPerSecond) >= sustainedThreshold
    )),
    timeline: deltas.slice(-MAX_SLOW_SAMPLES),
  };
}

function summarizeRuntimePressure(samplesValue) {
  const samples = Array.isArray(samplesValue) ? samplesValue : [];
  const free = samples.map((row) => Number(row && row.memoryPressure && row.memoryPressure.freePercent)).filter(Number.isFinite);
  const firstSwap = samples.find((row) => row && row.swapUsage)?.swapUsage;
  const lastSwap = [...samples].reverse().find((row) => row && row.swapUsage)?.swapUsage;
  return {
    sampleCount: samples.length,
    validMemoryPressureSamples: free.length,
    minimumFreePercent: free.length > 0 ? round(Math.min(...free)) : null,
    startSwapUsedMiB: firstSwap ? round(firstSwap.usedBytes / MIB) : null,
    endSwapUsedMiB: lastSwap ? round(lastSwap.usedBytes / MIB) : null,
    swapUsedDeltaMiB: firstSwap && lastSwap ? round((lastSwap.usedBytes - firstSwap.usedBytes) / MIB) : null,
    timeline: samples.slice(-MAX_SLOW_SAMPLES),
  };
}

function compactCpuTimeline(rowsValue) {
  const rows = Array.isArray(rowsValue) ? rowsValue : [];
  const result = [];
  let nextAt = 0;
  for (const row of rows) {
    if (result.length === 0 || row.elapsedMs >= nextAt || row === rows.at(-1)) {
      result.push({...row});
      nextAt = row.elapsedMs + 30_000;
    }
  }
  return result.slice(-128);
}

function cpuHotspots(rowsValue) {
  const rows = Array.isArray(rowsValue) ? rowsValue : [];
  return [...rows].sort((left, right) => (
    Number(right.externalBusyApproxPct ?? right.hostBusyPct ?? 0) - Number(left.externalBusyApproxPct ?? left.hostBusyPct ?? 0)
    || Number(left.elapsedMs || 0) - Number(right.elapsedMs || 0)
  )).slice(0, 12).map((row) => ({...row}));
}

function normalizedSlowInterval(value, fallback, minimum) {
  if (value === 0) return 0;
  return Math.max(minimum, positiveInteger(value, fallback));
}

function positiveInteger(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? Math.trunc(number) : fallback;
}

function clamp(value, minimum, maximum) {
  return Math.max(minimum, Math.min(maximum, value));
}

function round(value, digits = 3) {
  const number = Number(value);
  if (!Number.isFinite(number)) return null;
  const factor = 10 ** digits;
  return Math.round(number * factor) / factor;
}

function boundedPush(rows, value, limit) {
  rows.push(value);
  if (rows.length > limit) {
    rows.splice(0, rows.length - limit);
  }
}

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms || 0))));
}

function vmFixture(options = {}) {
  return [
    "Mach Virtual Memory Statistics: (page size of 16384 bytes)",
    "Pages free: 5000.",
    "Pages active: 200000.",
    "Pages inactive: 200000.",
    "Pages speculative: 1000.",
    `Pages throttled: ${Number(options.throttled || 0)}.`,
    "Pages wired down: 150000.",
    "Pages purgeable: 1000.",
    "Pages stored in compressor: 100000.",
    "Pages occupied by compressor: 20000.",
    "Decompressions: 1000.",
    "Compressions: 2000.",
    "Pageins: 3000.",
    `Pageouts: ${Number(options.pageouts || 0)}.`,
    "Swapins: 4000.",
    `Swapouts: ${Number(options.swapouts || 0)}.`,
  ].join("\n");
}

function cpuFixture(busy, idle) {
  return Array.from({length: 2}, () => ({
    model: "fixture",
    speed: 1,
    times: {user: busy, nice: 0, sys: 0, idle, irq: 0},
  }));
}

function dynamicFixture() {
  return {
    capturedAt: "2026-07-13T00:00:00.000Z",
    vmStat: parseVmStat(vmFixture({pageouts: 100, swapouts: 50, throttled: 0})),
    memoryPressure: {memoryBytes: 17179869184, pageCount: 1048576, pageSizeBytes: 16384, freePercent: 44},
    swapUsage: {totalBytes: 9 * 1024 ** 3, usedBytes: 2 * 1024 ** 3, freeBytes: 7 * 1024 ** 3, usedRatio: 2 / 9, encrypted: true},
    battery: {source: "ac", batteryPercent: 80, acAttached: true, charging: false},
    thermal: {
      thermalWarningRecorded: false,
      performanceWarningRecorded: false,
      cpuPowerStatusRecorded: false,
      schedulerLimitPct: null,
      availableCpus: null,
      speedLimitPct: null,
      throttled: false,
    },
    powerConfig: {battery: {lowPowerMode: 0}, ac: {lowPowerMode: 0}},
    probeStatus: Object.fromEntries(DYNAMIC_PROBES.map((name) => [name, {ok: true, code: "OK", durationMs: 1}])),
  };
}

function preflightFixture() {
  const start = dynamicFixture();
  const end = dynamicFixture();
  return {
    supported: true,
    expectedCpuSamples: 10,
    evidenceComplete: true,
    hardware: {model: "Mac17,4", cpuModel: "Apple M5", memoryBytes: 17179869184, physicalCores: 10, logicalCores: 10},
    start,
    end,
    cpu: {
      sampleCount: 10,
      validSampleCount: 10,
      hostBusyP50Pct: 10,
      hostBusyP95Pct: 20,
      hostBusyMaxPct: 20,
      samplesAboveBurstThreshold: 0,
      maxConsecutiveAboveBurstThreshold: 0,
    },
    vmDelta: {
      pageoutsMiBPerSecond: 0,
      swapoutsMiBPerSecond: 0,
      pagesThrottledDeltaPages: 0,
      pagesThrottledMax: 0,
    },
  };
}

function createFakeProbeRunner() {
  return async (file, args) => {
    const key = `${path.basename(file)} ${args.join(" ")}`;
    const outputs = {
      "sw_vers ": "ProductName:\tmacOS\nProductVersion:\t26.5\nBuildVersion:\t25F71\n",
      "sysctl hw.model hw.memsize hw.physicalcpu hw.logicalcpu machdep.cpu.brand_string": [
        "hw.model: Mac17,4",
        "hw.memsize: 17179869184",
        "hw.physicalcpu: 10",
        "hw.logicalcpu: 10",
        "machdep.cpu.brand_string: Apple M5",
      ].join("\n"),
      "vm_stat ": vmFixture({pageouts: 100, swapouts: 50}),
      "memory_pressure -Q": "The system has 17179869184 (1048576 pages with a page size of 16384).\nSystem-wide memory free percentage: 44%\n",
      "sysctl vm.swapusage": "vm.swapusage: total = 9216.00M  used = 2048.00M  free = 7168.00M  (encrypted)",
      "pmset -g batt": "Now drawing from 'AC Power'\n -InternalBattery-0\t80%; AC attached; not charging present: true\n",
      "pmset -g therm": "Note: No thermal warning level has been recorded\nNote: No performance warning level has been recorded\nNote: No CPU power status has been recorded\n",
      "pmset -g custom": "Battery Power:\n lowpowermode 0\nAC Power:\n lowpowermode 0\n",
    };
    return Object.hasOwn(outputs, key) ? {ok: true, stdout: outputs[key]} : {ok: false, code: "EXEC_FAILED"};
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(FILE) && process.argv.includes("--self-test")) {
  runMacosHostEvidenceSelfTest().then((result) => {
    process.stdout.write(`macOS host evidence self-test: ${result.assertions}/${result.assertions} passed\n`);
  }).catch((error) => {
    process.stderr.write(`macOS host evidence self-test failed: ${safeText(error && error.message, 200)}\n`);
    process.exitCode = 1;
  });
}
