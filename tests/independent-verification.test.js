"use strict";

/*
 * Independent verification of the replenishment engine.
 *
 * Expected values here come from hand arithmetic or from verification/oracle.js, which
 * recomputes the methodology in exact fractions without using the engine. Nothing is
 * derived from the engine under test.
 */

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var crypto = require("crypto");
var engine = require("../assets/js/replenishment-engine.js");
var oracle = require("../verification/oracle.js");
var engineV01 = require("../verification/baselines/replenishment-engine-v0.1.js");
var engineV02 = require("../verification/baselines/replenishment-engine-v0.2.js");

var root = path.join(__dirname, "..");
var passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log("ok - " + name);
}

function input(overrides) {
  return Object.assign({
    name: "Fixture item",
    unit: "rolls",
    unitKind: "preset",
    quantity: 6,
    usageMode: "weekly",
    weeklyUsage: 2,
    durationWeeks: null,
    leadTimeDays: 4,
    bufferDays: 3,
    variabilityPercent: 0,
    replenishmentQuantity: "",
    intervalDays: ""
  }, overrides);
}

function outputs(item, slipDays) {
  return engine.buildScenarioRecord([item], slipDays ? { slipDays: slipDays } : undefined).items[0].outputs;
}

// Continuous values are compared after rounding to 9 decimals; everything else exactly.
function normalized(value) {
  return JSON.stringify(value, function (key, v) { return typeof v === "number" ? Number(v.toFixed(9)) : v; });
}

function grid() {
  var cases = [];
  var quantities = [0.3, 0.5, 1, 1.1, 1.4, 2.2, 3, 4.9, 6, 12, 13.3];
  var rates = [0.1, 0.3, 0.7, 1, 1.1, 2, 3.5, 7.7];
  var variability = [0, 5, 10, 15, 25, 33, 45, 50];
  var leads = [0, 0.3, 0.7, 2.5, 4, 12];
  var buffers = [0, 0.2, 0.3, 3, 7];
  var intervals = ["", 0.5, 14, 21.1, 30];
  var n = 0;
  ["weekly", "duration"].forEach(function (mode) {
    quantities.forEach(function (q) {
      rates.forEach(function (r) {
        variability.forEach(function (v) {
          leads.forEach(function (l) {
            buffers.forEach(function (b) {
              n += 1;
              cases.push(input({
                quantity: q,
                usageMode: mode,
                weeklyUsage: mode === "weekly" ? r : null,
                durationWeeks: mode === "duration" ? r : null,
                variabilityPercent: v,
                leadTimeDays: l,
                bufferDays: b,
                replenishmentQuantity: n % 3 === 0 ? "" : (n % 3 === 1 ? 1.1 : 4),
                intervalDays: intervals[n % intervals.length]
              }));
            });
          });
        });
      });
    });
  });
  return cases;
}

var GRID = grid();

function assertThrowsField(fn, field) {
  var thrown = null;
  try { fn(); } catch (error) { thrown = error; }
  assert.ok(thrown, "expected a validation error for " + field);
  assert.strictEqual(thrown.name, "ValidationError");
  assert.ok(thrown.errors.some(function (e) { return e.field === field; }), field);
}

test("oracle reproduces hand-computed values exactly", function () {
  var a = oracle.deriveItem(input()).outputs;
  assert.deepStrictEqual(a.depletion_interval_days, { earliest: 21, latest: 21 });
  assert.deepStrictEqual(a.planning_trigger_days, { earliest: 14, latest: 14 });
  assert.strictEqual(a.lead_time_demand_units, 1.15);
  assert.strictEqual(a.reserve_stock_units, 0.86);
  var exact = oracle.deriveItem(input({ quantity: 1.1, weeklyUsage: 0.7, variabilityPercent: 50, leadTimeDays: 0, bufferDays: 0 })).outputs;
  assert.deepStrictEqual(exact.depletion_interval_days, { earliest: 7, latest: 22 }, "1.1 / 0.35 × 7 is exactly 22");
  assert.deepStrictEqual(oracle.fromDecimal(0.1), { n: 1n, d: 10n });
});

