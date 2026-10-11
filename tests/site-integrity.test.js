"use strict";

var assert = require("assert");
var fs = require("fs");
var path = require("path");
var childProcess = require("child_process");

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

var SITE = "https://hygieneroll.com/";
var INQUIRY = "agent@sohadot.com";
var PAGES = {
  "index.html": SITE,
  "calculator.html": SITE + "calculator.html",
  "reference.html": SITE + "reference.html",
  "replenishment-model.html": SITE + "replenishment-model.html",
  "acquisition/index.html": SITE + "acquisition/",
  "reference/cases/index.html": SITE + "reference/cases/"
};
var ALL_PAGES = Object.keys(PAGES).concat(["404.html"]);
// External links that are navigation or infrastructure, not cited evidence.
var NON_EVIDENCE_HOSTS = ["fonts.googleapis.com", "fonts.gstatic.com", "sohadot.com", "github.com"];

function attributes(html, tag, attr) {
  var pattern = new RegExp("<" + tag + "\\b[^>]*\\s" + attr + '="([^"]*)"', "g");
  var values = [];
  var match;
  while ((match = pattern.exec(html))) values.push(match[1]);
  return values;
}

function ids(html) {
  return attributes(html, "[a-z0-9]+", "id");
}

// Resolve an href against a page to a repository file and optional fragment.
function resolve(page, href) {
  var clean = href.split("?")[0];
  var hashIndex = clean.indexOf("#");
  var fragment = hashIndex === -1 ? "" : clean.slice(hashIndex + 1);
  var target = hashIndex === -1 ? clean : clean.slice(0, hashIndex);
  var file;
  if (target === "") {
    file = page;
  } else if (target.charAt(0) === "/") {
    file = target.slice(1);
  } else {
    file = path.posix.normalize(path.posix.join(path.posix.dirname(page), target));
  }
  if (file === "" || file === "." || file.slice(-1) === "/") file = (file === "." ? "" : file) + "index.html";
  return { file: file, fragment: fragment };
}

function urlToFile(url) {
  assert.ok(url.indexOf(SITE) === 0, url);
  var rest = url.slice(SITE.length);
  if (rest === "" || rest.slice(-1) === "/") rest += "index.html";
  return rest;
}

var sitemap = read("sitemap.xml");
var sitemapUrls = (sitemap.match(/<loc>([^<]+)<\/loc>/g) || []).map(function (loc) { return loc.slice(5, -6); });
var register = JSON.parse(read("reference/source-register.json"));

test("every internal link and fragment resolves", function () {
  ALL_PAGES.forEach(function (page) {
    var html = read(page);
    attributes(html, "a", "href").concat(attributes(html, "img", "src"), attributes(html, "script", "src")).forEach(function (href) {
      if (/^(https?:|mailto:)/.test(href)) return;
      var target = resolve(page, href);
      assert.ok(fs.existsSync(path.join(root, target.file)), page + " -> " + href);
      if (target.fragment && /\.html$/.test(target.file)) {
        assert.ok(ids(read(target.file)).indexOf(target.fragment) !== -1, page + " -> " + href);
      }
    });
  });
});

test("ids are unique within each page", function () {
  ALL_PAGES.forEach(function (page) {
    var list = ids(read(page));
    var seen = {};
    list.forEach(function (id) {
      assert.ok(!seen[id], page + " duplicate id " + id);
      seen[id] = true;
    });
  });
});

test("every page declares a language, a viewport, and image alt text", function () {
  ALL_PAGES.forEach(function (page) {
    var html = read(page);
    assert.ok(/<html lang="en">/.test(html), page);
    assert.ok(html.indexOf('name="viewport" content="width=device-width, initial-scale=1.0"') !== -1, page);
    (html.match(/<img\b[^>]*>/g) || []).forEach(function (img) {
      assert.ok(/\salt="[^"]+"/.test(img), page + " " + img);
    });
  });
});

