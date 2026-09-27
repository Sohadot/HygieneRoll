"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var gov = require("../reference/evidence-governance.js");

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

// Synthetic fixtures only. None of these is a registered source or a public claim.

function source(overrides) {
  return Object.assign({
    id: "SRC-HR-9001",
    title: "Synthetic household survey fixture",
    publisher: "Test Statistical Office",
    url: "https://example.invalid/survey",
    source_type: "official_statistics",
    publication_date: "2025-03",
    accessed_date: "2026-09-01",
    geography: "United States",
    population: "US households",
    scope: "Household paper hygiene purchases",
    metric: "Share of households purchasing monthly",
    rights_note: "Citation metadata only. No text reproduced.",
    admission_status: "ADMITTED",
    notes: "Fixture for governance tests."
  }, overrides || {});
}

function claim(overrides) {
  return Object.assign({
    id: "HRC-9001",
    class: "OBSERVED_EVIDENCE",
    text: "Synthetic claim text.",
    source_ids: ["SRC-HR-9001"],
    origin_refs: []
  }, overrides || {});
}

function qualification(dimensionOverrides, recordOverrides) {
  return Object.assign({
    claim_id: "HRC-9001",
    source_id: "SRC-HR-9001",
    qualification: Object.assign({
      scope_match: true,
      period_match: true,
      geography_match: true,
      population_match: true,
      metric_match: true,
      wording_supported: true
    }, dimensionOverrides || {}),
    result: "ADMISSIBLE"
  }, recordOverrides || {});
}

function context(sources, qualifications) {
  return {
    sources: sources === undefined ? [source()] : sources,
    qualifications: qualifications === undefined ? [qualification()] : qualifications
  };
}

function blockedFor(result, fragment) {
  assert.strictEqual(result.result, "BLOCKED");
  assert.ok(result.errors.some(function (error) { return error.indexOf(fragment) !== -1; }),
    "expected " + fragment + " in " + JSON.stringify(result.errors));
}

var knowledge = JSON.parse(read("reference/knowledge-objects.json"));
var sourceRegister = JSON.parse(read("reference/source-register.json"));
var qualificationRegister = JSON.parse(read("reference/claim-qualifications.json"));
var legacyRegister = JSON.parse(read("reference/legacy-claims.json"));
var decisionLog = read("DECISION_LOG.md");

var allClaims = [];
knowledge.objects.forEach(function (object) {
  object.claims.forEach(function (item) { allClaims.push(item); });
});

var repoContext = {
  sources: sourceRegister.sources,
  qualifications: qualificationRegister.qualifications,
  claims: allClaims
};

var PUBLIC_SURFACES = [
  "index.html",
  "replenishment-model.html",
  "calculator.html",
  "reference.html"
];

// --- Definition of Done -----------------------------------------------------

test("DoD: an external claim cannot become public merely because it cites an admitted source", function () {
  assert.ok(gov.isAdmittedSource(source()));
  var result = gov.evaluateClaim(claim(), context([source()], []));
  blockedFor(result, "missing-qualification:SRC-HR-9001");
  assert.strictEqual(gov.canPublish(claim(), context([source()], [])), false);
});

test("DoD: admitted source + qualified for this exact claim + every dimension passes is admissible", function () {
  var result = gov.evaluateClaim(claim(), context());
  assert.deepStrictEqual(result, { result: "ADMISSIBLE", errors: [] });
  assert.strictEqual(gov.canPublish(claim(), context()), true);
});

// --- Claim-source qualification: each governed dimension ---------------------

test("source ADMITTED but geography mismatch -> claim BLOCKED", function () {
  blockedFor(gov.evaluateClaim(claim(), context(undefined, [
    qualification({ geography_match: false }, { result: "BLOCKED" })
  ])), "failed-dimension:geography_match");
});

test("source ADMITTED but period mismatch -> claim BLOCKED", function () {
  blockedFor(gov.evaluateClaim(claim(), context(undefined, [
    qualification({ period_match: false }, { result: "BLOCKED" })
  ])), "failed-dimension:period_match");
});

