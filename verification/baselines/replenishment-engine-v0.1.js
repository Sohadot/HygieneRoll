/*
 * HygieneRoll replenishment engine v0.1
 *
 * Human-readable specification: CALCULATOR_METHODOLOGY.md
 * This file is the machine source of truth. The page must not reimplement these formulas.
 */
(function (root, factory) {
  var api = factory();
  if (typeof module === "object" && module.exports) {
    module.exports = api;
  } else {
    root.HygieneRollReplenishment = api;
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  "use strict";

  var VERSION = "v0.1";

  function validationError(errors) {
    var error = new Error(errors[0] ? errors[0].message : "Invalid input");
    error.name = "ValidationError";
    error.errors = errors;
    return error;
  }

  function isFiniteNumber(value) {
    return typeof value === "number" && Number.isFinite(value);
  }

  function omitted(value) {
    return value === undefined || value === null || value === "";
  }

  function push(errors, field, message) {
    errors.push({ field: field, message: message });
  }

  function roundHalfUp(value) {
    return Math.round(value);
  }

  function dayCount(value, singular, plural) {
    return value + " " + (value === 1 ? singular : plural);
  }

  function weekNumber(value) {
    var halves = Math.round(value * 2);
    var whole = Math.floor(halves / 2);
    var half = halves % 2 === 1;
    if (whole === 0 && half) return "½";
    if (half) return String(whole) + "½";
    return String(whole);
  }

  function formatWeekAside(earliest, latest) {
    if (!(earliest > 0)) return "";
    var start = Math.round((earliest / 7) * 2) / 2;
    var end = Math.round((latest / 7) * 2) / 2;
    if (!(end > 0)) return "";
    if (start === end) {
      return "about " + weekNumber(start) + " " + (start === 1 ? "week" : "weeks");
    }
    return "about " + weekNumber(start) + "–" + weekNumber(end) + " " + (end === 1 ? "week" : "weeks");
  }

  function formatDepletion(window) {
    if (window.earliest === window.latest) return dayCount(window.earliest, "day", "days");
    return window.earliest + "–" + window.latest + " days";
  }

  function formatTrigger(window) {
    if (window.latest === 0) return "Now";
    if (window.earliest === 0) return "Now–" + window.latest + " days";
    if (window.earliest === window.latest) return dayCount(window.earliest, "day", "days");
    return window.earliest + "–" + window.latest + " days";
  }

  function formatCadence(window) {
    return "every " + formatDepletion(window);
  }

  var PRESET_UNIT_FORMS = {
    rolls: ["roll", "rolls"],
    packs: ["pack", "packs"],
    bottles: ["bottle", "bottles"],
    tubes: ["tube", "tubes"],
    "bottles/refills": ["bottle or refill", "bottles or refills"],
    "packs/bottles": ["pack or bottle", "packs or bottles"]
  };

  function formatQuantityNumber(value) {
    if (Number.isInteger(value)) return String(value);
    return String(Math.round(value * 100) / 100);
  }

  function formatSupply(quantity, unit, kind) {
    var label = typeof unit === "string" ? unit.trim() : "";
    if (kind === "preset" && Object.prototype.hasOwnProperty.call(PRESET_UNIT_FORMS, label)) {
      var forms = PRESET_UNIT_FORMS[label];
      label = quantity === 1 ? forms[0] : forms[1];
    }
    if (!label) return formatQuantityNumber(quantity);
    return formatQuantityNumber(quantity) + " " + label;
  }

  function usageWindow(quantity, fastUsage, slowUsage, variability) {
    if (variability === 0) {
      var day = roundHalfUp((quantity / fastUsage) * 7);
      return { earliest: day, latest: day, single: true };
    }
    var earliest = Math.floor((quantity / fastUsage) * 7);
    var latest = Math.ceil((quantity / slowUsage) * 7);
    return { earliest: earliest, latest: latest, single: earliest === latest };
  }

  function triggerWindow(depletion, leadTimeDays, bufferDays) {
    var rawEarliest = depletion.earliest - leadTimeDays - bufferDays;
    var rawLatest = depletion.latest - leadTimeDays - bufferDays;
    var earliest;
    var latest;
    if (depletion.single) {
      var day = Math.max(0, roundHalfUp(rawEarliest));
      earliest = day;
      latest = day;
    } else {
      earliest = Math.max(0, Math.floor(rawEarliest));
      latest = Math.max(0, Math.ceil(rawLatest));
      if (earliest > latest) earliest = latest;
    }
    return { earliest: earliest, latest: latest, single: earliest === latest };
  }

  function validateItem(input) {
    var errors = [];
    var source = input || {};

    if (typeof source.name !== "string" || source.name.trim() === "") {
      push(errors, "name", "Enter an item name.");
    }

    if (!isFiniteNumber(source.quantity) || source.quantity <= 0) {
      push(errors, "quantity", "Enter a quantity greater than zero.");
    }

    if (source.usageMode !== "weekly" && source.usageMode !== "duration") {
      push(errors, "usageMode", "Choose a usage method.");
    } else if (source.usageMode === "weekly") {
      if (!isFiniteNumber(source.weeklyUsage) || source.weeklyUsage <= 0) {
        push(errors, "weeklyUsage", "Weekly use must be greater than zero.");
      }
    } else if (!isFiniteNumber(source.durationWeeks) || source.durationWeeks <= 0) {
      push(errors, "durationWeeks", "Enter a duration greater than zero.");
    }

    if (!isFiniteNumber(source.leadTimeDays) || source.leadTimeDays < 0) {
      push(errors, "leadTimeDays", "Enter a lead time of zero or more days.");
    }

    if (!isFiniteNumber(source.bufferDays) || source.bufferDays < 0) {
      push(errors, "bufferDays", "Enter a safety buffer of zero or more days.");
    }

    if (!isFiniteNumber(source.variabilityPercent) || source.variabilityPercent < 0 || source.variabilityPercent > 50) {
      push(errors, "variabilityPercent", "Variability must be between 0% and 50%.");
    }

    if (!omitted(source.replenishmentQuantity)) {
      if (!isFiniteNumber(source.replenishmentQuantity) || source.replenishmentQuantity <= 0) {
        push(errors, "replenishmentQuantity", "Enter a replenishment quantity greater than zero.");
      }
    }

    return errors;
  }

  function normalizeUsage(input) {
    var errors = validateItem(Object.assign({
      name: "item",
      leadTimeDays: 0,
      bufferDays: 0,
      variabilityPercent: 0
    }, input || {}));
    var usageErrors = errors.filter(function (error) {
      return error.field === "quantity" || error.field === "usageMode" || error.field === "weeklyUsage" || error.field === "durationWeeks";
    });
    if (usageErrors.length) throw validationError(usageErrors);

    var source = input || {};
    var weeklyUsage = source.usageMode === "weekly"
      ? source.weeklyUsage
      : source.quantity / source.durationWeeks;

    if (!(weeklyUsage > 0)) {
      throw validationError([{ field: "weeklyUsage", message: "Weekly use must be greater than zero." }]);
    }

    return { weeklyUsage: weeklyUsage };
  }

  function calculateItem(input) {
    var errors = validateItem(input);
    if (errors.length) throw validationError(errors);

    var name = input.name.trim();
    var unit = typeof input.unit === "string" ? input.unit.trim() : "";
    var unitKind = input.unitKind === "preset" ? "preset" : "custom";
    var quantity = input.quantity;
    var usage = normalizeUsage(input);
    var weeklyUsage = usage.weeklyUsage;
    var variability = input.variabilityPercent / 100;
    var slowUsage = weeklyUsage * (1 - variability);
    var fastUsage = weeklyUsage * (1 + variability);
    var defaulted = omitted(input.replenishmentQuantity);
    var replenishmentQuantity = defaulted ? quantity : input.replenishmentQuantity;
    var depletion = usageWindow(quantity, fastUsage, slowUsage, variability);
    var cadence = usageWindow(replenishmentQuantity, fastUsage, slowUsage, variability);
    var trigger = triggerWindow(depletion, input.leadTimeDays, input.bufferDays);

    return {
      name: name,
      unit: unit,
      unitKind: unitKind,
      quantity: quantity,
      usageMode: input.usageMode,
      weeklyUsage: weeklyUsage,
      durationWeeks: input.usageMode === "duration" ? input.durationWeeks : null,
      variabilityPercent: input.variabilityPercent,
      variability: variability,
      slowUsage: slowUsage,
      fastUsage: fastUsage,
      leadTimeDays: input.leadTimeDays,
      bufferDays: input.bufferDays,
      replenishmentQuantity: replenishmentQuantity,
      replenishmentDefaulted: defaulted,
      depletion: depletion,
      trigger: trigger,
      cadence: cadence,
      text: {
        depletion: formatDepletion(depletion),
        depletionWeeks: formatWeekAside(depletion.earliest, depletion.latest),
        trigger: formatTrigger(trigger),
        triggerWeeks: formatWeekAside(trigger.earliest, trigger.latest),
        triggerNote: trigger.latest === 0 ? "Within the current lead-time and buffer window." : "",
        cadence: formatCadence(cadence),
        cadenceWeeks: formatWeekAside(cadence.earliest, cadence.latest)
      }
    };
  }

  function calculateHousehold(items) {
    if (!Array.isArray(items) || items.length === 0) {
      throw validationError([{ field: "items", message: "Add at least one item." }]);
    }

    var results = items.map(calculateItem);
    var soonest = results[0].trigger.earliest;
    results.forEach(function (item) {
      if (item.trigger.earliest < soonest) soonest = item.trigger.earliest;
    });

    var tied = results.filter(function (item) {
      return item.trigger.earliest === soonest;
    });
    var shared = tied.every(function (item) {
      return item.trigger.latest === tied[0].trigger.latest;
    });

    var nextDistinct = null;
    results.forEach(function (item) {
      if (item.trigger.earliest > soonest && (nextDistinct === null || item.trigger.earliest < nextDistinct)) {
        nextDistinct = item.trigger.earliest;
      }
    });

    return {
      items: results,
      nextReturn: {
        names: tied.map(function (item) { return item.name; }),
        items: tied,
        trigger: shared ? {
          earliest: tied[0].trigger.earliest,
          latest: tied[0].trigger.latest,
          single: tied[0].trigger.single
        } : null
      },
      anotherSoon: nextDistinct !== null && nextDistinct - soonest <= 7,
      clocksDiffer: results.some(function (item) {
        return item.trigger.earliest !== results[0].trigger.earliest || item.trigger.latest !== results[0].trigger.latest;
      })
    };
  }

  return {
    version: VERSION,
    validateItem: validateItem,
    normalizeUsage: normalizeUsage,
    calculateItem: calculateItem,
    calculateHousehold: calculateHousehold,
    formatDepletion: formatDepletion,
    formatTrigger: formatTrigger,
    formatCadence: formatCadence,
    formatWeekAside: formatWeekAside,
    formatSupply: formatSupply
  };
});
