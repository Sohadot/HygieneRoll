#!/usr/bin/env node
/*
 * Extended numerical audit: compares the replenishment engine with the exact-rational
 * oracle on every unique input of the deterministic sets in audit-sets.js.
 *
 *   node verification/audit-numerical.js              all sets
 *   node verification/audit-numerical.js --sets=B,C   chosen sets
 *   node verification/audit-numerical.js --json       machine-readable report
 *
 * Each unique input is compared with the exact oracle. A difference counts as a
 * documented precision limit only when the engine matches the oracle run with the
 * documented 2^-47 tolerance exactly. Exits 1 if any other difference is found. It is not part of the standard
 * test suite. The standard suite runs sets D and E on every test run.
 */
"use strict";

var path = require("path");
var sets = require("./audit-sets.js");

var SLIPS = [0, 0.3, 3, 7];

// Whole days, codes, booleans, and hundredths must match exactly; continuous values
// (rates, drift, arrival days) to 1e-12 relative.
function diffs(a, b, prefix, out) {
  out = out || [];
  if (typeof a === "number" && typeof b === "number") {
    var ok = Number.isInteger(a) && Number.isInteger(b) ? a === b : Math.abs(a - b) <= 1e-12 * Math.max(1, Math.abs(b));
    if (!ok) out.push(prefix + ": " + a + " vs " + b);
  } else if (a && typeof a === "object" && b && typeof b === "object") {
    Object.keys(a).concat(Object.keys(b)).filter(function (k, i, all) { return all.indexOf(k) === i; }).forEach(function (key) {
      diffs(a[key], b[key], prefix + "." + key, out);
    });
  } else if (a !== b) {
    out.push(prefix + ": " + JSON.stringify(a) + " vs " + JSON.stringify(b));
  }
  return out;
}

function runSet(id, options) {
  var settings = options || {};
  var engine = settings.engine || require(path.join(__dirname, "..", "assets", "js", "replenishment-engine.js"));
  var oracle = settings.oracle || require("./oracle.js");
  var started = Date.now();
  var listed = sets.SETS[id].generate();
  var seen = {};
  var unique = [];
  listed.forEach(function (item) {
    var key = sets.inputKey(item);
    if (!seen[key]) {
      seen[key] = true;
      unique.push(item);
    }
  });
  var subject = settings.limit ? unique.slice(0, settings.limit) : unique;
  var mismatches = 0;
  var withinLimit = 0;
  var examples = [];
  var limitExamples = [];
  subject.forEach(function (item) {
    var engineOut = engine.buildScenarioRecord([item], { slipDays: SLIPS }).items[0].outputs;
    var found = diffs(engineOut, oracle.deriveItem(item, SLIPS).outputs, "outputs");
    if (!found.length) return;
    // A difference from exact arithmetic is acceptable only when the engine matches the
    // documented tolerance rule exactly; anything else is a defect.
    var tolerant = diffs(engineOut, oracle.deriveItem(item, SLIPS, { tolerance: oracle.DOCUMENTED_TOLERANCE }).outputs, "outputs");
    if (!tolerant.length) {
      withinLimit += 1;
      if (limitExamples.length < 2) limitExamples.push({ input: item, differences_from_exact: found.slice(0, 3) });
      return;
    }
    mismatches += 1;
    if (examples.length < 3) examples.push({ input: item, differences: tolerant.slice(0, 4) });
  });
  return {
    set: id,
    name: sets.SETS[id].name,
    in_standard_suite: sets.SETS[id].standard,
    listed: listed.length,
    unique: unique.length,
    duplicates: listed.length - unique.length,
    compared: subject.length,
    exact_matches: subject.length - mismatches - withinLimit,
    documented_precision_limit: withinLimit,
    mismatches: mismatches,
    examples: examples,
    limit_examples: limitExamples,
    keys: Object.keys(seen),
    milliseconds: Date.now() - started
  };
}

function audit(options) {
  var settings = options || {};
  var ids = settings.sets || Object.keys(sets.SETS);
  var reports = ids.map(function (id) { return runSet(id, settings); });
  var union = {};
  reports.forEach(function (report) { report.keys.forEach(function (key) { union[key] = true; }); });
  var overlaps = [];
  for (var i = 0; i < reports.length; i += 1) {
    for (var j = i + 1; j < reports.length; j += 1) {
      var mine = {};
      reports[i].keys.forEach(function (key) { mine[key] = true; });
      var shared = reports[j].keys.filter(function (key) { return mine[key]; }).length;
      if (shared) overlaps.push({ sets: reports[i].set + "∩" + reports[j].set, shared: shared });
    }
  }
  return {
    engine_version: (settings.engine || require(path.join(__dirname, "..", "assets", "js", "replenishment-engine.js"))).version,
    oracle_version: (settings.oracle || require("./oracle.js")).version,
    slip_offsets_days: SLIPS,
    sets: reports.map(function (report) {
      var copy = Object.assign({}, report);
      delete copy.keys;
      return copy;
    }),
    overlaps: overlaps,
    listed_total: reports.reduce(function (sum, r) { return sum + r.listed; }, 0),
    unique_total: Object.keys(union).length,
    compared_total: reports.reduce(function (sum, r) { return sum + r.compared; }, 0),
    documented_precision_limit_total: reports.reduce(function (sum, r) { return sum + r.documented_precision_limit; }, 0),
    mismatches_total: reports.reduce(function (sum, r) { return sum + r.mismatches; }, 0)
  };
}

function main() {
  var args = process.argv.slice(2);
  var setArg = args.filter(function (a) { return a.indexOf("--sets=") === 0; })[0];
  var ids = setArg ? setArg.slice(7).split(",") : undefined;
  (ids || []).forEach(function (id) {
    if (!sets.SETS[id]) {
      console.error("Unknown set " + id + ". Known sets: " + Object.keys(sets.SETS).join(", "));
      process.exit(2);
    }
  });
  var report = audit({ sets: ids });
  if (args.indexOf("--json") !== -1) {
    console.log(JSON.stringify(report, null, 2));
  } else {
    console.log("HygieneRoll numerical audit: engine " + report.engine_version + " against oracle " + report.oracle_version);
    report.sets.forEach(function (r) {
      console.log("  " + r.set + " " + r.name.padEnd(26) + " listed " + String(r.listed).padStart(6) + "  unique " + String(r.unique).padStart(6) + "  duplicates " + String(r.duplicates).padStart(5) + "  exact " + String(r.exact_matches).padStart(6) + "  at limit " + r.documented_precision_limit + "  mismatches " + r.mismatches + "  " + r.milliseconds + " ms" + (r.in_standard_suite ? "  (also in the standard suite)" : ""));
      r.examples.forEach(function (e) { console.log("      MISMATCH " + JSON.stringify(e)); });
      r.limit_examples.forEach(function (e) { console.log("      at documented limit: " + JSON.stringify(e.input) + " " + e.differences_from_exact[0]); });
    });
    report.overlaps.forEach(function (o) { console.log("  overlap " + o.sets + ": " + o.shared + " inputs"); });
    console.log("  total listed " + report.listed_total + ", unique across sets " + report.unique_total + ", at documented precision limit " + report.documented_precision_limit_total + ", mismatches " + report.mismatches_total);
  }
  process.exit(report.mismatches_total ? 1 : 0);
}

if (require.main === module) main();

module.exports = { audit: audit, runSet: runSet, diffs: diffs };
