"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var builder = require("../verification/build-reference-records.js");
var validator = require("../verification/schema-validator.js");
var engine = require("../assets/js/replenishment-engine.js");

var root = path.join(__dirname, "..");
var passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log("ok - " + name);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function countLeaves(value) {
  if (value !== null && typeof value === "object") {
    return Object.keys(value).reduce(function (sum, key) { return sum + countLeaves(value[key]); }, 0);
  }
  return 1;
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

var registry = JSON.parse(read("reference/cases/registry.json"));
var ontology = JSON.parse(read("reference/replenishment-ontology.json"));
var register = JSON.parse(read("reference/source-register.json"));
var schema = JSON.parse(read("reference/schema/reference-case-record.schema.json"));
var manifest = JSON.parse(read("reference/cases/manifest.json"));
var page = read("reference/cases/index.html");
var records = registry.cases.map(function (item) { return JSON.parse(read("reference/cases/" + item.id + ".json")); });

test("registry holds five published cases with stable identifiers", function () {
  assert.strictEqual(registry.version, "0.1");
  assert.deepStrictEqual(registry.cases.map(function (c) { return c.id; }), ["HRR-001", "HRR-002", "HRR-003", "HRR-004", "HRR-005"]);
  assert.deepStrictEqual(registry.cases.map(function (c) { return c.slug; }), [
    "stable-consumption", "variable-consumption", "short-lead-time", "delayed-delivery-stockout", "fixed-interval-versus-window"
  ]);
  registry.cases.forEach(function (c) {
    assert.ok(Number.isInteger(c.version) && c.version >= 1, c.id);
    assert.strictEqual(c.status, "PUBLISHED", c.id);
    ["purpose", "inputs", "expected", "derivation", "assumptions", "limitations", "ontology_terms", "evidence"].forEach(function (key) {
      assert.ok(c[key], c.id + " " + key);
    });
  });
  assert.ok(registry.changelog.some(function (entry) { return entry.version === registry.version; }));
});

test("the five cases cover the required scenario shapes", function () {
  var byId = {};
  records.forEach(function (r) { byId[r.case.id] = r.results.items[0].outputs; });
  var stable = byId["HRR-001"].depletion_interval_days;
  assert.strictEqual(stable.earliest, stable.latest);
  var variable = byId["HRR-002"].depletion_interval_days;
  assert.ok(variable.latest - variable.earliest >= 7);
  assert.ok(registry.cases[2].inputs.leadTimeDays <= 1);
  assert.ok(byId["HRR-004"].lead_time_slip.every(function (s) { return s.exposure_if_ordered_at_trigger.status === "STOCKOUT_AT_BOTH_BOUNDS"; }));
  assert.ok(byId["HRR-005"].fixed_interval_fit && byId["HRR-005"].fixed_interval_fit.fit !== "WITHIN_WINDOW");
});

test("committed records, manifest, and page equal a fresh build", function () {
  var outcome = builder.build();
  assert.ok(outcome.ok, outcome.failures.join("\n"));
  Object.keys(outcome.files).forEach(function (file) {
    assert.strictEqual(read(file), outcome.files[file], file + " is stale; run node verification/build-reference-records.js");
  });
  assert.strictEqual(Object.keys(outcome.files).length, 7);
});

test("two builds produce byte-identical output", function () {
  var a = builder.build();
  var b = builder.build();
  assert.deepStrictEqual(a.files, b.files);
});

test("every record validates against the record schema", function () {
  records.forEach(function (record) {
    assert.deepStrictEqual(validator.validate(schema, record), [], record.case.id);
  });
});

test("records use canonical serialization and match manifest digests", function () {
  manifest.records.forEach(function (entry, index) {
    var text = read("reference/cases/" + entry.id + ".json");
    assert.strictEqual(builder.canonical(JSON.parse(text)), text, entry.id);
    assert.strictEqual(builder.sha256(text), entry.sha256, entry.id);
    assert.strictEqual(entry.outcome, "PASS");
    assert.strictEqual(entry.url, "https://hygieneroll.com/reference/cases/" + entry.id + ".json");
    assert.strictEqual(entry.version, registry.cases[index].version);
  });
  var shuffled = { b: 1, a: { d: 2, c: [3, { f: 4, e: 5 }] } };
  assert.strictEqual(builder.canonical(shuffled), builder.canonical({ a: { c: [3, { e: 5, f: 4 }], d: 2 }, b: 1 }));
});

test("each record separates inputs, methodology, results, evidence, and validation", function () {
  records.forEach(function (record) {
    assert.deepStrictEqual(record.inputs, registry.cases.find(function (c) { return c.id === record.case.id; }).inputs);
    assert.strictEqual(record.methodology.document, "https://hygieneroll.com/CALCULATOR_METHODOLOGY.md");
    assert.strictEqual(record.methodology.engine.version, engine.version);
    assert.strictEqual(record.results.record_type, "hygieneroll.replenishment-scenario");
    assert.strictEqual(record.evidence.origin, "SYNTHETIC");
    assert.deepStrictEqual(record.evidence.external_observations, []);
    assert.strictEqual(record.validation.outcome, "PASS");
    assert.strictEqual(record.validation.checks_failed, 0);
    assert.strictEqual(record.validation.checks.length, record.validation.checks_total);
    assert.ok(record.validation.checks.every(function (c) { return c.result === "PASS"; }));
  });
});

test("every check compares a hand value with both the engine and the oracle", function () {
  records.forEach(function (record) {
    var expectedLeaves = countLeaves(record.expected);
    assert.strictEqual(record.validation.checks_total, expectedLeaves + 2, record.case.id);
    record.validation.checks.forEach(function (c) {
      assert.ok("expected" in c && "engine" in c && "oracle" in c, record.case.id + " " + c.path);
    });
  });
});

test("ontology terms resolve to active concepts and cover every applicable output", function () {
  var byId = {};
  ontology.concepts.forEach(function (c) { byId[c.id] = c; });
  records.forEach(function (record) {
    record.ontology_terms.forEach(function (term) {
      assert.ok(byId[term.id], term.id);
      assert.strictEqual(byId[term.id].status, "ACTIVE");
      assert.strictEqual(term.term, byId[term.id].term);
      assert.strictEqual(term.layer, byId[term.id].layer);
      assert.strictEqual(term.url, "https://hygieneroll.com/reference.html#term-" + byId[term.id].slug);
    });
    record.parameters.forEach(function (p) { assert.ok(byId[p.concept], p.concept); });
    record.methodology.steps.forEach(function (step) {
      assert.strictEqual(byId[step.concept].layer, "DERIVED_CALCULATION");
      assert.strictEqual(step.formula, byId[step.concept].formula);
    });
  });
  registry.cases.forEach(function (c) { assert.deepStrictEqual(builder.ontologyErrors(c, ontology), [], c.id); });
  var unknown = clone(registry.cases[0]);
  unknown.ontology_terms.push("HRO-999");
  assert.ok(builder.ontologyErrors(unknown, ontology).some(function (e) { return /unknown ontology term HRO-999/.test(e); }));
  var uncovered = clone(registry.cases[0]);
  uncovered.ontology_terms = uncovered.ontology_terms.filter(function (id) { return id !== "HRO-014"; });
  assert.ok(builder.ontologyErrors(uncovered, ontology).some(function (e) { return /reorder_threshold_units/.test(e); }));
  var reserved = clone(registry.cases[0]);
  reserved.ontology_terms.push("HRO-024");
  assert.ok(builder.ontologyErrors(reserved, ontology).some(function (e) { return /HRO-024 is not ACTIVE/.test(e); }));
});

test("synthetic cases cannot be presented as external observations", function () {
  registry.cases.forEach(function (c) { assert.deepStrictEqual(builder.evidenceErrors(c, register), [], c.id); });
  var base = registry.cases[0];
  var observed = clone(base);
  observed.evidence.claim_class = "OBSERVED_EVIDENCE";
  assert.ok(builder.evidenceErrors(observed, register).length > 0);
  var cited = clone(base);
  cited.evidence.source_ids = ["SRC-HR-0001"];
  assert.ok(builder.evidenceErrors(cited, register).length > 0);
  var withObservation = clone(base);
  withObservation.evidence.external_observations = [{ text: "x", source_ids: ["SRC-HR-0001"] }];
  assert.ok(builder.evidenceErrors(withObservation, register).some(function (e) { return /admitted source/.test(e); }));
  var unlabeled = clone(base);
  unlabeled.title = "Stable consumption";
  assert.ok(builder.evidenceErrors(unlabeled, register).some(function (e) { return /\(synthetic\)/.test(e); }));
  var notSynthetic = clone(base);
  notSynthetic.evidence.origin = "OBSERVED";
  assert.ok(builder.evidenceErrors(notSynthetic, register).length > 0);
});

test("a wrong expected value blocks the whole build and writes nothing", function () {
  var tampered = clone(registry);
  tampered.cases[1].expected.depletion_interval_days.latest = 57;
  var outcome = builder.build({ registry: tampered });
  assert.strictEqual(outcome.ok, false);
  assert.deepStrictEqual(outcome.files, {});
  assert.ok(outcome.failures.some(function (f) { return /HRR-002: outputs.depletion_interval_days.latest expected 57/.test(f); }));
});

test("an engine that disagrees with the oracle cannot produce an approved record", function () {
  var drifting = Object.assign({}, engine, {
    buildScenarioRecord: function (items) {
      var record = engine.buildScenarioRecord(items);
      record.items[0].outputs.reorder_threshold_units += 0.01;
      return record;
    }
  });
  var outcome = builder.build({ engine: drifting });
  assert.strictEqual(outcome.ok, false);
  assert.deepStrictEqual(outcome.files, {});
  assert.strictEqual(outcome.failures.filter(function (f) { return /reorder_threshold_units/.test(f); }).length, 5);
});

test("version drift between registry, engine, and ontology blocks the build", function () {
  var stale = clone(registry);
  stale.engine_version = "v0.2";
  assert.ok(builder.build({ registry: stale }).failures.some(function (f) { return /targets engine v0.2/.test(f); }));
  var future = clone(ontology);
  future.version = "0.2";
  assert.ok(builder.build({ ontology: future }).failures.some(function (f) { return /targets ontology/.test(f); }));
});

test("the record schema rejects failed or unlabeled records", function () {
  var record = records[0];
  var failed = clone(record);
  failed.validation.outcome = "FAIL";
  failed.validation.checks_failed = 1;
  failed.validation.checks[0].result = "FAIL";
  var errors = validator.validate(schema, failed);
  assert.ok(errors.some(function (e) { return /outcome/.test(e); }));
  assert.ok(errors.some(function (e) { return /checks_failed/.test(e); }));
  var observed = clone(record);
  observed.evidence.origin = "OBSERVED";
  observed.case.title = "Stable consumption";
  assert.ok(validator.validate(schema, observed).length >= 2);
  var extra = clone(record);
  extra.valuation = 1;
  assert.ok(validator.validate(schema, extra).some(function (e) { return /unexpected property valuation/.test(e); }));
  assert.throws(function () { validator.validate({ oneOf: [] }, {}); }, /unsupported schema keyword oneOf/);
});

test("the oracle is independent of the engine under test", function () {
  var source = read("verification/oracle.js");
  assert.ok(!/require\([^)]*replenishment-engine/.test(source));
  assert.ok(!/HygieneRollReplenishment/.test(source));
  assert.ok(/BigInt|\d+n\b/.test(source));
});

test("the explorer page lists every case with its record, digest, and synthetic label", function () {
  records.forEach(function (record, index) {
    assert.ok(page.indexOf('id="' + record.case.slug + '"') !== -1, record.case.id);
    assert.ok(page.indexOf('href="' + record.case.id + '.json"') !== -1, record.case.id);
    assert.ok(page.indexOf(manifest.records[index].sha256) !== -1, record.case.id);
    assert.ok(page.indexOf(record.case.title) !== -1, record.case.id);
  });
  assert.strictEqual((page.match(/<span class="badge">Synthetic inputs<\/span>/g) || []).length, 5);
  assert.strictEqual((page.match(/<svg class="timeline"/g) || []).length, 5);
  assert.strictEqual((page.match(/<desc id="hrr-00\d-tl-desc">/g) || []).length, 5);
  assert.ok(!/<script(?![^>]*application\/ld\+json)/.test(page), "page must not need JavaScript");
});

console.log(passed + " passed");
