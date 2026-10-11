# Household Hygiene Replenishment Calculator Methodology

Version: v0.2.1

v0.2.1 is a correctness patch. Before each whole-day decision, the engine now removes binary floating-point noise, so a value that is exactly a whole or half day in decimal arithmetic rounds as this document states. See "Binary noise" under the rounding law. No formula changed.

v0.2 adds a reorder threshold, a fixed-interval fit, lead-time slip with stockout exposure, and a machine-readable scenario record. All v0.1 formulas and outputs are unchanged. Every input and output is defined in `reference/replenishment-ontology.json`.

## Scope

The calculator estimates a replenishment planning window from user-supplied household assumptions. It is a transparent, deterministic scenario tool.

The engine does not know how a household uses a product. No empirical household-consumption benchmarks are embedded. That is deliberate. The estimate stays inspectable until a later sprint introduces governed evidence.

The tool does not predict actual depletion, and it does not describe an output as optimal, guaranteed, or recommended. HygieneRoll does not operate fulfillment, subscriptions, logistics, accounts, or live inventory through this page.

## Input model

Each item is an independent clock. The engine accepts:

| Input | Meaning | Rule |
| --- | --- | --- |
| Item name | Preset label or custom name | Required, after trimming whitespace |
| Unit label | Display unit only | Not used in the math. Preset units are inflected for display. A custom unit is shown as entered |
| Current quantity | Supply on hand | Must be a finite number greater than 0. Decimals are allowed |
| Usage method | `weekly` or `duration` | Required |
| Weekly use | Units used per week | Required and greater than 0 when the method is `weekly` |
| Typical duration | Weeks the current quantity usually lasts | Required and greater than 0 when the method is `duration` |
| Replenishment quantity | Units usually added at replenishment | Optional. Blank uses the current quantity. A supplied value must be greater than 0 |
| Lead time | Days until a replenishment could arrive | Finite number, 0 or greater. No hidden default |
| Safety buffer | Extra days the user wants before depletion | Finite number, 0 or greater. User-selected. Not an optimal stock level |
| Variability | Planning allowance, 0% to 50% | Default visible value is 0%. Nothing is applied silently |
| Fixed delivery interval | Days between deliveries of a schedule the user wants to compare | Optional. A supplied value must be a finite number greater than 0 |
| Category | `PAPER_HYGIENE`, `PERSONAL_HYGIENE`, `HOUSEHOLD_HYGIENE`, or `OTHER` | Optional. Set by the preset's group. A label only. It does not change a result |

Household size is not an input. It does not determine consumption.

Preset names supply a display name and a default unit label only. They do not supply a usage rate.

Unit wording is display-only and does not change a result. Governed preset units use a singular form at exactly 1 and a plural form otherwise: roll/rolls, pack/packs, bottle/bottles, tube/tubes. Compound preset units use an explicit phrase rather than a broken plural: “bottle or refill” / “bottles or refills”, and “pack or bottle” / “packs or bottles”. A custom unit, including a preset unit the visitor rewrites, is an opaque label and is not pluralized.

## Usage normalization

Let `q` be the current quantity and `r` the normalized weekly usage rate.

Weekly method:

```
r = weekly_usage
```

Duration method:

```
r = q / duration_weeks
```

`r` must be greater than 0. The engine rejects a result that is not.

## Variability allowance

Let `p` be the variability percentage and:

```
v = p / 100
```

Allowed range:

```
0 <= v <= 0.50
```

```
slow_usage = r × (1 − v)
fast_usage = r × (1 + v)
```

When `v = 0`, `slow_usage` and `fast_usage` both equal `r`.

This is a user-selected planning allowance. It is not a probability model and it is not a statistical confidence interval. At 50%, `slow_usage` is half of `r`, so the rate stays above zero whenever `r` is above zero.

## Depletion calculation

Raw day counts:

```
depletion_earliest_raw = (q / fast_usage) × 7
depletion_latest_raw = (q / slow_usage) × 7
```