test("engine agrees with the exact-arithmetic oracle across " + GRID.length + " grid inputs", function () {
  var mismatches = [];
  GRID.forEach(function (item) {
    var e = normalized(outputs(item, [0, 0.3, 3, 7]));
    var o = normalized(oracle.deriveItem(item, [0, 0.3, 3, 7]).outputs);
    if (e !== o && mismatches.length < 5) mismatches.push({ input: item, engine: JSON.parse(e), oracle: JSON.parse(o) });
  });
  assert.deepStrictEqual(mismatches, []);
});

test("household summary agrees with the oracle for multi-item scenarios", function () {
  for (var i = 0; i + 3 <= 300; i += 3) {
    var items = GRID.slice(i * 7, i * 7 + 3).map(function (item, k) { return Object.assign({}, item, { name: "Item " + k }); });
    var e = engine.buildScenarioRecord(items).household;
    var o = oracle.deriveHousehold(items).household;
    assert.deepStrictEqual(e, o, "items " + i);
  }
});

test("boundary conditions follow the methodology", function () {
  // Half-day tie rounds up when variability is 0: 1 / 2 × 7 = 3.5 → 4.
  assert.deepStrictEqual(outputs(input({ quantity: 1, weeklyUsage: 2, leadTimeDays: 0, bufferDays: 0 })).depletion_interval_days, { earliest: 4, latest: 4 });
  // A fractional single-day trigger also rounds half up: 21 − 3.5 = 17.5 → 18.
  assert.deepStrictEqual(outputs(input({ leadTimeDays: 3.5, bufferDays: 0 })).planning_trigger_days, { earliest: 18, latest: 18 });
  // Decimal lead time and buffer that sum to a whole day: 21 − 0.7 − 0.3 = 20, not 19 or 21.
  assert.deepStrictEqual(outputs(input({ leadTimeDays: 0.7, bufferDays: 0.3, variabilityPercent: 10 })).planning_trigger_days, { earliest: 18, latest: 23 });
  // The documented regression: 1.1 / 0.35 × 7 = 22 exactly, so the ceiling stays 22.
  assert.strictEqual(outputs(input({ quantity: 1.1, weeklyUsage: 0.7, variabilityPercent: 50 })).depletion_interval_days.latest, 22);
  // Variability at the 50% limit halves the slow rate without reaching zero.
  assert.deepStrictEqual(outputs(input({ variabilityPercent: 50, leadTimeDays: 0, bufferDays: 0 })).depletion_interval_days, { earliest: 14, latest: 42 });
  // Triggers clamp at zero and a clamped earliest end never passes the latest.
  assert.deepStrictEqual(outputs(input({ leadTimeDays: 30, bufferDays: 0 })).planning_trigger_days, { earliest: 0, latest: 0 });
  // Interval exactly at either cadence end is within the window; half a day outside is not.
  var ranged = input({ variabilityPercent: 20 });
  assert.strictEqual(outputs(Object.assign({}, ranged, { intervalDays: 17 })).fixed_interval_fit.fit, "WITHIN_WINDOW");
  assert.strictEqual(outputs(Object.assign({}, ranged, { intervalDays: 27 })).fixed_interval_fit.fit, "WITHIN_WINDOW");
  assert.strictEqual(outputs(Object.assign({}, ranged, { intervalDays: 16.5 })).fixed_interval_fit.fit, "EARLIER_THAN_WINDOW");
  assert.strictEqual(outputs(Object.assign({}, ranged, { intervalDays: 27.5 })).fixed_interval_fit.fit, "LATER_THAN_WINDOW");
  // Arrival exactly at depletion leaves no gap; exactly at depletion − buffer keeps the buffer intact.
  var item = engine.calculateItem(input());
  assert.deepStrictEqual(engine.stockoutExposure(item, 17).gapDays, { min: 0, max: 0 });
  assert.strictEqual(engine.stockoutExposure(item, 14).status, "BUFFER_INTACT");
  assert.strictEqual(engine.stockoutExposure(item, 14.1).status, "BUFFER_DRAWN");
  assert.strictEqual(engine.stockoutExposure(item, 4.7, 13.3).status, "BUFFER_INTACT", "4.7 + 13.3 = 18 = 21 − 3 exactly");
});

