"use strict";

var assert = require("assert");
var engine = require("../assets/js/replenishment-engine.js");

var passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log("ok - " + name);
}

function item(overrides) {
  return Object.assign({
    name: "Paper rolls",
    unit: "rolls",
    quantity: 6,
    usageMode: "weekly",
    weeklyUsage: 2,
    leadTimeDays: 4,
    bufferDays: 3,
    variabilityPercent: 0
  }, overrides);
}

function assertThrows(fn, field) {
  var thrown = null;
  try {
    fn();
  } catch (error) {
    thrown = error;
  }
  assert.ok(thrown, "expected a validation error");
  assert.strictEqual(thrown.name, "ValidationError");
  assert.ok(thrown.errors.some(function (error) { return error.field === field; }));
}

test("weekly-rate normalization", function () {
  var usage = engine.normalizeUsage(item());
  assert.strictEqual(usage.weeklyUsage, 2);
});

test("duration-mode normalization", function () {
  var usage = engine.normalizeUsage(item({
    usageMode: "duration",
    quantity: 4,
    durationWeeks: 8,
    weeklyUsage: null
  }));
  assert.strictEqual(usage.weeklyUsage, 0.5);
});

test("zero variability produces a single rounded day", function () {
  var result = engine.calculateItem(item());
  assert.deepStrictEqual(result.depletion, { earliest: 21, latest: 21, single: true });
  assert.strictEqual(result.text.depletion, "21 days");
  assert.strictEqual(result.text.depletionWeeks, "about 3 weeks");
  assert.strictEqual(result.fastUsage, result.slowUsage);
});

test("nonzero variability widens the window", function () {
  var result = engine.calculateItem(item({ variabilityPercent: 20 }));
  assert.strictEqual(result.fastUsage, 2.4);
  assert.strictEqual(result.slowUsage, 1.6);
  assert.deepStrictEqual(result.depletion, { earliest: 17, latest: 27, single: false });
  assert.strictEqual(result.text.depletion, "17–27 days");
});

test("lead time is subtracted from depletion", function () {
  var result = engine.calculateItem(item({ bufferDays: 0 }));
  assert.strictEqual(result.trigger.earliest, 17);
  assert.strictEqual(result.trigger.latest, 17);
});

test("safety buffer is subtracted from depletion", function () {
  var result = engine.calculateItem(item({ leadTimeDays: 0 }));
  assert.strictEqual(result.trigger.earliest, 18);
  assert.strictEqual(result.trigger.latest, 18);
});

test("scenario A depletion and trigger", function () {
  var result = engine.calculateItem(item());
  assert.strictEqual(result.text.depletion, "21 days");
  assert.strictEqual(result.text.trigger, "14 days");
  assert.strictEqual(result.text.triggerWeeks, "about 2 weeks");
});

test("scenario B variability window and trigger", function () {
  var result = engine.calculateItem(item({ variabilityPercent: 20 }));
  assert.strictEqual(result.text.depletion, "17–27 days");
  assert.strictEqual(result.text.trigger, "10–20 days");
  assert.strictEqual(result.text.depletionWeeks, "about 2½–4 weeks");
  assert.strictEqual(result.text.triggerWeeks, "about 1½–3 weeks");
});

test("trigger clamps at zero", function () {
  var result = engine.calculateItem(item({
    quantity: 1,
    weeklyUsage: 1,
    leadTimeDays: 5,
    bufferDays: 4
  }));
  assert.strictEqual(result.depletion.earliest, 7);
  assert.strictEqual(result.trigger.earliest, 0);
  assert.strictEqual(result.trigger.latest, 0);
  assert.strictEqual(result.text.trigger, "Now");
  assert.strictEqual(result.text.triggerNote, "Within the current lead-time and buffer window.");
});

test("partial trigger window starts at Now", function () {
  var result = engine.calculateItem(item({
    variabilityPercent: 20,
    leadTimeDays: 17,
    bufferDays: 0
  }));
  assert.strictEqual(result.text.trigger, "Now–10 days");
});

