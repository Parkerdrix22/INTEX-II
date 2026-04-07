# Pipeline 8: Need-Based Donation Routing

## Business question

When a donor gives money for a specific program area (e.g., "Education"),
which safehouse(s) should actually receive the funds? The naive answer
("split it evenly across all safehouses") wastes money on safehouses that
already have what they need. The right answer is to route dollars where
they will produce the most marginal impact — to the safehouses with the
**greatest current need** in the donor's chosen area.

## Why this matters for the client

Lighthouse Sanctuary (and the Kateri-inspired org we're modeling) operates
9 safehouses with very different conditions: some are well-funded and
running smoothly, others are stressed (high incident counts, low average
health scores, recent funding gaps). Donors don't know this — they just
want their gift to do the most good. Pipeline 8 makes that decision for
them, transparently and based on real data, every time a donation is
submitted.

## Why this isn't a "trained ML model"

Unlike Pipelines 1, 2, 3, 5, 6, 7 (which fit sklearn models on historical
data), Pipeline 8 is a **deterministic scoring/ranking algorithm** that
runs at request time. There is no `.onnx` file. The reason: a routing
decision that affects real money should be **transparent, auditable, and
reproducible** — properties that supervised learning models don't always
provide. The score is computed from clear, named signals; a donor can ask
"why did my gift go to Safehouse 7?" and the answer is a one-line
explanation, not a SHAP plot.

That said, the algorithm uses the same `safehouse_monthly_metrics` table
that feeds Pipelines 1, 4, and 6, so it's part of the same data lineage.

## Algorithm

### Inputs
- `total_amount` (decimal): the donation amount
- `program_area` (string): one of `Education`, `Wellbeing`, `Operations`,
  `Outreach`, `Transport`, `Maintenance` (the 6 distinct values present in
  `lighthouse.donation_allocations.program_area`)

### Step 1: Outcome deficit per safehouse

Some program areas have a direct outcome metric in
`lighthouse.safehouse_monthly_metrics`:

| Program area | Outcome metric             | Direction          |
|--------------|----------------------------|--------------------|
| Wellbeing    | `avg_health_score`         | lower → more need  |
| Education    | `avg_education_progress`   | lower → more need  |
| Operations   | `incident_count`           | higher → more need |
| Outreach     | (none)                     | (skip outcome term)|
| Transport    | (none)                     | (skip outcome term)|
| Maintenance  | (none)                     | (skip outcome term)|

For each safehouse, we take the **most recent non-null value** of the
relevant column from `safehouse_monthly_metrics`. Safehouses with no
outcome data substitute the **median** across all safehouses (treated as
average need — they get a fair shot at being chosen).

The outcome deficit for safehouse `s` and area `a`:

```
if direction == "lower-is-need":
    outcome_deficit(s, a) = clip( (median - value_s) / max(median, 0.01), 0, 1 )
if direction == "higher-is-need":
    outcome_deficit(s, a) = clip( (value_s - median) / max(median, 1.0), 0, 1 )
```

For program areas with no outcome metric, `outcome_deficit = 0` and the
funding deficit (below) gets full weight.

### Step 2: Funding deficit per safehouse

For each safehouse, sum the donations they have received in the chosen
program area in the **last 90 days**:

```sql
SELECT SUM(amount_allocated)
FROM lighthouse.donation_allocations
WHERE safehouse_id = s
  AND program_area = a
  AND allocation_date >= CURRENT_DATE - INTERVAL '90 days';
```

Then:

```
max_recent = max(recent_funding for all safehouses)
if max_recent <= 0:
    funding_deficit(s, a) = 1.0   # nobody got funded recently
else:
    funding_deficit(s, a) = 1 - (recent_funding_s / max_recent)
```

This means: a safehouse that received the **most** recent funding for the
chosen area has `funding_deficit = 0`. A safehouse that received **no**
funding has `funding_deficit = 1`.

### Step 3: Combined need score

```
if program area has an outcome signal:
    need_score(s) = 0.6 * outcome_deficit(s) + 0.4 * funding_deficit(s)
else:
    need_score(s) = funding_deficit(s)   # 100% weight on funding
```

The 0.6 / 0.4 weighting reflects a deliberate bias toward outcome data
when it's available — measured suffering (low health scores, high incident
rates) should outweigh "you got less money recently" because the latter
can be a bookkeeping artifact while the former is real.

### Step 4: Allocation

