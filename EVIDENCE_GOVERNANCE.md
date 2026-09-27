# HygieneRoll Evidence Governance

Version: v0.2 — Evidence Governance Hardening

## Baseline

Foundation v0.1 is the baseline, at commit `69ecf4cf168e2062490edb3f047c589e79f19f6f` on `main`.

v0.2 does not rewrite the v0.1 documents or registers. `EVIDENCE_POLICY.md`, `REFERENCE_ARCHITECTURE.md`, `reference/knowledge-objects.json`, and `reference/source-register.json` keep their v0.1 content. This document adds to them. Where v0.1 treats an `ADMITTED` source as enough to support an observed or derived claim, this document governs: an admitted source is necessary, and it is not sufficient.

## Scope (DEC-HR-006)

Every external factual claim on every public HygieneRoll surface is under one Evidence Admission Law. The reference layer is not a governed island. The law covers:

- `index.html`
- `replenishment-model.html`
- `calculator.html`
- `reference.html`
- explanatory copy on any of them
- any future public page, from the moment it exists

The test suite fails if a root HTML page or a sitemap URL is not on the governed surface list, and if any governed surface shows a quantitative external figure (a currency amount, a million/billion/trillion magnitude, or CAGR language) that is not part of a registered claim.

## Pipeline (DEC-HR-007)

```
SOURCE
  ↓ source qualification
ADMITTED SOURCE
  ↓ claim-source qualification
ADMISSIBLE CLAIM
  ↓
PUBLICATION
```

Not:

```
ADMITTED SOURCE → PUBLIC CLAIM
```

Source admission says a source is trustworthy. It does not say the source supports a given sentence. A source is not evidence for every claim.

## Source node (DEC-HR-008)

A source record carries every one of these fields as a non-empty string:

| Field | Rule |
| --- | --- |
| `id` | `SRC-HR-0001` form |
| `title` | |
| `publisher` | |
| `url` | `http` or `https` |
| `source_type` | |
| `publication_date` | `YYYY`, `YYYY-MM`, or `YYYY-MM-DD`, a real date |
| `accessed_date` | `YYYY-MM-DD`, a real date, not before `publication_date` |
| `geography` | |
| `population` | |
| `scope` | |
| `metric` | |
| `rights_note` | |
| `admission_status` | `ADMITTED`, `REVIEW_REQUIRED`, or `BLOCKED` |
| `notes` | |

A missing, blank, or malformed field is a material omission. A record with a material omission is treated as `BLOCKED`, whatever `admission_status` it declares.

## Source Qualification Contract

Claim-source qualification is its own record, one per claim and cited source:

```json
{
  "claim_id": "HRC-XXXX",
  "source_id": "SRC-HR-XXXX",
  "qualification": {
    "scope_match": true,
    "period_match": true,
    "geography_match": true,
    "population_match": true,
    "metric_match": true,
    "wording_supported": true
  },
  "result": "ADMISSIBLE"
}
```

Records live in `reference/claim-qualifications.json`.

The six dimensions:

- `scope_match` — the claim stays inside the activity, product set, and channel the source measured.
- `period_match` — the claim keeps the source period; a forecast is not a measurement.
- `geography_match` — the claim keeps the source geography.
- `population_match` — the claim's population is not wider than the source's.
- `metric_match` — the claim uses the source's metric, unit, and inclusion rules.
- `wording_supported` — the source states what the claim asserts, and the wording does not exceed it.

Rules the engine enforces:

1. Each dimension must be present and the literal value `true`. `false`, missing, `null`, `"true"`, `1`, and any other value block.
2. An unknown dimension key blocks, so a misspelled key cannot pass silently.
3. The result is computed from the dimensions. A declared `result` is never trusted; if it disagrees with the computed result, the record is `BLOCKED`.
4. Qualification does not transfer between claims or between sources.
5. Two records for the same claim-source pair are ambiguous and block.
6. Every source a claim cites must be admitted and qualified, not just one of them.

Absence of qualification is not permission.

## Claim admission

`OBSERVED_EVIDENCE` and `DERIVED_INTERPRETATION` are admissible only when:

1. the claim has an id and at least one `source_id`;
2. every `source_id` resolves to exactly one source record;
3. every cited source is a complete source node with `admission_status` `ADMITTED`;
4. every cited source has exactly one qualification record for this claim; and
5. every governed dimension on that record passes.

Anything else is `BLOCKED`.

`PROJECT_DEFINITION` keeps the v0.1 contract: no `source_ids`, at least one `origin_ref`. `ILLUSTRATIVE_MODEL` is unchanged from v0.1.

## Legacy external claims (DEC-HR-009)

Two external claims were published before DEC-HR-006 and are registered in `reference/legacy-claims.json` as legacy external claims pending governance migration:

- `HRL-001` — Subscription Economy figures, on `index.html` and `replenishment-model.html`
- `HRL-002` — Broad Cleaning & Hygiene Products Market figures, on `index.html` and `replenishment-model.html`

They are not grandfathered:

- `PENDING_MIGRATION` is never admissible.
- `MIGRATED` requires a `governed_claim_id` that passes the full v0.2 contract.
- `SUPPRESSED` requires the registered text to be gone from every surface.
- While not suppressed, the registered text must match the live page exactly, so an edit to a legacy figure is caught.
- `migration_due` is `0.3`. When the governance version reaches it, any claim still pending fails the suite.

## Engine and tests

- Engine: `reference/evidence-governance.js`
- Tests: `tests/evidence-governance.test.js`
- v0.1 tests remain: `tests/reference-governance.test.js`, `tests/replenishment-engine.test.js`

```
node tests/evidence-governance.test.js
node tests/reference-governance.test.js
node tests/replenishment-engine.test.js
```

## Register state in v0.2

`reference/source-register.json` stays `{ "version": "0.1", "sources": [] }`. `reference/claim-qualifications.json` stays empty. The court is built before the first case is brought.

## Roadmap

1. v0.1 — Vocabulary Foundation (done)
2. v0.2 — Evidence Governance Hardening (this version)
3. v0.3 — Legacy Claim Migration
4. v0.4 — First Governed External Source Admission
5. v0.5 — First `OBSERVED_EVIDENCE` object

Corpus construction begins after v0.5.