test("results are dimensionally consistent", function () {
  GRID.filter(function (_, i) { return i % 37 === 0; }).forEach(function (item) {
    var base = outputs(item);
    [0.5, 2, 10].forEach(function (k) {
      var scaled = Object.assign({}, item, {
        quantity: item.quantity * k,
        weeklyUsage: item.weeklyUsage === null ? null : item.weeklyUsage * k,
        replenishmentQuantity: item.replenishmentQuantity === "" ? "" : item.replenishmentQuantity * k
      });
      var s = outputs(scaled);
      // Days are units ÷ (units per week) × 7: scaling every unit leaves every day unchanged.
      assert.deepStrictEqual(s.depletion_interval_days, base.depletion_interval_days);
      assert.deepStrictEqual(s.planning_trigger_days, base.planning_trigger_days);
      assert.deepStrictEqual(s.replenishment_cadence_days, base.replenishment_cadence_days);
      // Units scale with k, within one rounding step of 0.01 on each side.
      assert.ok(Math.abs(s.lead_time_demand_units - k * base.lead_time_demand_units) <= 0.01 * (k + 1) + 1e-9);
      assert.ok(Math.abs(s.reserve_stock_units - k * base.reserve_stock_units) <= 0.01 * (k + 1) + 1e-9);
    });
  });
  // Labels and categories are not quantities.
  var plain = outputs(input());
  assert.deepStrictEqual(outputs(input({ unit: "boxes", unitKind: "custom", category: "OTHER", name: "Other" })), plain);
  // The duration method is the weekly method with r = q / duration.
  assert.deepStrictEqual(outputs(input({ usageMode: "duration", weeklyUsage: null, durationWeeks: 3 })), plain);
});

test("rounding never publishes fractional days and never understates units", function () {
  GRID.forEach(function (item) {
    var e = outputs(item);
    [e.depletion_interval_days, e.planning_trigger_days, e.replenishment_cadence_days].forEach(function (w) {
      assert.ok(Number.isInteger(w.earliest) && Number.isInteger(w.latest) && w.earliest <= w.latest && w.earliest >= 0);
    });
    var exact = oracle.deriveItem(item).exact;
    var leadExact = Number(oracle.fromDecimal(item.leadTimeDays).n) / Number(oracle.fromDecimal(item.leadTimeDays).d) * (Number(exact.fast.n) / Number(exact.fast.d)) / 7;
    assert.ok(e.lead_time_demand_units + 1e-9 >= leadExact && e.lead_time_demand_units < leadExact + 0.01 + 1e-9);
    assert.strictEqual(Math.round(e.reorder_threshold_units * 100), Math.round((e.lead_time_demand_units + e.reserve_stock_units) * 100));
  });
});

test("invalid inputs fail safely in the engine and the oracle", function () {
  var bad = [
    ["quantity", { quantity: 0 }], ["quantity", { quantity: -1 }], ["quantity", { quantity: NaN }], ["quantity", { quantity: Infinity }], ["quantity", { quantity: "6" }],
    ["weeklyUsage", { weeklyUsage: 0 }], ["weeklyUsage", { weeklyUsage: -2 }], ["weeklyUsage", { weeklyUsage: null }],
    ["durationWeeks", { usageMode: "duration", durationWeeks: 0 }],
    ["usageMode", { usageMode: "monthly" }],
    ["leadTimeDays", { leadTimeDays: -1 }], ["leadTimeDays", { leadTimeDays: NaN }],
    ["bufferDays", { bufferDays: -0.5 }],
    ["variabilityPercent", { variabilityPercent: 50.5 }], ["variabilityPercent", { variabilityPercent: -1 }],
    ["replenishmentQuantity", { replenishmentQuantity: 0 }],
    ["intervalDays", { intervalDays: 0 }], ["intervalDays", { intervalDays: -7 }],
    ["category", { category: "TISSUE" }],
    ["name", { name: "  " }]
  ];
  bad.forEach(function (row) {
    assertThrowsField(function () { engine.calculateItem(input(row[1])); }, row[0]);
    assertThrowsField(function () { engine.buildScenarioRecord([input(row[1])]); }, row[0]);
  });
  ["quantity", "weeklyUsage", "leadTimeDays", "bufferDays", "variabilityPercent"].forEach(function (field) {
    var overrides = {};
    overrides[field] = field === "variabilityPercent" ? 60 : -1;
    assert.throws(function () { oracle.deriveItem(input(overrides)); }, field);
  });
  assertThrowsField(function () { engine.buildScenarioRecord([]); }, "items");
});