test("population narrower than claim wording -> claim BLOCKED", function () {
  blockedFor(gov.evaluateClaim(claim(), context(undefined, [
    qualification({ population_match: false }, { result: "BLOCKED" })
  ])), "failed-dimension:population_match");
});

test("metric differs -> claim BLOCKED", function () {
  blockedFor(gov.evaluateClaim(claim(), context(undefined, [
    qualification({ metric_match: false }, { result: "BLOCKED" })
  ])), "failed-dimension:metric_match");
});

test("source does not state what the claim asserts -> claim BLOCKED", function () {
  blockedFor(gov.evaluateClaim(claim(), context(undefined, [
    qualification({ wording_supported: false }, { result: "BLOCKED" })
  ])), "failed-dimension:wording_supported");
});

test("claim exceeds source scope -> claim BLOCKED", function () {
  blockedFor(gov.evaluateClaim(claim(), context(undefined, [
    qualification({ scope_match: false }, { result: "BLOCKED" })
  ])), "failed-dimension:scope_match");
});

test("all dimensions match -> ADMISSIBLE", function () {
  var result = gov.evaluateQualification(qualification(), "HRC-9001", "SRC-HR-9001");
  assert.deepStrictEqual(result, { result: "ADMISSIBLE", errors: [] });
});

test("every single failed dimension blocks on its own", function () {
  gov.QUALIFICATION_DIMENSIONS.forEach(function (dimension) {
    var overrides = {};
    overrides[dimension] = false;
    var result = gov.evaluateQualification(qualification(overrides, { result: undefined }));
    blockedFor(result, "failed-dimension:" + dimension);
  });
});

// --- Absence of qualification is not permission ------------------------------

test("missing qualification record -> BLOCKED", function () {
  blockedFor(gov.evaluateClaim(claim(), context(undefined, [])), "missing-qualification:SRC-HR-9001");
  blockedFor(gov.evaluateClaim(claim(), { sources: [source()] }), "missing-qualification:SRC-HR-9001");
  blockedFor(gov.evaluateQualification(undefined), "missing-qualification");
});

test("missing any single dimension -> BLOCKED", function () {
  gov.QUALIFICATION_DIMENSIONS.forEach(function (dimension) {
    var record = qualification({}, { result: undefined });
    delete record.qualification[dimension];
    blockedFor(gov.evaluateQualification(record), "missing-dimension:" + dimension);
    blockedFor(gov.evaluateClaim(claim(), context(undefined, [record])), "missing-dimension:" + dimension);
  });
});

test("missing qualification object -> BLOCKED", function () {
  var record = qualification();
  delete record.qualification;
  blockedFor(gov.evaluateClaim(claim(), context(undefined, [record])), "missing-qualification-dimensions");
  blockedFor(gov.evaluateQualification({ claim_id: "HRC-9001", source_id: "SRC-HR-9001", qualification: {} }),
    "missing-dimension:scope_match");
});

test("null, undefined, and truthy non-boolean dimension values do not pass", function () {
  [null, undefined, "true", "yes", 1, {}, []].forEach(function (value) {
    var record = qualification({ metric_match: value }, { result: undefined });
    blockedFor(gov.evaluateQualification(record), "metric_match");
  });
});

test("declared ADMISSIBLE result is not trusted when a dimension fails", function () {
  var record = qualification({ geography_match: false }, { result: "ADMISSIBLE" });
  var result = gov.evaluateQualification(record);
  blockedFor(result, "failed-dimension:geography_match");
  blockedFor(result, "declared-result-contradicted:ADMISSIBLE");
});

test("declared BLOCKED result is honored even when dimensions pass", function () {
  var result = gov.evaluateQualification(qualification({}, { result: "BLOCKED" }));
  blockedFor(result, "declared-result-contradicted:BLOCKED");
});

