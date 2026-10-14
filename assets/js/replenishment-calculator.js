(function () {
  "use strict";

  var engine = window.HygieneRollReplenishment;
  var scenarioApi = window.HygieneRollReferenceScenario;
  var MAX_ITEMS = 10;
  var nextId = 1;

  var PRESETS = [
    { id: "toilet-tissue", group: "Paper hygiene", name: "Toilet tissue / paper rolls", unit: "rolls" },
    { id: "paper-towels", group: "Paper hygiene", name: "Paper towels", unit: "rolls" },
    { id: "wipes", group: "Paper hygiene", name: "Wipes", unit: "packs" },
    { id: "hand-soap", group: "Personal hygiene", name: "Hand soap / refill", unit: "bottles/refills" },
    { id: "body-wash", group: "Personal hygiene", name: "Body wash", unit: "bottles" },
    { id: "shampoo", group: "Personal hygiene", name: "Shampoo", unit: "bottles" },
    { id: "toothpaste", group: "Personal hygiene", name: "Toothpaste", unit: "tubes" },
    { id: "dish-soap", group: "Household hygiene", name: "Dishwashing liquid / refill", unit: "bottles/refills" },
    { id: "laundry", group: "Household hygiene", name: "Laundry detergent", unit: "packs/bottles" },
    { id: "surface", group: "Household hygiene", name: "Surface cleaner / disinfectant", unit: "bottles" },
    { id: "custom", group: "Other", name: "Custom item", unit: "" }
  ];

  var CATEGORY_BY_GROUP = {
    "Paper hygiene": "PAPER_HYGIENE",
    "Personal hygiene": "PERSONAL_HYGIENE",
    "Household hygiene": "HOUSEHOLD_HYGIENE",
    "Other": "OTHER"
  };

  var EXPOSURE_TEXT = {
    BUFFER_INTACT: "Buffer stays intact",
    BUFFER_DRAWN: "Buffer absorbs it"
  };

  var FIT_TEXT = {
    WITHIN_WINDOW: "Within the cadence window",
    EARLIER_THAN_WINDOW: "Earlier than the cadence window",
    LATER_THAN_WINDOW: "Later than the cadence window"
  };

  var list;
  var addButton;
  var limitNote;
  var results;
  var status;
  var banner;
  var activeReference = null;
  var pendingCase = null;

  document.addEventListener("DOMContentLoaded", init);

  function init() {
    if (!engine) {
      status = document.getElementById("calculator-status");
      if (status) status.textContent = "The calculation engine did not load.";
      return;
    }

    list = document.getElementById("item-list");
    addButton = document.getElementById("add-item");
    limitNote = document.getElementById("item-limit");
    results = document.getElementById("calculator-results");
    status = document.getElementById("calculator-status");
    banner = document.getElementById("reference-banner");

    var form = document.getElementById("calculator-form");
    form.addEventListener("submit", function (event) {
      event.preventDefault();
      if (!form.checkValidity()) {
        form.reportValidity();
        return;
      }
      calculate();
    });
    form.addEventListener("input", onScenarioEdit);
    form.addEventListener("change", onScenarioEdit);
    addButton.addEventListener("click", function () {
      if (list.children.length >= MAX_ITEMS) return;
      invalidateResults();
      var card = addItem();
      var select = card.querySelector("select");
      if (select) select.focus();
    });
    document.getElementById("reset-scenario").addEventListener("click", resetScenario);

    addItem();
    loadReferenceFromLocation();
    window.addEventListener("hashchange", loadReferenceFromLocation);
  }

  function addItem() {
    var id = nextId;
    nextId += 1;
    var card = buildCard(id);
    list.appendChild(card);
    syncLimit();
    return card;
  }

  function syncLimit() {
    var full = list.children.length >= MAX_ITEMS;
    addButton.disabled = full;
    limitNote.hidden = !full;
  }

  function buildCard(id) {
    var card = document.createElement("fieldset");
    card.className = "item-card glass";
    card.dataset.itemId = String(id);

    var legend = document.createElement("legend");
    legend.className = "item-legend";
    legend.textContent = "Item";
    card.appendChild(legend);

    var grid = document.createElement("div");
    grid.className = "field-grid";

    var preset = selectField(id, "preset", "Item", presetOptions());
    preset.select.value = "toilet-tissue";
    grid.appendChild(preset.wrap);

    var custom = textField(id, "name", "Custom item name", "e.g. Cotton pads");
    custom.wrap.hidden = true;
    grid.appendChild(custom.wrap);

    var unit = textField(id, "unit", "Unit", "e.g. rolls");
    unit.input.value = "rolls";
    grid.appendChild(unit.wrap);

    var quantity = numberField(id, "quantity", "Current quantity", "e.g. 6", "0", true);
    grid.appendChild(quantity.wrap);

    grid.appendChild(usageFields(id));
    card.appendChild(grid);

    var planning = document.createElement("div");
    planning.className = "planning";
    var planningTitle = document.createElement("h3");
    planningTitle.textContent = "Planning settings";
    planning.appendChild(planningTitle);

    var planningGrid = document.createElement("div");
    planningGrid.className = "field-grid";
    planningGrid.appendChild(numberField(id, "lead", "Lead time (days)", "e.g. 4", "0", true).wrap);
    planningGrid.appendChild(numberField(id, "buffer", "Safety buffer (days)", "e.g. 3", "0", true).wrap);
    var variability = numberField(id, "variability", "Usage variability (%)", "0", "0", true);
    variability.input.value = "0";
    variability.input.max = "50";
    planningGrid.appendChild(variability.wrap);
    planningGrid.appendChild(numberField(id, "replenishment", "Replenishment quantity", "e.g. 6", "0").wrap);
    planningGrid.appendChild(numberField(id, "interval", "Fixed delivery interval to compare (days)", "optional", "0").wrap);
    planning.appendChild(planningGrid);

    var hint = document.createElement("p");
    hint.className = "field-hint";
    hint.textContent = "Variability widens the planning window; it is not a confidence interval. Leave replenishment quantity blank to use the current quantity. A fixed delivery interval is optional: enter a subscription schedule you hold or are considering to compare it with this item's cadence.";
    planning.appendChild(hint);
    card.appendChild(planning);

    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-quiet remove-item";
    remove.addEventListener("click", function () {
      if (list.children.length === 1) {
        list.removeChild(card);
        var fresh = addItem();
        invalidateResults();
        var focusTarget = fresh.querySelector("select");
        if (focusTarget) focusTarget.focus();
        return;
      }
      list.removeChild(card);
      syncLimit();
      invalidateResults();
    });
    card.appendChild(remove);

    function refreshIdentity() {
      var selected = presetById(preset.select.value);
      var customMode = selected.id === "custom";
      custom.wrap.hidden = !customMode;
      custom.input.required = customMode;
      if (!customMode) {
        unit.input.value = selected.unit;
        legend.textContent = selected.name;
      } else {
        var customName = custom.input.value.trim();
        legend.textContent = customName || "Custom item";
        if (!unit.input.dataset.touched) unit.input.value = "";
      }
      var labelName = legend.textContent;
      remove.textContent = "Remove item";
      remove.setAttribute("aria-label", "Remove " + labelName);
    }

    preset.select.addEventListener("change", function () {
      unit.input.dataset.touched = "";
      refreshIdentity();
    });
    custom.input.addEventListener("input", refreshIdentity);
    unit.input.addEventListener("input", function () {
      unit.input.dataset.touched = "true";
    });
    refreshIdentity();
    return card;
  }

  function usageFields(id) {
    var wrap = document.createElement("fieldset");
    wrap.className = "usage-method";
    var legend = document.createElement("legend");
    legend.textContent = "Usage method";
    wrap.appendChild(legend);

    var weekly = radio(id, "weekly", "Units used per week", true);
    var duration = radio(id, "duration", "How long the current quantity usually lasts", false);
    wrap.appendChild(weekly.label);
    wrap.appendChild(duration.label);

    var weeklyField = numberField(id, "weekly", "Units per week", "e.g. 2", "0", true);
    var durationField = numberField(id, "duration", "Typical duration (weeks)", "e.g. 3", "0", false);
    wrap.appendChild(weeklyField.wrap);
    wrap.appendChild(durationField.wrap);

    function sync() {
      var useWeekly = weekly.input.checked;
      weeklyField.wrap.hidden = !useWeekly;
      durationField.wrap.hidden = useWeekly;
      weeklyField.input.required = useWeekly;
      weeklyField.input.disabled = !useWeekly;
      durationField.input.required = !useWeekly;
      durationField.input.disabled = useWeekly;
    }
    weekly.input.addEventListener("change", sync);
    duration.input.addEventListener("change", sync);
    sync();
    return wrap;
  }

  function radio(id, value, text, checked) {
    var label = document.createElement("label");
    label.className = "choice";
    var input = document.createElement("input");
    input.type = "radio";
    input.name = "usage-" + id;
    input.value = value;
    input.checked = checked;
    var span = document.createElement("span");
    span.textContent = text;
    label.appendChild(input);
    label.appendChild(span);
    return { label: label, input: input };
  }

  function presetOptions() {
    var groups = [];
    PRESETS.forEach(function (preset) {
      var group = groups.find(function (entry) { return entry.label === preset.group; });
      if (!group) {
        group = { label: preset.group, options: [] };
        groups.push(group);
      }
      group.options.push(preset);
    });
    return groups;
  }

  function selectField(id, key, labelText, groups) {
    var built = labeledControl(id, key, labelText, "select");
    groups.forEach(function (group) {
      var parent = built.control;
      if (group.label) {
        parent = document.createElement("optgroup");
        parent.label = group.label;
        built.control.appendChild(parent);
      }
      group.options.forEach(function (preset) {
        var option = document.createElement("option");
        option.value = preset.id;
        option.textContent = preset.name;
        parent.appendChild(option);
      });
    });
    return { wrap: built.wrap, select: built.control };
  }

  function textField(id, key, labelText, placeholder) {
    var built = labeledControl(id, key, labelText, "input");
    built.control.type = "text";
    built.control.placeholder = placeholder;
    built.control.autocomplete = "off";
    return { wrap: built.wrap, input: built.control };
  }

  function numberField(id, key, labelText, placeholder, min, required) {
    var built = labeledControl(id, key, labelText, "input");
    built.control.type = "number";
    built.control.inputMode = "decimal";
    built.control.step = "any";
    built.control.min = min;
    built.control.placeholder = placeholder;
    built.control.autocomplete = "off";
    built.control.required = required;
    return { wrap: built.wrap, input: built.control };
  }

  function labeledControl(id, key, labelText, tag) {
    var wrap = document.createElement("div");
    wrap.className = "field";
    var fieldId = "item-" + id + "-" + key;
    var label = document.createElement("label");
    label.htmlFor = fieldId;
    label.textContent = labelText;
    var control = document.createElement(tag);
    control.id = fieldId;
    var error = document.createElement("p");
    error.className = "field-error";
    error.id = fieldId + "-error";
    error.hidden = true;
    wrap.appendChild(label);
    wrap.appendChild(control);
    wrap.appendChild(error);
    return { wrap: wrap, control: control };
  }

  function presetById(id) {
    return PRESETS.find(function (preset) { return preset.id === id; }) || PRESETS[0];
  }

  function readNumber(input) {
    var raw = input.value.trim();
    if (raw === "") return { empty: true, value: null };
    var value = Number(raw);
    if (!Number.isFinite(value)) return { empty: false, invalid: true, value: null };
    return { empty: false, invalid: false, value: value };
  }

  function calculate() {
    clearFieldErrors();
    var cards = Array.prototype.slice.call(list.children);
    var inputs = [];
    var firstInvalid = null;

    cards.forEach(function (card) {
      var read = readCard(card);
      inputs.push(read.input);
      var errors = engine.validateItem(read.input);
      if (errors.length && !firstInvalid) firstInvalid = { card: card, field: errors[0].field };
      showErrors(card, errors);
    });

    if (firstInvalid) {
      clearResults();
      status.textContent = "Check the highlighted fields.";
      var target = fieldElement(firstInvalid.card, firstInvalid.field);
      if (target) target.focus();
      return;
    }

    var summary = engine.calculateHousehold(inputs);
    render(summary, engine.buildScenarioRecord(inputs), inputs);
  }

  function readCard(card) {
    var id = card.dataset.itemId;
    var preset = presetById(valueOf(card, "preset"));
    var custom = valueOf(card, "name").trim();
    var mode = checkedUsage(card);
    var quantity = readNumber(element(card, "quantity"));
    var weekly = readNumber(element(card, "weekly"));
    var duration = readNumber(element(card, "duration"));
    var lead = readNumber(element(card, "lead"));
    var buffer = readNumber(element(card, "buffer"));
    var variability = readNumber(element(card, "variability"));
    var replenishment = readNumber(element(card, "replenishment"));
    var interval = readNumber(element(card, "interval"));

    return {
      input: {
        name: preset.id === "custom" ? custom : preset.name,
        unit: valueOf(card, "unit").trim(),
        unitKind: preset.id !== "custom" && element(card, "unit").dataset.touched !== "true" ? "preset" : "custom",
        quantity: quantity.empty || quantity.invalid ? Number.NaN : quantity.value,
        usageMode: mode,
        weeklyUsage: mode === "weekly" ? (weekly.empty || weekly.invalid ? Number.NaN : weekly.value) : null,
        durationWeeks: mode === "duration" ? (duration.empty || duration.invalid ? Number.NaN : duration.value) : null,
        leadTimeDays: lead.empty || lead.invalid ? Number.NaN : lead.value,
        bufferDays: buffer.empty || buffer.invalid ? Number.NaN : buffer.value,
        variabilityPercent: variability.empty || variability.invalid ? Number.NaN : variability.value,
        replenishmentQuantity: replenishment.empty ? "" : (replenishment.invalid ? Number.NaN : replenishment.value),
        intervalDays: interval.empty ? "" : (interval.invalid ? Number.NaN : interval.value),
        category: preset.id === "custom" && card.dataset.category ? card.dataset.category : (CATEGORY_BY_GROUP[preset.group] || "OTHER")
      }
    };
  }

  function checkedUsage(card) {
    var checked = card.querySelector('input[type="radio"]:checked');
    return checked ? checked.value : "";
  }

  function element(card, key) {
    return card.querySelector("#item-" + card.dataset.itemId + "-" + key);
  }

  function valueOf(card, key) {
    var node = element(card, key);
    return node ? node.value : "";
  }

  function fieldElement(card, field) {
    var key = field;
    if (field === "weeklyUsage") key = "weekly";
    if (field === "durationWeeks") key = "duration";
    if (field === "leadTimeDays") key = "lead";
    if (field === "bufferDays") key = "buffer";
    if (field === "variabilityPercent") key = "variability";
    if (field === "replenishmentQuantity") key = "replenishment";
    if (field === "intervalDays") key = "interval";
    if (field === "name") key = "name";
    if (field === "quantity") key = "quantity";
    return element(card, key);
  }

  function showErrors(card, errors) {
    errors.forEach(function (error) {
      var input = fieldElement(card, error.field);
      if (!input) return;
      var message = card.querySelector("#" + input.id + "-error");
      input.setAttribute("aria-invalid", "true");
      input.setAttribute("aria-describedby", message.id);
      message.textContent = error.message;
      message.hidden = false;
    });
  }

  function onScenarioEdit(event) {
    var target = event.target;
    if (!target || !list.contains(target)) return;
    clearControlError(target);
    invalidateResults();
  }

  function clearControlError(input) {
    if (!input.id) return;
    var message = document.getElementById(input.id + "-error");
    if (!message || message.hidden) return;
    input.removeAttribute("aria-invalid");
    input.removeAttribute("aria-describedby");
    message.textContent = "";
    message.hidden = true;
  }

  function invalidateResults() {
    if (!results.childNodes.length) return;
    clearResults();
    status.textContent = "Inputs changed. Recalculate to update the planning window.";
  }

  function clearFieldErrors() {
    Array.prototype.forEach.call(list.querySelectorAll("[aria-invalid]"), function (input) {
      input.removeAttribute("aria-invalid");
      input.removeAttribute("aria-describedby");
    });
    Array.prototype.forEach.call(list.querySelectorAll(".field-error"), function (message) {
      message.textContent = "";
      message.hidden = true;
    });
  }

  function clearResults() {
    results.textContent = "";
  }

  function resetScenario() {
    while (list.firstChild) list.removeChild(list.firstChild);
    nextId = 1;
    addItem();
    clearResults();
    status.textContent = "Scenario cleared.";
    var select = list.querySelector("select");
    if (select) select.focus();
  }

  function render(summary, record, inputs) {
    results.textContent = "";
    var summaryCard = document.createElement("article");
    summaryCard.className = "result-card glass";
    appendHeading(summaryCard, "Next household return");

    var nameLine = document.createElement("p");
    nameLine.className = "result-name";
    nameLine.textContent = summary.nextReturn.names.join(", ");
    summaryCard.appendChild(nameLine);

    if (summary.nextReturn.trigger) {
      appendPair(summaryCard, "Planning trigger", summary.nextReturn.items[0].text.trigger);
      appendAside(summaryCard, summary.nextReturn.items[0].text.triggerWeeks);
      appendAside(summaryCard, summary.nextReturn.items[0].text.triggerNote);
    } else {
      summary.nextReturn.items.forEach(function (item) {
        appendPair(summaryCard, item.name, item.text.trigger);
      });
    }

    if (summary.anotherSoon) {
      appendNote(summaryCard, "Another item enters its planning window shortly after.");
    }
    if (summary.items.length > 1 && summary.clocksDiffer) {
      appendNote(summaryCard, "Different household essentials can enter their replenishment windows at different times.");
    }
    results.appendChild(summaryCard);

    var listHeading = document.createElement("h2");
    listHeading.className = "results-title";
    listHeading.textContent = "Item results";
    results.appendChild(listHeading);

    summary.items.forEach(function (item) {
      results.appendChild(itemCard(item));
    });

    results.appendChild(recordPanel(record));
    if (activeReference) results.appendChild(comparisonPanel(record, inputs[0], inputs.length));

    var first = summary.nextReturn.names.join(", ");
    var triggerText = summary.nextReturn.trigger
      ? summary.nextReturn.items[0].text.trigger
      : "see tied items";
    status.textContent = "Next household return: " + first + ". Planning trigger: " + triggerText + ".";
  }

  function itemCard(item) {
    var card = document.createElement("article");
    card.className = "result-card glass";
    var title = document.createElement("h3");
    title.textContent = item.name;
    card.appendChild(title);
    appendPair(card, "Current supply", quantityText(item.quantity, item.unit, item.unitKind));
    appendPair(card, "Observed usage", usageText(item));
    appendPair(card, "Estimated depletion", item.text.depletion);
    appendAside(card, item.text.depletionWeeks);
    appendPair(card, "Lead time", dayLabel(item.leadTimeDays));
    appendPair(card, "Safety buffer", dayLabel(item.bufferDays));
    appendPair(card, "Planning trigger", item.text.trigger);
    appendAside(card, item.text.triggerWeeks);
    appendAside(card, item.text.triggerNote);
    appendPair(card, "Illustrative cadence", item.text.cadence);
    appendAside(card, item.text.cadenceWeeks);
    appendPair(card, "Reorder threshold", quantityText(item.reorder.thresholdUnits, item.unit, item.unitKind));
    appendAside(card, "Lead-time demand " + formatNumber(item.reorder.leadTimeDemandUnits) + " + reserve " + formatNumber(item.reorder.reserveUnits) + ", at the fast usage bound.");
    if (item.reorder.atOrBelowThreshold) appendAside(card, "Current supply is at or below this threshold.");
    if (item.intervalFit) {
      appendPair(card, formatNumber(item.intervalFit.intervalDays) + "-day fixed interval", FIT_TEXT[item.intervalFit.fit]);
      appendAside(card, driftText(item.intervalFit.driftDaysPerCycle));
    }
    engine.leadTimeSlip(item).forEach(function (row) {
      appendPair(card, "If delivery takes " + dayLabel(row.slipDays) + " longer", exposureText(row.exposureIfOrderedAtTrigger));
      appendAside(card, "Ordered at the planning trigger. Re-planned trigger: " + engine.formatTrigger(row.replannedTrigger) + ".");
    });
    appendPair(card, "Variability allowance", formatNumber(item.variabilityPercent) + "%");
    return card;
  }

  function exposureText(exposure) {
    if (EXPOSURE_TEXT[exposure.status]) return EXPOSURE_TEXT[exposure.status];
    var gap = exposure.gapDays;
    if (gap.min === gap.max) return dayLabel(gap.max) + " without supply";
    if (gap.min === 0) return "Up to " + dayLabel(gap.max) + " without supply";
    return gap.min + "–" + dayLabel(gap.max) + " without supply";
  }

  function driftText(drift) {
    function phrase(days) {
      if (days === 0) return "on time";
      return (days > 0 ? "+" : "−") + dayLabel(Math.abs(days));
    }
    var span = drift.min === drift.max ? phrase(drift.min) : phrase(drift.min) + " to " + phrase(drift.max);
    var effect = "";
    if (drift.min > 0) effect = " Supply shrinks each delivery.";
    if (drift.max < 0) effect = " Stock builds up each delivery.";
    return "Drift per delivery: " + span + "." + effect;
  }

  function recordPanel(record) {
    return jsonPanel(
      "Machine-readable scenario (JSON)",
      "Every input and derived value, named by the replenishment ontology. Inputs are your assumptions; outputs are calculations from them. Identical inputs produce an identical record.",
      JSON.stringify(record, null, 2),
      "Scenario record JSON",
      "hygieneroll-scenario.json"
    );
  }

  function jsonPanel(title, noteText, json, label, filename) {
    var details = document.createElement("details");
    details.className = "result-card glass record-panel";
    var summary = document.createElement("summary");
    summary.textContent = title;
    details.appendChild(summary);
    var note = document.createElement("p");
    note.className = "result-aside";
    note.textContent = noteText;
    details.appendChild(note);
    var pre = document.createElement("pre");
    pre.tabIndex = 0;
    pre.setAttribute("aria-label", label);
    pre.textContent = json;
    details.appendChild(pre);
    var save = document.createElement("button");
    save.type = "button";
    save.className = "btn btn-secondary";
    save.textContent = "Save JSON file";
    save.addEventListener("click", function () {
      var url = URL.createObjectURL(new Blob([json], { type: "application/json" }));
      var link = document.createElement("a");
      link.href = url;
      link.download = filename;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      URL.revokeObjectURL(url);
    });
    details.appendChild(save);
    return details;
  }

  // ---- Reference cases: open, verify, compare --------------------------------------

  function referenceError(message) {
    var error = new Error(message);
    error.reference = true;
    return error;
  }

  function loadReferenceFromLocation() {
    if (!scenarioApi || !banner) return;
    var request = scenarioApi.parseCaseFragment(window.location.hash);
    if (request.none) {
      pendingCase = null;
      if (activeReference) clearReference(false);
      return;
    }
    if (request.error) {
      pendingCase = null;
      showReferenceProblem(request.error);
      return;
    }
    if (activeReference && activeReference.id === request.id) return;
    pendingCase = request.id;
    showReferenceMessage("Loading reference case " + request.id + "…");
    loadReference(request.id).then(function (reference) {
      if (pendingCase !== reference.id) return;
      pendingCase = null;
      applyReference(reference);
    }, function (error) {
      if (pendingCase !== request.id) return;
      pendingCase = null;
      showReferenceProblem(error && error.reference ? error.message : "Reference case " + request.id + " could not be loaded.");
    });
  }

  function fetchText(url) {
    if (typeof fetch !== "function") return Promise.reject(referenceError("This browser cannot load reference cases."));
    return fetch(url, { credentials: "same-origin", cache: "no-cache" }).then(function (response) {
      if (!response.ok) throw referenceError("The reference case could not be loaded.");
      return response.text();
    });
  }

  function sha256Hex(text) {
    if (!window.crypto || !window.crypto.subtle || typeof TextEncoder === "undefined") {
      return Promise.reject(referenceError("This browser cannot verify the reference record, so it was not loaded."));
    }
    return window.crypto.subtle.digest("SHA-256", new TextEncoder().encode(text)).then(function (buffer) {
      return Array.prototype.map.call(new Uint8Array(buffer), function (byte) { return ("0" + byte.toString(16)).slice(-2); }).join("");
    });
  }

  // The id has already matched HRR-###; it must also be listed in the published manifest,
  // and the record must hash to the manifest's sha256 before anything is read from it.
  function loadReference(id) {
    return fetchText("reference/cases/manifest.json").then(function (manifestText) {
      var entry = scenarioApi.manifestEntry(JSON.parse(manifestText), id);
      if (!entry) throw referenceError("Reference case " + id + " is not published.");
      return fetchText("reference/cases/" + entry.id + ".json").then(function (recordText) {
        return sha256Hex(recordText).then(function (digest) {
          if (digest !== entry.sha256) throw referenceError("Reference case " + id + " does not match its published fingerprint, so it was not loaded.");
          var checked = scenarioApi.validateReferenceRecord(JSON.parse(recordText), entry, engine);
          if (!checked.ok) throw referenceError("Reference case " + id + " failed validation: " + checked.errors[0]);
          return checked.reference;
        });
      });
    });
  }

  function applyReference(reference) {
    while (list.firstChild) list.removeChild(list.firstChild);
    nextId = 1;
    var card = addItem();
    fillCard(card, reference.inputs);
    activeReference = reference;
    clearResults();
    renderBanner(reference);
    status.textContent = "Loaded reference case " + reference.id + ". Calculate to see its results, or change the inputs to compare.";
  }

  function fillCard(card, inputs) {
    var preset = element(card, "preset");
    preset.value = "custom";
    preset.dispatchEvent(new Event("change", { bubbles: true }));
    var name = element(card, "name");
    name.value = inputs.name;
    name.dispatchEvent(new Event("input", { bubbles: true }));
    var unit = element(card, "unit");
    unit.value = inputs.unit || "";
    unit.dataset.touched = "true";
    card.dataset.category = inputs.category || "";
    var radio = card.querySelector('input[type="radio"][value="' + (inputs.usageMode === "duration" ? "duration" : "weekly") + '"]');
    radio.checked = true;
    radio.dispatchEvent(new Event("change", { bubbles: true }));
    setNumber(card, "quantity", inputs.quantity);
    setNumber(card, "weekly", inputs.weeklyUsage);
    setNumber(card, "duration", inputs.durationWeeks);
    setNumber(card, "lead", inputs.leadTimeDays);
    setNumber(card, "buffer", inputs.bufferDays);
    setNumber(card, "variability", inputs.variabilityPercent);
    setNumber(card, "replenishment", inputs.replenishmentQuantity);
    setNumber(card, "interval", inputs.intervalDays);
  }

  function setNumber(card, key, value) {
    var input = element(card, key);
    if (input) input.value = value === null || value === undefined ? "" : String(value);
  }

  function clearBanner() {
    banner.textContent = "";
    banner.className = "reference-banner glass";
  }

  function renderBanner(reference) {
    clearBanner();
    banner.hidden = false;
    var title = document.createElement("p");
    title.className = "reference-title";
    title.textContent = "Reference case " + reference.id + " · version " + reference.version + ": " + reference.title;
    banner.appendChild(title);
    var note = document.createElement("p");
    note.textContent = "Verified synthetic reference. Its fingerprint matches the published manifest. Change any input and calculate to compare your scenario with it. Your scenario is yours: it is not verified and does not change the reference.";
    banner.appendChild(note);
    var links = document.createElement("p");
    links.className = "reference-links";
    links.appendChild(link("reference/cases/#" + reference.slug, "View the reference case"));
    links.appendChild(document.createTextNode(" · "));
    links.appendChild(link("reference/cases/" + reference.id + ".json", "Reference record (JSON)"));
    banner.appendChild(links);
    banner.appendChild(bannerButton("Stop comparing", function () { clearReference(true); }));
  }

  function showReferenceMessage(text) {
    clearBanner();
    banner.hidden = false;
    var note = document.createElement("p");
    note.textContent = text;
    banner.appendChild(note);
  }

  function showReferenceProblem(text) {
    activeReference = null;
    clearBanner();
    banner.hidden = false;
    banner.className = "reference-banner reference-problem glass";
    var note = document.createElement("p");
    note.textContent = text + " The calculator works normally without it.";
    banner.appendChild(note);
    banner.appendChild(bannerButton("Dismiss", function () { clearReference(true); }));
    status.textContent = text;
  }

  function clearReference(updateUrl) {
    activeReference = null;
    pendingCase = null;
    clearBanner();
    banner.hidden = true;
    if (updateUrl && window.location.hash && window.history && window.history.replaceState) {
      window.history.replaceState(null, "", window.location.pathname + window.location.search);
    }
    if (results.childNodes.length) clearResults();
    status.textContent = "Reference comparison closed. Your inputs are kept.";
  }

  function link(href, text) {
    var anchor = document.createElement("a");
    anchor.href = href;
    anchor.textContent = text;
    return anchor;
  }

  function bannerButton(text, onClick) {
    var button = document.createElement("button");
    button.type = "button";
    button.className = "btn btn-secondary";
    button.textContent = text;
    button.addEventListener("click", onClick);
    return button;
  }

  function windowLabel(w) {
    if (w.earliest === w.latest) return w.earliest === 0 ? "Now" : dayLabel(w.earliest);
    return w.earliest + "–" + w.latest + " days";
  }

  function signed(value) {
    if (value === 0) return "0";
    return (value > 0 ? "+" : "−") + formatNumber(Math.abs(value));
  }

  function windowChange(delta) {
    if (delta.earliest === 0 && delta.latest === 0) return "No change";
    if (delta.earliest === delta.latest) return signed(delta.earliest) + " days";
    return signed(delta.earliest) + " / " + signed(delta.latest) + " days";
  }

  function fitLabel(side) {
    if (!side.applicable) return "Not applicable";
    return FIT_TEXT[side.fit] + " (" + formatNumber(side.interval_days) + "-day interval)";
  }

  function gapLabel(gap) {
    if (gap.max === 0) return "no days without supply";
    if (gap.min === gap.max) return dayLabel(gap.max) + " without supply";
    return gap.min + "–" + dayLabel(gap.max) + " without supply";
  }

  var STATUS_SHORT = {
    BUFFER_INTACT: "Buffer intact",
    BUFFER_DRAWN: "Buffer absorbs it",
    STOCKOUT_POSSIBLE: "Stockout possible",
    STOCKOUT_AT_BOTH_BOUNDS: "Stockout at both bounds"
  };

  var FIELD_LABELS = {
    quantity: "Current quantity",
    usageMode: "Usage method",
    weeklyUsage: "Units per week",
    durationWeeks: "Typical duration (weeks)",
    variabilityPercent: "Usage variability (%)",
    leadTimeDays: "Lead time (days)",
    bufferDays: "Safety buffer (days)",
    replenishmentQuantity: "Replenishment quantity",
    intervalDays: "Fixed delivery interval (days)"
  };

  function comparisonPanel(record, scenarioInputs, itemCount) {
    var comparison = scenarioApi.compare(activeReference, scenarioInputs, record.items[0].outputs);
    var panel = document.createElement("article");
    panel.className = "result-card glass compare-card";
    panel.setAttribute("aria-labelledby", "compare-heading");
    var heading = document.createElement("h2");
    heading.id = "compare-heading";
    heading.textContent = "Reference vs your scenario";
    panel.appendChild(heading);

    var badges = document.createElement("p");
    badges.className = "compare-badges";
    var refBadge = document.createElement("span");
    refBadge.className = "badge badge-ref";
    refBadge.textContent = "Reference " + activeReference.id + " v" + activeReference.version + ": verified synthetic record";
    var userBadge = document.createElement("span");
    userBadge.className = "badge badge-user";
    userBadge.textContent = "Your scenario: user-generated, not verified";
    badges.appendChild(refBadge);
    badges.appendChild(userBadge);
    panel.appendChild(badges);

    if (itemCount > 1) appendNote(panel, "Only the first item is compared with the reference.");
    if (comparison.identical_inputs) {
      var same = scenarioApi.canonical(record.items[0].outputs) === scenarioApi.canonical(activeReference.outputs);
      appendNote(panel, same
        ? "Your inputs match the reference, and the results equal its verified values."
        : "Your inputs match the reference, but this engine gives different results from the reference record. The reference record was verified with engine " + activeReference.engineVersion + ".");
    } else {
      var changed = document.createElement("ul");
      changed.className = "compare-changes";
      comparison.changed_inputs.forEach(function (change) {
        var item = document.createElement("li");
        item.textContent = (FIELD_LABELS[change.field] || change.field) + ": " + inputText(change.reference) + " → " + inputText(change.scenario);
        changed.appendChild(item);
      });
      appendNote(panel, "You changed:");
      panel.appendChild(changed);
    }

    var table = document.createElement("table");
    table.className = "compare-table";
    var head = document.createElement("thead");
    head.appendChild(row(["Measure", "Reference (verified)", "Your scenario", "Change"], "th", "col"));
    table.appendChild(head);
    var body = document.createElement("tbody");
    body.appendChild(row(["Supply runs out", windowLabel(comparison.depletion_days.reference), windowLabel(comparison.depletion_days.scenario), windowChange(comparison.depletion_days.delta)], "td"));
    body.appendChild(row(["Order window", windowLabel(comparison.planning_trigger_days.reference), windowLabel(comparison.planning_trigger_days.scenario), windowChange(comparison.planning_trigger_days.delta)], "td"));
    body.appendChild(row(["Replenishment cadence", windowLabel(comparison.replenishment_cadence_days.reference), windowLabel(comparison.replenishment_cadence_days.scenario), windowChange(comparison.replenishment_cadence_days.delta)], "td"));
    var threshold = comparison.reorder_threshold_units;
    body.appendChild(row(["Reorder threshold", formatNumber(threshold.reference) + " units", formatNumber(threshold.scenario) + " units", threshold.delta === 0 ? "No change" : signed(threshold.delta) + " units"], "td"));
    var fit = comparison.fixed_interval_fit;
    var fitChange = !fit.reference.applicable && !fit.scenario.applicable ? "Not applicable" : (fit.reference.fit === fit.scenario.fit && fit.reference.interval_days === fit.scenario.interval_days ? "No change" : "Changed");
    body.appendChild(row(["Fixed delivery interval", fitLabel(fit.reference), fitLabel(fit.scenario), fitChange], "td"));
    comparison.stockout_exposure.forEach(function (slip) {
      var gapChange = slip.delta_gap_days.min === 0 && slip.delta_gap_days.max === 0 && slip.reference.status === slip.scenario.status ? "No change" : (slip.delta_gap_days.max === 0 && slip.delta_gap_days.min === 0 ? "Status changed" : windowChange({ earliest: slip.delta_gap_days.min, latest: slip.delta_gap_days.max }) + " without supply");
      body.appendChild(row([
        "Delivery " + slip.slip_days + " days late",
        STATUS_SHORT[slip.reference.status] + ", " + gapLabel(slip.reference.supply_gap_days),
        STATUS_SHORT[slip.scenario.status] + ", " + gapLabel(slip.scenario.supply_gap_days),
        gapChange
      ], "td"));
    });
    table.appendChild(body);
    var wrap = document.createElement("div");
    wrap.className = "compare-wrap";
    wrap.appendChild(table);
    panel.appendChild(wrap);

    [fit.reference, fit.scenario].forEach(function (side, index) {
      if (!side.applicable) appendAside(panel, (index === 0 ? "Reference: " : "Your scenario: ") + side.reason);
    });
    appendAside(panel, "Changes are your scenario minus the reference. Late-delivery rows assume the order is placed at the earliest planning trigger of each side.");

    var exportRecord = scenarioApi.buildScenarioExport(activeReference, scenarioInputs, record, comparison);
    panel.appendChild(jsonPanel(
      "Comparison and provenance (JSON)",
      "Your scenario, its source reference case and version, the engine version, and the differences. It is marked as a user scenario, not a reference record.",
      scenarioApi.canonical(exportRecord),
      "Comparison and provenance JSON",
      "hygieneroll-" + activeReference.id.toLowerCase() + "-scenario.json"
    ));
    return panel;
  }

  function inputText(value) {
    if (value === null || value === undefined || value === "") return "blank";
    return typeof value === "number" ? formatNumber(value) : String(value);
  }

  function row(cells, tag, scope) {
    var tr = document.createElement("tr");
    cells.forEach(function (text, index) {
      var cell = document.createElement(index === 0 && tag === "td" ? "th" : tag);
      if (index === 0 && tag === "td") cell.scope = "row";
      if (scope) cell.scope = scope;
      cell.textContent = text;
      tr.appendChild(cell);
    });
    return tr;
  }

  function usageText(item) {
    if (item.usageMode === "duration") {
      return quantityText(item.quantity, item.unit, item.unitKind) + (item.quantity === 1 ? " usually lasts " : " usually last ") + formatNumber(item.durationWeeks) + (item.durationWeeks === 1 ? " week" : " weeks");
    }
    return quantityText(item.weeklyUsage, item.unit, item.unitKind) + "/week";
  }

  function quantityText(quantity, unit, unitKind) {
    return engine.formatSupply(quantity, unit, unitKind);
  }

  function dayLabel(value) {
    return formatNumber(value) + (value === 1 ? " day" : " days");
  }

  function formatNumber(value) {
    if (Number.isInteger(value)) return String(value);
    return String(Math.round(value * 100) / 100);
  }

  function appendHeading(parent, text) {
    var heading = document.createElement("h2");
    heading.textContent = text;
    parent.appendChild(heading);
  }

  function appendPair(parent, label, value) {
    var row = document.createElement("p");
    row.className = "result-row";
    var name = document.createElement("span");
    name.textContent = label;
    var amount = document.createElement("strong");
    amount.textContent = value;
    row.appendChild(name);
    row.appendChild(amount);
    parent.appendChild(row);
  }

  function appendAside(parent, text) {
    if (!text) return;
    var note = document.createElement("p");
    note.className = "result-aside";
    note.textContent = text;
    parent.appendChild(note);
  }

  function appendNote(parent, text) {
    var note = document.createElement("p");
    note.className = "result-note";
    note.textContent = text;
    parent.appendChild(note);
  }
})();