When `v = 0` the two raw values are equal. The published day is that value rounded half up to a whole day. Halves round toward positive infinity, matching `Math.round` for these non-negative values.

When `v > 0`:

```
depletion_earliest = floor(depletion_earliest_raw)
depletion_latest = ceil(depletion_latest_raw)
```

The result is a whole-day window. The engine does not publish fractional days.

## Planning trigger

Lead time `L` and safety buffer `B` are subtracted from the rounded depletion days:

```
trigger_raw = rounded_depletion_day − L − B
```

Each end of the depletion window is subtracted separately.

When the depletion result is a single day, a fractional trigger is rounded half up. When the depletion result is a range, the earlier trigger is floored and the later trigger is ceiled. Whole-day inputs are unchanged by that second rounding, because an integer stays on the same integer.

Each end is then clamped:

```
trigger = max(0, rounded_trigger)
```

A negative day is never shown.

- Both ends at 0: `Now`. The accompanying note is “Within the current lead-time and buffer window.”
- Earlier end at 0 and later end above 0: `Now–X days`
- Otherwise a single day, or a day range

This is a planning calculation. It is not a perfect reorder date, an optimal date, or an automated recommendation.

## Illustrative cadence

Let `R` be the replenishment quantity. If the user leaves it blank, `R = q`.

Cadence uses the same day-window rule as depletion, with `R` in place of `q`:

```
cadence_earliest_raw = (R / fast_usage) × 7
cadence_latest_raw = (R / slow_usage) × 7
```

The published label is “Illustrative cadence”. It is not an optimal cadence and it is not a recommended subscription frequency.

## Reorder threshold

The reorder threshold is the planning trigger expressed as a stock level. It uses the fast usage bound, which is the same bound that sets the earliest trigger.

```
lead_time_demand = ceil_0.01(L × fast_usage / 7)
reserve_stock    = ceil_0.01(B × fast_usage / 7)
reorder_threshold = lead_time_demand + reserve_stock
```

`ceil_0.01` rounds up to the next hundredth of a unit, so a published threshold never understates the stock it covers. Before rounding up, the engine strips binary noise. For example, 1.1 × 100 evaluates to 110.00000000000001 in floating point and is treated as 110. The threshold is the sum of the two published parts, so the displayed arithmetic adds up.

`at_or_below_reorder_threshold` is true when current supply is less than or equal to the threshold.

Day rounding and unit rounding are separate, so the threshold and the day trigger can differ by a fraction of a day's use. The day trigger stays the governing planning date.

## Fixed-interval fit

A fixed delivery interval `I` is compared with the illustrative cadence window:

```
fit = EARLIER_THAN_WINDOW  if I < cadence_earliest
      LATER_THAN_WINDOW    if I > cadence_latest
      WITHIN_WINDOW        otherwise
drift_per_cycle.min = I − cadence_latest
drift_per_cycle.max = I − cadence_earliest
```

Positive drift means each delivery arrives after the previous replenishment quantity would run out, so supply shrinks with each cycle. Negative drift means stock builds up. This makes the replenishment-versus-subscription distinction measurable for one item. It is not a recommendation to change a subscription.

## Stockout exposure and lead-time slip

Stockout exposure is evaluated for a given order day `d` and actual lead time `L'`:

```
arrival = d + L'
gap.max = max(0, ceil(arrival − depletion_earliest))   fast usage bound
gap.min = max(0, ceil(arrival − depletion_latest))     slow usage bound
```

Status:

- `BUFFER_INTACT`: arrival is on or before `depletion_earliest − B`
- `BUFFER_DRAWN`: arrival is after that day but on or before `depletion_earliest`
- `STOCKOUT_POSSIBLE`: a gap exists at the fast bound only
- `STOCKOUT_AT_BOTH_BOUNDS`: a gap exists at both bounds

Lead-time slip applies fixed offsets of +3 and +7 days to the entered lead time. For each offset `s` the engine reports:

- the planning trigger re-planned with lead time `L + s`
- the stockout exposure if the order had been placed at `planning_trigger_earliest` but took `L + s` days to arrive

When the trigger is not clamped and lead time and buffer are whole days, a slip no longer than the buffer leaves `gap.max` at 0. With fractional days, the half-up rounding of a single-day trigger can move the order day up to half a day later. The offsets are fixed sensitivity checks. They are not forecasts of delay, and the exposure is arithmetic, not a probability.

## Scenario record

`buildScenarioRecord(items)` returns one JSON object per scenario:

- `record_type`, `record_version`, `engine_version`, and the ontology URL and version
- `epistemic_status`: inputs are `HYPOTHETICAL_SCENARIO`, outputs are `DERIVED_CALCULATION`, `observed_evidence_used` is false, and `embedded_benchmarks` is false
- `uncertainty`: `USER_VARIABILITY_ALLOWANCE`, with `statistical_confidence` false
- `lead_time_slip_offsets_days`
- `items[]`: each item with `inputs` exactly as entered and `outputs` as calculated
- `household`: next return, whether another trigger begins within 7 days, and whether the clocks differ

The record has no timestamp and no identifier from the browser, so identical inputs produce byte-identical JSON. Invalid input throws the same validation error as `calculateItem`, and no partial record is emitted. The calculator page shows the record and can save it as a local file. Nothing is sent over the network.

## Reference cases

`reference/cases/registry.json` holds synthetic scenarios with expected values derived by hand from this document. `verification/build-reference-records.js` compares each expected value with the engine and with the oracle. A case is published as a record only when all three agree, its ontology terms resolve, and its evidence labels are correct. If any check fails, nothing is written.

Published records are serialized canonically, and their sha256 digests are listed in `reference/cases/manifest.json`. The explorer at `/reference/cases/` renders the same records as static HTML. The inputs are synthetic. They are not observed household behavior or benchmarks.

## Multi-item household summary

Each calculated item keeps its own window. The household summary does not average unlike items.

`Next household return` is the item whose `planning_trigger_earliest` is smallest. If several items share that earliest day, every tied name is kept, in input order, and each tied item keeps its own full trigger window.

The machine summary is:

```
nextReturn.names    tied names, in input order
nextReturn.items    those calculated items, each with its own trigger
nextReturn.trigger  { earliest, latest, single } only when every tied item
                    has the same earliest day and the same latest day;
                    otherwise null
```

`trigger` is not copied from the first tied item to stand for the others. It is not an average, and it is not a merged span. When it is `null`, each entry in `items` is the window for that item.

A separate sentence may note that another item’s planning window begins within 7 days. That sentence does not recommend combining shipments.

When two or more items produce different trigger windows, the page can state that different household essentials can enter their replenishment windows at different times. That observation is descriptive.

## Rounding law

Day math, in order:

1. Convert usage to a weekly rate.
2. Apply the variability allowance.
3. Convert quantity and rate to raw days.
4. If variability is 0%, round half up to a whole day. If variability is greater than 0%, floor the early bound and ceil the late bound.
5. Subtract lead time and buffer from those whole days.
6. Round a fractional trigger by the same single-day or range rule, then clamp at 0.

No result displays a fraction of a day.

### Binary noise

This document's formulas are defined on the decimal values the user enters. A browser stores most decimals as the nearest binary double, so arithmetic can land just above or below a whole day. For example, 1.1 / 0.35 × 7 is exactly 22, but evaluates to 22.000000000000004. Taking the ceiling of that gives 23, which is wrong.

From v0.2.1, a value is treated as noise only when it sits within 2⁻⁴⁷ (about 7.1 × 10⁻¹⁵) of a whole or half day, relative to the largest operand. In that case it is moved onto that day before a floor, ceiling, half-up rounding, or comparison decides the result. One day calculation carries at most nine binary roundings: three decimal inputs and six operations. That is about 2⁻⁴⁹·⁸ relative error in the worst case, so the bound leaves a sevenfold margin. Any larger offset is genuine and is rounded as written. A true 22.000000001 still rounds up to 23, and a true 3.4999999999 still rounds half-up to 3.