test("blank replenishment quantity defaults to current quantity", function () {
  var result = engine.calculateItem(item());
  assert.strictEqual(result.replenishmentDefaulted, true);
  assert.strictEqual(result.replenishmentQuantity, 6);
  assert.strictEqual(result.cadence.earliest, 21);
  assert.strictEqual(result.text.cadence, "every 21 days");
});

test("custom replenishment quantity changes cadence", function () {
  var result = engine.calculateItem(item({ replenishmentQuantity: 4 }));
  assert.strictEqual(result.replenishmentDefaulted, false);
  assert.strictEqual(result.cadence.earliest, 14);
  assert.strictEqual(result.text.cadence, "every 14 days");
  assert.strictEqual(result.text.cadenceWeeks, "about 2 weeks");
});

test("duration mode depletion uses normalized weekly usage", function () {
  var result = engine.calculateItem(item({
    usageMode: "duration",
    quantity: 4,
    durationWeeks: 8,
    weeklyUsage: null,
    leadTimeDays: 0,
    bufferDays: 0
  }));
  assert.strictEqual(result.weeklyUsage, 0.5);
  assert.strictEqual(result.depletion.earliest, 56);
  assert.strictEqual(result.trigger.earliest, 56);
  assert.strictEqual(result.cadence.earliest, 56);
});

test("fractional stock and fractional usage stay exact", function () {
  var result = engine.calculateItem(item({
    quantity: 1.5,
    weeklyUsage: 0.5,
    leadTimeDays: 0,
    bufferDays: 0
  }));
  assert.strictEqual(result.depletion.earliest, 21);
});

test("50 percent variability does not divide by zero", function () {
  var result = engine.calculateItem(item({ variabilityPercent: 50, leadTimeDays: 0, bufferDays: 0 }));
  assert.strictEqual(result.fastUsage, 3);
  assert.strictEqual(result.slowUsage, 1);
  assert.strictEqual(result.depletion.earliest, 14);
  assert.strictEqual(result.depletion.latest, 42);
});

test("invalid quantity is rejected", function () {
  assertThrows(function () { engine.calculateItem(item({ quantity: 0 })); }, "quantity");
  assertThrows(function () { engine.calculateItem(item({ quantity: -2 })); }, "quantity");
});

test("invalid usage is rejected", function () {
  assertThrows(function () { engine.calculateItem(item({ weeklyUsage: 0 })); }, "weeklyUsage");
  assertThrows(function () { engine.calculateItem(item({ weeklyUsage: -1 })); }, "weeklyUsage");
  assertThrows(function () {
    engine.calculateItem(item({ usageMode: "duration", durationWeeks: 0, weeklyUsage: null }));
  }, "durationWeeks");
});

test("variability above 50 is rejected", function () {
  assertThrows(function () { engine.calculateItem(item({ variabilityPercent: 51 })); }, "variabilityPercent");
  assertThrows(function () { engine.calculateItem(item({ variabilityPercent: -1 })); }, "variabilityPercent");
});

test("negative lead time is rejected", function () {
  assertThrows(function () { engine.calculateItem(item({ leadTimeDays: -1 })); }, "leadTimeDays");
});

test("empty custom name and nonpositive replenishment quantity are rejected", function () {
  assertThrows(function () { engine.calculateItem(item({ name: "   " })); }, "name");
  assertThrows(function () { engine.calculateItem(item({ replenishmentQuantity: 0 })); }, "replenishmentQuantity");
});

test("household summary selects the soonest trigger and does not average", function () {
  var summary = engine.calculateHousehold([
    item({ name: "Paper rolls" }),
    item({ name: "Hand soap", quantity: 1, weeklyUsage: 1, leadTimeDays: 5, bufferDays: 4 }),
    item({ name: "Laundry detergent", quantity: 10, weeklyUsage: 1, leadTimeDays: 0, bufferDays: 0 })
  ]);
  assert.deepStrictEqual(summary.nextReturn.names, ["Hand soap"]);
  assert.strictEqual(summary.nextReturn.trigger.earliest, 0);
  assert.strictEqual(summary.nextReturn.trigger.latest, 0);
  assert.notStrictEqual(
    (summary.items[0].trigger.earliest + summary.items[1].trigger.earliest + summary.items[2].trigger.earliest) / 3,
    summary.nextReturn.trigger.earliest
  );
  assert.strictEqual(summary.clocksDiffer, true);
});