test("unknown dimension key blocks rather than being ignored", function () {
  var record = qualification({ geography_matched: true }, { result: undefined });
  blockedFor(gov.evaluateQualification(record), "unknown-dimension:geography_matched");
});

// --- Qualification is per claim and per source -------------------------------

test("qualification for another claim does not transfer", function () {
  var other = qualification({}, { claim_id: "HRC-9002" });
  blockedFor(gov.evaluateClaim(claim(), context(undefined, [other])), "missing-qualification:SRC-HR-9001");
  blockedFor(gov.evaluateQualification(other, "HRC-9001", "SRC-HR-9001"), "claim-mismatch");
});

test("qualification for another source does not transfer", function () {
  var second = source({ id: "SRC-HR-9002" });
  var onlyFirst = [qualification()];
  var result = gov.evaluateClaim(
    claim({ source_ids: ["SRC-HR-9001", "SRC-HR-9002"] }),
    context([source(), second], onlyFirst)
  );
  blockedFor(result, "missing-qualification:SRC-HR-9002");
});

test("every cited source must be qualified, not just one", function () {
  var second = source({ id: "SRC-HR-9002" });
  var result = gov.evaluateClaim(
    claim({ source_ids: ["SRC-HR-9001", "SRC-HR-9002"] }),
    context([source(), second], [
      qualification(),
      qualification({ period_match: false }, { source_id: "SRC-HR-9002", result: "BLOCKED" })
    ])
  );
  blockedFor(result, "not-qualified:SRC-HR-9002:failed-dimension:period_match");
  var allQualified = gov.evaluateClaim(
    claim({ source_ids: ["SRC-HR-9001", "SRC-HR-9002"] }),
    context([source(), second], [qualification(), qualification({}, { source_id: "SRC-HR-9002" })])
  );
  assert.strictEqual(allQualified.result, "ADMISSIBLE");
});

test("duplicate qualification records for one claim-source pair -> BLOCKED", function () {
  blockedFor(gov.evaluateClaim(claim(), context(undefined, [qualification(), qualification()])),
    "ambiguous-qualification:SRC-HR-9001");
});

test("duplicate source ids in register -> BLOCKED", function () {
  blockedFor(gov.evaluateClaim(claim(), context([source(), source()], undefined)),
    "ambiguous-source:SRC-HR-9001");
});

// --- Source admission is decoupled from, and precedes, claim admission -------

test("full qualification cannot rescue a REVIEW_REQUIRED or BLOCKED source", function () {
  ["REVIEW_REQUIRED", "BLOCKED"].forEach(function (status) {
    blockedFor(gov.evaluateClaim(claim(), context([source({ admission_status: status })], undefined)),
      "source-not-admitted:SRC-HR-9001");
  });
});

test("full qualification cannot rescue an unresolved source", function () {
  blockedFor(gov.evaluateClaim(claim(), context([], undefined)), "unresolved-source:SRC-HR-9001");
});

test("external claim without sources -> BLOCKED", function () {
  gov.EXTERNAL_CLASSES.forEach(function (cls) {
    blockedFor(gov.evaluateClaim(claim({ class: cls, source_ids: [] }), context()), "external-claim-without-source");
    blockedFor(gov.evaluateClaim(claim({ class: cls, source_ids: undefined }), context()), "external-claim-without-source");
  });
});

test("derived interpretation is under the same qualification contract", function () {
  var derived = claim({ class: "DERIVED_INTERPRETATION" });
  blockedFor(gov.evaluateClaim(derived, context(undefined, [])), "missing-qualification:SRC-HR-9001");
  blockedFor(gov.evaluateClaim(derived, context(undefined, [qualification({ wording_supported: false })])),
    "failed-dimension:wording_supported");
  assert.strictEqual(gov.evaluateClaim(derived, context()).result, "ADMISSIBLE");
});

test("external claim without an id cannot be qualified", function () {
  blockedFor(gov.evaluateClaim(claim({ id: undefined }), context()), "missing-claim-id");
});

