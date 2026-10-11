# HygieneRoll Public Decision Log

This log records public reference decisions only. It does not record pricing, valuation, buyer selection, negotiation, outreach, or private commercial plans.

## DEC-HR-001

Date: 2026-09-24

Reference claims use four explicit classes: `PROJECT_DEFINITION`, `OBSERVED_EVIDENCE`, `DERIVED_INTERPRETATION`, and `ILLUSTRATIVE_MODEL`.

## DEC-HR-002

Date: 2026-09-24

Project definitions are not treated as external evidence. HygieneRoll pages and the calculator methodology may show where a concept comes from. They do not establish facts about markets, households, or companies.

## DEC-HR-003

Date: 2026-09-24

Observed external claims fail closed without admissible evidence. A missing source blocks the claim. The sentence is not softened while the unsupported fact remains.

## DEC-HR-004

Date: 2026-09-24

Phase II begins with one reference hub, `reference.html`, not with a separate page for each concept.

## DEC-HR-005

Date: 2026-09-24

The first eight knowledge objects are project definitions unless external evidence is separately admitted. Foundation v0.1 admits no external sources.

## DEC-HR-006

Date: 2026-10-11

The replenishment ontology adds `DERIVED_CALCULATION` and `HYPOTHETICAL_SCENARIO` as layers for scenario fields. A deterministic calculation from user inputs needs a formula, not a source. That keeps the source requirement on `DERIVED_INTERPRETATION` intact.

## DEC-HR-007

Date: 2026-10-11

Third-party figures already displayed on public pages are recorded in the source register as `REVIEW_REQUIRED`, so the register reflects what the site shows. Recording a figure does not admit it. Admitting or removing the displayed market figures is left to the owner.

## DEC-HR-008

Date: 2026-10-11

Acquisition calls to action lead to `/acquisition/`, which lists the components available to evaluate and what is not claimed. The contact route is a mailto link to the published inquiry address. The address is excluded from CDN email rewriting so it works without JavaScript. No backend collects inquiries.

## DEC-HR-009

Date: 2026-10-11

This decision replaces the display part of DEC-HR-007. Public pages show no third-party market figure until its source is `ADMITTED`. The Grand View Research figures were removed from the homepage and the replenishment model. Their records stay in the register as `REVIEW_REQUIRED`, with empty `cited_on`.

## DEC-HR-010

Date: 2026-10-11

Market-condition statements on public pages are either project theses, marked as the model's premise or design intent, or verified external claims with an admitted source. Unsourced statements about trends, consumer behavior, channel effects, and scarcity were rewritten as statements of the model's premise. The withdrawn phrasings are listed in `tests/site-integrity.test.js` and may return only with an admitted source.

## DEC-HR-011

Date: 2026-10-11

Before a whole-day floor, ceiling, half-up rounding, or comparison, engine v0.2.1 moves a value onto the nearest whole or half day only if it is within 2⁻⁴⁷ of it, relative to the largest operand. That bound is about seven times the worst-case binary rounding error of the calculation. Unit rounding uses the same bound. The exact-arithmetic oracle showed that binary floating-point noise made v0.1 and v0.2 disagree with the published methodology for about 3% of the verification grid. A first draft of this fix rounded values to 9 decimals. Review showed that it hid genuine offsets of up to 5 × 10⁻¹⁰ days and truncated published arrival days, so it was replaced before merge. The methodology defines the formulas on decimal inputs, so the engine was corrected to match it. The record field contract is unchanged. Tests require every changed result to match the oracle.

## DEC-HR-012

Date: 2026-10-11

Reference cases are published only through `verification/build-reference-records.js`. Each case needs hand-derived expected values that agree with both the engine and an independent oracle. A failed check blocks the whole build, so a failed case cannot appear as an approved record. Cases reuse the existing claim class `ILLUSTRATIVE_MODEL` and the ontology layers. No new evidence class was introduced.

## DEC-HR-013

Date: 2026-10-11

A reference case opens in the calculator through `#case=HRR-###`, never through input values in the URL. The calculator trusts a record only after its sha256 matches the published manifest. The visitor's scenario and its export are labeled `USER_SCENARIO` and `verified_reference: false`. Published records and the manifest are not changed by this feature.

## DEC-HR-014

Date: 2026-10-11

The one-off numerical sweeps from Sprint #10 became a permanent, deterministic audit with pinned set fingerprints. When the engine differs from exact arithmetic, the audit counts the input as a documented precision limit only if the engine matches the documented 2⁻⁴⁷ rule computed exactly. Otherwise it reports a mismatch. The audit runs separately from the standard tests because of its size.
