"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var engine = require("../assets/js/replenishment-engine.js");

var root = path.join(__dirname, "..");
var passed = 0;

function test(name, fn) {
  fn();
  passed += 1;
  console.log("ok - " + name);
}

function read(relativePath) {
  return fs.readFileSync(path.join(root, relativePath), "utf8");
}

function ids(list, key) {
  return list.map(function (entry) { return entry[key || "id"]; });
}

function lookup(object, dotted) {
  return dotted.split(".").reduce(function (value, key) {
    return value !== undefined && value !== null && Object.prototype.hasOwnProperty.call(value, key) ? value[key] : undefined;
  }, object);
}

function fixture(overrides) {
  return Object.assign({
    name: "Fixture item",
    unit: "rolls",
    unitKind: "preset",
    category: "PAPER_HYGIENE",
    quantity: 6,
    usageMode: "weekly",
    weeklyUsage: 2,
    leadTimeDays: 4,
    bufferDays: 3,
    variabilityPercent: 20,
    replenishmentQuantity: 12,
    intervalDays: 28
  }, overrides);
}

var ontology = JSON.parse(read("reference/replenishment-ontology.json"));
var knowledge = JSON.parse(read("reference/knowledge-objects.json"));
var sources = JSON.parse(read("reference/source-register.json"));
var reference = read("reference.html");
var LAYERS = ["PROJECT_DEFINITION", "OBSERVED_EVIDENCE", "DERIVED_CALCULATION", "HYPOTHETICAL_SCENARIO"];
var record = engine.buildScenarioRecord([fixture()]);
var itemRecord = record.items[0];

test("ontology parses with version and engine version", function () {
  assert.strictEqual(ontology.version, "0.1");
  assert.strictEqual(ontology.version, engine.ontologyVersion);
  assert.strictEqual(ontology.engine_version, engine.version);
  assert.strictEqual(record.ontology.version, ontology.version);
  assert.strictEqual(record.ontology.url, ontology.id);
});

test("layers are exactly the four controlled layers", function () {
  assert.deepStrictEqual(ids(ontology.layers), LAYERS);
});

test("concept IDs are unique, stable in form, and slugs are unique", function () {
  var conceptIds = ids(ontology.concepts);
  assert.strictEqual(new Set(conceptIds).size, conceptIds.length);
  conceptIds.forEach(function (id) { assert.ok(/^HRO-\d{3}$/.test(id), id); });
  var slugs = ids(ontology.concepts, "slug");
  assert.strictEqual(new Set(slugs).size, slugs.length);
});

test("every concept uses a declared layer, status, and dimension", function () {
  var statuses = ids(ontology.statuses);
  var dimensions = ids(ontology.dimensions);
  ontology.concepts.forEach(function (concept) {
    assert.ok(LAYERS.indexOf(concept.layer) !== -1, concept.id);
    assert.ok(statuses.indexOf(concept.status) !== -1, concept.id);
    assert.ok(dimensions.indexOf(concept.dimension) !== -1, concept.id);
    assert.ok(concept.definition && concept.definition.length > 20, concept.id);
    assert.ok(/^\d+\.\d+$/.test(concept.since), concept.id);
  });
});

test("required replenishment concepts are covered", function () {
  var terms = ids(ontology.concepts, "term");
  [
    "Product category", "Consumption unit", "Household demand profile", "Consumption rate",
    "Depletion interval", "Reserve stock", "Reorder threshold", "Fulfillment lead time",
    "Replenishment cadence", "Subscription compatibility", "Stockout exposure"
  ].forEach(function (term) { assert.ok(terms.indexOf(term) !== -1, term); });
});

test("project definitions carry origins and no sources", function () {
  ontology.concepts.forEach(function (concept) {
    assert.ok(Array.isArray(concept.origin_refs) && concept.origin_refs.length > 0, concept.id);
    concept.origin_refs.forEach(function (ref) {
      assert.ok(fs.existsSync(path.join(root, ref)), concept.id + " " + ref);
    });
    if (concept.layer !== "OBSERVED_EVIDENCE") {
      assert.ok(!concept.source_ids || concept.source_ids.length === 0, concept.id);
    }
  });
});

test("derived calculations name a formula and an exported engine operation", function () {
  ontology.concepts.filter(function (concept) { return concept.layer === "DERIVED_CALCULATION"; }).forEach(function (concept) {
    assert.ok(concept.formula, concept.id);
    assert.strictEqual(typeof engine[concept.engine_operation], "function", concept.id);
  });
});

test("observed evidence fails closed: active values need admitted sources", function () {
  var admitted = {};
  sources.sources.forEach(function (source) {
    if (source.admission_status === "ADMITTED") admitted[source.id] = true;
  });
  ontology.concepts.filter(function (concept) { return concept.layer === "OBSERVED_EVIDENCE"; }).forEach(function (concept) {
    assert.ok(Array.isArray(concept.source_ids), concept.id);
    var supported = concept.source_ids.length > 0 && concept.source_ids.every(function (id) { return admitted[id]; });
    if (!supported) assert.strictEqual(concept.status, "RESERVED", concept.id);
    assert.ok(!concept.record_fields, concept.id + " must not be a scenario field");
    assert.ok(!concept.engine_operation, concept.id + " must not be computed");
  });
});