test("unknown claim class -> BLOCKED", function () {
  blockedFor(gov.evaluateClaim(claim({ class: "FACT" }), context()), "invalid-class");
});

test("project definitions keep the v0.1 contract under the v0.2 engine", function () {
  var definition = { id: "HRC-9100", class: "PROJECT_DEFINITION", source_ids: [], origin_refs: ["calculator.html"] };
  assert.strictEqual(gov.evaluateClaim(definition, context([], [])).result, "ADMISSIBLE");
  blockedFor(gov.evaluateClaim(Object.assign({}, definition, { source_ids: ["SRC-HR-9001"] }), context()),
    "project-definition-with-source");
  blockedFor(gov.evaluateClaim(Object.assign({}, definition, { origin_refs: [] }), context()),
    "project-definition-without-origin");
});

// --- Formal fail-closed source node ------------------------------------------

test("source object requires exactly the governed field set", function () {
  assert.deepStrictEqual(gov.REQUIRED_SOURCE_FIELDS, [
    "id", "title", "publisher", "url", "source_type", "publication_date", "accessed_date",
    "geography", "population", "scope", "metric", "rights_note", "admission_status", "notes"
  ]);
});

test("complete source validates", function () {
  assert.deepStrictEqual(gov.validateSource(source()), { valid: true, errors: [] });
  assert.strictEqual(gov.sourceAdmission(source()).status, "ADMITTED");
});

test("any missing field means the source cannot be ADMITTED", function () {
  gov.REQUIRED_SOURCE_FIELDS.forEach(function (field) {
    var record = source();
    delete record[field];
    var admission = gov.sourceAdmission(record);
    assert.strictEqual(admission.status, "BLOCKED", field);
    assert.ok(admission.errors.indexOf("missing-field:" + field) !== -1, field);
    assert.strictEqual(gov.isAdmittedSource(record), false, field);
  });
});

test("blank, whitespace, and non-string fields count as omissions", function () {
  ["", "   ", null, 0, [], {}].forEach(function (value) {
    var admission = gov.sourceAdmission(source({ metric: value }));
    assert.strictEqual(admission.status, "BLOCKED");
    assert.ok(admission.errors.indexOf("missing-field:metric") !== -1);
  });
});

test("incomplete source declared ADMITTED cannot support a fully qualified claim", function () {
  var incomplete = source();
  delete incomplete.geography;
  blockedFor(gov.evaluateClaim(claim(), context([incomplete], undefined)), "source-not-admitted:SRC-HR-9001");
});

test("malformed source fields block admission", function () {
  [
    [{ id: "SRC-9001" }, "invalid-id"],
    [{ url: "example.invalid/survey" }, "invalid-url"],
    [{ publication_date: "March 2025" }, "invalid-publication-date"],
    [{ publication_date: "2025-13" }, "invalid-publication-date"],
    [{ accessed_date: "2026-09" }, "invalid-accessed-date"],
    [{ accessed_date: "2026-02-30" }, "invalid-accessed-date"],
    [{ publication_date: "2026-10-01", accessed_date: "2026-09-01" }, "accessed-before-publication"],
    [{ admission_status: "QUALIFIED" }, "invalid-admission-status"]
  ].forEach(function (pair) {
    var admission = gov.sourceAdmission(source(pair[0]));
    assert.strictEqual(admission.status, "BLOCKED", pair[1]);
    assert.ok(admission.errors.indexOf(pair[1]) !== -1, pair[1] + " " + JSON.stringify(admission.errors));
  });
});

test("REVIEW_REQUIRED and BLOCKED complete sources are recorded but not admitted", function () {
  assert.strictEqual(gov.sourceAdmission(source({ admission_status: "REVIEW_REQUIRED" })).status, "REVIEW_REQUIRED");
  assert.strictEqual(gov.sourceAdmission(source({ admission_status: "BLOCKED" })).status, "BLOCKED");
  assert.strictEqual(gov.isAdmittedSource(source({ admission_status: "REVIEW_REQUIRED" })), false);
});

