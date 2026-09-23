# Household Hygiene Replenishment Calculator Methodology

Version: v0.1

## Scope

The calculator estimates a replenishment planning window from user-supplied household assumptions. It is a transparent, deterministic scenario tool.

v0.1 does not know how a household uses a product. No empirical household-consumption benchmarks are embedded in v0.1. That is deliberate. The estimate stays inspectable until a later sprint introduces governed evidence.

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
- item name empty after trimming

Zero is valid for lead time, buffer, and variability. It is not valid for quantity or usage.

## Limitations

- The estimate is only as useful as the numbers the visitor enters.
- Household behavior can change.
- Product sizes and what counts as one unit vary.
- The tool does not predict actual consumption.
- The variability allowance is user-selected. It is not statistical confidence.
- The output is a planning aid for commerce replenishment, not medical or sanitation-safety guidance.
- v0.1 contains no embedded consumption benchmarks, no shipment optimization, and no product recommendation.

## Privacy / local execution

`calculateItem` and `calculateHousehold` are pure functions. They do not read storage, do not write storage, and do not send a request. The page must not put calculator inputs in `localStorage`, `sessionStorage`, a query string, a form submission, or a network call.

## Version

v0.1
