"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var engine = require("../assets/js/replenishment-engine.js");
var api = require("../assets/js/reference-scenario.js");

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

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

function deepFreeze(value) {
  if (value && typeof value === "object") {
    Object.freeze(value);
    Object.keys(value).forEach(function (key) { deepFreeze(value[key]); });
  }
  return value;
}

var manifest = JSON.parse(read("reference/cases/manifest.json"));
var IDS = ["HRR-001", "HRR-002", "HRR-003", "HRR-004", "HRR-005"];
var records = {};
IDS.forEach(function (id) { records[id] = JSON.parse(read("reference/cases/" + id + ".json")); });

function loaded(id) {
  var result = api.validateReferenceRecord(records[id], api.manifestEntry(manifest, id), engine);
  assert.ok(result.ok, id + " " + JSON.stringify(result.errors));
  return result.reference;
}

function scenario(inputs) {
  return engine.buildScenarioRecord([Object.assign({ name: "x" }, inputs)]);
}

// The published records and manifest as merged in PR #10. Sprint #11 must not change them.
var IMMUTABLE = {
  "reference/cases/manifest.json": "3b12719842622d0b1ab986bb025c4bf2c93668cf6f1c2975707a02c84e7811df",
  "reference/cases/registry.json": "88a43541a42e7b07322ae91b11d9928baad48289edf6487e9783a91d0ac1aff6",
  "reference/cases/HRR-001.json": "ce575c9d78129705842fa7b9ae8fa70f84614c1f805d6a9736a7cdd0f2c36e88",
  "reference/cases/HRR-002.json": "343b889d4bcbfeafe1b2f4eabdbd3cf976488b235d463879778b5c5b606698a3",
  "reference/cases/HRR-003.json": "3f8192f8ddbf0ee8b0340bc0641c329650776b1398f804bd4eef3dc2748f9f92",
  "reference/cases/HRR-004.json": "1a4b7c2013b7955287a29609d903cbee8c1f921c5158a1bede00b102a12a6fd0",
  "reference/cases/HRR-005.json": "d5d9afa3df7a75d0d26a39aa9647be352e2ddacb07d5b9a0d481e56fc7b33239",
  "reference/schema/reference-case-record.schema.json": "60a1bf8626717cb9b6caf133cf91bd4d8a76da3d394122b84fd29123433aab3f"
};

test("reference records, registry, manifest, and schema are byte-identical to PR #10", function () {
  Object.keys(IMMUTABLE).forEach(function (file) {
    var digest = crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
    assert.strictEqual(digest, IMMUTABLE[file], file);
  });
});

test("case links accept only a published-format identifier", function () {
  assert.deepStrictEqual(api.parseCaseFragment("#case=HRR-001"), { id: "HRR-001" });
  assert.deepStrictEqual(api.parseCaseFragment("#case=HRR-005"), { id: "HRR-005" });
  ["", "#", "#foo=bar", "#top", "#case=HRR-001&quantity=999", "#quantity=9&case=HRR-001", undefined, null, 42].forEach(function (hash) {
    assert.deepStrictEqual(api.parseCaseFragment(hash), { none: true }, String(hash));
  });
  ["#case=", "#case=HRR-1", "#case=HRR-0011", "#case=hrr-001", "#case=../../etc/passwd", "#case=HRR-001%3Cscript%3E", "#case=%E0%A4%A", "#case=HRR-001.json", "#case=javascript:alert(1)"].forEach(function (hash) {
    assert.ok(api.parseCaseFragment(hash).error, hash);
  });
  assert.strictEqual(api.caseFragment("HRR-002"), "#case=HRR-002");
  assert.throws(function () { api.caseFragment("../x"); });
});

test("manifest lookup finds each published case and nothing else", function () {
  IDS.forEach(function (id) { assert.strictEqual(api.manifestEntry(manifest, id).id, id); });
  assert.strictEqual(api.manifestEntry(manifest, "HRR-999"), null);
  assert.strictEqual(api.manifestEntry(null, "HRR-001"), null);
  assert.strictEqual(api.manifestEntry({ records: "x" }, "HRR-001"), null);
  var doubled = clone(manifest);
  doubled.records.push(doubled.records[0]);
  assert.strictEqual(api.manifestEntry(doubled, "HRR-001"), null, "an ambiguous manifest is refused");
});

test("all five published records validate and load their exact inputs without being changed", function () {
  IDS.forEach(function (id) {
    var frozen = deepFreeze(clone(records[id]));
    var result = api.validateReferenceRecord(frozen, api.manifestEntry(manifest, id), engine);
    assert.ok(result.ok, id + " " + JSON.stringify(result.errors));
    assert.deepStrictEqual(result.reference.inputs, records[id].inputs);
    assert.notStrictEqual(result.reference.inputs, frozen.inputs, "inputs are copied");
    assert.strictEqual(result.reference.sha256, api.manifestEntry(manifest, id).sha256);
    assert.strictEqual(result.reference.version, records[id].case.version);
    assert.strictEqual(result.reference.slug, records[id].case.slug);
  });
});