// --- Repository state: the court exists, no case has been brought -----------

test("source register stays empty during v0.2", function () {
  assert.deepStrictEqual(sourceRegister, { version: "0.1", sources: [] });
});

test("qualification register parses and is empty during v0.2", function () {
  assert.strictEqual(qualificationRegister.version, "0.2");
  assert.deepStrictEqual(qualificationRegister.qualifications, []);
});

test("every registered source, if any, is a complete source node", function () {
  sourceRegister.sources.forEach(function (record) {
    assert.deepStrictEqual(gov.validateSource(record).errors, [], record.id);
  });
});

test("every registered qualification, if any, resolves to a real claim and source", function () {
  var claimIds = allClaims.map(function (item) { return item.id; });
  var sourceIds = sourceRegister.sources.map(function (record) { return record.id; });
  qualificationRegister.qualifications.forEach(function (record) {
    assert.ok(claimIds.indexOf(record.claim_id) !== -1, record.claim_id);
    assert.ok(sourceIds.indexOf(record.source_id) !== -1, record.source_id);
  });
});

test("every registered claim is admissible under the v0.2 engine", function () {
  allClaims.forEach(function (item) {
    assert.deepStrictEqual(gov.evaluateClaim(item, repoContext), { result: "ADMISSIBLE", errors: [] }, item.id);
  });
});

test("governance engine reports v0.2", function () {
  assert.strictEqual(gov.GOVERNANCE_VERSION, "0.2");
});

// --- DEC-HR-006: one evidence law across every public surface ---------------

test("DEC-HR-006, DEC-HR-007, DEC-HR-008, and DEC-HR-009 are recorded", function () {
  ["DEC-HR-006", "DEC-HR-007", "DEC-HR-008", "DEC-HR-009"].forEach(function (id) {
    assert.ok(decisionLog.indexOf("## " + id) !== -1, id);
  });
});

test("every root HTML page is a governed public surface", function () {
  var pages = fs.readdirSync(root).filter(function (name) { return /\.html$/.test(name); }).sort();
  assert.deepStrictEqual(pages, PUBLIC_SURFACES.slice().sort());
});

test("every sitemap URL is a governed public surface", function () {
  var sitemap = read("sitemap.xml");
  var locs = (sitemap.match(/<loc>([^<]+)<\/loc>/g) || []).map(function (tag) {
    var url = tag.replace(/<\/?loc>/g, "").replace("https://hygieneroll.com/", "");
    return url === "" ? "index.html" : url;
  });
  assert.ok(locs.length > 0);
  locs.forEach(function (page) {
    assert.ok(PUBLIC_SURFACES.indexOf(page) !== -1, page);
  });
});

test("no public surface carries an unregistered external figure", function () {
  var registered = [];
  legacyRegister.claims.forEach(function (legacy) {
    if (legacy.migration_status !== "SUPPRESSED") {
      registered = registered.concat(legacy.fragments);
    }
  });
  allClaims.forEach(function (item) {
    if (gov.canPublish(item, repoContext)) registered.push(item.text);
  });
  PUBLIC_SURFACES.forEach(function (page) {
    assert.deepStrictEqual(gov.unregisteredFigures(read(page), registered), [], page);
  });
});

test("figure scanner catches an unregistered market figure", function () {
  var html = "<p>The market reached USD 12.4 billion in 2025, a 6% CAGR.</p><div>$9.9B</div>";
  var found = gov.unregisteredFigures(html, []);
  assert.ok(found.length >= 3, JSON.stringify(found));
  assert.deepStrictEqual(gov.unregisteredFigures("<p>At 0% variability.</p>", []), []);
});

// --- Legacy external claims: registered, not grandfathered ------------------