test("negative safety buffer is rejected", function () {
  assertThrows(function () { engine.calculateItem(item({ bufferDays: -2 })); }, "bufferDays");
});

test("missing lead time and safety buffer are rejected", function () {
  var missingLead = item();
  delete missingLead.leadTimeDays;
  assertThrows(function () { engine.calculateItem(missingLead); }, "leadTimeDays");
  assertThrows(function () { engine.calculateItem(item({ bufferDays: undefined })); }, "bufferDays");
});

test("empty-string replenishment quantity defaults to current quantity", function () {
  var result = engine.calculateItem(item({ replenishmentQuantity: "" }));
  assert.strictEqual(result.replenishmentDefaulted, true);
  assert.strictEqual(result.replenishmentQuantity, 6);
  assert.strictEqual(result.cadence.earliest, 21);
});

test("preset supply wording uses singular and plural forms", function () {
  assert.strictEqual(engine.formatSupply(1, "rolls", "preset"), "1 roll");
  assert.strictEqual(engine.formatSupply(2, "rolls", "preset"), "2 rolls");
  assert.strictEqual(engine.formatSupply(1, "packs", "preset"), "1 pack");
  assert.strictEqual(engine.formatSupply(2, "packs", "preset"), "2 packs");
  assert.strictEqual(engine.formatSupply(1, "bottles", "preset"), "1 bottle");
  assert.strictEqual(engine.formatSupply(2, "bottles", "preset"), "2 bottles");
  assert.strictEqual(engine.formatSupply(1, "tubes", "preset"), "1 tube");
  assert.strictEqual(engine.formatSupply(2, "tubes", "preset"), "2 tubes");
  assert.strictEqual(engine.formatSupply(1, "bottles/refills", "preset"), "1 bottle or refill");
  assert.strictEqual(engine.formatSupply(2, "bottles/refills", "preset"), "2 bottles or refills");
  assert.strictEqual(engine.formatSupply(1, "packs/bottles", "preset"), "1 pack or bottle");
  assert.strictEqual(engine.formatSupply(2, "packs/bottles", "preset"), "2 packs or bottles");
  assert.strictEqual(engine.formatSupply(1.5, "bottles", "preset"), "1.5 bottles");
  assert.strictEqual(engine.formatSupply(1, "pads", "custom"), "1 pads");
  assert.strictEqual(engine.formatSupply(1, "rolls", "custom"), "1 rolls");
});

test("tied soonest triggers keep every tied name in input order", function () {
  var summary = engine.calculateHousehold([
    item({ name: "Paper towels" }),
    item({ name: "Wipes" }),
    item({ name: "Shampoo", quantity: 10, weeklyUsage: 1, leadTimeDays: 0, bufferDays: 0 })
  ]);
  assert.deepStrictEqual(summary.nextReturn.names, ["Paper towels", "Wipes"]);
  assert.strictEqual(summary.nextReturn.trigger.earliest, 14);
  assert.strictEqual(summary.nextReturn.trigger.latest, 14);
});

test("tied trigger starts with different ends do not share one window", function () {
  var summary = engine.calculateHousehold([
    item({ name: "Paper towels" }),
    item({
      name: "Wipes",
      variabilityPercent: 20,
      leadTimeDays: 3,
      bufferDays: 0
    })
  ]);
  assert.deepStrictEqual(summary.nextReturn.names, ["Paper towels", "Wipes"]);
  assert.strictEqual(summary.nextReturn.trigger, null);
  assert.deepStrictEqual(summary.nextReturn.items[0].trigger, { earliest: 14, latest: 14, single: true });
  assert.deepStrictEqual(summary.nextReturn.items[1].trigger, { earliest: 14, latest: 24, single: false });
  assert.notStrictEqual(summary.nextReturn.items[0].text.trigger, summary.nextReturn.items[1].text.trigger);
});