test("tampered or unexpected records are refused", function () {
  var entry = api.manifestEntry(manifest, "HRR-002");
  function refused(mutate, entryOverride) {
    var record = clone(records["HRR-002"]);
    mutate(record);
    var result = api.validateReferenceRecord(record, entryOverride || entry, engine);
    assert.strictEqual(result.ok, false);
    return result.errors.join(" ");
  }
  assert.ok(/does not match the requested case/.test(refused(function (r) { r.case.id = "HRR-003"; })));
  assert.ok(/version/.test(refused(function (r) { r.case.version = 2; })));
  assert.ok(/did not pass validation/.test(refused(function (r) { r.validation.outcome = "FAIL"; })));
  assert.ok(/synthetic/.test(refused(function (r) { r.evidence.origin = "OBSERVED"; })));
  assert.ok(/Unexpected input onload/.test(refused(function (r) { r.inputs.onload = "alert(1)"; })));
  assert.ok(/wrong type/.test(refused(function (r) { r.inputs.quantity = "3"; })));
  assert.ok(/quantity/.test(refused(function (r) { r.inputs.quantity = 0; })));
  assert.ok(/leadTimeDays/.test(refused(function (r) { r.inputs.leadTimeDays = -1; })));
  assert.ok(/no verified results/.test(refused(function (r) { delete r.results; })));
  assert.ok(/slug/.test(refused(function (r) { r.case.slug = "<b>x</b>"; })));
  assert.ok(/not listed as verified/.test(refused(function () {}, Object.assign({}, entry, { outcome: "FAIL" }))));
  assert.ok(/not listed as verified/.test(refused(function () {}, Object.assign({}, entry, { sha256: "nothex" }))));
  assert.strictEqual(api.validateReferenceRecord(null, entry, engine).ok, false);
});

test("an unchanged scenario reproduces the verified reference outputs exactly", function () {
  IDS.forEach(function (id) {
    var ref = loaded(id);
    var run = scenario(ref.inputs);
    assert.strictEqual(api.canonical(run.items[0].outputs), api.canonical(ref.outputs), id);
    var comparison = api.compare(ref, ref.inputs, run.items[0].outputs);
    assert.strictEqual(comparison.identical_inputs, true, id);
    assert.deepStrictEqual(comparison.changed_inputs, []);
    ["depletion_days", "planning_trigger_days", "replenishment_cadence_days"].forEach(function (key) {
      assert.deepStrictEqual(comparison[key].delta, { earliest: 0, latest: 0 }, id + " " + key);
    });
    assert.strictEqual(comparison.reorder_threshold_units.delta, 0);
    comparison.stockout_exposure.forEach(function (slip) { assert.deepStrictEqual(slip.delta_gap_days, { min: 0, max: 0 }); });
  });
});

test("changing the lead time of HRR-002 gives hand-checked differences", function () {
  var ref = loaded("HRR-002");
  var inputs = Object.assign({}, ref.inputs, { leadTimeDays: 9 });
  var comparison = api.compare(ref, inputs, scenario(inputs).items[0].outputs);
  assert.deepStrictEqual(comparison.changed_inputs, [{ field: "leadTimeDays", reference: 5, scenario: 9 }]);
  // Depletion does not depend on lead time: 33–56 days in both.
  assert.deepStrictEqual(comparison.depletion_days.delta, { earliest: 0, latest: 0 });
  // Trigger: 33 − 9 − 5 = 19 and 56 − 9 − 5 = 42, four days earlier at both ends.
  assert.deepStrictEqual(comparison.planning_trigger_days.scenario, { earliest: 19, latest: 42 });
  assert.deepStrictEqual(comparison.planning_trigger_days.delta, { earliest: -4, latest: -4 });
  // Lead-time demand 9 × 0.625 / 7 = 0.8036 → 0.81; reserve 0.45; threshold 1.26 (was 0.90).
  assert.strictEqual(comparison.reorder_threshold_units.scenario, 1.26);
  assert.strictEqual(comparison.reorder_threshold_units.delta, 0.36);
});

test("HRR-005 at 0% variability and a 28-day interval gives hand-checked differences", function () {
  var ref = loaded("HRR-005");
  var inputs = Object.assign({}, ref.inputs, { variabilityPercent: 0, intervalDays: 28 });
  var comparison = api.compare(ref, inputs, scenario(inputs).items[0].outputs);
  // 2 / 0.5 × 7 = 28 days; trigger 28 − 4 − 3 = 21.
  assert.deepStrictEqual(comparison.depletion_days.scenario, { earliest: 28, latest: 28 });
  assert.deepStrictEqual(comparison.depletion_days.delta, { earliest: 4, latest: -5 });
  assert.deepStrictEqual(comparison.planning_trigger_days.scenario, { earliest: 21, latest: 21 });
  assert.strictEqual(comparison.fixed_interval_fit.reference.fit, "LATER_THAN_WINDOW");
  assert.strictEqual(comparison.fixed_interval_fit.scenario.fit, "WITHIN_WINDOW");
  // 7 days late: ordered on day 21, lead 11, arrives day 32: 4 days without supply.
  var late = comparison.stockout_exposure[1];
  assert.deepStrictEqual(late.scenario.supply_gap_days, { min: 4, max: 4 });
  assert.deepStrictEqual(late.delta_gap_days, { min: 4, max: 0 });
});

