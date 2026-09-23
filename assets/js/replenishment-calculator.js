(function () {
  "use strict";

  var engine = window.HygieneRollReplenishment;
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

  var list;
  var addButton;
  var limitNote;
  var results;
  var status;

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

    document.getElementById("calculator-form").addEventListener("submit", function (event) {
      event.preventDefault();
      calculate();
    });
    addButton.addEventListener("click", function () {
      if (list.children.length >= MAX_ITEMS) return;
      var card = addItem();
      var select = card.querySelector("select");
      if (select) select.focus();
    });
    document.getElementById("reset-scenario").addEventListener("click", resetScenario);

    addItem();
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

    var quantity = numberField(id, "quantity", "Current quantity", "e.g. 6", "0");
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
    planningGrid.appendChild(numberField(id, "lead", "Lead time (days)", "e.g. 4", "0").wrap);
    planningGrid.appendChild(numberField(id, "buffer", "Safety buffer (days)", "e.g. 3", "0").wrap);
    var variability = numberField(id, "variability", "Usage variability (%)", "0", "0");
    variability.input.value = "0";
    variability.input.max = "50";
    planningGrid.appendChild(variability.wrap);
    planningGrid.appendChild(numberField(id, "replenishment", "Replenishment quantity", "e.g. 6", "0").wrap);
    planning.appendChild(planningGrid);

    var hint = document.createElement("p");
    hint.className = "field-hint";
    hint.textContent = "Variability widens the planning window; it is not a confidence interval. Leave replenishment quantity blank to use the current quantity.";
    planning.appendChild(hint);
    card.appendChild(planning);

    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn-quiet remove-item";
    remove.addEventListener("click", function () {
      if (list.children.length === 1) {
        list.removeChild(card);
        var fresh = addItem();
        clearResults();
        var focusTarget = fresh.querySelector("select");
        if (focusTarget) focusTarget.focus();
        return;
      }
      list.removeChild(card);
      syncLimit();
      clearResults();
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

    var weeklyField = numberField(id, "weekly", "Units per week", "e.g. 2", "0");
    var durationField = numberField(id, "duration", "Typical duration (weeks)", "e.g. 3", "0");
    durationField.wrap.hidden = true;
    wrap.appendChild(weeklyField.wrap);
    wrap.appendChild(durationField.wrap);

    function sync() {
      var useWeekly = weekly.input.checked;
      weeklyField.wrap.hidden = !useWeekly;
      durationField.wrap.hidden = useWeekly;
    }
    weekly.input.addEventListener("change", sync);
    duration.input.addEventListener("change", sync);
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

  function numberField(id, key, labelText, placeholder, min) {
    var built = labeledControl(id, key, labelText, "input");
    built.control.type = "number";
    built.control.inputMode = "decimal";
    built.control.step = "any";
    built.control.min = min;
    built.control.placeholder = placeholder;
    built.control.autocomplete = "off";
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
    render(summary);
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

    return {
      input: {
        name: preset.id === "custom" ? custom : preset.name,
        unit: valueOf(card, "unit").trim(),
        quantity: quantity.empty || quantity.invalid ? Number.NaN : quantity.value,
        usageMode: mode,
        weeklyUsage: mode === "weekly" ? (weekly.empty || weekly.invalid ? Number.NaN : weekly.value) : null,
        durationWeeks: mode === "duration" ? (duration.empty || duration.invalid ? Number.NaN : duration.value) : null,
        leadTimeDays: lead.empty || lead.invalid ? Number.NaN : lead.value,
        bufferDays: buffer.empty || buffer.invalid ? Number.NaN : buffer.value,
        variabilityPercent: variability.empty || variability.invalid ? Number.NaN : variability.value,
        replenishmentQuantity: replenishment.empty ? "" : (replenishment.invalid ? Number.NaN : replenishment.value)
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

  function render(summary) {
    results.textContent = "";
    var summaryCard = document.createElement("article");
    summaryCard.className = "result-card glass";
    appendHeading(summaryCard, "Next household return");

    var nameLine = document.createElement("p");
    nameLine.className = "result-name";
    nameLine.textContent = summary.nextReturn.names.join(", ");
    summaryCard.appendChild(nameLine);

    if (windowsMatch(summary.nextReturn.items)) {
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

    var first = summary.nextReturn.names.join(", ");
    var triggerText = windowsMatch(summary.nextReturn.items)
      ? summary.nextReturn.items[0].text.trigger
      : "see tied items";
    status.textContent = "Next household return: " + first + ". Planning trigger: " + triggerText + ".";
  }

  function windowsMatch(items) {
    return items.every(function (item) {
      return item.trigger.earliest === items[0].trigger.earliest && item.trigger.latest === items[0].trigger.latest;
    });
  }

  function itemCard(item) {
    var card = document.createElement("article");
    card.className = "result-card glass";
    var title = document.createElement("h3");
    title.textContent = item.name;
    card.appendChild(title);
    appendPair(card, "Current supply", quantityText(item.quantity, item.unit));
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
    appendPair(card, "Variability allowance", formatNumber(item.variabilityPercent) + "%");
    return card;
  }

  function usageText(item) {
    var unit = item.unit ? " " + item.unit : "";
    if (item.usageMode === "duration") {
      return quantityText(item.quantity, item.unit) + (item.quantity === 1 ? " usually lasts " : " usually last ") + formatNumber(item.durationWeeks) + (item.durationWeeks === 1 ? " week" : " weeks");
    }
    return formatNumber(item.weeklyUsage) + unit + "/week";
  }

  function quantityText(quantity, unit) {
    return formatNumber(quantity) + (unit ? " " + unit : "");
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
