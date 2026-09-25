"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");

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

var CLASSES = [
  "PROJECT_DEFINITION",
  "OBSERVED_EVIDENCE",
  "DERIVED_INTERPRETATION",
  "ILLUSTRATIVE_MODEL"
];

var ADMISSION = ["ADMITTED", "REVIEW_REQUIRED", "BLOCKED"];

function sourceIndex(register) {
  var index = {};
  (register.sources || []).forEach(function (source) {
    index[source.id] = source;
  });
  return index;
}

function admissionErrors(claim, sources) {
  var errors = [];
  if (CLASSES.indexOf(claim.class) === -1) {
    errors.push("class");
  }
  var ids = claim.source_ids || [];
  var origins = claim.origin_refs || [];
  if (claim.class === "PROJECT_DEFINITION") {
    if (ids.length !== 0) errors.push("project-definition-with-source");
    if (origins.length === 0) errors.push("project-definition-without-origin");
  }
  if (claim.class === "OBSERVED_EVIDENCE" && ids.length === 0) {
    errors.push("observed-without-source");
  }
  if (claim.class === "DERIVED_INTERPRETATION" && ids.length === 0) {
    errors.push("derived-without-source");
  }
  var needsAdmission = claim.class === "OBSERVED_EVIDENCE" || claim.class === "DERIVED_INTERPRETATION";
  ids.forEach(function (id) {
    var source = sources[id];
    if (!source) {
      errors.push("unresolved-source:" + id);
      return;
    }
    if (needsAdmission && source.admission_status !== "ADMITTED") {
      errors.push("source-not-admitted:" + id);
    }
  });
  return errors;
}

function sourceRecord(status) {
  return {
    "SRC-HR-9001": {
      id: "SRC-HR-9001",
      title: "Synthetic fixture",
      publisher: "Test",
      url: "https://example.invalid/src",
      source_type: "fixture",
      admission_status: status
    }
  };
}

var knowledge = JSON.parse(read("reference/knowledge-objects.json"));
var sources = JSON.parse(read("reference/source-register.json"));
var page = read("reference.html");
var sitemap = read("sitemap.xml");
var indexedSources = sourceIndex(sources);

test("registry JSON parses", function () {
  assert.ok(Array.isArray(knowledge.objects));
});

test("version exists", function () {
  assert.strictEqual(knowledge.version, "0.1");
  assert.strictEqual(sources.version, "0.1");
});

test("exactly 8 foundation objects", function () {
  assert.strictEqual(knowledge.objects.length, 8);
});

test("knowledge-object IDs are unique", function () {
  var ids = knowledge.objects.map(function (object) { return object.id; });
  assert.strictEqual(new Set(ids).size, ids.length);
});

test("claim IDs are unique", function () {
  var ids = [];
  knowledge.objects.forEach(function (object) {
    object.claims.forEach(function (claim) { ids.push(claim.id); });
  });
  assert.ok(ids.length > 0);
  assert.strictEqual(new Set(ids).size, ids.length);
});

test("slugs are unique", function () {
  var slugs = knowledge.objects.map(function (object) { return object.slug; });
  assert.strictEqual(new Set(slugs).size, slugs.length);
});

test("all objects are ACTIVE", function () {
  knowledge.objects.forEach(function (object) {
    assert.strictEqual(object.status, "ACTIVE");
  });
});

test("allowed claim classes only", function () {
  knowledge.objects.forEach(function (object) {
    object.claims.forEach(function (claim) {
      assert.ok(CLASSES.indexOf(claim.class) !== -1);
    });
  });
});

test("OBSERVED_EVIDENCE cannot have empty source_ids", function () {
  knowledge.objects.forEach(function (object) {
    object.claims.forEach(function (claim) {
      if (claim.class === "OBSERVED_EVIDENCE") {
        assert.ok(claim.source_ids.length > 0);
      }
    });
  });
  var errors = admissionErrors({
    class: "OBSERVED_EVIDENCE",
    source_ids: []
  }, indexedSources);
  assert.ok(errors.indexOf("observed-without-source") !== -1);
});

