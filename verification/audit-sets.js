/*
 * Deterministic input sets for the HygieneRoll numerical audit.
 *
 * Each generator returns engine inputs in a fixed order, with no randomness and no
 * dependence on time or environment. The standard test suite uses standardGrid and
 * nearBoundaryStandard. verification/audit-numerical.js runs every set.
 */
"use strict";

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

function nudge(value, sign, exponent) {
  return Number((value + sign * Math.pow(10, -exponent)).toFixed(exponent + 2));
}

// Set A: the first exploratory grid. Weekly mode, interval 21.
function exploratory() {
  var out = [];
  [0.5, 1, 1.1, 1.4, 2, 2.2, 3, 3.3, 6, 7, 12, 13.3].forEach(function (q) {
    [0.1, 0.2, 0.3, 0.5, 0.7, 1, 1.1, 2, 3, 3.5].forEach(function (w) {
      [0, 5, 10, 15, 20, 25, 33, 50].forEach(function (v) {
        [0, 1, 2.5, 4, 7, 12].forEach(function (l) {
          [0, 0.5, 3, 7].forEach(function (b) {
            ["", 1.1, 4].forEach(function (r) {
              out.push(input({ quantity: q, weeklyUsage: w, variabilityPercent: v, leadTimeDays: l, bufferDays: b, replenishmentQuantity: r, intervalDays: 21 }));
            });
          });
        });
      });
    });
  });
  return out;
}

// Set B: decimals that binary doubles cannot represent, in weekly and duration mode.
function adversarial() {
  var out = [];
  var intervals = [0.5, 7.3, 14, 21.1, 30];
  var n = 0;
  ["weekly", "duration"].forEach(function (mode) {
    [0.3, 0.7, 1, 1.5, 2.1, 3, 4.9, 10].forEach(function (q) {
      [0.1, 0.3, 0.7, 1, 1.5, 2.1, 3, 6, 7.7].forEach(function (d) {
        [0, 1, 7, 10, 30, 45, 50].forEach(function (v) {
          [0, 0.1, 0.3, 0.7, 1.2, 2.9, 3.5].forEach(function (l) {
            [0, 0.2, 0.3, 0.8, 1.5].forEach(function (b) {
              out.push(input({
                quantity: q,
                usageMode: mode,
                weeklyUsage: mode === "weekly" ? d : null,
                durationWeeks: mode === "duration" ? d : null,
                variabilityPercent: v,
                leadTimeDays: l,
                bufferDays: b,
                intervalDays: intervals[n % intervals.length]
              }));
              n += 1;
            });
          });
        });
      });
    });
  });
  return out;
}

// Set C: quantity, lead time, or buffer moved 1e-6 to 1e-11 days off a grid point.
// Values clamped at zero repeat, so the set contains duplicates by construction.
function nearBoundaryExtended() {
  var out = [];
  [1, 1.1, 2.2, 3, 6, 7].forEach(function (q) {
    [0.5, 0.7, 1, 1.4, 2].forEach(function (r) {
      [0, 10, 20, 50].forEach(function (v) {
        [0, 3, 4].forEach(function (l) {
          ["weekly", "duration"].forEach(function (mode) {
            [6, 7, 8, 9, 10, 11].forEach(function (m) {
              [-1, 1].forEach(function (sign) {
                ["quantity", "leadTimeDays", "bufferDays"].forEach(function (field) {
                  var item = input({
                    quantity: q,
                    usageMode: mode,
                    weeklyUsage: mode === "weekly" ? r : null,
                    durationWeeks: mode === "duration" ? Number((r * 3).toFixed(4)) : null,
                    variabilityPercent: v,
                    leadTimeDays: l,
                    bufferDays: 3
                  });
                  item[field] = Math.max(0, nudge(item[field], sign, m));
                  out.push(item);
                });
              });
            });
          });
        });
      });
    });
  });
  return out;
}

// Set D: the standard test grid used by tests/independent-verification.test.js.
function standardGrid() {
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

// Set E: the near-boundary inputs in the standard test suite.
function nearBoundaryStandard() {
  var out = [];
  [1, 1.1, 2.2, 3, 7].forEach(function (q) {
    [0.5, 0.7, 1.4, 2].forEach(function (r) {
      [0, 10, 50].forEach(function (v) {
        ["weekly", "duration"].forEach(function (mode) {
          [6, 8, 10, 11].forEach(function (m) {
            [-1, 1].forEach(function (sign) {
              ["quantity", "leadTimeDays", "bufferDays"].forEach(function (field) {
                var item = input({ quantity: q, usageMode: mode, weeklyUsage: mode === "weekly" ? r : null, durationWeeks: mode === "duration" ? Number((r * 3).toFixed(4)) : null, variabilityPercent: v, leadTimeDays: 3, bufferDays: 3 });
                item[field] = nudge(item[field], sign, m);
                out.push(item);
              });
            });
          });
        });
      });
    });
  });
  return out;
}

// Set U: unit rounding. Tiny and hundredth-sized lead times and buffers, where a
// rounding-up rule that strips noise too aggressively would publish 0.
function unitRounding() {
  var out = [];
  var tiny = [1e-12, 1e-10, 1e-8, 1e-6, 1e-4, 0.01, 0.07, 0.14, 0.7, 1.4, 7, 14];
  [0.1, 0.5, 0.7, 1, 2, 3.5, 7.7].forEach(function (r) {
    [0, 10, 50].forEach(function (v) {
      tiny.forEach(function (t) {
        out.push(input({ quantity: 6, weeklyUsage: r, variabilityPercent: v, leadTimeDays: t, bufferDays: 0 }));
        out.push(input({ quantity: 6, weeklyUsage: r, variabilityPercent: v, leadTimeDays: 0, bufferDays: t }));
      });
    });
  });
  return out;
}

var SETS = {
  A: { name: "exploratory grid", generate: exploratory, standard: false },
  B: { name: "adversarial decimals", generate: adversarial, standard: false },
  C: { name: "near-boundary, extended", generate: nearBoundaryExtended, standard: false },
  D: { name: "standard test grid", generate: standardGrid, standard: true },
  E: { name: "near-boundary, standard", generate: nearBoundaryStandard, standard: true },
  U: { name: "unit rounding", generate: unitRounding, standard: false }
};

// Identity of an input for de-duplication: every field that can change a result.
function inputKey(item) {
  function value(v) { return v === undefined || v === null ? "" : v; }
  return JSON.stringify([item.quantity, item.usageMode, value(item.weeklyUsage), value(item.durationWeeks), item.variabilityPercent, item.leadTimeDays, item.bufferDays, value(item.replenishmentQuantity), value(item.intervalDays)]);
}

module.exports = {
  input: input,
  standardGrid: standardGrid,
  nearBoundaryStandard: nearBoundaryStandard,
  SETS: SETS,
  inputKey: inputKey
};
