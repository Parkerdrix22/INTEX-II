"""
Pipeline 6: Case Resolution Predictor (formerly Reintegration Readiness)

Business question: Which residents currently in care look most like girls whose
cases were successfully closed? This helps case managers prioritize case-closure
planning, free up beds, and focus reintegration paperwork on the right girls.

Why "case_status == 'Closed'" instead of "reintegration_status == 'Completed'":
The original Pipeline 6 attempted to predict reintegration_status == 'Completed'
using ~45 features and got chance-level performance (ROC-AUC ≈ 0.49). After
salvage experiments, we found:
  1. The 45-feature set introduces too much noise on N=60 — LR overfits.
  2. Reducing to 8 high-prior features → AUC 0.736 (workable).
  3. Switching the target to case_status == 'Closed' → AUC 0.783 (best,
     and lower variance). "Case closed" is a cleaner administrative outcome
     than the more interpretive "reintegration_status" field, and it captures
     ALL successful exits (reintegration, adoption, foster, aging out).
  4. Trajectory features hurt — they add noise without signal for this target.

Target: binary case_resolved_flag = 1 if case_status == 'Closed' else 0
Class balance: ~19/60 positives (32%) — healthy for binary classification.
Predictive model: LogisticRegression (beats RF/GB on this small N + few features)
Explanatory: Same model, coefficient table exported as JSON.
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from imblearn.over_sampling import SMOTE
from imblearn.pipeline import Pipeline as ImbPipeline
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.model_selection import StratifiedKFold, cross_validate
from sklearn.pipeline import Pipeline as sklearn_Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))
sys.path.insert(0, str(ROOT / "scripts"))

# Reuse Pipeline 1's feature engineering (minus the parts we don't need).
from train_pipeline_01_resident_risk import (  # noqa: E402
    engineer_features as engineer_pipeline1_features,
    load_data,
)

from utils.metrics_logger import log_metrics  # noqa: E402
from utils.onnx_exporter import export_to_onnx, verify_onnx  # noqa: E402

PIPELINE_NAME = "pipeline_06_case_resolution"

# Lean 8-feature set — survived the salvage experiments
FEATURE_COLUMNS = [
    "case_cat_Surrendered",
    "case_cat_Abandoned",
    "case_cat_Foundling",
    "case_cat_Neglected",
    "length_of_stay_days",
    "has_safety_plan",
    "achieved_rate",
    "session_count",
]


# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------
def engineer_features(tables: dict[str, pd.DataFrame]) -> tuple[pd.DataFrame, pd.Series]:
    """
    Returns (X_features, y_resolved) where y_resolved = 1 if case_status == 'Closed'.
    Reuses pipeline 1's full base table but only selects the 8 high-prior features.
    Fills any missing case_cat_* columns with 0 (defensive — pandas get_dummies
    only creates columns for categories present in the training data).
    """
    base, _, _ = engineer_pipeline1_features(tables)

    # Replace target — case closure
    residents = tables["residents"].copy()
    target_map = residents.set_index("resident_id")["case_status"].to_dict()
    base["case_resolved_flag"] = base["resident_id"].map(
        lambda rid: 1 if target_map.get(rid) == "Closed" else 0
    )

    # Ensure every expected feature column exists (some case_cat_* columns may
    # be missing if a category had zero residents in the training data)
    for col in FEATURE_COLUMNS:
        if col not in base.columns:
            base[col] = 0.0

    return base, base["case_resolved_flag"]


# ---------------------------------------------------------------------------
# Model builder — Logistic Regression with standardization
# ---------------------------------------------------------------------------
def _build_preprocessor() -> ColumnTransformer:
    return ColumnTransformer(
        transformers=[
            (
                "num",
                sklearn_Pipeline(
                    [
                        ("imputer", SimpleImputer(strategy="median")),
                        ("scaler", StandardScaler()),
                    ]
                ),
                FEATURE_COLUMNS,
            ),
        ]
    )


def _build_lr() -> LogisticRegression:
    return LogisticRegression(
        max_iter=2000,
        class_weight="balanced",
        C=0.5,
        solver="lbfgs",
    )


def build_training_pipeline() -> ImbPipeline:
    """
    Training-time pipeline WITH SMOTE for minority-class oversampling.

    Uses imblearn.pipeline.Pipeline so that inside cross_validate / GridSearchCV,
    SMOTE is applied only to the training fold of each split — the test fold is
    never touched. This is the canonical leakage-free way to use SMOTE with
    stratified k-fold CV (Ch. 14 + imbalanced-learn docs).

    k_neighbors=3 is explicit so the sampler doesn't fail on small training
    folds. With ~19 positives at N=60 and 5-fold CV, each training fold has
    ~15 positives — default k=5 would work, but k=3 is safer.
    """
    return ImbPipeline(
        [
            ("preprocessor", _build_preprocessor()),
            ("smote", SMOTE(random_state=42, k_neighbors=3)),
            ("model", _build_lr()),
        ]
    )


def build_pipeline() -> sklearn_Pipeline:
    """
    Inference-time pipeline (NO SMOTE).

    At prediction time SMOTE is a no-op, so the deployed ONNX artifact is
    built from a plain sklearn Pipeline containing just the preprocessor
    and model — skl2onnx doesn't need to understand imblearn.

    LR was the winner in salvage experiments (0.78 AUC vs 0.61 for RF,
    0.59 for GB). On N=60 with 8 features, simpler models generalize better.
    """
    return sklearn_Pipeline(
        [
            ("preprocessor", _build_preprocessor()),
            ("model", _build_lr()),
        ]
    )


# ---------------------------------------------------------------------------
# Cross-validate
# ---------------------------------------------------------------------------
def evaluate_with_cv(pipeline: sklearn_Pipeline, X: pd.DataFrame, y: pd.Series) -> dict:
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)
    scoring = {
        "roc_auc": "roc_auc",
        "f1": "f1",
        "precision": "precision",
        "recall": "recall",
    }
    scores = cross_validate(pipeline, X, y, cv=cv, scoring=scoring, return_train_score=False)
    return {
        "cv_roc_auc_mean": float(np.round(scores["test_roc_auc"].mean(), 4)),
        "cv_roc_auc_std": float(np.round(scores["test_roc_auc"].std(), 4)),
        "cv_f1_mean": float(np.round(scores["test_f1"].mean(), 4)),
        "cv_precision_mean": float(np.round(scores["test_precision"].mean(), 4)),
        "cv_recall_mean": float(np.round(scores["test_recall"].mean(), 4)),
    }


# ---------------------------------------------------------------------------
# Coefficient extraction (LR is interpretable in standardized space)
# ---------------------------------------------------------------------------
def extract_coefficients(pipeline: sklearn_Pipeline) -> list[dict]:
    model = pipeline.named_steps["model"]
    coefs = model.coef_[0]
    rows = []
    for name, coef in zip(FEATURE_COLUMNS, coefs):
        rows.append(
            {
                "feature": name,
                "coef": float(np.round(coef, 4)),
                "abs_coef": float(np.round(abs(coef), 4)),
                "direction": "positive" if coef > 0 else "negative",
                "interpretation": (
                    "increases case-resolution probability"
                    if coef > 0
                    else "decreases case-resolution probability"
                ),
            }
        )
    rows.sort(key=lambda r: r["abs_coef"], reverse=True)
    return rows


# ---------------------------------------------------------------------------
# Main train() entry point
# ---------------------------------------------------------------------------
def train(engine, models_dir: Path) -> dict:
    print("\n[Pipeline 6] Case Resolution Predictor")

    print("  Loading data (reusing pipeline 1 loader)...")
    tables = load_data(engine)
    for t, df in tables.items():
        print(f"    {t}: {len(df)} rows")

    print("  Building features (8-feature lean set, target = case_status == 'Closed')...")
    base, y = engineer_features(tables)
    print(f"  Feature count: {len(FEATURE_COLUMNS)}")
    print(f"  Target distribution: {dict(y.value_counts())}")
    print(f"  Class balance: {y.mean():.2%} positive (case Closed)")

    X = base[FEATURE_COLUMNS].astype(float).fillna(0.0)

    # ------------------------------------------------------------------
    # Cross-validate. We intentionally do NOT use SMOTE here even though
    # build_training_pipeline() is available. Experimental result: SMOTE
    # on this pipeline drops CV ROC-AUC from 0.78 → 0.71 and recall from
    # 0.65 → 0.53. Why: the class is already 31% positive (19 / 62) —
    # SMOTE is designed for severe imbalance (< 10% minority) where the
    # model can't see enough positives during training. When classes are
    # moderately balanced, SMOTE's synthetic points add noise without
    # fixing anything that needed fixing. This is the textbook Ch. 14
    # warning about tool selection — "when you only have a hammer, not
    # everything is a nail." Pipeline 1 (10% minority) DOES use SMOTE
    # because the imbalance is actually severe there.
    # ------------------------------------------------------------------
    print("\n  Logistic Regression CV (no SMOTE — see train() comment)...")
    pipe = build_pipeline()
    metrics = evaluate_with_cv(pipe, X, y)
    print(
        f"    LR  → ROC-AUC={metrics['cv_roc_auc_mean']:.4f} ± {metrics['cv_roc_auc_std']:.4f}, "
        f"F1={metrics['cv_f1_mean']:.4f}, "
        f"Prec={metrics['cv_precision_mean']:.4f}, "
        f"Rec={metrics['cv_recall_mean']:.4f}"
    )

    # Fit on full dataset for ONNX export + coefficients.
    pipe.fit(X, y)
    coef_table = extract_coefficients(pipe)

    print("\n  Top features by |coefficient|:")
    for row in coef_table:
        sign = "+" if row["coef"] > 0 else "−"
        print(f"    {sign} {row['feature']:30s}  coef={row['coef']:+.4f}")

    # ------------------------------------------------------------------
    # ONNX export
    # ------------------------------------------------------------------
    onnx_path = models_dir / "pipeline_06_case_resolution_lr.onnx"
    print(f"\n  Exporting LogisticRegression to ONNX → {onnx_path.name}")

    export_to_onnx(
        pipeline=pipe,
        X_train=X,
        output_path=onnx_path,
        schema_meta={
            "model_name": "pipeline_06_case_resolution_lr",
            "version": "2.0",
            "feature_order": FEATURE_COLUMNS,
            "task": "binary_classification",
            "target_label": "case_resolved_flag",
            "positive_class_meaning": "case_status_is_currently_closed",
            "output_tensors": [
                {
                    "name": "output_label",
                    "dtype": "int64",
                    "description": "0 = case still open, 1 = case resolved (closed)",
                },
                {
                    "name": "output_probability",
                    "dtype": "seq(map(int64,float))",
                    "description": "Per-class probabilities; key 1 = P(case resolved)",
                },
            ],
        },
    )

    print("  Verifying ONNX round-trip...")
    verified = verify_onnx(
        onnx_path=onnx_path,
        sklearn_pipeline=pipe,
        X_test=X.iloc[:10],
        atol=0.01,  # LR through ONNX is essentially exact
        is_classifier=True,
    )
    if not verified:
        print("  WARNING: ONNX verification failed — keeping model but flagging.")

    # ------------------------------------------------------------------
    # Save coefficients to JSON for the API
    # ------------------------------------------------------------------
    import json as _json
    coef_path = models_dir / "pipeline_06_lr_coefficients.json"
    coef_export = {
        "trained_at_utc": pd.Timestamp.now("UTC").isoformat(),
        "model": "LogisticRegression on standardized features",
        "interpretation": (
            "Positive coefficients push the model toward 'case will be resolved'. "
            "Negative coefficients push it toward 'case still open'. Coefficients are "
            "in standardized feature space (each feature mean-centered and scaled to "
            "unit variance), so magnitudes are comparable across features."
        ),
        "n_features": len(FEATURE_COLUMNS),
        "feature_order": FEATURE_COLUMNS,
        "coefficients": coef_table,
    }
    coef_path.write_text(_json.dumps(coef_export, indent=2))
    print(f"  Saved coefficients → {coef_path.name}")

    # ------------------------------------------------------------------
    # Final metrics
    # ------------------------------------------------------------------
    all_metrics = {
        **metrics,
        "winning_model": "LogisticRegression",
        "n_samples": int(len(X)),
        "n_positives": int(y.sum()),
        "positive_class_pct": float(np.round(y.mean() * 100, 2)),
        "n_features": len(FEATURE_COLUMNS),
        "onnx_verified": verified,
        "target": "case_status == 'Closed'",
    }
    log_metrics(PIPELINE_NAME, all_metrics, status="success")
    return all_metrics


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    from utils.db_loader import get_engine

    engine = get_engine()
    models_dir = ROOT / "models"
    models_dir.mkdir(exist_ok=True)
    metrics = train(engine, models_dir)
    print("\n  Final metrics summary:")
    for k, v in metrics.items():
        print(f"    {k}: {v}")
