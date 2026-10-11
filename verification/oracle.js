/*
 * HygieneRoll independent reference oracle
 *
 * Re-derives calculator results from CALCULATOR_METHODOLOGY.md using exact rational
 * arithmetic (BigInt fractions). It shares no code with assets/js/replenishment-engine.js
 * and never calls it. It exists so reference expectations are not produced by the code
 * under test.
 *
 * Inputs are taken as written decimals: a number is read through its shortest decimal
 * string, so 0.1 is exactly 1/10 here, not the nearest binary double.
 */
"use strict";

function gcd(a, b) {
  if (a < 0n) a = -a;
  if (b < 0n) b = -b;
  while (b) {
    var t = a % b;
    a = b;
    b = t;
  }
  return a;
}

function Q(n, d) {
  if (d === undefined) d = 1n;
  if (d === 0n) throw new Error("division by zero");
  if (d < 0n) {
    n = -n;
    d = -d;
  }
  var g = gcd(n, d) || 1n;
  return { n: n / g, d: d / g };
}

function fromDecimal(value) {
  if (typeof value !== "number" || !Number.isFinite(value)) throw new Error("not a finite number: " + value);
  var text = String(value);
  var match = /^(-?)(\d+)(?:\.(\d+))?(?:e([+-]?\d+))?$/i.exec(text);
  if (!match) throw new Error("unparseable number: " + text);
  var digits = match[2] + (match[3] || "");
  var scale = (match[3] || "").length - Number(match[4] || 0);
  var n = BigInt(digits) * (match[1] ? -1n : 1n);
  return scale >= 0 ? Q(n, 10n ** BigInt(scale)) : Q(n * 10n ** BigInt(-scale));
}

function add(a, b) { return Q(a.n * b.d + b.n * a.d, a.d * b.d); }
function sub(a, b) { return Q(a.n * b.d - b.n * a.d, a.d * b.d); }
function mul(a, b) { return Q(a.n * b.n, a.d * b.d); }
function div(a, b) { return Q(a.n * b.d, a.d * b.n); }
function cmp(a, b) { var x = a.n * b.d - b.n * a.d; return x < 0n ? -1 : x > 0n ? 1 : 0; }

function floorQ(a) {
  var q = a.n / a.d;
  if (a.n % a.d !== 0n && a.n < 0n) q -= 1n;
  return q;
}

function ceilQ(a) { return -floorQ(Q(-a.n, a.d)); }
function roundHalfUpQ(a) { return floorQ(add(a, Q(1n, 2n))); }
function maxInt(a, b) { return a > b ? a : b; }
function toNumber(a) { return Number(a.n) / Number(a.d); }
function int(q) { return Number(q); }

var ZERO = Q(0n);
var ONE = Q(1n);
var SEVEN = Q(7n);
var HUNDRED = Q(100n);

function absQ(a) { return a.n < 0n ? Q(-a.n, a.d) : a; }
function maxQ() { return Array.prototype.reduce.call(arguments, function (m, x) { return cmp(x, m) > 0 ? x : m; }); }

/*
 * Optional documented tolerance (CALCULATOR_METHODOLOGY.md, "Binary noise"). With
 * `tol` set, a value within tol × max(1, |value|, scale) of a whole or half day is moved
 * onto it before the decision, in exact arithmetic. With `tol` null the oracle is exact.
 * The audit uses the tolerant mode only to classify differences from exact results.
 */
function snapQ(x, scale, tol) {
  if (!tol) return x;
  var nearest = Q(roundHalfUpQ(mul(x, Q(2n))), 2n);
  var size = maxQ(ONE, absQ(x), absQ(scale || ZERO));
  return cmp(absQ(sub(x, nearest)), mul(tol, size)) <= 0 ? nearest : x;
}

// Units round up to the next hundredth; returned as an exact fraction over 100.
function ceilHundredth(a, tol) {
  var hundredths = mul(a, HUNDRED);
  if (tol) {
    var nearest = Q(roundHalfUpQ(hundredths));
    if (cmp(absQ(sub(hundredths, nearest)), mul(tol, maxQ(ONE, absQ(hundredths)))) <= 0) return Q(nearest.n, 100n);
  }
  return Q(ceilQ(hundredths), 100n);
}

