/*
 * Renders reference/cases/index.html from validated reference case records.
 * The page is static HTML and inline SVG. It needs no JavaScript.
 */
"use strict";

var SITE = "https://hygieneroll.com/";
var CANONICAL = SITE + "reference/cases/";
var TITLE = "Reference Cases — HygieneRoll.com";
var DESCRIPTION = "Five synthetic replenishment cases with hand-derived expected values, each checked against the HygieneRoll engine and an independent exact-arithmetic oracle. Machine-readable records included.";

function esc(value) {
  return String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function num(value) {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "yes" : "no";
  if (typeof value !== "number") return String(value);
  if (Number.isInteger(value)) return String(value);
  return String(Number(value.toFixed(4)));
}

function windowText(w) {
  if (w.earliest === w.latest) return w.earliest === 0 ? "Now (day 0)" : "day " + w.earliest;
  return "days " + w.earliest + "–" + w.latest;
}

function cadenceText(w) {
  return w.earliest === w.latest ? "every " + w.earliest + " days" : "every " + w.earliest + "–" + w.latest + " days";
}

function shortGap(gap) {
  if (gap.max === 0) return "no gap";
  return "gap " + (gap.min === gap.max ? gap.max : gap.min + "–" + gap.max) + " d";
}

function supplyText(gap) {
  return gap.max === 0 ? "no days without supply" : gapText(gap) + " without supply";
}

function gapText(gap) {
  if (gap.max === 0) return "none";
  if (gap.min === gap.max) return gap.max + (gap.max === 1 ? " day" : " days");
  return gap.min + "–" + gap.max + " days";
}

var STATUS_TEXT = {
  BUFFER_INTACT: "buffer intact",
  BUFFER_DRAWN: "buffer absorbs it",
  STOCKOUT_POSSIBLE: "stockout possible at the fast bound",
  STOCKOUT_AT_BOTH_BOUNDS: "stockout at both bounds"
};

var FIT_TEXT = {
  WITHIN_WINDOW: "within the cadence window",
  EARLIER_THAN_WINDOW: "earlier than the cadence window",
  LATER_THAN_WINDOW: "later than the cadence window"
};

// The timeline draws the return moment: supply running out, the order window, the lead
// time and buffer that sit between them, late deliveries, and the cadence of return.
function timeline(record) {
  var out = record.results.items[0].outputs;
  var inputs = record.inputs;
  var dep = out.depletion_interval_days;
  var trig = out.planning_trigger_days;
  var cad = out.replenishment_cadence_days;
  var slips = out.lead_time_slip;
  var interval = inputs.intervalDays;
  var furthest = Math.max(dep.latest, cad.latest, interval || 0, slips[slips.length - 1].exposure_if_ordered_at_trigger.arrival_day);
  var maxDay = Math.max(14, Math.ceil((furthest + 1) / 7) * 7);
  var x0 = 8;
  var x1 = 352;
  var x = function (day) { return Number((x0 + (Math.min(day, maxDay) / maxDay) * (x1 - x0)).toFixed(2)); };
  var rowH = 40;
  var rows = [];
  var id = record.case.id.toLowerCase();
  var y = 18;

  function label(text) {
    rows.push('<text x="' + x0 + '" y="' + y + '" class="tl-label">' + esc(text) + "</text>");
  }
  function bar(from, to, cls) {
    var left = x(from);
    var width = Math.max(3, Number((x(to) - left).toFixed(2)));
    rows.push('<rect x="' + left + '" y="' + (y + 7) + '" width="' + width + '" height="12" rx="3" class="' + cls + '"/>');
  }

  label("Supply runs out: " + windowText(dep));
  bar(0, dep.earliest, "tl-supply");
  if (dep.latest > dep.earliest) bar(dep.earliest, dep.latest, "tl-supply-range");
  else rows.push('<rect x="' + (x(dep.earliest) - 1.5) + '" y="' + (y + 3) + '" width="3" height="20" class="tl-mark"/>');
  y += rowH;

  label("Order window: " + windowText(trig));
  bar(trig.earliest, trig.latest, "tl-order");
  y += rowH;

  label("Lead time " + num(inputs.leadTimeDays) + " d + buffer " + num(inputs.bufferDays) + " d");
  bar(trig.earliest, trig.earliest + inputs.leadTimeDays, "tl-lead");
  if (inputs.bufferDays > 0) bar(trig.earliest + inputs.leadTimeDays, trig.earliest + inputs.leadTimeDays + inputs.bufferDays, "tl-buffer");
  y += rowH;

  slips.forEach(function (slip) {
    var exposure = slip.exposure_if_ordered_at_trigger;
    label(slip.slip_days + " d late: arrives day " + num(exposure.arrival_day) + ", " + shortGap(exposure.supply_gap_days));
    bar(exposure.order_day, exposure.arrival_day, "tl-transit");
    if (exposure.supply_gap_days.max > 0) bar(dep.earliest, exposure.arrival_day, "tl-gap");
    y += rowH;
  });

  label("Cadence: " + cadenceText(cad) + (interval ? " · fixed " + num(interval) + " d" : ""));
  bar(cad.earliest, cad.latest, "tl-cadence");
  if (interval) rows.push('<rect x="' + (x(interval) - 1.5) + '" y="' + (y + 1) + '" width="3" height="24" class="tl-interval"/>');
  y += rowH;

  var ticks = [];
  for (var day = 0; day <= maxDay; day += 7) {
    ticks.push('<line x1="' + x(day) + '" x2="' + x(day) + '" y1="4" y2="' + (y - 6) + '" class="tl-grid"/>');
    ticks.push('<text x="' + x(day) + '" y="' + (y + 8) + '" class="tl-tick">' + day + "</text>");
  }
  var height = y + 28;
  var summary = "Supply runs out " + windowText(dep) + ". Order window " + windowText(trig) + ". " +
    slips.map(function (slip) {
      return "If delivery is " + slip.slip_days + " days late, it arrives on day " + num(slip.exposure_if_ordered_at_trigger.arrival_day) + " with " + supplyText(slip.exposure_if_ordered_at_trigger.supply_gap_days) + ".";
    }).join(" ") + " Cadence " + cadenceText(cad) + "." + (interval ? " Fixed interval " + num(interval) + " days." : "");
  return '<svg class="timeline" viewBox="0 0 360 ' + height + '" role="img" aria-labelledby="' + id + '-tl-title ' + id + '-tl-desc">' +
    '<title id="' + id + '-tl-title">Replenishment timeline for ' + esc(record.case.id) + "</title>" +
    '<desc id="' + id + '-tl-desc">' + esc(summary) + "</desc>" +
    ticks.join("") + rows.join("") +
    '<text x="' + x1 + '" y="' + (y + 22) + '" class="tl-axis" text-anchor="end">days from the scenario start</text>' +
    "</svg>";
}

function termLink(record, conceptId, text) {
  var term = record.ontology_terms.find(function (t) { return t.id === conceptId; });
  return '<a href="../../reference.html#' + esc(term.url.split("#")[1]) + '">' + esc(text || term.term) + "</a>";
}

function caseSection(record, entry) {
  var out = record.results.items[0].outputs;
  var parameterRows = record.parameters.map(function (p) {
    return "<tr><th scope=\"row\">" + esc(p.field) + "</th><td>" + esc(num(p.value)) + "</td><td>" + esc(p.unit) + "</td><td>" + termLink(record, p.concept, p.concept) + "</td></tr>";
  }).join("");
  var checkRows = record.validation.checks.map(function (c) {
    return "<tr><th scope=\"row\"><code>" + esc(c.path.replace(/^outputs\./, "")) + "</code></th><td>" + esc(num(c.expected)) + "</td><td>" + esc(num(c.engine)) + "</td><td>" + esc(num(c.oracle)) + "</td><td>" + esc(c.result) + "</td></tr>";
  }).join("");
  var fit = out.fixed_interval_fit
    ? "<li>Fixed " + num(record.inputs.intervalDays) + "-day interval: " + FIT_TEXT[out.fixed_interval_fit.fit] + ", drift " + num(out.fixed_interval_fit.drift_days_per_cycle.min) + " to " + num(out.fixed_interval_fit.drift_days_per_cycle.max) + " days per delivery.</li>"
    : "";
  var slipItems = out.lead_time_slip.map(function (slip) {
    return "<li>Delivery " + slip.slip_days + " days late: " + STATUS_TEXT[slip.exposure_if_ordered_at_trigger.status] + ", " + supplyText(slip.exposure_if_ordered_at_trigger.supply_gap_days) + ".</li>";
  }).join("");
  return [
    '<article class="case glass" id="' + esc(record.case.slug) + '" aria-labelledby="' + esc(record.case.slug) + '-h">',
    '<p class="case-id">' + esc(record.case.id) + " · version " + record.case.version + "</p>",
    '<p class="badges"><span class="badge">Synthetic inputs</span><span class="badge">Illustrative model</span><span class="badge badge-pass">Verified: ' + record.validation.checks_total + " of " + record.validation.checks_total + " checks pass</span></p>",
    '<h2 id="' + esc(record.case.slug) + '-h">' + esc(record.case.title) + "</h2>",
    "<p>" + esc(record.case.purpose) + "</p>",
    "<h3>Timeline</h3>",
    '<figure class="figure">' + timeline(record) + "</figure>",
    "<h3>Results</h3>",
    "<ul>",
    "<li>Supply runs out " + windowText(out.depletion_interval_days) + ".</li>",
    "<li>Order window " + windowText(out.planning_trigger_days) + ".</li>",
    "<li>Reorder threshold " + num(out.reorder_threshold_units) + " " + esc(record.inputs.unit) + " (lead-time demand " + num(out.lead_time_demand_units) + " + reserve " + num(out.reserve_stock_units) + ")" + (out.at_or_below_reorder_threshold ? ". Current supply is already at or below it." : ".") + "</li>",
    fit,
    slipItems,
    "</ul>",
    "<h3>Inputs</h3>",
    '<div class="table-wrap"><table class="data"><thead><tr><th scope="col">Parameter</th><th scope="col">Value</th><th scope="col">Unit</th><th scope="col">Term</th></tr></thead><tbody>' + parameterRows + "</tbody></table></div>",
    "<h3>Assumptions and limitations</h3>",
    "<ul>" + record.assumptions.concat(record.limitations).map(function (text) { return "<li>" + esc(text) + "</li>"; }).join("") + "</ul>",
    "<h3>Hand derivation</h3>",
    "<ol>" + record.derivation.map(function (step) { return "<li>" + esc(step) + "</li>"; }).join("") + "</ol>",
    "<details><summary>Expected, engine, and oracle values (" + record.validation.checks_total + " checks)</summary>",
    '<div class="table-wrap"><table class="data checks"><thead><tr><th scope="col">Field</th><th scope="col">Expected</th><th scope="col">Engine ' + esc(record.validation.engine_version) + '</th><th scope="col">Oracle</th><th scope="col">Result</th></tr></thead><tbody>' + checkRows + "</tbody></table></div>",
    "</details>",
    "<details><summary>Method and ontology terms</summary>",
    "<ul>" + record.methodology.steps.map(function (step) { return "<li>" + termLink(record, step.concept) + ": <code>" + esc(step.formula) + "</code></li>"; }).join("") + "</ul>",
    "<p>Terms: " + record.ontology_terms.map(function (t) { return termLink(record, t.id, t.id + " " + t.term); }).join(", ") + ".</p>",
    "</details>",
    '<p class="record-link">Machine-readable record: <a href="' + esc(record.case.id) + '.json">' + esc(record.case.id) + ".json</a><br/>sha256 <code>" + esc(entry.sha256) + "</code></p>",
    "</article>"
  ].join("\n");
}

var CSS = [
  ":root { --bg: #edf4fb; --text: #0b1f3b; --muted: #566a84; --blue: #2563eb; --navy: #081a34; --container: 1100px; --radius-xl: 28px; --shadow: 0 18px 50px rgba(15, 35, 66, 0.08); }",
  "* { box-sizing: border-box; }",
  "body { margin: 0; font-family: Inter, system-ui, -apple-system, BlinkMacSystemFont, \"Segoe UI\", sans-serif; color: var(--text); background: radial-gradient(900px 420px at 10% -10%, rgba(37, 99, 235, 0.16), transparent 60%), linear-gradient(180deg, #f7fbff 0%, var(--bg) 42%, #e7eef8 100%); }",
  "a { color: var(--blue); text-underline-offset: 3px; }",
  ".skip-link { position: absolute; left: 12px; top: -40px; background: #fff; color: var(--navy); padding: 8px 12px; border-radius: 8px; z-index: 1100; }",
  ".skip-link:focus { top: 12px; }",
  ":focus-visible { outline: 2px solid var(--blue); outline-offset: 3px; }",
  ".container { width: min(calc(100% - 40px), var(--container)); margin: 0 auto; }",
  ".site-header { background: rgba(245, 249, 255, 0.9); border-bottom: 1px solid rgba(15, 35, 66, 0.06); }",
  ".nav { display: flex; align-items: center; justify-content: space-between; gap: 18px; min-height: 80px; padding: 12px 0; flex-wrap: wrap; }",
  ".brand { display: inline-flex; align-items: center; gap: 12px; text-decoration: none; }",
  ".brand-logo { width: 44px; height: 44px; object-fit: contain; }",
  ".brand-mark { font-weight: 800; letter-spacing: -0.045em; white-space: nowrap; font-size: 1.8rem; color: #0f2342; }",
  ".brand-mark .dotcom { font-size: 1.1rem; color: var(--blue); }",
  ".nav-actions { display: flex; gap: 8px; flex-wrap: wrap; }",
  ".nav-link, .nav-cta { display: inline-flex; align-items: center; height: 44px; padding: 0 14px; border-radius: 999px; font-weight: 600; color: #5e6f86; text-decoration: none; }",
  ".nav-link[aria-current] { color: #0f2342; background: rgba(37, 99, 235, 0.06); }",
  ".nav-cta { color: #0f2342; font-weight: 700; background: #fff; border: 1px solid rgba(15, 35, 66, 0.06); }",
  ".page { padding: 40px 0 28px; }",
  ".eyebrow { display: inline-flex; padding: 10px 16px; border-radius: 999px; background: rgba(255,255,255,0.72); color: var(--blue); font-size: 13px; font-weight: 800; letter-spacing: 0.08em; text-transform: uppercase; }",
  "h1 { margin: 18px 0 0; font-size: clamp(2.2rem, 5vw, 3.8rem); line-height: 1; letter-spacing: -0.05em; color: #0d2344; }",
  "h2 { margin: 10px 0 8px; font-size: clamp(1.4rem, 3vw, 2rem); letter-spacing: -0.04em; color: #0d2344; }",
  "h3 { margin: 22px 0 8px; font-size: 0.85rem; letter-spacing: 0.06em; text-transform: uppercase; color: #12325d; }",
  "p, li { color: var(--muted); font-size: 1.02rem; line-height: 1.65; }",
  ".lead { max-width: 70ch; font-size: 1.08rem; }",
  ".trust { font-weight: 700; color: #24405f; }",
  ".glass { background: rgba(255,255,255,0.88); border-radius: var(--radius-xl); box-shadow: var(--shadow); }",
  ".section { margin-top: 36px; }",
  ".case-list { display: grid; grid-template-columns: repeat(auto-fill, minmax(200px, 1fr)); gap: 12px; padding: 0; list-style: none; }",
  ".case-list a { display: block; height: 100%; padding: 16px 18px; border-radius: 18px; background: rgba(255,255,255,0.8); text-decoration: none; color: #12325d; font-weight: 750; }",
  ".case-list span { display: block; margin-top: 4px; color: var(--muted); font-weight: 500; font-size: 0.92rem; }",
  ".case { margin: 24px 0; padding: 24px; scroll-margin-top: 16px; }",
  ".case-id { margin: 0; font-size: 0.82rem; font-weight: 800; letter-spacing: 0.08em; color: var(--blue); }",
  ".badges { display: flex; flex-wrap: wrap; gap: 8px; margin: 10px 0 0; }",
  ".badge { padding: 5px 10px; border-radius: 999px; border: 1px solid rgba(37, 99, 235, 0.18); background: rgba(37, 99, 235, 0.06); color: #12325d; font-size: 0.8rem; font-weight: 750; }",
  ".badge-pass { border-color: rgba(21, 128, 61, 0.25); background: rgba(21, 128, 61, 0.08); color: #14532d; }",
  ".figure { margin: 0; }",
  ".timeline { width: 100%; max-width: 560px; height: auto; display: block; }",
  ".tl-label { font-size: 11.5px; fill: #24405f; font-weight: 600; }",
  ".tl-tick, .tl-axis { font-size: 9.5px; fill: #566a84; text-anchor: middle; }",
  ".tl-axis { text-anchor: end; }",
  ".tl-grid { stroke: rgba(15, 35, 66, 0.08); stroke-width: 1; }",
  ".tl-supply { fill: #bfd4fb; }",
  ".tl-supply-range { fill: #dbe7fd; stroke: #93b4f5; stroke-dasharray: 3 2; }",
  ".tl-mark, .tl-interval { fill: #0d2344; }",
  ".tl-order { fill: #2563eb; }",
  ".tl-lead { fill: #60a5fa; }",
  ".tl-buffer { fill: #a7f3d0; }",
  ".tl-transit { fill: #cbd5e1; }",
  ".tl-gap { fill: #dc2626; }",
  ".tl-cadence { fill: #93c5fd; }",
  ".table-wrap { overflow-x: auto; }",
  ".data { width: 100%; border-collapse: collapse; font-size: 0.92rem; }",
  ".data th, .data td { padding: 8px 10px; text-align: left; border-bottom: 1px solid rgba(15, 35, 66, 0.08); color: var(--muted); vertical-align: top; overflow-wrap: anywhere; }",
  ".data thead th { color: #12325d; font-size: 0.78rem; letter-spacing: 0.06em; text-transform: uppercase; }",
  ".data tbody th { color: #0d2344; font-weight: 700; }",
  "code { font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; font-size: 0.88em; overflow-wrap: anywhere; }",
  "details { margin-top: 14px; }",
  "summary { cursor: pointer; font-weight: 750; color: #0d2344; }",
  ".record-link { margin-top: 16px; font-size: 0.92rem; overflow-wrap: anywhere; }",
  ".footer { padding: 28px 0 48px; color: var(--muted); font-size: 14px; }",
  ".footer-inner { display: flex; justify-content: space-between; gap: 16px; flex-wrap: wrap; border-top: 1px solid rgba(167, 188, 217, 0.18); padding-top: 22px; }",
  "@media (max-width: 640px) { .container { width: min(calc(100% - 24px), var(--container)); } .case { padding: 18px 14px; } .brand-mark { font-size: 1.5rem; }",
  "  .data thead { display: none; } .data, .data tbody, .data tr, .data th, .data td { display: block; width: 100%; } .data tr { padding: 8px 0; border-bottom: 1px solid rgba(15, 35, 66, 0.08); } .data th, .data td { border: 0; padding: 2px 0; }",
  "  .checks td:nth-child(2)::before { content: \"Expected: \"; font-weight: 700; } .checks td:nth-child(3)::before { content: \"Engine: \"; font-weight: 700; } .checks td:nth-child(4)::before { content: \"Oracle: \"; font-weight: 700; } .checks td:nth-child(5)::before { content: \"Result: \"; font-weight: 700; } }"
].join("\n    ");

function render(records, manifest, registry) {
  var entries = {};
  manifest.records.forEach(function (entry) { entries[entry.id] = entry; });
  var jsonld = {
    "@context": "https://schema.org",
    "@type": "WebPage",
    "@id": CANONICAL + "#webpage",
    url: CANONICAL,
    name: TITLE,
    description: DESCRIPTION,
    isPartOf: { "@type": "WebSite", name: "HygieneRoll.com", url: SITE },
    hasPart: records.map(function (record) {
      return { "@type": "Dataset", name: record.case.id + " " + record.case.title, url: SITE + "reference/cases/" + record.case.id + ".json", description: record.case.purpose, isAccessibleForFree: true };
    })
  };
  return [
    "<!DOCTYPE html>",
    '<html lang="en">',
    "<head>",
    '  <meta charset="UTF-8" />',
    '  <meta name="viewport" content="width=device-width, initial-scale=1.0" />',
    "  <title>" + TITLE + "</title>",
    '  <meta name="description" content="' + esc(DESCRIPTION) + '" />',
    '  <link rel="canonical" href="' + CANONICAL + '" />',
    '  <meta name="robots" content="index, follow" />',
    '  <meta name="theme-color" content="#081a34" />',
    '  <meta property="og:title" content="' + TITLE + '" />',
    '  <meta property="og:description" content="' + esc(DESCRIPTION) + '" />',
    '  <meta property="og:type" content="website" />',
    '  <meta property="og:url" content="' + CANONICAL + '" />',
    '  <meta property="og:image" content="https://hygieneroll.com/assets/images/hygieneroll-social.jpg" />',
    '  <meta name="twitter:card" content="summary_large_image" />',
    '  <script type="application/ld+json">',
    JSON.stringify(jsonld, null, 2),
    "  </script>",
    "  <style>",
    "    " + CSS,
    "  </style>",
    "</head>",
    "<body>",
    '  <a class="skip-link" href="#top">Skip to content</a>',
    '  <header class="site-header">',
    '    <div class="container nav">',
    '      <a href="../../index.html" class="brand" aria-label="HygieneRoll.com home">',
    '        <img src="../../assets/images/logo-hygieneroll.png" class="brand-logo" alt="HygieneRoll logo" />',
    '        <span class="brand-mark">HygieneRoll<span class="dotcom">.com</span></span>',
    "      </a>",
    '      <div class="nav-actions">',
    '        <a class="nav-link" href="../../replenishment-model.html">Model</a>',
    '        <a class="nav-link" href="../../calculator.html">Calculator</a>',
    '        <a class="nav-link" href="../../reference.html">Reference</a>',
    '        <a class="nav-link" href="./" aria-current="page">Cases</a>',
    '        <a class="nav-cta" href="../../acquisition/">Acquisition</a>',
    "      </div>",
    "    </div>",
    "  </header>",
    '  <main id="top" class="page">',
    '    <div class="container">',
    '      <span class="eyebrow">Reference Cases</span>',
    "      <h1>Reproducible replenishment cases</h1>",
    '      <p class="lead">Five synthetic scenarios exercise the replenishment method end to end. For each one, the expected values were derived by hand. They were then checked against the calculator engine and against an independent oracle that recomputes everything in exact fractions. A case is published only when all three agree.</p>',
    '      <p class="trust">Synthetic inputs. These are not observed household behavior, consumption statistics, or benchmarks.</p>',
    '      <section class="section" aria-labelledby="cases-heading">',
    '        <h2 id="cases-heading">Cases</h2>',
    '        <ul class="case-list">',
    records.map(function (record) {
      return '          <li><a href="#' + esc(record.case.slug) + '">' + esc(record.case.id) + '<span>' + esc(record.case.title.replace(/ \(synthetic\)$/, "")) + "</span></a></li>";
    }).join("\n"),
    "        </ul>",
    "      </section>",
    '      <section class="section" aria-labelledby="verify-heading">',
    '        <h2 id="verify-heading">How to check a case yourself</h2>',
    "        <ol>",
    "          <li>Work through the hand derivation shown for the case. Every step uses only the formulas in the <a href=\"../../CALCULATOR_METHODOLOGY.md\">calculator methodology</a>.</li>",
    "          <li>Enter the same inputs in the <a href=\"../../calculator.html\">calculator</a>. Its JSON record should match the <code>results</code> block of the case record.</li>",
    "          <li>Download the <a href=\"manifest.json\">manifest</a> and a record, and compare the record's sha256 with the manifest. Records use the serialization the manifest describes.</li>",
    "          <li>From a copy of the <a href=\"https://github.com/Sohadot/HygieneRoll\">public repository</a>, run <code>node verification/build-reference-records.js --check</code>. It recomputes every case with the engine and the <a href=\"../../verification/oracle.js\">oracle</a>, and fails if any value or file differs.</li>",
    "        </ol>",
    "        <p>Records follow an internal <a href=\"../schema/reference-case-record.schema.json\">record schema</a> (version 0.1). It is a HygieneRoll contract, not an external standard. Cases come from the <a href=\"registry.json\">registry</a> version " + esc(registry.version) + ", checked against engine " + esc(manifest.engine_version) + " and ontology " + esc(manifest.ontology_version) + ".</p>",
    "      </section>",
    records.map(function (record) { return caseSection(record, entries[record.case.id]); }).join("\n"),
    "    </div>",
    "  </main>",
    '  <footer class="footer">',
    '    <div class="container footer-inner">',
    "      <span>HygieneRoll.com — developed digital asset for recurring household hygiene replenishment</span>",
    '      <a href="../../index.html">Home</a>',
    '      <a href="../../calculator.html">Calculator</a>',
    '      <a href="../../reference.html">Reference</a>',
    '      <a href="../../acquisition/">Acquisition</a>',
    "    </div>",
    "  </footer>",
    "</body>",
    "</html>",
    ""
  ].join("\n");
}

module.exports = { render: render };