The guard applies to depletion and cadence days, planning-trigger days, supply-gap days, and the buffer comparison. Unit quantities use the same bound before rounding up to 0.01, so a genuine excess as small as 7 × 10⁻¹⁰ units still rounds up. The adjusted value is used only for the decision. Published values such as the arrival day are never altered.

Offsets smaller than the bound, about 1.4 × 10⁻¹² days at a 200-day magnitude, cannot be told apart from binary noise in double precision. They arise only from inputs with roughly 13 or more significant digits.

An independent exact-arithmetic oracle (`verification/oracle.js`) checks this rule.

- On the verification grid of 42,240 inputs, v0.1 published 1,224 wrong depletion, trigger, or cadence windows, and v0.2 published 1,455 wrong outputs. v0.2.1 publishes none.
- On a separate sweep of 2,880 inputs moved 10⁻⁶ to 10⁻¹¹ days off a boundary, v0.2.1 also matches the oracle.
- Every result that changed from v0.1 or v0.2 now matches the oracle.
- The changes are limited to depletion, planning-trigger, and cadence windows, and to the interval fit, lead-time slip, and next return that follow from them. Rates, unit quantities, and thresholds are unchanged on the grid.

A week phrase is display only. Days are divided by 7 and rounded to the nearest half week. Examples: 21 days is “about 3 weeks”; 25 days is “about 3½ weeks”; a 17–27 day window is “about 2½–4 weeks”. The week phrase does not replace the day count. A trigger of `Now`, or a window that starts at `Now`, does not receive a week phrase.

## Validation law

Invalid input produces no estimate. The engine does not coerce a bad value into a plausible result.

The page also applies native constraints before an estimate is drawn: quantity, lead time, buffer, and variability are required; weekly use is required only in weekly mode; duration is required only in duration mode; the inactive usage field is disabled so it cannot remain required; variability is limited to 0–50; replenishment quantity is optional and, when supplied, cannot be negative. Those checks do not replace the engine. The engine still rejects zero quantity and zero usage, and it remains the source of validation truth.

A rendered result is cleared as soon as the visible scenario changes. The previous window is not left on screen beside new inputs.

Rejected cases include:

- current quantity missing, not a finite number, zero, or negative
- weekly use missing, not finite, zero, or negative
- duration missing, not finite, zero, or negative
- lead time missing, not finite, or negative
- safety buffer missing, not finite, or negative
- variability missing, not finite, below 0%, or above 50%
- replenishment quantity supplied but not a finite number greater than 0
- fixed delivery interval supplied but not a finite number greater than 0
- category supplied but not one of the listed codes
- item name empty after trimming
- stockout exposure with a negative or non-finite order day or lead time
- lead-time slip offsets that would make lead time negative

Zero is valid for lead time, buffer, and variability. It is not valid for quantity or usage.

## Limitations

- The estimate is only as useful as the numbers the visitor enters.
- Household behavior can change.
- Product sizes and what counts as one unit vary.
- The tool does not predict actual consumption.
- The variability allowance is user-selected. It is not statistical confidence.
- The output is a planning aid for commerce replenishment, not medical or sanitation-safety guidance.
- The engine contains no embedded consumption benchmarks, no shipment optimization, and no product recommendation.
- Stockout exposure and fixed-interval fit are arithmetic on user assumptions. They are not probabilities.

## Privacy / local execution

`calculateItem` and `calculateHousehold` are pure functions. They do not read storage, do not write storage, and do not send a request. The page must not put calculator inputs in `localStorage`, `sessionStorage`, a query string, a form submission, or a network call.

## Version

v0.2.1. The formulas for depletion, trigger, and cadence are unchanged from v0.1. v0.2.1 corrects binary-noise rounding, and its record field contract is the same as v0.2.
