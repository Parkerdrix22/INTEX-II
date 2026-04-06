# ML Pipelines

Five production ML pipelines trained nightly against live PostgreSQL data and
exported as ONNX models consumed by a C# .NET 10 Web API and React dashboard.

## Pipelines

| # | Pipeline | Business Question | Algorithm | Target | N Rows |
|---|----------|-------------------|-----------|--------|--------|
| 1 | Resident Risk | Which residents need immediate intervention? | Random Forest Classifier | high_risk_flag (binary) | ~60 |
| 2 | Donor Churn | Which donors are at risk of lapsing? | Logistic Regression / RF | churned (binary) | ~60 |
| 3 | Social Media | What content drives the most engagement? | Gradient Boosting Regressor | engagement_rate | ~812 |
| 4 | Safehouse Ops | How many incidents next month? | Random Forest Regressor | incident_count | ~432 |
| 5 | Impact Attribution | How does funding improve health outcomes? | Linear Regression | avg_health_score | ~253 |

## Architecture

```
  AWS RDS PostgreSQL (schema: lighthouse)
           │
           │  SQLAlchemy / psycopg2
           ▼
  Python Training Scripts (ml-pipelines/scripts/)
  train_all.py auto-discovers train_pipeline_*.py
           │
           │  skl2onnx export
           ▼
  ONNX Model Files (ml-pipelines/models/)
  *.onnx  +  *_schema.json
           │
           │  committed to Git → triggers deployment
           ▼
  C# .NET 10 Web API (Microsoft.ML.OnnxRuntime)
           │
           │  REST / JSON
           ▼
  React / Vite / TypeScript Dashboard
```

- `notebooks/` — Exploration and rubric documentation (not run in CI)
- `scripts/` — Production training system (run by GitHub Actions nightly)

## Getting Started

### Prerequisites

- Python 3.11+
- Network access to AWS RDS instance

### Setup

```bash
pip install -r is455/requirements.txt
```

Configure `.env` in `is455/`:

```dotenv
PGHOST=<rds-endpoint>
PGDATABASE=lighthouse
PGUSER=<username>
PGPASSWORD=<password>
PGPORT=5432
PGSSLMODE=require
```

### Run all pipelines

```bash
python is455/ml-pipelines/scripts/train_all.py
```

### Run one pipeline

```bash
python is455/ml-pipelines/scripts/train_all.py --pipeline pipeline_03
```

## Nightly Retraining

GitHub Actions workflow (`.github/workflows/ml_retrain.yml`) runs at 2:00 AM UTC.

### Required GitHub Secrets

| Secret | Description |
|--------|-------------|
| `PGHOST` | RDS endpoint hostname |
| `PGDATABASE` | Database name |
| `PGUSER` | Database username |
| `PGPASSWORD` | Database password |
| `PGPORT` | Port (typically `5432`) |

### Manual trigger

Actions → Nightly ML Retrain → Run workflow

### Safety gate

Each pipeline verifies ONNX round-trip correctness before overwriting model files.
Failed verification keeps the previous model intact.

## C# Integration

Each model ships with a `_schema.json` documenting feature order and output tensor names.

```csharp
using Microsoft.ML.OnnxRuntime;
using Microsoft.ML.OnnxRuntime.Tensors;

var session = new InferenceSession("models/pipeline_01_resident_risk_rf.onnx");

float[] features = { /* values in schema.json order */ };
var tensor = new DenseTensor<float>(features, new[] { 1, features.Length });
var inputs = new List<NamedOnnxValue>
{
    NamedOnnxValue.CreateFromTensor("float_input", tensor)
};

using var results = session.Run(inputs);
```

**Feature order is contract** — C# must send features in exactly the sequence from `_schema.json`. All values must be `float32`.

## Adding a New Pipeline

1. Create `scripts/train_pipeline_NN_name.py` implementing `train(engine, models_dir) -> dict`
2. `train_all.py` auto-discovers it — no changes needed
3. Add a notebook to `notebooks/` for documentation