function dayWindow(quantity, fast, slow, singleRate, tol) {
  if (singleRate) {
    var day = roundHalfUpQ(snapQ(mul(div(quantity, fast), SEVEN), null, tol));
    return { earliest: day, latest: day, single: true };
  }
  var earliest = floorQ(snapQ(mul(div(quantity, fast), SEVEN), null, tol));
  var latest = ceilQ(snapQ(mul(div(quantity, slow), SEVEN), null, tol));
  return { earliest: earliest, latest: latest, single: earliest === latest };
}

function trigger(depletion, lead, buffer, tol) {
  var operands = maxQ(Q(depletion.latest), lead, buffer);
  var rawEarliest = snapQ(sub(sub(Q(depletion.earliest), lead), buffer), operands, tol);
  var rawLatest = snapQ(sub(sub(Q(depletion.latest), lead), buffer), operands, tol);
  if (depletion.single) {
    var day = maxInt(0n, roundHalfUpQ(rawEarliest));
    return { earliest: day, latest: day };
  }
  var earliest = maxInt(0n, floorQ(rawEarliest));
  var latest = maxInt(0n, ceilQ(rawLatest));
  if (earliest > latest) earliest = latest;
  return { earliest: earliest, latest: latest };
}

function exposure(depletion, buffer, orderDay, lead, tol) {
  var arrival = add(orderDay, lead);
  var operands = maxQ(orderDay, lead, Q(depletion.latest), buffer);
  var worst = maxInt(0n, ceilQ(snapQ(sub(arrival, Q(depletion.earliest)), operands, tol)));
  var best = maxInt(0n, ceilQ(snapQ(sub(arrival, Q(depletion.latest)), operands, tol)));
  var status;
  if (worst === 0n) {
    status = cmp(snapQ(sub(arrival, sub(Q(depletion.earliest), buffer)), operands, tol), ZERO) <= 0 ? "BUFFER_INTACT" : "BUFFER_DRAWN";
  } else {
    status = best === 0n ? "STOCKOUT_POSSIBLE" : "STOCKOUT_AT_BOTH_BOUNDS";
  }
  return { arrival: arrival, gap: { min: best, max: worst }, status: status };
}

function windowOut(w) { return { earliest: int(w.earliest), latest: int(w.latest) }; }

/*
 * Returns the derived outputs for one item, named as in the scenario record, plus exact
 * fractions under `exact` for continuous values. Throws on input the methodology rejects.
 */