test("not-applicable interval fit is explained on whichever side lacks an interval", function () {
  var ref1 = loaded("HRR-001");
  var withInterval = Object.assign({}, ref1.inputs, { intervalDays: 30 });
  var added = api.compare(ref1, withInterval, scenario(withInterval).items[0].outputs);
  assert.strictEqual(added.fixed_interval_fit.reference.applicable, false);
  assert.ok(/No fixed delivery interval/.test(added.fixed_interval_fit.reference.reason));
  assert.strictEqual(added.fixed_interval_fit.scenario.applicable, true);
  assert.strictEqual(added.fixed_interval_fit.scenario.fit, "LATER_THAN_WINDOW");
  var ref5 = loaded("HRR-005");
  var without = Object.assign({}, ref5.inputs, { intervalDays: "" });
  var removed = api.compare(ref5, without, scenario(without).items[0].outputs);
  assert.strictEqual(removed.fixed_interval_fit.reference.applicable, true);
  assert.strictEqual(removed.fixed_interval_fit.scenario.applicable, false);
  assert.deepStrictEqual(removed.changed_inputs, [{ field: "intervalDays", reference: 35, scenario: null }]);
});

test("the scenario export identifies its source and never claims to be a reference", function () {
  var ref = loaded("HRR-003");
  var inputs = Object.assign({}, ref.inputs, { bufferDays: 5 });
  var run = scenario(inputs);
  var comparison = api.compare(ref, inputs, run.items[0].outputs);
  var exported = api.buildScenarioExport(ref, inputs, run, comparison);
  assert.strictEqual(exported.record_type, "hygieneroll.reference-derived-scenario");
  assert.notStrictEqual(exported.record_type, records["HRR-003"].record_type);
  assert.strictEqual(exported.classification, "USER_SCENARIO");
  assert.strictEqual(exported.verified_reference, false);
  assert.deepStrictEqual(exported.source_reference, {
    id: "HRR-003",
    version: 1,
    record_url: "https://hygieneroll.com/reference/cases/HRR-003.json",
    manifest_url: "https://hygieneroll.com/reference/cases/manifest.json",
    sha256: api.manifestEntry(manifest, "HRR-003").sha256,
    engine_version: "v0.2.1"
  });
  assert.strictEqual(exported.engine_version, engine.version);
  assert.strictEqual(exported.methodology, "https://hygieneroll.com/CALCULATOR_METHODOLOGY.md");
  assert.strictEqual(exported.scenario_inputs.bufferDays, 5);
  assert.strictEqual(exported.reference_inputs.bufferDays, 2);
  assert.strictEqual(exported.epistemic_status.observed_evidence_used, false);
  assert.ok(!("validation" in exported), "no validation outcome is claimed");
  var text = api.canonical(exported);
  assert.strictEqual(text, api.canonical(api.buildScenarioExport(ref, inputs, scenario(inputs), api.compare(ref, inputs, scenario(inputs).items[0].outputs))), "deterministic");
  assert.strictEqual(api.canonical(JSON.parse(text)), text, "canonical");
  assert.ok(!/@|timestamp|password|token/i.test(text));
});

test("the calculator page loads only verified records and renders text safely", function () {
  var page = read("calculator.html");
  var engineAt = page.indexOf('src="assets/js/replenishment-engine.js"');
  var helperAt = page.indexOf('src="assets/js/reference-scenario.js"');
  var calcAt = page.indexOf('src="assets/js/replenishment-calculator.js"');
  assert.ok(engineAt !== -1 && helperAt > engineAt && calcAt > helperAt);
  assert.ok(/<div id="reference-banner" class="reference-banner glass" role="status" aria-live="polite" hidden><\/div>/.test(page));
  var script = read("assets/js/replenishment-calculator.js");
  assert.ok(!/innerHTML|insertAdjacentHTML|eval\(|new Function/.test(script), "no HTML or code injection paths");
  assert.ok(/fetchText\("reference\/cases\/manifest\.json"\)/.test(script));
  assert.ok(/fetchText\("reference\/cases\/" \+ entry\.id \+ "\.json"\)/.test(script), "the record path comes from the manifest entry");
  assert.ok(/digest !== entry\.sha256/.test(script), "the record is checked against the manifest fingerprint");
  assert.ok(!/localStorage|sessionStorage|document\.cookie/.test(script));
});

test("the explorer opens every case in the calculator", function () {
  var page = read("reference/cases/index.html");
  IDS.forEach(function (id) {
    assert.ok(page.indexOf('href="../../calculator.html#case=' + id + '"') !== -1, id);
  });
});

console.log(passed + " passed");
