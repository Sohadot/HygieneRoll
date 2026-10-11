"use strict";

/*
 * Checks the extended numerical audit tool without running it in full. The full audit
 * is run separately with: node verification/audit-numerical.js
 */

var assert = require("assert");
var crypto = require("crypto");
var path = require("path");
var childProcess = require("child_process");
var sets = require("../verification/audit-sets.js");
var audit = require("../verification/audit-numerical.js");
var engine = require("../assets/js/replenishment-engine.js");
var oracle = require("../verification/oracle.js");

var root = path.join(__dirname, "..");
var passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log("ok - " + name);
}

function keyDigest(list) {
  return crypto.createHash("sha256").update(list.map(sets.inputKey).join("\n")).digest("hex");
}

var PINNED = {
  A: { listed: 69120, unique: 69120, digest: "1d453ed33b3623cc3359ab8408f3d6a7b7c1ed58bf6ea296bb638e9a4a9e4d9c" },
  B: { listed: 35280, unique: 35280, digest: "d35495779f76bd35fac2b6bed8841ca30db7facd2787fb0a7fc23e2e13cde3dc" },
  C: { listed: 25920, unique: 24720, digest: "a6adae8be2a33f76db96a3d0ec055b28832e9f763a0bd71894c4ba896b337f2f" },
  D: { listed: 42240, unique: 42240, digest: "4901a31339bc2f2f120b1db5b3a0e567197fad15cfcd22db625d0033fc3a7b03" },
  E: { listed: 2880, unique: 2880, digest: "e012985dc45631624df7aca39244684064771a3d78b43f7912e8d6f67c44fe04" },
  U: { listed: 504, unique: 504, digest: "1f2d2362e46dd690ff682078722c9a3746b33f5d79046c461a1681658be47912" }
};

test("every audit set is deterministic and matches its pinned size and fingerprint", function () {
  assert.deepStrictEqual(Object.keys(sets.SETS), Object.keys(PINNED));
  Object.keys(PINNED).forEach(function (id) {
    var first = sets.SETS[id].generate();
    var second = sets.SETS[id].generate();
    assert.strictEqual(keyDigest(first), keyDigest(second), id);
    assert.strictEqual(first.length, PINNED[id].listed, id + " listed");
    assert.strictEqual(new Set(first.map(sets.inputKey)).size, PINNED[id].unique, id + " unique");
    assert.strictEqual(keyDigest(first), PINNED[id].digest, id + " fingerprint");
  });
});

test("the standard suite and the audit share the same D and E inputs", function () {
  assert.strictEqual(sets.SETS.D.standard, true);
  assert.strictEqual(sets.SETS.E.standard, true);
  ["A", "B", "C", "U"].forEach(function (id) { assert.strictEqual(sets.SETS[id].standard, false, id); });
  assert.strictEqual(keyDigest(sets.standardGrid()), PINNED.D.digest);
  assert.strictEqual(keyDigest(sets.nearBoundaryStandard()), PINNED.E.digest);
});

test("overlaps between sets are what the audit reports", function () {
  function keys(id) { return new Set(sets.SETS[id].generate().map(sets.inputKey)); }
  var b = keys("B");
  var d = keys("D");
  var c = keys("C");
  var e = keys("E");
  assert.strictEqual(Array.from(b).filter(function (k) { return d.has(k); }).length, 160);
  assert.strictEqual(Array.from(e).filter(function (k) { return c.has(k); }).length, 2880, "E is inside C");
});

test("a sample of every set matches the oracle", function () {
  Object.keys(PINNED).forEach(function (id) {
    var report = audit.runSet(id, { limit: 150 });
    assert.strictEqual(report.compared, 150, id);
    assert.strictEqual(report.mismatches, 0, id + " " + JSON.stringify(report.examples));
  });
});

test("unit-rounding set: tiny demand rounds up, and limit cases follow the documented rule exactly", function () {
  var report = audit.runSet("U");
  assert.strictEqual(report.mismatches, 0, JSON.stringify(report.examples));
  assert.strictEqual(report.documented_precision_limit, 8);
  assert.strictEqual(report.exact_matches, 496);
  sets.SETS.U.generate().forEach(function (item) {
    var out = engine.calculateItem(item).reorder;
    var exact = oracle.deriveItem(item).outputs;
    // Unit rounding never hits the limit: every unit value equals exact arithmetic.
    assert.strictEqual(out.leadTimeDemandUnits, exact.lead_time_demand_units, JSON.stringify(item));
    assert.strictEqual(out.reserveUnits, exact.reserve_stock_units, JSON.stringify(item));
    if (item.leadTimeDays > 0) assert.ok(out.leadTimeDemandUnits >= 0.01, "positive lead time never rounds to zero units");
  });
});

test("the audit reports a defective engine as mismatches, not as a precision limit", function () {
  var broken = Object.assign({}, engine, {
    buildScenarioRecord: function (items, options) {
      var record = engine.buildScenarioRecord(items, options);
      record.items[0].outputs.depletion_interval_days.latest += 1;
      return record;
    }
  });
  var report = audit.runSet("D", { engine: broken, limit: 40 });
  assert.strictEqual(report.mismatches, 40);
  assert.strictEqual(report.documented_precision_limit, 0);
  // An exact-arithmetic engine would differ from the documented rule in the limit cases.
  var exactEngine = Object.assign({}, engine, {
    buildScenarioRecord: function (items, options) {
      var record = engine.buildScenarioRecord(items, options);
      record.items[0].outputs = oracle.deriveItem(items[0], options.slipDays).outputs;
      return record;
    }
  });
  var limitReport = audit.runSet("U", { engine: exactEngine });
  assert.strictEqual(limitReport.documented_precision_limit, 0);
  assert.strictEqual(limitReport.mismatches, 0, "exact results always pass");
});

test("the command line rejects unknown sets and reports results", function () {
  var bad = childProcess.spawnSync(process.execPath, ["verification/audit-numerical.js", "--sets=Z"], { cwd: root, encoding: "utf8" });
  assert.strictEqual(bad.status, 2);
  assert.ok(/Unknown set Z/.test(bad.stderr));
  var good = childProcess.spawnSync(process.execPath, ["verification/audit-numerical.js", "--sets=E,U", "--json"], { cwd: root, encoding: "utf8" });
  assert.strictEqual(good.status, 0, good.stderr);
  var report = JSON.parse(good.stdout);
  assert.strictEqual(report.engine_version, engine.version);
  assert.strictEqual(report.listed_total, 2880 + 504);
  assert.strictEqual(report.mismatches_total, 0);
  assert.strictEqual(report.documented_precision_limit_total, 8);
});

console.log(passed + " passed");