test("legacy register lists exactly the two pre-existing external claims", function () {
  assert.strictEqual(legacyRegister.version, "0.2");
  var titles = legacyRegister.claims.map(function (legacy) { return legacy.title; });
  assert.deepStrictEqual(titles, [
    "Subscription Economy figures",
    "Broad Cleaning & Hygiene Products Market figures"
  ]);
  var ids = legacyRegister.claims.map(function (legacy) { return legacy.id; });
  assert.strictEqual(new Set(ids).size, ids.length);
});

test("legacy claims use the legacy status vocabulary and are external classes", function () {
  legacyRegister.claims.forEach(function (legacy) {
    assert.ok(gov.LEGACY_STATUSES.indexOf(legacy.migration_status) !== -1, legacy.id);
    assert.ok(gov.EXTERNAL_CLASSES.indexOf(legacy.class) !== -1, legacy.id);
    assert.ok(Array.isArray(legacy.fragments) && legacy.fragments.length > 0, legacy.id);
    legacy.surfaces.forEach(function (page) {
      assert.ok(PUBLIC_SURFACES.indexOf(page) !== -1, page);
    });
  });
});

test("a pending legacy claim is never admissible", function () {
  legacyRegister.claims.forEach(function (legacy) {
    if (legacy.migration_status === "PENDING_MIGRATION") {
      var result = gov.evaluateLegacyClaim(legacy, repoContext);
      assert.strictEqual(result.admissible, false, legacy.id);
      assert.ok(result.errors.indexOf("pending-migration") !== -1);
    }
  });
});

test("legacy fragments match the live public text exactly while not suppressed", function () {
  legacyRegister.claims.forEach(function (legacy) {
    legacy.surfaces.forEach(function (page) {
      var html = read(page);
      legacy.fragments.forEach(function (fragment) {
        if (legacy.migration_status === "SUPPRESSED") {
          assert.strictEqual(html.indexOf(fragment), -1, legacy.id + " still on " + page);
        } else {
          assert.ok(html.indexOf(fragment) !== -1, legacy.id + " drifted on " + page);
        }
      });
    });
  });
});

test("legacy claims must be resolved by their due version", function () {
  var pending = legacyRegister.claims.filter(function (legacy) {
    return legacy.migration_status === "PENDING_MIGRATION";
  });
  if (gov.compareVersions(gov.GOVERNANCE_VERSION, legacyRegister.migration_due) >= 0) {
    assert.deepStrictEqual(pending.map(function (legacy) { return legacy.id; }), []);
  }
  assert.strictEqual(gov.compareVersions("0.3", "0.3"), 0);
  assert.strictEqual(gov.compareVersions("0.2", "0.3"), -1);
  assert.strictEqual(gov.compareVersions("0.10", "0.3"), 1);
});

test("a migrated legacy claim must point at an admissible governed claim", function () {
  var migrated = { id: "HRL-9001", migration_status: "MIGRATED", governed_claim_id: "HRC-9001" };
  var unqualified = gov.evaluateLegacyClaim(migrated, {
    claims: [claim()], sources: [source()], qualifications: []
  });
  assert.strictEqual(unqualified.admissible, false);
  assert.ok(unqualified.errors.indexOf("governed-claim-blocked") !== -1);
  var missing = gov.evaluateLegacyClaim(migrated, { claims: [], sources: [], qualifications: [] });
  assert.ok(missing.errors.indexOf("migrated-without-governed-claim") !== -1);
  var qualified = gov.evaluateLegacyClaim(migrated, {
    claims: [claim()], sources: [source()], qualifications: [qualification()]
  });
  assert.deepStrictEqual(qualified, { admissible: true, errors: [] });
});

test("a suppressed legacy claim is not admissible", function () {
  var result = gov.evaluateLegacyClaim({ id: "HRL-9002", migration_status: "SUPPRESSED" }, repoContext);
  assert.strictEqual(result.admissible, false);
  assert.strictEqual(gov.evaluateLegacyClaim({ id: "HRL-9003", migration_status: "GRANDFATHERED" }, repoContext)
    .errors.indexOf("invalid-migration-status") !== -1, true);
});

console.log(passed + " passed");
