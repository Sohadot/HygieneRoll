/*
 * HygieneRoll reference scenario helpers v0.1
 *
 * Opens a published reference case in the calculator, compares the visitor's scenario
 * with the immutable reference, and builds a provenance export. Pure functions only:
 * no DOM, no network, no storage. The calculator page does the fetching and checks the
 * record's sha256 against the published manifest before calling validateReferenceRecord.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.HygieneRollReferenceScenario = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = "0.1";
  var CASE_ID = /^HRR-\d{3}$/;
  var SITE = "https://hygieneroll.com/";

  // The only inputs a reference may hand to the calculator, with the type each must have.
  var INPUT_FIELDS = {
    name: "string",
    unit: "string",
    unitKind: "string",
    category: "string",
    quantity: "number",
    usageMode: "string",
    weeklyUsage: "number|null",
    durationWeeks: "number|null",
    leadTimeDays: "number",
    bufferDays: "number",
    variabilityPercent: "number",
    replenishmentQuantity: "number|null",
    intervalDays: "number|null"
  };

  var COMPARED_INPUTS = ["quantity", "usageMode", "weeklyUsage", "durationWeeks", "variabilityPercent", "leadTimeDays", "bufferDays", "replenishmentQuantity", "intervalDays"];

  function blank(value) {
    return value === undefined || value === null || value === "";
  }

  function typeMatches(value, spec) {
    return spec.split("|").some(function (type) {
      if (type === "null") return value === null;
      if (type === "number") return typeof value === "number" && Number.isFinite(value);
      return typeof value === type;
    });
  }

  /*
   * Reads a location fragment. Returns { id } for "#case=HRR-001", { none: true } when
   * no case is requested, and { error } for anything else. Nothing else in the fragment
   * is read, so values cannot be injected through the URL.
   */
  function parseCaseFragment(hash) {
    if (typeof hash !== "string" || hash === "" || hash === "#") return { none: true };
    var match = /^#case=([^&]*)$/.exec(hash);
    if (!match) return { none: true };
    var id;
    try {
      id = decodeURIComponent(match[1]);
    } catch (error) {
      return { error: "The reference case link is malformed." };
    }
    if (!CASE_ID.test(id)) return { error: "The reference case link is malformed." };
    return { id: id };
  }

  function caseFragment(id) {
    if (!CASE_ID.test(id)) throw new Error("invalid case id");
    return "#case=" + id;
  }

  function manifestEntry(manifest, id) {
    if (!manifest || !Array.isArray(manifest.records)) return null;
    var found = manifest.records.filter(function (entry) { return entry && entry.id === id; });
    return found.length === 1 ? found[0] : null;
  }

  /*
   * Checks a fetched record against its manifest entry and the engine. Returns
   * { ok: true, reference } or { ok: false, errors }. Never mutates the record.
   */
  function validateReferenceRecord(record, entry, engine) {
    var errors = [];
    if (!entry || !CASE_ID.test(entry.id) || entry.outcome !== "PASS" || !/^[0-9a-f]{64}$/.test(entry.sha256 || "")) {
      return { ok: false, errors: ["The reference case is not listed as verified in the manifest."] };
    }
    if (!record || typeof record !== "object") return { ok: false, errors: ["The reference record could not be read."] };
    if (record.record_type !== "hygieneroll.reference-case-record") errors.push("Unexpected record type.");
    var info = record.case || {};
    if (info.id !== entry.id) errors.push("The record does not match the requested case.");
    if (info.version !== entry.version) errors.push("The record version does not match the manifest.");
    if (info.status !== "PUBLISHED") errors.push("The record is not published.");
    if (typeof info.slug !== "string" || !/^[a-z0-9]+(-[a-z0-9]+)*$/.test(info.slug)) errors.push("The record has an invalid slug.");
    if (!record.validation || record.validation.outcome !== "PASS" || record.validation.checks_failed !== 0) errors.push("The record did not pass validation.");
    if (!record.evidence || record.evidence.origin !== "SYNTHETIC") errors.push("The record is not labeled synthetic.");
    var inputs = record.inputs;
    if (!inputs || typeof inputs !== "object" || Array.isArray(inputs)) {
      errors.push("The record has no inputs.");
    } else {
      Object.keys(inputs).forEach(function (key) {
        if (!Object.prototype.hasOwnProperty.call(INPUT_FIELDS, key)) errors.push("Unexpected input " + key + ".");
        else if (!typeMatches(inputs[key], INPUT_FIELDS[key])) errors.push("Input " + key + " has the wrong type.");
      });
      if (!errors.length && engine) {
        engine.validateItem(inputs).forEach(function (error) { errors.push("Input " + error.field + ": " + error.message); });
      }
    }
    var outputs = record.results && record.results.items && record.results.items[0] && record.results.items[0].outputs;
    if (!outputs) errors.push("The record has no verified results.");
    if (errors.length) return { ok: false, errors: errors };

    var copy = JSON.parse(JSON.stringify(inputs));
    return {
      ok: true,
      reference: {
        id: info.id,
        version: info.version,
        slug: info.slug,
        title: info.title,
        sha256: entry.sha256,
        engineVersion: record.methodology && record.methodology.engine ? record.methodology.engine.version : null,
        inputs: copy,
        outputs: JSON.parse(JSON.stringify(outputs))
      }
    };
  }

  function windowDelta(reference, scenario) {
    return {
      reference: { earliest: reference.earliest, latest: reference.latest },
      scenario: { earliest: scenario.earliest, latest: scenario.latest },
      delta: { earliest: scenario.earliest - reference.earliest, latest: scenario.latest - reference.latest }
    };
  }

  function round2(value) {
    return Number(value.toFixed(2));
  }

  function fitSide(fit, intervalDays) {
    if (fit) return { applicable: true, interval_days: intervalDays, fit: fit.fit, drift_days_per_cycle: fit.drift_days_per_cycle };
    return { applicable: false, reason: "No fixed delivery interval was entered, so there is no schedule to compare with the cadence." };
  }

  /*
   * Compares the verified reference outputs with a scenario computed by the engine.
   * Every difference is scenario minus reference.
   */
  function compare(reference, scenarioInputs, scenarioOutputs) {
    var ref = reference.outputs;
    var out = scenarioOutputs;
    var changedInputs = COMPARED_INPUTS.filter(function (field) {
      var a = reference.inputs[field];
      var b = scenarioInputs[field];
      return !(blank(a) && blank(b)) && a !== b;
    }).map(function (field) {
      return { field: field, reference: blank(reference.inputs[field]) ? null : reference.inputs[field], scenario: blank(scenarioInputs[field]) ? null : scenarioInputs[field] };
    });
    var slips = ref.lead_time_slip.map(function (refSlip, index) {
      var scenarioSlip = out.lead_time_slip[index];
      var a = refSlip.exposure_if_ordered_at_trigger;
      var b = scenarioSlip.exposure_if_ordered_at_trigger;
      return {
        slip_days: refSlip.slip_days,
        reference: { status: a.status, supply_gap_days: a.supply_gap_days },
        scenario: { status: b.status, supply_gap_days: b.supply_gap_days },
        delta_gap_days: { min: b.supply_gap_days.min - a.supply_gap_days.min, max: b.supply_gap_days.max - a.supply_gap_days.max }
      };
    });
    return {
      changed_inputs: changedInputs,
      identical_inputs: changedInputs.length === 0,
      depletion_days: windowDelta(ref.depletion_interval_days, out.depletion_interval_days),
      planning_trigger_days: windowDelta(ref.planning_trigger_days, out.planning_trigger_days),
      replenishment_cadence_days: windowDelta(ref.replenishment_cadence_days, out.replenishment_cadence_days),
      reorder_threshold_units: {
        reference: ref.reorder_threshold_units,
        scenario: out.reorder_threshold_units,
        delta: round2(out.reorder_threshold_units - ref.reorder_threshold_units)
      },
      fixed_interval_fit: {
        reference: fitSide(ref.fixed_interval_fit, reference.inputs.intervalDays),
        scenario: fitSide(out.fixed_interval_fit, blank(scenarioInputs.intervalDays) ? null : scenarioInputs.intervalDays)
      },
      stockout_exposure: slips
    };
  }

  function canonical(value) {
    function sort(node) {
      if (Array.isArray(node)) return node.map(sort);
      if (node && typeof node === "object") {
        var out = {};
        Object.keys(node).sort().forEach(function (key) { out[key] = sort(node[key]); });
        return out;
      }
      return node;
    }
    return JSON.stringify(sort(value), null, 2) + "\n";
  }

  function exportInputs(inputs) {
    var out = {};
    COMPARED_INPUTS.concat(["name", "unit", "category"]).forEach(function (field) {
      out[field] = blank(inputs[field]) ? null : inputs[field];
    });
    return out;
  }

  /*
   * Builds the provenance export for a scenario derived from a reference case. It is a
   * user scenario, never a reference record, and says so in its own fields.
   */
  function buildScenarioExport(reference, scenarioInputs, scenarioRecord, comparison) {
    return {
      record_type: "hygieneroll.reference-derived-scenario",
      record_version: VERSION,
      classification: "USER_SCENARIO",
      verified_reference: false,
      statement: "A scenario the visitor ran in the calculator, starting from a published reference case. It is not a reference record, it was not verified against the oracle, and it does not change the reference.",
      source_reference: {
        id: reference.id,
        version: reference.version,
        record_url: SITE + "reference/cases/" + reference.id + ".json",
        manifest_url: SITE + "reference/cases/manifest.json",
        sha256: reference.sha256,
        engine_version: reference.engineVersion
      },
      engine_version: scenarioRecord.engine_version,
      methodology: SITE + "CALCULATOR_METHODOLOGY.md",
      ontology: scenarioRecord.ontology,
      epistemic_status: {
        inputs: "HYPOTHETICAL_SCENARIO",
        outputs: "DERIVED_CALCULATION",
        observed_evidence_used: false
      },
      reference_inputs: exportInputs(reference.inputs),
      scenario_inputs: exportInputs(scenarioInputs),
      scenario_results: scenarioRecord.items[0].outputs,
      comparison: comparison
    };
  }

  return {
    version: VERSION,
    parseCaseFragment: parseCaseFragment,
    caseFragment: caseFragment,
    manifestEntry: manifestEntry,
    validateReferenceRecord: validateReferenceRecord,
    compare: compare,
    buildScenarioExport: buildScenarioExport,
    canonical: canonical
  };
});
