# HygieneRoll Evidence Policy

Version: v0.1

## Purpose

This policy governs what may appear in the public HygieneRoll reference layer as a fact about the world, as distinct from a concept HygieneRoll itself defines.

The reference layer is a vocabulary and an admission system. It is not an industry standard, an official taxonomy, or a claim of scientific validation.

## Claim classes

Every public reference claim uses exactly one class.

### PROJECT_DEFINITION

A concept or distinction intentionally defined by HygieneRoll.

A project definition does not need an external source in order to exist. It must be framed as a HygieneRoll definition, not as a universal empirical fact. It identifies the public artifact where the concept originated or is operationalized, using `origin_refs`.

`source_ids` must be empty. `origin_refs` must contain at least one project provenance reference. External evidence belongs on an observed or derived claim, not inside the definition.

### OBSERVED_EVIDENCE

A factual statement about the external world.

Examples include market size, household or consumer behavior, subscription adoption, logistics performance, consumption rates, retailer behavior, company operations, and published research findings.

This class requires admissible external evidence. `source_ids` must contain at least one id. Every id must resolve in the source register. Every supporting source must have `admission_status` `ADMITTED`. A missing, unresolved, `REVIEW_REQUIRED`, or `BLOCKED` source does not admit the claim.

### DERIVED_INTERPRETATION

An interpretation produced from one or more premises.

In v0.1 a derived interpretation must contain at least one `source_id`. Every id must resolve in the source register. Every supporting source must have `admission_status` `ADMITTED`. There is no source-free interpretation mode and no optional flag that turns the requirement off. A later phase that needs project-only reasoning would require an explicit governance decision.

The wording must stay interpretive: “this suggests,” “one operational implication is,” or “the evidence is consistent with.” The interpretation must not be presented as a sentence the source itself stated.

### ILLUSTRATIVE_MODEL

A scenario, hypothetical example, calculator fixture, diagram, or model used to explain logic.

It must be identified as illustrative. It is not a measured household, average behavior, real customer data, or market evidence.

## Source hierarchy

Preferred evidence, in order:

Tier A: regulators, government agencies, official statistical bodies, standards organizations, peer-reviewed research, academic institutions, primary company filings or official reports, and primary platform documentation.

Tier B: established research organizations, respected institutional reports, and transparent industry bodies.

Tier C: reputable trade publications and high-quality secondary reporting.

These are not foundational evidence: affiliate blogs, generic SEO pages, anonymous statistics sites, scraped content, AI-generated pages, unsourced infographics, and copied market-statistic aggregators.

A weaker source may help someone discover a document. Discovery is not admission.

## Source admission status

Every source in the register uses one status. The allowed values are:

- `ADMITTED` — the source may support an observed claim or a derived interpretation.
- `REVIEW_REQUIRED` — the source is recorded and not yet qualified. It does not support a claim.
- `BLOCKED` — the source is disqualified. It does not support a claim.

Anything outside that set is invalid. Only `ADMITTED` satisfies an external evidence dependency. The empty source register remains valid.

## Admission rules

An OBSERVED_EVIDENCE claim may be public only when all of the following hold:

1. A source exists.
2. The source is identifiable.
3. The source supports the exact claim.
4. Scope is compatible.
5. Time period is compatible.
6. Geography is not silently generalized.
7. Population is not silently generalized.
8. The metric definition is understood.
9. The public wording does not exceed the source.

If any requirement fails, status is BLOCKED. The claim is not rewritten into a softer label that keeps the unsupported factual implication.

## Scope matching

The public sentence must stay inside the activity, product set, and channel the source actually measured. A broad cleaning-products series is not a household-hygiene-only total. A commerce category is not HygieneRoll revenue.

## Date matching

The public sentence must keep the source period. A figure for one year is not silently moved to another year, and a forecast is not presented as a current measurement.

## Geography matching

A national, regional, or platform-specific finding is not restated as a global household law. If the source names a geography, the public claim keeps it.

## Population matching

A sample, a customer base, a retail channel, or an institutional buyer group is not restated as “households” in general. The population in the sentence matches the population in the source.

## Metric-definition matching

The public claim uses the source’s metric, unit, and inclusion rules. A subscription-economy total is not a hygiene market. A shipment count is not a depletion measurement.

## Primary vs secondary evidence

Primary evidence is the document or dataset that established the figure or finding. Secondary reporting may point to it. Admission prefers the primary source. A secondary mention does not upgrade a claim the primary document does not support.

## Copyright / source-use law

The repository stores citation metadata, not a library of other people’s documents. Do not commit downloaded source PDFs or full third-party texts merely because they are publicly reachable.

A future source object uses these fields:

- `id`
- `title`
- `publisher`
- `url`
- `source_type`
- `publication_date`
- `accessed_date`
- `geography`
- `population`
- `scope`
- `rights_note`
- `admission_status`
- `notes`

`admission_status` is exactly one of `ADMITTED`, `REVIEW_REQUIRED`, or `BLOCKED`.

Suggested identifier: `SRC-HR-0001`. No source is registered in v0.1. Speculative sources and research wishlists are not entered to fill the file.

Long excerpts are not reproduced. Paraphrase. A quotation is minimal and only when the exact words are necessary.

Third-party files are committed only when reuse rights are clearly compatible and there is a concrete reason.

## Project-artifact provenance

HygieneRoll’s own homepage, replenishment model, calculator, methodology, and reference page may establish PROJECT_DEFINITION and the origin of a project concept.

They are not external evidence for markets, consumers, households, companies, or industry outcomes.

Use `origin_refs` for project artifacts. Use `source_ids` only for admitted external evidence. Do not cite a HygieneRoll page as the source of an external fact.

## Blocked claims

A blocked claim is not published. Missing evidence is not filled with a vaguer sentence that still asserts the fact. Project confidence is not converted into an industry-standard, official-taxonomy, or scientifically-validated label.

## Interpretation language

Derived claims stay in interpretive voice. They name the supporting source IDs. They do not say the source “found” a conclusion the source did not state.

## Illustrative-model law

An example used to show arithmetic or a loop is labeled illustrative. It is not labeled as an average household, a customer history, or a market result. Calculator fixtures used in tests are not public consumption benchmarks.

## Version

v0.1. This is the foundation contract, not a complete evidence corpus.