test("engine record never claims observed evidence or benchmarks", function () {
  assert.strictEqual(record.epistemic_status.inputs, "HYPOTHETICAL_SCENARIO");
  assert.strictEqual(record.epistemic_status.outputs, "DERIVED_CALCULATION");
  assert.strictEqual(record.epistemic_status.observed_evidence_used, false);
  assert.strictEqual(record.epistemic_status.embedded_benchmarks, false);
  assert.strictEqual(record.uncertainty.statistical_confidence, false);
});

test("every concept record field resolves in a generated scenario record", function () {
  ontology.concepts.forEach(function (concept) {
    (concept.record_fields || []).forEach(function (field) {
      var top = lookup(record, field);
      var item = lookup(itemRecord, field);
      assert.ok(top !== undefined || item !== undefined, concept.id + " " + field);
    });
  });
});

test("every scenario-record item field maps to an ontology concept", function () {
  var mapped = {};
  ontology.concepts.forEach(function (concept) {
    (concept.record_fields || []).forEach(function (field) { mapped[field] = concept; });
  });
  ["inputs", "outputs"].forEach(function (group) {
    Object.keys(itemRecord[group]).forEach(function (key) {
      var field = group + "." + key;
      assert.ok(mapped[field], field);
    });
  });
});

test("input fields are scenario or project concepts, output fields are derived", function () {
  ontology.concepts.forEach(function (concept) {
    (concept.record_fields || []).forEach(function (field) {
      if (field.indexOf("inputs.") === 0) {
        assert.ok(concept.layer === "HYPOTHETICAL_SCENARIO" || concept.layer === "PROJECT_DEFINITION", concept.id);
      }
      if (field.indexOf("outputs.") === 0) {
        assert.strictEqual(concept.layer, "DERIVED_CALCULATION", concept.id);
      }
    });
  });
});

test("controlled values match the engine", function () {
  assert.deepStrictEqual(ids(ontology.categories, "code"), engine.categories);
  var fit = ontology.concepts.find(function (concept) { return concept.id === "HRO-019"; });
  assert.ok(fit.values.indexOf(itemRecord.outputs.fixed_interval_fit.fit) !== -1);
  var exposure = ontology.concepts.find(function (concept) { return concept.id === "HRO-020"; });
  itemRecord.outputs.lead_time_slip.forEach(function (row) {
    assert.ok(exposure.values.indexOf(row.exposure_if_ordered_at_trigger.status) !== -1);
  });
});

test("relationships use declared predicates and resolve both ends", function () {
  var conceptIds = ids(ontology.concepts);
  var predicates = ids(ontology.predicates);
  var seen = {};
  ontology.relationships.forEach(function (rel) {
    assert.ok(conceptIds.indexOf(rel.subject) !== -1, rel.subject);
    assert.ok(conceptIds.indexOf(rel.object) !== -1, rel.object);
    assert.ok(predicates.indexOf(rel.predicate) !== -1, rel.predicate);
    assert.notStrictEqual(rel.subject, rel.object);
    var key = rel.subject + " " + rel.predicate + " " + rel.object;
    assert.ok(!seen[key], "duplicate " + key);
    seen[key] = true;
  });
});

test("derived_from graph has no cycles", function () {
  var edges = {};
  ontology.relationships.filter(function (rel) { return rel.predicate === "derived_from"; }).forEach(function (rel) {
    (edges[rel.subject] = edges[rel.subject] || []).push(rel.object);
  });
  var state = {};
  function visit(node) {
    assert.notStrictEqual(state[node], 1, "cycle at " + node);
    if (state[node] === 2) return;
    state[node] = 1;
    (edges[node] || []).forEach(visit);
    state[node] = 2;
  }
  Object.keys(edges).forEach(visit);
});

test("related knowledge objects resolve", function () {
  var known = ids(knowledge.objects);
  ontology.concepts.forEach(function (concept) {
    (concept.related_knowledge_objects || []).forEach(function (id) {
      assert.ok(known.indexOf(id) !== -1, concept.id + " " + id);
    });
  });
});

test("versioning rules are declared", function () {
  assert.ok(ontology.versioning.rules.length >= 4);
  assert.ok(ontology.versioning.rules.some(function (rule) { return /never reused/.test(rule); }));
});

test("reference page renders every concept with matching term and layer", function () {
  ontology.concepts.forEach(function (concept) {
    var pattern = new RegExp('<tr id="term-' + concept.slug + '" data-concept-id="' + concept.id + '" data-layer="' + concept.layer + '">\\s*<td>' + concept.id + '</td>\\s*<th scope="row">([^<]+)</th>');
    var match = reference.match(pattern);
    assert.ok(match, concept.id);
    assert.strictEqual(match[1], concept.term);
  });
  var rows = reference.match(/data-concept-id="HRO-\d{3}"/g) || [];
  assert.strictEqual(rows.length, ontology.concepts.length);
});

console.log(passed + " passed");