test("deterministic repeat execution returns identical output", function () {
  var input = [
    item(),
    item({ name: "Toothpaste", quantity: 1.5, weeklyUsage: 0.5, variabilityPercent: 20, replenishmentQuantity: 2 })
  ];
  assert.strictEqual(
    JSON.stringify(engine.calculateHousehold(input)),
    JSON.stringify(engine.calculateHousehold(input))
  );
});

test("v0.1 output fields are unchanged by v0.2 additions", function () {
  var result = engine.calculateItem(item());
  assert.deepStrictEqual(result.depletion, { earliest: 21, latest: 21, single: true });
  assert.deepStrictEqual(result.trigger, { earliest: 14, latest: 14, single: true });
  assert.deepStrictEqual(result.cadence, { earliest: 21, latest: 21, single: true });
  assert.strictEqual(result.intervalFit, null);
  assert.strictEqual(result.category, null);
});

test("reorder threshold is lead-time demand plus reserve at the fast bound", function () {
  var result = engine.calculateItem(item());
  assert.strictEqual(result.reorder.leadTimeDemandUnits, 1.15);
  assert.strictEqual(result.reorder.reserveUnits, 0.86);
  assert.strictEqual(result.reorder.thresholdUnits, 2.01);
  assert.strictEqual(result.reorder.atOrBelowThreshold, false);
  var widened = engine.calculateItem(item({ variabilityPercent: 50, leadTimeDays: 7, bufferDays: 7 }));
  assert.strictEqual(widened.reorder.leadTimeDemandUnits, 3);
  assert.strictEqual(widened.reorder.reserveUnits, 3);
  assert.strictEqual(widened.reorder.thresholdUnits, 6);
  assert.strictEqual(widened.reorder.atOrBelowThreshold, true);
});

test("unit rounding strips binary noise before rounding up", function () {
  var result = engine.calculateItem(item({ weeklyUsage: 7.7, leadTimeDays: 1, bufferDays: 0 }));
  assert.strictEqual(result.reorder.leadTimeDemandUnits, 1.1);
  assert.strictEqual(result.reorder.reserveUnits, 0);
});

test("zero lead time and zero buffer give a zero threshold", function () {
  var result = engine.calculateItem(item({ leadTimeDays: 0, bufferDays: 0 }));
  assert.strictEqual(result.reorder.thresholdUnits, 0);
});

test("fixed interval fit classifies against the cadence window", function () {
  assert.strictEqual(engine.calculateItem(item({ intervalDays: 21 })).intervalFit.fit, "WITHIN_WINDOW");
  var late = engine.calculateItem(item({ intervalDays: 28 })).intervalFit;
  assert.strictEqual(late.fit, "LATER_THAN_WINDOW");
  assert.deepStrictEqual(late.driftDaysPerCycle, { min: 7, max: 7 });
  var early = engine.calculateItem(item({ intervalDays: 14 })).intervalFit;
  assert.strictEqual(early.fit, "EARLIER_THAN_WINDOW");
  assert.deepStrictEqual(early.driftDaysPerCycle, { min: -7, max: -7 });
  var ranged = engine.calculateItem(item({ variabilityPercent: 20, intervalDays: 21 }));
  assert.deepStrictEqual(ranged.cadence, { earliest: 17, latest: 27, single: false });
  assert.strictEqual(ranged.intervalFit.fit, "WITHIN_WINDOW");
  assert.deepStrictEqual(ranged.intervalFit.driftDaysPerCycle, { min: -6, max: 4 });
});

test("invalid interval and category are rejected", function () {
  assertThrows(function () { engine.calculateItem(item({ intervalDays: 0 })); }, "intervalDays");
  assertThrows(function () { engine.calculateItem(item({ intervalDays: -7 })); }, "intervalDays");
  assertThrows(function () { engine.calculateItem(item({ intervalDays: Number.NaN })); }, "intervalDays");
  assertThrows(function () { engine.calculateItem(item({ category: "TISSUE" })); }, "category");
  assert.strictEqual(engine.calculateItem(item({ intervalDays: "" })).intervalFit, null);
});

