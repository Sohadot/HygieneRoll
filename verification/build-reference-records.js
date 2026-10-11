#!/usr/bin/env node
/*
 * Builds the published reference case records, their manifest, and the static explorer
 * page from reference/cases/registry.json.
 *
 * Every expected value in the registry is compared with the engine under test and with
 * the independent oracle. If any comparison fails, or a case breaks the evidence or
 * ontology rules, nothing is written and the process exits non-zero.
 *
 *   node verification/build-reference-records.js          write the files
 *   node verification/build-reference-records.js --check  fail if the files on disk differ
 */
"use strict";

var fs = require("fs");
var path = require("path");
var crypto = require("crypto");

var ROOT = path.join(__dirname, "..");
var SITE = "https://hygieneroll.com/";
var SCHEMA_URL = SITE + "reference/schema/reference-case-record.schema.json";
var OUT_DIR = "reference/cases/";

function readJson(relativePath) {
  return JSON.parse(fs.readFileSync(path.join(ROOT, relativePath), "utf8"));
}

// Canonical serialization: keys sorted at every level, two-space indent, LF, final newline.
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

function sha256(text) {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

// Continuous values (rates, drift, arrival) may differ by binary noise; whole days,
// hundredths of a unit, codes, and booleans must match exactly.
function same(a, b) {
  if (typeof a === "number" && typeof b === "number") {
    if (Number.isInteger(a) && Number.isInteger(b)) return a === b;
    return Math.abs(a - b) <= 1e-9 * Math.max(1, Math.abs(b));
  }
  return a === b;
}

function leaves(value, prefix, out) {
  out = out || [];
  if (value !== null && typeof value === "object") {
    Object.keys(value).forEach(function (key) {
      var next = Array.isArray(value) ? prefix + "[" + key + "]" : (prefix ? prefix + "." + key : key);
      leaves(value[key], next, out);
    });
  } else {
    out.push({ path: prefix, value: value });
  }
  return out;
}

function lookup(value, pathText) {
  return pathText.replace(/\[(\d+)\]/g, ".$1").split(".").reduce(function (node, key) {
    return node === undefined || node === null ? undefined : node[key];
  }, value);
}

var PARAMETERS = [
  { field: "category", concept: "HRO-001", unit: function () { return "code"; } },
  { field: "unit", concept: "HRO-002", unit: function () { return "text"; } },
  { field: "quantity", concept: "HRO-004", unit: function (inputs) { return inputs.unit; } },
  { field: "usageMode", concept: "HRO-006", unit: function () { return "code"; } },
  { field: "weeklyUsage", concept: "HRO-006", unit: function (inputs) { return inputs.unit + " per week"; } },
  { field: "durationWeeks", concept: "HRO-006", unit: function () { return "weeks"; } },
  { field: "variabilityPercent", concept: "HRO-007", unit: function () { return "percent"; } },
  { field: "leadTimeDays", concept: "HRO-010", unit: function () { return "days"; } },
  { field: "bufferDays", concept: "HRO-011", unit: function () { return "days"; } },
  { field: "replenishmentQuantity", concept: "HRO-016", unit: function (inputs) { return inputs.unit; } },
  { field: "intervalDays", concept: "HRO-018", unit: function () { return "days"; } }
];

function evidenceErrors(item, register) {
  var errors = [];
  var evidence = item.evidence || {};
  var admitted = {};
  (register.sources || []).forEach(function (source) {
    if (source.admission_status === "ADMITTED") admitted[source.id] = true;
  });
  if (evidence.origin === "SYNTHETIC") {
    if (evidence.claim_class !== "ILLUSTRATIVE_MODEL") errors.push("synthetic case must be ILLUSTRATIVE_MODEL");
    if ((evidence.source_ids || []).length) errors.push("synthetic case cannot cite sources");
    if ((evidence.external_observations || []).length) errors.push("synthetic case cannot carry external observations");
    if (!/\(synthetic\)$/.test(item.title || "")) errors.push("synthetic case title must end with (synthetic)");
    if (!/\(synthetic\)$/.test((item.inputs || {}).name || "")) errors.push("synthetic item name must end with (synthetic)");
  } else {
    errors.push("only SYNTHETIC cases are publishable in registry 0.1");
  }
  (evidence.external_observations || []).forEach(function (observation, index) {
    var ids = observation.source_ids || [];
    if (!ids.length || !ids.every(function (id) { return admitted[id]; })) {
      errors.push("external observation " + index + " lacks an admitted source");
    }
  });
  if (evidence.input_layer !== "HYPOTHETICAL_SCENARIO") errors.push("input layer must be HYPOTHETICAL_SCENARIO");
  if (evidence.output_layer !== "DERIVED_CALCULATION") errors.push("output layer must be DERIVED_CALCULATION");
  return errors;
}

function ontologyErrors(item, ontology) {
  var errors = [];
  var byId = {};
  ontology.concepts.forEach(function (concept) { byId[concept.id] = concept; });
  var terms = item.ontology_terms || [];
  terms.forEach(function (id) {
    if (!byId[id]) errors.push("unknown ontology term " + id);
    else if (byId[id].status !== "ACTIVE") errors.push("ontology term " + id + " is not ACTIVE");
  });
  // Every expected output must be governed by a listed concept. A null expectation marks
  // an output that does not apply to the case, such as interval fit without an interval.
  Object.keys(item.expected || {}).forEach(function (key) {
    if (item.expected[key] === null) return;
    var governing = ontology.concepts.filter(function (concept) {
      return (concept.record_fields || []).indexOf("outputs." + key) !== -1;
    });
    if (!governing.length) errors.push("expected field " + key + " has no ontology concept");
    else if (!governing.some(function (concept) { return terms.indexOf(concept.id) !== -1; })) {
      errors.push("expected field " + key + " is governed by " + governing.map(function (c) { return c.id; }).join("/") + ", which is not listed");
    }
  });
  PARAMETERS.forEach(function (parameter) {
    var value = (item.inputs || {})[parameter.field];
    if (value !== null && value !== undefined && value !== "" && terms.indexOf(parameter.concept) === -1) {
      errors.push("input " + parameter.field + " needs ontology term " + parameter.concept);
    }
  });
  return errors;
}

function compareCase(item, engine, oracle) {
  var results = engine.buildScenarioRecord([item.inputs]);
  var engineOut = results.items[0].outputs;
  var oracleRun = oracle.deriveHousehold([item.inputs]);
  var oracleOut = oracleRun.items[0].outputs;
  var checks = leaves(item.expected, "").map(function (leaf) {
    var e = lookup(engineOut, leaf.path);
    var o = lookup(oracleOut, leaf.path);
    return {
      path: "outputs." + leaf.path,
      expected: leaf.value,
      engine: e === undefined ? null : e,
      oracle: o === undefined ? null : o,
      result: same(leaf.value, e) && same(leaf.value, o) ? "PASS" : "FAIL"
    };
  });
  ["earliest", "latest"].forEach(function (end) {
    var expected = item.expected.planning_trigger_days[end];
    var e = results.household.next_return.planning_trigger_days[end];
    var o = oracleRun.household.next_return.planning_trigger_days[end];
    checks.push({
      path: "household.next_return.planning_trigger_days." + end,
      expected: expected,
      engine: e,
      oracle: o,
      result: same(expected, e) && same(expected, o) ? "PASS" : "FAIL"
    });
  });
  return { results: results, checks: checks };
}

function buildRecord(item, registry, ontology, engine, oracle, comparison) {
  var byId = {};
  ontology.concepts.forEach(function (concept) { byId[concept.id] = concept; });
  var terms = item.ontology_terms.slice().sort();
  return {
    $schema: SCHEMA_URL,
    record_type: "hygieneroll.reference-case-record",
    record_version: "0.1",
    registry: { url: registry.id, version: registry.version },
    case: {
      id: item.id,
      version: item.version,
      slug: item.slug,
      title: item.title,
      purpose: item.purpose,
      status: item.status
    },
    evidence: {
      origin: item.evidence.origin,
      claim_class: item.evidence.claim_class,
      input_layer: item.evidence.input_layer,
      output_layer: item.evidence.output_layer,
      source_ids: [],
      external_observations: [],
      statement: "Synthetic inputs chosen to exercise the method. They are not observed household behavior, consumption statistics, or benchmarks. Outputs are arithmetic on those inputs."
    },
    inputs: item.inputs,
    parameters: PARAMETERS.filter(function (parameter) {
      var value = item.inputs[parameter.field];
      return value !== null && value !== undefined && value !== "";
    }).map(function (parameter) {
      return { field: parameter.field, concept: parameter.concept, value: item.inputs[parameter.field], unit: parameter.unit(item.inputs) };
    }),
    methodology: {
      document: SITE + "CALCULATOR_METHODOLOGY.md",
      engine: { url: SITE + "assets/js/replenishment-engine.js", version: engine.version },
      ontology: { url: ontology.id, version: ontology.version },
      steps: terms.filter(function (id) { return byId[id].layer === "DERIVED_CALCULATION"; }).map(function (id) {
        return { concept: id, term: byId[id].term, formula: byId[id].formula };
      })
    },
    ontology_terms: terms.map(function (id) {
      return { id: id, term: byId[id].term, layer: byId[id].layer, url: SITE + "reference.html#term-" + byId[id].slug };
    }),
    expected: item.expected,
    derivation: item.derivation,
    results: comparison.results,
    validation: {
      outcome: "PASS",
      rule: "Each expected value must equal the engine result and the oracle result. Whole days, hundredths of a unit, codes, and booleans must match exactly. Rates, drift, and arrival days may differ by at most 1e-9 relative.",
      engine_version: engine.version,
      oracle: { name: oracle.name, version: oracle.version, arithmetic: oracle.arithmetic, url: SITE + "verification/oracle.js" },
      checks_total: comparison.checks.length,
      checks_failed: 0,
      checks: comparison.checks
    },
    assumptions: item.assumptions,
    limitations: item.limitations
  };
}

/*
 * Pure build: returns { ok, failures, files } and never touches the disk.
 * `files` is empty whenever `ok` is false.
 */
function build(options) {
  var settings = options || {};
  var registry = settings.registry || readJson(OUT_DIR + "registry.json");
  var ontology = settings.ontology || readJson("reference/replenishment-ontology.json");
  var register = settings.register || readJson("reference/source-register.json");
  var schema = settings.schema || readJson("reference/schema/reference-case-record.schema.json");
  var engine = settings.engine || require("../assets/js/replenishment-engine.js");
  var oracle = settings.oracle || require("./oracle.js");
  var validator = require("./schema-validator.js");
  var failures = [];
  var records = [];

  if (registry.engine_version !== engine.version) failures.push("registry targets engine " + registry.engine_version + " but engine is " + engine.version);
  if (registry.ontology_version !== ontology.version) failures.push("registry targets ontology " + registry.ontology_version + " but ontology is " + ontology.version);
  var seen = {};
  registry.cases.forEach(function (item) {
    if (seen[item.id] || seen[item.slug]) failures.push(item.id + ": duplicate id or slug");
    seen[item.id] = seen[item.slug] = true;
    if (item.status !== "PUBLISHED") return;
    var problems = evidenceErrors(item, register).concat(ontologyErrors(item, ontology));
    var comparison;
    try {
      comparison = compareCase(item, engine, oracle);
    } catch (error) {
      problems.push("calculation failed: " + error.message);
    }
    if (comparison) {
      comparison.checks.filter(function (check) { return check.result !== "PASS"; }).forEach(function (check) {
        problems.push(check.path + " expected " + JSON.stringify(check.expected) + ", engine " + JSON.stringify(check.engine) + ", oracle " + JSON.stringify(check.oracle));
      });
    }
    if (!problems.length) {
      var record = buildRecord(item, registry, ontology, engine, oracle, comparison);
      validator.validate(schema, record).forEach(function (error) { problems.push("schema " + error); });
      if (!problems.length) records.push(record);
    }
    problems.forEach(function (problem) { failures.push(item.id + ": " + problem); });
  });

  if (failures.length) return { ok: false, failures: failures, files: {} };

  var files = {};
  var manifest = {
    registry: { url: registry.id, version: registry.version },
    engine_version: engine.version,
    ontology_version: ontology.version,
    oracle: { name: oracle.name, version: oracle.version },
    serialization: "UTF-8 JSON, keys sorted at every level, two-space indent, LF line endings, final newline. sha256 is taken over those exact bytes.",
    records: records.map(function (record) {
      var text = canonical(record);
      files[OUT_DIR + record.case.id + ".json"] = text;
      return {
        id: record.case.id,
        version: record.case.version,
        title: record.case.title,
        url: SITE + OUT_DIR + record.case.id + ".json",
        sha256: sha256(text),
        outcome: record.validation.outcome,
        checks: record.validation.checks_total
      };
    })
  };
  files[OUT_DIR + "manifest.json"] = canonical(manifest);
  files[OUT_DIR + "index.html"] = require("./render-reference-cases.js").render(records, manifest, registry);
  return { ok: true, failures: [], files: files };
}

function main() {
  var check = process.argv.indexOf("--check") !== -1;
  var outcome = build();
  if (!outcome.ok) {
    console.error("Reference build failed. No files were written.");
    outcome.failures.forEach(function (failure) { console.error("  - " + failure); });
    process.exit(1);
  }
  var stale = [];
  Object.keys(outcome.files).forEach(function (file) {
    var target = path.join(ROOT, file);
    var current = fs.existsSync(target) ? fs.readFileSync(target, "utf8") : null;
    if (current !== outcome.files[file]) {
      if (check) stale.push(file);
      else fs.writeFileSync(target, outcome.files[file]);
    }
  });
  if (check && stale.length) {
    console.error("Published reference files are out of date: " + stale.join(", "));
    process.exit(1);
  }
  console.log((check ? "Verified " : "Built ") + Object.keys(outcome.files).length + " files; all reference cases PASS.");
}

if (require.main === module) main();

module.exports = { build: build, canonical: canonical, sha256: sha256, evidenceErrors: evidenceErrors, ontologyErrors: ontologyErrors };