test("repeated runs return byte-identical records with no time or random fields", function () {
  var items = GRID.slice(0, 4).map(function (item, k) { return Object.assign({}, item, { name: "Item " + k }); });
  var first = JSON.stringify(engine.buildScenarioRecord(items));
  for (var i = 0; i < 100; i += 1) assert.strictEqual(JSON.stringify(engine.buildScenarioRecord(items)), first);
  var keys = [];
  JSON.parse(first, function (key, value) { keys.push(key); return value; });
  assert.ok(!keys.some(function (key) { return /^(timestamp|generated_at|created_at|updated_at|date|uuid|nonce|random)$/i.test(key); }));
});

test("the scenario record keeps the v0.2 field contract", function () {
  function shape(value) {
    if (Array.isArray(value)) return value.length ? [shape(value[0])] : [];
    if (value && typeof value === "object") {
      var out = {};
      Object.keys(value).sort().forEach(function (key) { out[key] = shape(value[key]); });
      return out;
    }
    return value === null ? "null" : typeof value;
  }
  var item = input({ intervalDays: 21, category: "PAPER_HYGIENE" });
  var current = engine.buildScenarioRecord([item]);
  var baseline = engineV02.buildScenarioRecord([item]);
  assert.deepStrictEqual(shape(current), shape(baseline));
  assert.strictEqual(current.engine_version, "v0.2.1");
  assert.strictEqual(baseline.engine_version, "v0.2");
});

test("frozen baselines are the exact v0.1 and v0.2 engines", function () {
  function digest(file) { return crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex"); }
  assert.strictEqual(digest("verification/baselines/replenishment-engine-v0.1.js"), "6836d617405aeb1347efa7fe366db71f450ad8003efd1f14713bca5eb67672ca");
  assert.strictEqual(digest("verification/baselines/replenishment-engine-v0.2.js"), "616283b0cdca2f877fdcbe10d4912db1c0cf0852a3e38dc31ee44544ca306d75");
  assert.strictEqual(engineV01.version, "v0.1");
  assert.strictEqual(engineV02.version, "v0.2");
});

test("v0.1 and v0.2 behavior is preserved except for corrections toward the oracle", function () {
  var V01_FIELDS = ["depletion", "trigger", "cadence", "weeklyUsage", "slowUsage", "fastUsage", "replenishmentQuantity", "text"];
  var unchanged = 0;
  var corrected = 0;
  GRID.forEach(function (item) {
    var o = oracle.deriveItem(item).outputs;
    var current = engine.calculateItem(item);
    var old = engineV01.calculateItem(item);
    var same = V01_FIELDS.every(function (f) { return JSON.stringify(current[f]) === JSON.stringify(old[f]); });
    if (same) {
      unchanged += 1;
      return;
    }
    corrected += 1;
    var currentWindows = { d: [current.depletion.earliest, current.depletion.latest], t: [current.trigger.earliest, current.trigger.latest], c: [current.cadence.earliest, current.cadence.latest] };
    var oracleWindows = { d: [o.depletion_interval_days.earliest, o.depletion_interval_days.latest], t: [o.planning_trigger_days.earliest, o.planning_trigger_days.latest], c: [o.replenishment_cadence_days.earliest, o.replenishment_cadence_days.latest] };
    var oldWindows = { d: [old.depletion.earliest, old.depletion.latest], t: [old.trigger.earliest, old.trigger.latest], c: [old.cadence.earliest, old.cadence.latest] };
    assert.deepStrictEqual(currentWindows, oracleWindows, "a changed v0.1 result must match the oracle");
    assert.notDeepStrictEqual(oldWindows, oracleWindows, "only results v0.1 got wrong may change");
  });
  assert.ok(unchanged > corrected * 10, "most results are unchanged");
  assert.ok(corrected > 0, "the grid includes the documented binary-noise cases");

  var v02Changed = 0;
  GRID.forEach(function (item) {
    var current = engine.buildScenarioRecord([item]).items[0].outputs;
    var old = engineV02.buildScenarioRecord([item]).items[0].outputs;
    if (normalized(current) === normalized(old)) return;
    v02Changed += 1;
    assert.strictEqual(normalized(current), normalized(oracle.deriveItem(item).outputs), "a changed v0.2 result must match the oracle");
  });
  assert.ok(v02Changed > 0);
});

console.log(passed + " passed");