test("stockout exposure statuses follow arrival against depletion and buffer", function () {
  var result = engine.calculateItem(item());
  assert.strictEqual(engine.stockoutExposure(result, 14).status, "BUFFER_INTACT");
  assert.strictEqual(engine.stockoutExposure(result, 16).status, "BUFFER_DRAWN");
  var late = engine.stockoutExposure(result, 20);
  assert.strictEqual(late.arrivalDay, 24);
  assert.deepStrictEqual(late.gapDays, { min: 3, max: 3 });
  assert.strictEqual(late.status, "STOCKOUT_AT_BOTH_BOUNDS");
  var ranged = engine.calculateItem(item({ variabilityPercent: 20 }));
  var possible = engine.stockoutExposure(ranged, 16);
  assert.deepStrictEqual(possible.gapDays, { min: 0, max: 3 });
  assert.strictEqual(possible.status, "STOCKOUT_POSSIBLE");
});

test("stockout exposure rejects invalid order day and lead time", function () {
  var result = engine.calculateItem(item());
  assertThrows(function () { engine.stockoutExposure(result, -1); }, "orderDay");
  assertThrows(function () { engine.stockoutExposure(result, Number.NaN); }, "orderDay");
  assertThrows(function () { engine.stockoutExposure(result, 1, -2); }, "leadTimeDays");
  assertThrows(function () { engine.stockoutExposure({}, 1); }, "item");
});

test("lead-time slip within the buffer is absorbed and beyond it is exposed", function () {
  var rows = engine.leadTimeSlip(engine.calculateItem(item()));
  assert.deepStrictEqual(rows.map(function (row) { return row.slipDays; }), [3, 7]);
  assert.deepStrictEqual(rows[0].replannedTrigger, { earliest: 11, latest: 11, single: true });
  assert.deepStrictEqual(rows[0].exposureIfOrderedAtTrigger.gapDays, { min: 0, max: 0 });
  assert.strictEqual(rows[0].exposureIfOrderedAtTrigger.status, "BUFFER_DRAWN");
  assert.deepStrictEqual(rows[1].exposureIfOrderedAtTrigger.gapDays, { min: 4, max: 4 });
  assertThrows(function () { engine.leadTimeSlip(engine.calculateItem(item()), [-5]); }, "slipDays");
  assertThrows(function () { engine.leadTimeSlip(engine.calculateItem(item()), "3"); }, "slipDays");
});

test("scenario record is deterministic, versioned, and traceable to inputs", function () {
  var inputs = [item({ category: "PAPER_HYGIENE", intervalDays: 28 }), item({ name: "Hand soap", unit: "bottles", quantity: 2, weeklyUsage: 0.5 })];
  var first = engine.buildScenarioRecord(inputs);
  var second = engine.buildScenarioRecord(inputs);
  assert.strictEqual(JSON.stringify(first), JSON.stringify(second));
  assert.strictEqual(first.engine_version, "v0.2");
  assert.strictEqual(first.items.length, 2);
  assert.strictEqual(first.items[0].inputs.current_quantity, 6);
  assert.strictEqual(first.items[0].inputs.replenishment_quantity, null);
  assert.strictEqual(first.items[0].outputs.replenishment_quantity_applied, 6);
  assert.deepStrictEqual(first.items[0].outputs.planning_trigger_days, { earliest: 14, latest: 14 });
  assert.strictEqual(first.items[0].outputs.fixed_interval_fit.fit, "LATER_THAN_WINDOW");
  assert.strictEqual(first.items[1].outputs.fixed_interval_fit, null);
  assert.deepStrictEqual(first.household.next_return.names, ["Paper rolls"]);
  assert.ok(JSON.stringify(first).indexOf("timestamp") === -1);
});

test("scenario record rejects invalid input instead of emitting a partial record", function () {
  assertThrows(function () { engine.buildScenarioRecord([item({ quantity: 0 })]); }, "quantity");
  assertThrows(function () { engine.buildScenarioRecord([]); }, "items");
});

console.log(passed + " passed");