1. Reserve **10% for the General Operating Fund** and **5% for the Rainy
   Day Fund**. These are recorded as `donation_allocations` rows with
   `safehouse_id = NULL` and the special `program_area` values
   `"General Fund"` and `"Rainy Day Reserve"`.
2. The remaining **85%** is split across the **top 2 safehouses by
   need_score**, proportional to their scores:

```
total_score = score(top1) + score(top2)
top1_share  = score(top1) / total_score        (if total_score > 0)
top1_amount = remaining * top1_share
top2_amount = remaining - top1_amount          (exact, no rounding loss)
```

When both top scores are 0 (e.g., a brand new database with no metrics),
the remainder splits evenly (50/50).

### Step 5: Persistence

After computing the plan, the controller inserts **4 rows** in
`lighthouse.donation_allocations`:
- 1 row for safehouse #1 (with `allocation_notes = "Auto-routed by need
  score = X.YYYY"`)
- 1 row for safehouse #2 (same)
- 1 row for the General Fund (`safehouse_id = NULL`, notes = "10% reserve for general operating expenses")
- 1 row for the Rainy Day Reserve (`safehouse_id = NULL`, notes = "5% reserve for emergencies")

This means the donor's impact report on `/donor-impact` will show their
total contribution distributed across the program area chart and the
funded safehouses bar chart automatically — no special-casing needed.

## Where the code lives

- **Service**: `backend/Lighthouse.API/Services/NeedBasedAllocationService.cs`
- **Interface + DTOs**: `backend/Lighthouse.API/Services/INeedBasedAllocationService.cs`
- **Donor-facing donation handler**: `backend/Lighthouse.API/Controllers/DonationsController.cs`
- **Admin staff donation handler**: `backend/Lighthouse.API/Controllers/DonorsContributionsController.cs`
- **DI registration**: `Program.cs` (line ~117)

## Frontend integration

- **`/donor-dashboard`**: the donate form has a "Where should your gift
  go?" dropdown of the 6 program areas, a transparency note explaining
  the 10/5/85 split, and a success card after submission showing the
  actual safehouses that received the gift with the dollar amounts.
- **`/donors-contributions`** (staff/admin): same dropdown plus a "Manual
  override" toggle that lets staff specify safehouses and amounts
  explicitly when needed (e.g., for restricted gifts the donor specified
  out-of-band).

## Why donor B doesn't see donor A's auto-allocation

The need score is computed from **global** safehouse state and global
recent funding flow — not from per-donor data. Donor A's gift might have
just bumped Safehouse 7's recent funding by $100, which slightly lowers
its need score for the next 90 days. So donor B's gift in the same area,
submitted seconds later, might be routed to Safehouse 1 instead. **The
routing reflects the moving need state of the org, not which donor is
asking.** This is the right behavior for a system that's supposed to
direct money where it's most needed.

## What this contributes to the writeup

This pipeline is the *closing argument* for the project. The earlier
pipelines all answered "what does the data show?" — risk patterns, donor
churn, social media engagement, etc. Pipeline 8 takes those insights and
**uses them to make a real decision** that affects where money flows.
It's the bridge between analytics and operations, and it makes the entire
project's claim — "data-driven decisions improve outcomes for residents"
— concrete and demonstrable. Every donor who uses the form *experiences*
the pipeline's output.

## Possible future work

1. **Promote to a nightly snapshot pipeline** — pre-compute and cache the
   need score per (safehouse × program area) in a JSON artifact under
   `is455/ml-pipelines/models/`, refresh nightly via the existing GitHub
   Actions cron, and have the C# service read from cache instead of
   computing on-demand. This would make the algorithm faster + match the
   "pipeline pattern" of the other 7 pipelines more closely.
2. **Multi-objective optimization** — instead of a hand-tuned 60/40
   weighting between outcome and funding deficits, learn the weights from
   historical donor satisfaction data (if you ever collect it) or from
   measured downstream outcome improvement after each donation.
3. **Forecast-aware routing** — combine with Pipeline 4 (Safehouse
   Performance) once it produces a positive R². Route donations to
   safehouses *predicted* to deteriorate next month, not just ones
   currently struggling.
4. **Donor preference history** — if a donor consistently picks
   "Education", soft-bias their future gifts toward education-related
   safehouses they've already supported, for continuity ("you've been
   funding Safehouse 5's reading program — here's an update on it").
