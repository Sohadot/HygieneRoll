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

console.log(passed + " passed");