test("canonical URLs match their route and appear in the sitemap", function () {
  Object.keys(PAGES).forEach(function (page) {
    var html = read(page);
    assert.ok(html.indexOf('<link rel="canonical" href="' + PAGES[page] + '" />') !== -1, page);
    assert.ok(html.indexOf('<meta property="og:url" content="' + PAGES[page] + '" />') !== -1, page);
    assert.ok(sitemapUrls.indexOf(PAGES[page]) !== -1, page);
  });
  sitemapUrls.forEach(function (url) {
    assert.ok(fs.existsSync(path.join(root, urlToFile(url))), url);
  });
  assert.ok(read("404.html").indexOf('name="robots" content="noindex"') !== -1);
});

test("JSON-LD blocks parse", function () {
  Object.keys(PAGES).forEach(function (page) {
    var blocks = read(page).match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g) || [];
    assert.ok(blocks.length > 0, page);
    blocks.forEach(function (block) {
      JSON.parse(block.replace(/^<script[^>]*>/, "").replace(/<\/script>$/, ""));
    });
  });
});

test("every header acquisition CTA leads to the acquisition gateway", function () {
  Object.keys(PAGES).forEach(function (page) {
    var html = read(page);
    var navCtas = html.match(/<a class="nav-cta" href="([^"]+)"/g) || [];
    assert.strictEqual(navCtas.length, 1, page);
    var href = navCtas[0].match(/href="([^"]+)"/)[1];
    assert.strictEqual(resolve(page, href).file, "acquisition/index.html", page);
  });
  var hero = read("index.html").match(/<a href="([^"]+)" class="btn btn-secondary">Strategic Acquisition<\/a>/);
  assert.ok(hero, "hero acquisition CTA");
  assert.strictEqual(resolve("index.html", hero[1]).file, "acquisition/index.html");
});

test("every mailto targets the inquiry address and is shielded from CDN rewriting", function () {
  var count = 0;
  ALL_PAGES.forEach(function (page) {
    var html = read(page);
    var pattern = /href="mailto:([^"?]+)[^"]*"/g;
    var match;
    while ((match = pattern.exec(html))) {
      count += 1;
      assert.strictEqual(match[1], INQUIRY, page);
      var open = html.lastIndexOf("<!--email_off-->", match.index);
      var close = html.lastIndexOf("<!--/email_off-->", match.index);
      assert.ok(open !== -1 && open > close, page + " mailto outside email_off");
    }
  });
  assert.ok(count >= 2);
  assert.ok(read("acquisition/index.html").indexOf("mailto:" + INQUIRY) !== -1);
});

