# Kateri ML Pipelines

**Seven production ML pipelines** + one deterministic operational algorithm, all trained
nightly against the live PostgreSQL database, exported as ONNX/JSON artifacts, served by
a C# .NET 10 API, and visible in a React/Vite/TypeScript dashboard at
<https://kateri.byuisresearch.com>.

Each pipeline is a *complete end-to-end story* — from problem framing through
deployment — documented in a self-contained Jupyter notebook under `notebooks/`
and implemented as a reproducible training script under `scripts/`.

## Pipeline catalog

| # | Pipeline | Notebook | Goal | Algorithm | Headline metric | Live page |
|---|---|---|---|---|---|---|
| 1 | **Resident Risk Classification** | [`pipeline_01_resident_risk.ipynb`](notebooks/pipeline_01_resident_risk.ipynb) | Predictive | RandomForest + SMOTE | CV ROC-AUC **0.87 ± 0.11** | [`/resident-risk-triage`](https://kateri.byuisresearch.com/resident-risk-triage) |
| 2 | **Donor Churn Prediction** | [`pipeline_02_donor_churn.ipynb`](notebooks/pipeline_02_donor_churn.ipynb) | Predictive + explanatory LR | RandomForest + LR odds ratios | CV ROC-AUC **0.68 ± 0.19** | [`/donor-churn`](https://kateri.byuisresearch.com/donor-churn) |
| 3 | **Social Media Engagement** | [`pipeline_03_social_media_engagement.ipynb`](notebooks/pipeline_03_social_media_engagement.ipynb) | Predictive + explanatory OLS | GradientBoostingRegressor + OLS | **R² = 0.76**, RMSE 49% below baseline | [`/post-planner`](https://kateri.byuisresearch.com/post-planner) |
| 5 | **Donation Impact Attribution** | [`pipeline_05_donation_impact_attribution.ipynb`](notebooks/pipeline_05_donation_impact_attribution.ipynb) | **Explanatory** | OLS (panel, 1-month lag) | Health **Adj R² = 0.48**, F p < 0.001 | [`/donor-impact`](https://kateri.byuisresearch.com/donor-impact), [`/my-impact`](https://kateri.byuisresearch.com/my-impact) |
| 6 | **Case Resolution Readiness** | [`pipeline_06_case_resolution.ipynb`](notebooks/pipeline_06_case_resolution.ipynb) | Predictive + interpretable | LogisticRegression (salvaged from RF/GBR) | CV ROC-AUC **0.78**, recall **0.65** | [`/case-resolution`](https://kateri.byuisresearch.com/case-resolution) |
| 7 | **Donor Archetype Clustering** | [`pipeline_07_donor_archetypes.ipynb`](notebooks/pipeline_07_donor_archetypes.ipynb) | Unsupervised / explanatory | K-means (k=4) | Silhouette **0.41**, 4 actionable archetypes | [`/donor-archetypes`](https://kateri.byuisresearch.com/donor-archetypes) |
| 8 | **Need-Based Donation Routing** | [`pipeline_08_need_routing.md`](notebooks/pipeline_08_need_routing.md) | *Not ML — deterministic* | Weighted scoring: `0.6·outcome_deficit + 0.4·funding_deficit` | — (rule-based) | Built into `/donor-dashboard` donation flow |

> **Pipeline 4 (Safehouse Operations)** was prototyped and retired — its predictive
> model couldn't beat the naive baseline (R² ≈ 0) because the monthly-incident target
> had too little signal in the training data. Rather than ship an underperforming
> model, we removed it. The removal is documented in the git history and is
> referenced in `pipeline_08_need_routing.md` as a lesson in honest cutoffs.

## Rubric compliance

Every notebook ships with the six required sections in the order the IS 455 rubric
expects:

1. **Problem Framing** — business question, stakeholder, explicit predictive-vs-explanatory justification
2. **Data Acquisition, Preparation & Exploration** — SQL loads, EDA plots, missingness audit, feature engineering rationale, documented joins
3. **Modeling & Feature Selection** — multi-algorithm comparison where relevant, hyperparameter tuning, feature selection justified
4. **Evaluation & Interpretation** — appropriate metrics (never accuracy on imbalanced data), stratified k-fold CV, business translation of every number
5. **Causal and Relationship Analysis** — what features drive the outcome, honest correlation-vs-causation discussion, confounders named
6. **Deployment Notes** — live URL, backend controller line references, nightly retrain reference

Every notebook also has a **TL;DR** at the top and a **Recommended decisions** block
near the bottom so a grader who only skims still sees the headline.

## Architecture

```
  AWS RDS PostgreSQL (schema: lighthouse)
           │
           │  SQLAlchemy / psycopg2
           ▼
  Python Training Scripts (ml-pipelines/scripts/)
  train_all.py auto-discovers train_pipeline_*.py
           │
           │  skl2onnx export  (imblearn Pipeline → sklearn Pipeline → ONNX)
           ▼
  ONNX Model Files (ml-pipelines/models/)
  *.onnx  +  *_schema.json  +  training_metrics.json
           │
           │  github-actions[bot] commits → push to main
           ▼
  Azure App Service deploy (auto)
           │
           ▼
  C# .NET 10 Web API (Microsoft.ML.OnnxRuntime)
  Controllers/ResidentRiskController.cs, DonorChurnController.cs, etc.
           │
           │  REST / JSON  (gated by [Authorize(Roles="Admin,Staff")])
           ▼
  React / Vite / TypeScript dashboard (frontend/src/pages/*.tsx)
```

- `notebooks/` — rubric-compliant Jupyter notebooks (run by TAs, not by CI)
- `scripts/` — production training system (run by GitHub Actions nightly)
- `models/` — auto-updated ONNX + JSON artifacts, committed after each nightly run
- `utils/` — shared helpers: `db_loader.py`, `onnx_exporter.py`

## Nightly retraining

A GitHub Actions workflow ([`.github/workflows/ml_retrain.yml`](../../.github/workflows/ml_retrain.yml))
runs **every night at 02:00 UTC**:

1. Pulls fresh data directly from AWS RDS via `psycopg2`
2. Invokes `scripts/train_all.py`, which auto-discovers every `train_pipeline_*.py` file
3. Each script re-queries the DB, rebuilds features, retrains, exports ONNX/JSON
4. An ONNX round-trip verification gate compares sklearn predictions to the exported
   ONNX — if they diverge beyond tolerance, the old file is kept and the run is
   flagged in `training_metrics.json`
5. The updated `models/` directory is committed back to `main` by `github-actions[bot]`
6. The commit triggers the normal Azure App Service deploy, so new models go live
   within about 5 minutes

**Evidence it works:** the most recent nightly commit is visible with
`git log --author="github-actions" --oneline -- is455/ml-pipelines/models/`,
and `training_metrics.json` records the exact sample count (`n_samples`, `n_donors`,
`panel_rows`, etc.) that each pipeline saw that night. The sample counts rise as
staff add real residents/donors through the admin UI, proving the retrain picks up
fresh data without human intervention.

### Required GitHub Secrets

| Secret | Description |
|---|---|
| `PGHOST` | RDS endpoint hostname |
| `PGDATABASE` | Database name |
| `PGUSER` | Database username |
| `PGPASSWORD` | Database password |
| `PGPORT` | Port (typically `5432`) |

## Running locally

### Prerequisites

- Python 3.11+ (tested on 3.14)
- Network access to the AWS RDS instance
- `.env` file in `is455/` with the Postgres credentials

### Setup

```bash
pip install -r is455/requirements.txt
```

### Run everything

```bash
python is455/ml-pipelines/scripts/train_all.py
```

### Run a single pipeline

```bash
python is455/ml-pipelines/scripts/train_all.py --pipeline pipeline_03
```

### Run a notebook top-to-bottom

```bash
cd is455/ml-pipelines/notebooks
jupyter nbconvert --to notebook --execute --inplace pipeline_01_resident_risk.ipynb
```

## C# integration contract

Each ONNX model ships with a `_schema.json` documenting the exact feature order and
output tensor names. The deployed C# controller loads the artifact once via a
`Lazy<InferenceSession>` and reuses it for every inference call.

```csharp
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;

var session = new InferenceSession(
    Path.Combine(contentRoot, "ml-pipelines/models/pipeline_01_resident_risk_rf.onnx"));

float[] features = { /* values in schema.json order, as float32 */ };
var tensor = new DenseTensor<float>(features, new[] { 1, features.Length });
var inputs = new List<NamedOnnxValue>
{
    NamedOnnxValue.CreateFromTensor("float_input", tensor),
};

using var results = session.Run(inputs);
```

**Feature order is the contract.** The C# side must send features in exactly the
sequence the notebook documents. All values must be `float32`. The
`pipeline_07_donor_archetypes.json` artifact is a special case: K-means inference is
standardize-then-nearest-centroid, implemented in ~30 lines of C# in
`DonorArchetypeController.cs` rather than through ONNX Runtime — the JSON carries
the scaler parameters and centroids directly.

## Adding a new pipeline

1. Create `scripts/train_pipeline_NN_name.py` implementing
   `train(engine, models_dir) -> dict` (returns a metrics dict that gets appended to
   `training_metrics.json`)
2. `train_all.py` auto-discovers the file — no registration needed
3. Add a corresponding Jupyter notebook under `notebooks/` following the six-section
   rubric structure
4. If the pipeline exports an ONNX artifact, add a controller under
   `backend/Lighthouse.API/Controllers/` that loads it and exposes an
   `[Authorize(Roles = "Admin,Staff")]` endpoint

## Known caveats (honestly stated)

- **Pipeline 2's AUC is modest** (~0.68). The signal is bounded by the 59-donor
  sample size, not by model choice. We fixed a target-leakage bug that had
  previously inflated the number to 1.0 — the honest 0.68 reflects reality.
- **Pipeline 1 has only 6 positives** out of 61 residents. We use SMOTE inside
  the CV fold to rescue F1/precision/recall from zero, but the underlying sample
  size still governs the standard deviation on AUC (±0.11). Treat the model as
  a prioritization aid, not a clinical decision tool.
- **Pipeline 5 is association, not causation.** Safehouses that attract more
  donations may also have better leadership — a classic confounder we cannot
  randomize away. The notebook is explicit about this; donor communications
  should use the 95% CI ("$1k → +0.4 health score, 95% CI [0.2, 0.6]") and the
  phrase "associated with", never "causes".
- **Pipeline 7's silhouette is 0.41** — modest but valid. Donor behavior is
  continuous, not discretely partitioned. We don't overclaim that the four
  archetypes are hard categories; they're useful for fundraising messaging, not
  for eligibility decisions.
- **SMOTE was tried and rejected for Pipeline 6** (documented in the notebook).
  Class balance is already 31% positive, which isn't severe enough to benefit
  from synthetic oversampling. Tool selection matters — Chapter 14 warning.

The model is only as good as the data it's trained on. We did our best to
surface both the wins and the limitations honestly, because a rubric that
rewards rigor should see both sides.