test("external source IDs must resolve", function () {
  knowledge.objects.forEach(function (object) {
    object.claims.forEach(function (claim) {
      claim.source_ids.forEach(function (id) {
        assert.ok(indexedSources[id], id);
      });
    });
  });
});

test("related object IDs must resolve", function () {
  var ids = {};
  knowledge.objects.forEach(function (object) { ids[object.id] = true; });
  knowledge.objects.forEach(function (object) {
    object.related_objects.forEach(function (id) {
      assert.ok(ids[id], id);
      assert.notStrictEqual(id, object.id);
    });
  });
});

test("origin_refs are not treated as source_ids", function () {
  knowledge.objects.forEach(function (object) {
    var origins = {};
    object.origin_refs.forEach(function (ref) { origins[ref] = true; });
    object.claims.forEach(function (claim) {
      claim.source_ids.forEach(function (id) {
        assert.ok(!origins[id]);
      });
      claim.origin_refs.forEach(function (ref) {
        assert.ok(!indexedSources[ref]);
      });
    });
  });
  var errors = admissionErrors({
    class: "PROJECT_DEFINITION",
    source_ids: [],
    origin_refs: ["CALCULATOR_METHODOLOGY.md"]
  }, indexedSources);
  assert.deepStrictEqual(errors, []);
});

test("every registered object ID appears in reference.html", function () {
  knowledge.objects.forEach(function (object) {
    assert.ok(page.indexOf(object.id) !== -1, object.id);
  });
});

test("every registered slug appears as an HTML anchor", function () {
  knowledge.objects.forEach(function (object) {
    assert.ok(page.indexOf('id="' + object.slug + '"') !== -1, object.slug);
  });
});

test("every registered title appears in reference.html", function () {
  knowledge.objects.forEach(function (object) {
    assert.ok(page.indexOf(object.title) !== -1, object.title);
  });
});

test("source register parses", function () {
  assert.ok(Array.isArray(sources.sources));
  var ids = sources.sources.map(function (source) { return source.id; });
  assert.strictEqual(new Set(ids).size, ids.length);
  sources.sources.forEach(function (source) {
    ["id", "title", "publisher", "url", "source_type", "admission_status"].forEach(function (field) {
      assert.ok(source[field], field);
    });
    assert.ok(ADMISSION.indexOf(source.admission_status) !== -1, source.admission_status);
  });
});

test("sitemap contains reference.html", function () {
  assert.ok(sitemap.indexOf("https://hygieneroll.com/reference.html") !== -1);
});

test("reference canonical is correct", function () {
  assert.ok(page.indexOf('rel="canonical" href="https://hygieneroll.com/reference.html"') !== -1);
});

test("reference page contains Calculator link", function () {
  assert.ok(page.indexOf('href="calculator.html"') !== -1);
});

test("reference page contains Replenishment Model link", function () {
  assert.ok(page.indexOf('href="replenishment-model.html"') !== -1);
});

test("unresolved derived interpretation fails closed", function () {
  var errors = admissionErrors({
    class: "DERIVED_INTERPRETATION",
    source_ids: ["SRC-HR-9999"]
  }, indexedSources);
  assert.ok(errors.indexOf("unresolved-source:SRC-HR-9999") !== -1);
  var missing = admissionErrors({
    class: "DERIVED_INTERPRETATION",
    source_ids: []
  }, indexedSources);
  assert.ok(missing.indexOf("derived-without-source") !== -1);
});

test("allowed admission statuses", function () {
  assert.deepStrictEqual(ADMISSION, ["ADMITTED", "REVIEW_REQUIRED", "BLOCKED"]);
  var unknown = { admission_status: "QUALIFIED" };
  assert.ok(ADMISSION.indexOf(unknown.admission_status) === -1);
});

test("observed claim with unresolved source fails", function () {
  var errors = admissionErrors({
    class: "OBSERVED_EVIDENCE",
    source_ids: ["SRC-HR-4040"]
  }, {});
  assert.ok(errors.indexOf("unresolved-source:SRC-HR-4040") !== -1);
});