function deriveItem(input, slipDays, options) {
  var tol = options && options.tolerance ? options.tolerance : null;
  var q = fromDecimal(input.quantity);
  if (cmp(q, ZERO) <= 0) throw new Error("quantity must be > 0");
  var rate;
  if (input.usageMode === "weekly") {
    rate = fromDecimal(input.weeklyUsage);
  } else if (input.usageMode === "duration") {
    var weeks = fromDecimal(input.durationWeeks);
    if (cmp(weeks, ZERO) <= 0) throw new Error("duration must be > 0");
    rate = div(q, weeks);
  } else {
    throw new Error("unknown usage mode");
  }
  if (cmp(rate, ZERO) <= 0) throw new Error("usage must be > 0");
  var lead = fromDecimal(input.leadTimeDays);
  var buffer = fromDecimal(input.bufferDays);
  if (cmp(lead, ZERO) < 0 || cmp(buffer, ZERO) < 0) throw new Error("lead time and buffer must be >= 0");
  var v = div(fromDecimal(input.variabilityPercent), HUNDRED);
  if (cmp(v, ZERO) < 0 || cmp(v, Q(1n, 2n)) > 0) throw new Error("variability must be 0..50");
  var replenishment = input.replenishmentQuantity === undefined || input.replenishmentQuantity === null || input.replenishmentQuantity === ""
    ? q : fromDecimal(input.replenishmentQuantity);

  var singleRate = cmp(v, ZERO) === 0;
  var slow = mul(rate, sub(ONE, v));
  var fast = mul(rate, add(ONE, v));
  var depletion = dayWindow(q, fast, slow, singleRate, tol);
  var trig = trigger(depletion, lead, buffer, tol);
  var cadence = dayWindow(replenishment, fast, slow, singleRate, tol);

  var leadDemand = ceilHundredth(div(mul(lead, fast), SEVEN), tol);
  var reserve = ceilHundredth(div(mul(buffer, fast), SEVEN), tol);
  var threshold = add(leadDemand, reserve);

  var fit = null;
  if (input.intervalDays !== undefined && input.intervalDays !== null && input.intervalDays !== "") {
    var interval = fromDecimal(input.intervalDays);
    var code = "WITHIN_WINDOW";
    if (cmp(interval, Q(cadence.earliest)) < 0) code = "EARLIER_THAN_WINDOW";
    if (cmp(interval, Q(cadence.latest)) > 0) code = "LATER_THAN_WINDOW";
    fit = {
      fit: code,
      drift_days_per_cycle: {
        min: toNumber(sub(interval, Q(cadence.latest))),
        max: toNumber(sub(interval, Q(cadence.earliest)))
      }
    };
  }

  var slips = (slipDays || [3, 7]).map(function (slip) {
    var slipLead = add(lead, fromDecimal(slip));
    var e = exposure(depletion, buffer, Q(trig.earliest), slipLead, tol);
    return {
      slip_days: slip,
      replanned_trigger_days: windowOut(trigger(depletion, slipLead, buffer, tol)),
      exposure_if_ordered_at_trigger: {
        order_day: int(trig.earliest),
        arrival_day: toNumber(e.arrival),
        supply_gap_days: { min: int(e.gap.min), max: int(e.gap.max) },
        status: e.status
      }
    };
  });

  return {
    outputs: {
      consumption_rate_per_week: toNumber(rate),
      usage_bounds_per_week: { slow: toNumber(slow), fast: toNumber(fast) },
      depletion_interval_days: windowOut(depletion),
      planning_trigger_days: windowOut(trig),
      replenishment_quantity_applied: toNumber(replenishment),
      replenishment_cadence_days: windowOut(cadence),
      lead_time_demand_units: toNumber(leadDemand),
      reserve_stock_units: toNumber(reserve),
      reorder_threshold_units: toNumber(threshold),
      at_or_below_reorder_threshold: cmp(q, threshold) <= 0,
      fixed_interval_fit: fit,
      lead_time_slip: slips
    },
    exact: {
      consumption_rate_per_week: rate,
      slow: slow,
      fast: fast
    }
  };
}

function deriveHousehold(inputs, slipDays) {
  var items = inputs.map(function (input) { return deriveItem(input, slipDays); });
  var soonest = Math.min.apply(null, items.map(function (item) { return item.outputs.planning_trigger_days.earliest; }));
  var tied = [];
  items.forEach(function (item, index) {
    if (item.outputs.planning_trigger_days.earliest === soonest) tied.push(index);
  });
  var shared = tied.every(function (index) {
    return items[index].outputs.planning_trigger_days.latest === items[tied[0]].outputs.planning_trigger_days.latest;
  });
  var later = items.map(function (item) { return item.outputs.planning_trigger_days.earliest; }).filter(function (day) { return day > soonest; });
  return {
    items: items,
    household: {
      next_return: {
        names: tied.map(function (index) { return inputs[index].name.trim(); }),
        planning_trigger_days: shared ? items[tied[0]].outputs.planning_trigger_days : null
      },
      another_within_7_days: later.length > 0 && Math.min.apply(null, later) - soonest <= 7,
      clocks_differ: items.some(function (item) {
        var a = item.outputs.planning_trigger_days;
        var b = items[0].outputs.planning_trigger_days;
        return a.earliest !== b.earliest || a.latest !== b.latest;
      })
    }
  };
}

module.exports = {
  name: "hygieneroll-reference-oracle",
  version: "0.1",
  arithmetic: "exact rational (BigInt)",
  deriveItem: deriveItem,
  DOCUMENTED_TOLERANCE: Q(1n, 2n ** 47n),
  deriveHousehold: deriveHousehold,
  fromDecimal: fromDecimal
};
