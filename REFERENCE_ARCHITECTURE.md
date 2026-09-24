# HygieneRoll Reference Architecture

Version: v0.1

## Purpose

The reference layer is a governed public vocabulary for the HygieneRoll replenishment model. It separates what HygieneRoll defines from what external evidence establishes, from what is interpreted, and from what is only an illustration.

Phase II begins here, with one hub, not with a set of keyword pages.

## Reference layer architecture

Public reading happens on `reference.html`.

The machine contract is `reference/knowledge-objects.json`.

External sources, when a later sprint admits them, are listed in `reference/source-register.json`.

The rules for admission are `EVIDENCE_POLICY.md`.

The calculator methodology remains the formula specification for calculator v0.1. This architecture does not replace it.

## Knowledge objects

A knowledge object is one distinct concept in the public vocabulary. Foundation v0.1 contains exactly eight objects, `HRK-001` through `HRK-008`. Each object is ACTIVE. There is no maturity score and no numerical quality score.

An object carries an id, slug, title, status, definition scope, summary, claims, origin references, related objects, and related routes.

Claims use `HRC-` identifiers. Each claim has one class: `PROJECT_DEFINITION`, `OBSERVED_EVIDENCE`, `DERIVED_INTERPRETATION`, or `ILLUSTRATIVE_MODEL`.

## Claim classes

`PROJECT_DEFINITION` is a HygieneRoll working definition. It points at project artifacts through `origin_refs`, and `origin_refs` must name at least one artifact. Its `source_ids` stay empty.

`OBSERVED_EVIDENCE` is a statement about the external world. It requires at least one `source_id`. Each id must resolve, and each supporting source must be `ADMITTED`.

`DERIVED_INTERPRETATION` is an inference. It requires at least one `source_id`. Each id must resolve, and each supporting source must be `ADMITTED`. The sentence stays interpretive. v0.1 has no source-free interpretation mode.

`ILLUSTRATIVE_MODEL` is an example or diagram used to explain logic. It is marked as illustrative and is not treated as observed behavior.

## Project provenance vs external evidence

`origin_refs` record where a project concept lives: a page, the methodology, or the calculator engine.

`source_ids` record external sources only, and only a source with `admission_status` `ADMITTED` can support a published observed or derived claim.

A HygieneRoll page cannot be used as evidence that a market, a household, or a company behaves in a stated way. That would be circular.

## Source register

`reference/source-register.json` version 0.1 may contain an empty `sources` array. Empty is valid. Sources are not added to make the register look active.

A future source object uses: id, title, publisher, url, source_type, publication_date, accessed_date, geography, population, scope, rights_note, admission_status, and notes. The identifier form is `SRC-HR-0001`.

`admission_status` is one of `ADMITTED`, `REVIEW_REQUIRED`, or `BLOCKED`. Only `ADMITTED` can satisfy an evidence dependency. `REVIEW_REQUIRED` and `BLOCKED` do not.

## Admission rule

Observed claims fail closed. If the source is missing, unidentified, off-scope, out of period, or broader than the evidence, the claim is BLOCKED and is not published in a softened form that keeps the same factual implication.

The later evidence phase proceeds source, then qualification, then claim, then interpretation, then publication. It does not start from a desired sentence and search for convenient support.

Evidence supports understanding. It does not, by itself, become a prediction that HygieneRoll will succeed, a valuation input, or proof of guaranteed recurring revenue.

## Public rendering

`reference.html` is the human-readable rendering of the register. Identifiers, titles, slugs, and claim classes on the page match the JSON. Each formal claim is rendered in one paragraph marked `data-claim-id`, and that paragraph’s text matches `claim.text`. The page explains the four classes, states the evidence posture of each object, and links to the calculator and the replenishment model. Claim identifiers stay in that attribute. They are not shown as a visible score or label.

The page does not display a count of verified claims, an evidence score, a trust score, or a verification percentage.

## Versioning

Reference foundation v0.1. Knowledge register v0.1. Evidence policy v0.1. Source register v0.1.

This is not called 1.0, final, or complete.

## Expansion rule

A future knowledge object is admitted only when it adds a genuinely distinct concept. A synonym is not given its own object in order to target a search phrase.

One governed object does not automatically become one public page.

A dedicated public route is created only when the object has substantive content and at least one of: a distinct evidence body, standalone utility, meaningful research value, or substantial explanatory depth.

That rule is how the reference layer avoids thin-page growth.

Foundation v0.1 publishes the eight objects inside the single reference hub. It does not publish a separate URL per object.
