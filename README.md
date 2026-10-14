# HygieneRoll.com

A developed strategic digital asset for recurring household hygiene replenishment.

## What HygieneRoll is

HygieneRoll.com is a category-native consumer entry layer developed around recurring hygiene demand. The work concentrates on replenishment continuity, cadence, usage, re-entry, and household expansion.

Paper hygiene — tissue, rolls, towels, wipes — is the model's clearest entry point, because in the model that is where household language and depletion behavior are most specific. It is not the ceiling. The same relationship is built to extend into personal care and broader household hygiene essentials.

This repository is the public record of that asset. It is not an operating tissue company, a fulfillment business, or a live subscription service.

## Core thesis

In a category defined by habitual depletion, the valuable position is ownership of return: the direct consumer relationship through which demand comes back.

Retail can distribute the product and still leave cadence, usage, and the next purchase outside the brand’s control. A category-native surface is aimed at that moment — the household noticing it is running low — rather than at a one-time brand campaign.

The thesis holds together a few ideas:

- ownership of return, instead of a rented retail relationship
- recurring household demand
- replenishment continuity
- cadence and usage as operating signals
- re-entry into the same household need
- a direct consumer relationship
- category-native entry, legible before a product brand is
- household hygiene expansion from the paper entry point outward

## What has been developed

The public asset currently includes:

- strategic category positioning for recurring household hygiene
- a public website at [hygieneroll.com](https://hygieneroll.com/)
- a replenishment model, published as a reference document
- interface concepts for plan construction, cadence, subscription control, shipment visibility, and account continuity
- operating logic for a direct replenishment loop
- household expansion logic from paper hygiene into personal care and home essentials
- a public acquisition surface with a direct inquiry path
- a browser-based household hygiene replenishment calculator using user-supplied usage, lead-time, buffer, and variability assumptions, with reorder thresholds, fixed-interval fit, lead-time slip exposure, and a machine-readable scenario record
- a versioned replenishment ontology that defines every calculator input and output, published as JSON and on the reference page
- a governed household hygiene replenishment reference layer
- a public evidence policy separating definitions, observations, interpretations, and illustrative models

No customers, revenue, fulfillment operation, or live subscription product are claimed. Interface screens are concepts developed to show how an operator could deploy the model.

## Status

Developed strategic digital asset — available for strategic acquisition.

## Intended operator fit

The asset is structured for operators who already understand recurring household demand. Generic fits include:

- tissue and household hygiene companies
- direct-to-consumer hygiene operators
- private-label operators
- recurring-commerce businesses
- subscription and replenishment platforms
- commerce and fulfillment infrastructure companies

## Live asset

https://hygieneroll.com

Public pages:

- [Home](https://hygieneroll.com/) — the asset thesis, operating concepts, and acquisition availability
- [Replenishment model](https://hygieneroll.com/replenishment-model.html) — the reference document for the operating logic
- [Calculator](https://hygieneroll.com/calculator.html) — a local planning estimator driven by the visitor’s own usage, lead-time, buffer, and variability assumptions
- [Reference](https://hygieneroll.com/reference.html) — working definitions, the replenishment ontology, and evidence rules
- [Reference cases](https://hygieneroll.com/reference/cases/) — five synthetic scenarios whose results are checked against an independent oracle
- [Acquisition](https://hygieneroll.com/acquisition/) — what can be evaluated, what is not claimed, and the inquiry address

## Strategic acquisition inquiries

agent@sohadot.com — scope at [hygieneroll.com/acquisition/](https://hygieneroll.com/acquisition/)

## Ownership / rights

Public source is presented for transparency and asset demonstration. No license for reuse is granted unless explicitly stated.

The site presents developed public work for evaluation. It does not, by itself, transfer trademarks, copy, or other rights that have not been agreed in a transaction.

## Repository

```
HygieneRoll/
├── README.md
├── .gitignore
├── CNAME
├── index.html
├── replenishment-model.html
├── calculator.html
├── reference.html
├── acquisition/
├── 404.html
├── llms.txt
├── CALCULATOR_METHODOLOGY.md
├── REFERENCE_ARCHITECTURE.md
├── EVIDENCE_POLICY.md
├── DECISION_LOG.md
├── reference/
│   ├── cases/
│   └── schema/
├── verification/
├── assets/
│   ├── images/
│   └── js/
├── tests/
├── robots.txt
└── sitemap.xml
```

## Tests

No dependencies. Run each suite with Node:

```
node tests/replenishment-engine.test.js
node tests/replenishment-ontology.test.js
node tests/reference-governance.test.js
node tests/site-integrity.test.js
node tests/reference-cases.test.js
node tests/independent-verification.test.js
node tests/reference-scenario.test.js
node tests/numerical-audit.test.js
```

The extended numerical audit runs separately, in about 8 seconds:

```
node verification/audit-numerical.js
```

After changing the engine, the ontology, or `reference/cases/registry.json`, rebuild the published reference records:

```
node verification/build-reference-records.js
```

The build fails, and writes nothing, if any expected value disagrees with the engine or the oracle.