test("blocked source cannot support observed claim", function () {
  var errors = admissionErrors({
    class: "OBSERVED_EVIDENCE",
    source_ids: ["SRC-HR-9001"]
  }, sourceRecord("BLOCKED"));
  assert.ok(errors.indexOf("source-not-admitted:SRC-HR-9001") !== -1);
});

test("review-required source cannot support observed claim", function () {
  var errors = admissionErrors({
    class: "OBSERVED_EVIDENCE",
    source_ids: ["SRC-HR-9001"]
  }, sourceRecord("REVIEW_REQUIRED"));
  assert.ok(errors.indexOf("source-not-admitted:SRC-HR-9001") !== -1);
});

test("admitted source supports observed claim", function () {
  var errors = admissionErrors({
    class: "OBSERVED_EVIDENCE",
    source_ids: ["SRC-HR-9001"]
  }, sourceRecord("ADMITTED"));
  assert.deepStrictEqual(errors, []);
});

test("derived interpretation requires a source", function () {
  var errors = admissionErrors({
    class: "DERIVED_INTERPRETATION",
    source_ids: []
  }, {});
  assert.ok(errors.indexOf("derived-without-source") !== -1);
});

test("derived interpretation requires an admitted source", function () {
  var blocked = admissionErrors({
    class: "DERIVED_INTERPRETATION",
    source_ids: ["SRC-HR-9001"]
  }, sourceRecord("BLOCKED"));
  assert.ok(blocked.indexOf("source-not-admitted:SRC-HR-9001") !== -1);
  var pending = admissionErrors({
    class: "DERIVED_INTERPRETATION",
    source_ids: ["SRC-HR-9001"]
  }, sourceRecord("REVIEW_REQUIRED"));
  assert.ok(pending.indexOf("source-not-admitted:SRC-HR-9001") !== -1);
  var admitted = admissionErrors({
    class: "DERIVED_INTERPRETATION",
    source_ids: ["SRC-HR-9001"]
  }, sourceRecord("ADMITTED"));
  assert.deepStrictEqual(admitted, []);
});

test("project definition rejects source_ids", function () {
  var errors = admissionErrors({
    class: "PROJECT_DEFINITION",
    source_ids: ["SRC-HR-9001"],
    origin_refs: ["calculator.html"]
  }, sourceRecord("ADMITTED"));
  assert.ok(errors.indexOf("project-definition-with-source") !== -1);
});

test("project definition requires origin_refs", function () {
  var errors = admissionErrors({
    class: "PROJECT_DEFINITION",
    source_ids: [],
    origin_refs: []
  }, {});
  assert.ok(errors.indexOf("project-definition-without-origin") !== -1);
  knowledge.objects.forEach(function (object) {
    object.claims.forEach(function (claim) {
      if (claim.class === "PROJECT_DEFINITION") {
        assert.deepStrictEqual(admissionErrors(claim, indexedSources), []);
      }
    });
  });
});

test("every claim ID maps to exactly one HTML claim element", function () {
  var rendered = page.match(/data-claim-id="(HRC-\d+)"/g) || [];
  var ids = rendered.map(function (token) { return token.slice('data-claim-id="'.length, -1); });
  assert.strictEqual(new Set(ids).size, ids.length);
  var registered = [];
  knowledge.objects.forEach(function (object) {
    object.claims.forEach(function (claim) { registered.push(claim.id); });
  });
  assert.deepStrictEqual(ids.slice().sort(), registered.slice().sort());
  ids.forEach(function (id) {
    assert.ok(registered.indexOf(id) !== -1, id);
  });
});

test("every claim text matches its rendered claim element", function () {
  knowledge.objects.forEach(function (object) {
    object.claims.forEach(function (claim) {
      var pattern = new RegExp('<p data-claim-id="' + claim.id + '">([\\s\\S]*?)</p>');
      var match = page.match(pattern);
      assert.ok(match, claim.id);
      assert.strictEqual(match[1], claim.text);
    });
  });
});

console.log(passed + " passed");