test("external evidence links on public pages are registered sources", function () {
  var byUrl = {};
  register.sources.forEach(function (source) { byUrl[source.url] = source; });
  Object.keys(PAGES).forEach(function (page) {
    attributes(read(page), "a", "href").forEach(function (href) {
      if (!/^https?:/.test(href)) return;
      var host = href.replace(/^https?:\/\//, "").split("/")[0];
      if (NON_EVIDENCE_HOSTS.indexOf(host) !== -1) return;
      var source = byUrl[href];
      assert.ok(source, page + " cites unregistered " + href);
      assert.ok((source.cited_on || []).indexOf(page) !== -1, source.id + " cited_on " + page);
    });
  });
  register.sources.forEach(function (source) {
    (source.cited_on || []).forEach(function (page) {
      assert.ok(read(page).indexOf('href="' + source.url + '"') !== -1, source.id + " " + page);
    });
  });
});

test("every email address in a page is the inquiry address and sits inside email_off", function () {
  ALL_PAGES.forEach(function (page) {
    var html = read(page).replace(/"@(context|type|id|graph)"/g, "");
    var pattern = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
    var match;
    while ((match = pattern.exec(html))) {
      assert.strictEqual(match[0], INQUIRY, page + " " + match[0]);
      var open = html.lastIndexOf("<!--email_off-->", match.index);
      var close = html.lastIndexOf("<!--/email_off-->", match.index);
      assert.ok(open !== -1 && open > close, page + " address outside email_off");
    }
  });
});

test("only admitted sources may be displayed on public pages", function () {
  register.sources.forEach(function (source) {
    if (source.admission_status !== "ADMITTED") {
      assert.deepStrictEqual(source.cited_on || [], [], source.id);
      ALL_PAGES.concat(["llms.txt"]).forEach(function (page) {
        assert.ok(read(page).indexOf(source.url) === -1, source.id + " linked from " + page);
      });
    }
  });
});

test("public pages publish no market-size figures", function () {
  ALL_PAGES.forEach(function (page) {
    var text = read(page);
    assert.ok(!/\$\s?\d[\d.,]*\s?(T|B|M|bn|tn)\b/.test(text), page);
    assert.ok(!/\b(USD|US\$)\s?[\d.,]+\s?(billion|trillion|million)\b/i.test(text), page);
    assert.ok(!/\b[\d.,]+\s?(billion|trillion)\b/i.test(text), page);
  });
});

// Market-condition assertions withdrawn in the PR #9 evidence review. They return only with an admitted source.
var UNSUPPORTED_MARKET_ASSERTIONS = [
  /\bincreasingly\b/i,
  /\btypically\b/i,
  /\bmost brands\b/i,
  /\buniversally\b/i,
  /\byear over year\b/i,
  /\blow-margin\b/i,
  /compete on price/i,
  /trust forms/i,
  /leak both conversion/i,
  /rewards direct consumer control/i,
  /weakens the category/i,
  /few names combine/i,
  /households think in categories/i,
  /published series mix/i
];

function visibleText(html) {
  return html.replace(/<script[\s\S]*?<\/script>|<style[\s\S]*?<\/style>/g, " ").replace(/<[^>]+>/g, " ").replace(/\s+/g, " ");
}

test("public pages carry no withdrawn or unsourced market-condition assertions", function () {
  ALL_PAGES.forEach(function (page) {
    var html = read(page);
    var text = visibleText(html) + " " + (html.match(/content="[^"]*"/g) || []).join(" ");
    UNSUPPORTED_MARKET_ASSERTIONS.forEach(function (pattern) {
      assert.ok(!pattern.test(text), page + " " + pattern);
    });
  });
});

test("llms.txt links resolve to published files", function () {
  var text = read("llms.txt");
  var urls = text.match(/https:\/\/hygieneroll\.com\/[^)\s]*/g) || [];
  assert.ok(urls.length >= 8);
  urls.forEach(function (url) {
    assert.ok(fs.existsSync(path.join(root, urlToFile(url))), url);
  });
});

test("calculator loads the engine before the page script", function () {
  var html = read("calculator.html");
  var engineAt = html.indexOf('src="assets/js/replenishment-engine.js"');
  var pageAt = html.indexOf('src="assets/js/replenishment-calculator.js"');
  assert.ok(engineAt !== -1 && pageAt > engineAt);
});

test("tracked files carry no credentials or internal strategy material", function () {
  var files = childProcess.execSync("git ls-files", { cwd: root, encoding: "utf8" }).split("\n").filter(Boolean);
  files.forEach(function (file) {
    assert.ok(!/^(strategy|\.claude|\.cursor)\//.test(file), file);
    assert.ok(!/(^|\/)\.env(\.|$)/.test(file), file);
  });
  var secret = /(AKIA[0-9A-Z]{16}|gh[pousr]_[A-Za-z0-9]{30,}|sk-[A-Za-z0-9]{20,}|-----BEGIN [A-Z ]*PRIVATE KEY-----|xox[abpr]-[A-Za-z0-9-]{10,})/;
  files.filter(function (file) { return /\.(html|js|json|md|txt|xml)$/.test(file); }).forEach(function (file) {
    assert.ok(!secret.test(read(file)), file);
  });
});

console.log(passed + " passed");
