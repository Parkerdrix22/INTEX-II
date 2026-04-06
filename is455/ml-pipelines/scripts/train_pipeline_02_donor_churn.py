"""
Pipeline 2: Donor Churn Prediction
Business question: Which donors are at risk of lapsing, and what distinguishes
engaged from churned donors so we can personalize outreach?

Target: churned (binary classification)
  churned = 1 if max(donation_date) < 2025-03-01, else 0
Models: LogisticRegression and RandomForestClassifier (best ROC-AUC wins)
N: ~60 rows x ~25 features (one row per supporter with donation history)
"""

import sys
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestClassifier
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LogisticRegression
from sklearn.metrics import (
    f1_score,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import GridSearchCV, StratifiedKFold, cross_val_score
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from utils.db_loader import get_engine, load_table
from utils.onnx_exporter import export_to_onnx, verify_onnx
from utils.metrics_logger import log_metrics

PIPELINE_NAME = "pipeline_02_donor_churn"

# Reference dates
DATASET_END = pd.Timestamp("2026-03-01")
CHURN_CUTOFF = pd.Timestamp("2025-03-01")  # 12 months before end


def load_data(engine) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    supporters = load_table(engine, "supporters")
    donations = load_table(engine, "donations")
    donation_allocations = load_table(engine, "donation_allocations")
    return supporters, donations, donation_allocations


def _build_churn_label(donations: pd.DataFrame) -> pd.DataFrame:
    """
    Compute churned label per supporter.
    churned = 1 if max(donation_date) < CHURN_CUTOFF, else 0.
    """
    donations = donations.copy()
    donations["donation_date"] = pd.to_datetime(donations["donation_date"])

    last_donation = (
        donations.groupby("supporter_id")["donation_date"]
        .max()
        .reset_index()
        .rename(columns={"donation_date": "last_donation_date"})
    )
    last_donation["churned"] = (last_donation["last_donation_date"] < CHURN_CUTOFF).astype(int)
    return last_donation


def _build_rfm_features(donations: pd.DataFrame) -> pd.DataFrame:
    """Build RFM and donation-pattern features aggregated per supporter."""
    donations = donations.copy()
    donations["donation_date"] = pd.to_datetime(donations["donation_date"])

    # Normalize is_recurring to boolean int
    donations["is_recurring_bool"] = (
        donations["is_recurring"]
        .map({True: 1, False: 0, "True": 1, "False": 0, 1: 1, 0: 0})
        .fillna(0)
        .astype(int)
    )

    rfm = donations.groupby("supporter_id").agg(
        last_donation_date=("donation_date", "max"),
        first_donation_date=("donation_date", "min"),
        frequency=("donation_id", "count"),
        monetary_total=("estimated_value", "sum"),
        monetary_avg=("estimated_value", "mean"),
        monetary_max=("estimated_value", "max"),
        has_recurring=("is_recurring_bool", "max"),
        recurring_sum=("is_recurring_bool", "sum"),
        donation_types_count=("donation_type", "nunique"),
    ).reset_index()

    rfm["recency_days"] = (DATASET_END - rfm["last_donation_date"]).dt.days
    rfm["days_since_first"] = (DATASET_END - rfm["first_donation_date"]).dt.days

    # Avoid division by zero
    rfm["donation_velocity"] = rfm["frequency"] / rfm["days_since_first"].replace(0, np.nan)
    rfm["donation_velocity"] = rfm["donation_velocity"].fillna(0)

    rfm["recurring_rate"] = rfm["recurring_sum"] / rfm["frequency"].replace(0, np.nan)
    rfm["recurring_rate"] = rfm["recurring_rate"].fillna(0)

    # has_campaign_donation: 1 if any campaign_name is not null
    campaign_flag = (
        donations[donations["campaign_name"].notna()]
        .groupby("supporter_id")["donation_id"]
        .count()
        .reset_index(name="campaign_count")
    )
    campaign_flag["has_campaign_donation"] = 1
    rfm = rfm.merge(campaign_flag[["supporter_id", "has_campaign_donation"]], on="supporter_id", how="left")
    rfm["has_campaign_donation"] = rfm["has_campaign_donation"].fillna(0).astype(int)

    # Drop intermediate columns not needed as features
    rfm = rfm.drop(columns=["last_donation_date", "first_donation_date", "recurring_sum"])

    return rfm


def _build_allocation_features(donations: pd.DataFrame, donation_allocations: pd.DataFrame) -> pd.DataFrame:
    """Build program-area funding breakdown features per supporter."""
    # Join allocations to donations to get supporter_id
    alloc = donation_allocations.merge(
        donations[["donation_id", "supporter_id"]], on="donation_id", how="left"
    )
    alloc = alloc.dropna(subset=["supporter_id"])

    alloc_agg = alloc.groupby("supporter_id").agg(
        total_allocated=("amount_allocated", "sum"),
        unique_safehouses_funded=("safehouse_id", "nunique"),
    ).reset_index()

    # Program area flags
    program = alloc.copy()
    program["program_area_lower"] = program["program_area"].fillna("").str.lower()

    education = (
        program[program["program_area_lower"].str.contains("education")]
        .groupby("supporter_id")["amount_allocated"].sum()
        .reset_index(name="alloc_education")
    )
    health = (
        program[program["program_area_lower"].str.contains("health|wellbeing")]
        .groupby("supporter_id")["amount_allocated"].sum()
        .reset_index(name="alloc_health")
    )
    counseling = (
        program[program["program_area_lower"].str.contains("counsel|case")]
        .groupby("supporter_id")["amount_allocated"].sum()
        .reset_index(name="alloc_counseling")
    )

    alloc_agg = alloc_agg.merge(education, on="supporter_id", how="left")
    alloc_agg = alloc_agg.merge(health, on="supporter_id", how="left")
    alloc_agg = alloc_agg.merge(counseling, on="supporter_id", how="left")

    for col in ["alloc_education", "alloc_health", "alloc_counseling"]:
        alloc_agg[col] = alloc_agg[col].fillna(0)

    # Convert to proportions (avoid div by zero)
    total = alloc_agg["total_allocated"].replace(0, np.nan)
    alloc_agg["pct_education"] = alloc_agg["alloc_education"] / total
    alloc_agg["pct_health"] = alloc_agg["alloc_health"] / total
    alloc_agg["pct_counseling"] = alloc_agg["alloc_counseling"] / total

    alloc_agg = alloc_agg.drop(columns=["alloc_education", "alloc_health", "alloc_counseling", "total_allocated"])
    alloc_agg[["pct_education", "pct_health", "pct_counseling"]] = (
        alloc_agg[["pct_education", "pct_health", "pct_counseling"]].fillna(0)
    )

    return alloc_agg


def engineer_features(
    supporters: pd.DataFrame,
    donations: pd.DataFrame,
    donation_allocations: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.Series, list[str], list[str]]:
    """Build the full feature matrix and target vector."""

    # --- Churn label ---
    label_df = _build_churn_label(donations)

    # --- RFM features ---
    rfm_df = _build_rfm_features(donations)

    # --- Allocation features ---
    alloc_df = _build_allocation_features(donations, donation_allocations)

    # --- Static supporter features ---
    supporters = supporters.copy()
    supporters["created_at"] = pd.to_datetime(supporters["created_at"])
    supporters["tenure_days"] = (DATASET_END - supporters["created_at"]).dt.days

    # Drop data-leaky and PII columns
    leaky_cols = [
        "status", "email", "phone", "display_name",
        "first_name", "last_name", "organization_name",
        "first_donation_date",  # redundant with rfm days_since_first
        "created_at",
    ]
    static_cols = [
        "supporter_id", "tenure_days",
        "supporter_type", "acquisition_channel", "relationship_type", "region", "country",
    ]
    static_df = supporters[[c for c in static_cols if c in supporters.columns]].copy()

    # Drop country if too many categories (>20 unique non-null values)
    if "country" in static_df.columns:
        n_countries = static_df["country"].nunique()
        if n_countries > 20:
            static_df = static_df.drop(columns=["country"])
            print(f"  Dropped 'country' column ({n_countries} unique values)")

    # --- Merge everything ---
    df = (
        label_df[["supporter_id", "churned"]]
        .merge(rfm_df, on="supporter_id", how="left")
        .merge(alloc_df, on="supporter_id", how="left")
        .merge(static_df, on="supporter_id", how="left")
    )

    # Fill all numeric NaN with 0
    numeric_cols = df.select_dtypes(include=[np.number]).columns.tolist()
    df[numeric_cols] = df[numeric_cols].fillna(0)

    # Identify feature columns
    exclude_cols = {"supporter_id", "churned"}
    cat_cols = [
        c for c in ["supporter_type", "acquisition_channel", "relationship_type", "region", "country"]
        if c in df.columns
    ]

    # OHE categoricals in pandas (ONNX-safe: no string columns in pipeline)
    dummies = pd.get_dummies(df[cat_cols], columns=cat_cols, dtype=float)
    df = pd.concat([df.drop(columns=cat_cols).reset_index(drop=True), dummies.reset_index(drop=True)], axis=1)

    numeric_features = [
        c for c in df.columns
        if c not in exclude_cols
    ]
    categorical_features = []  # all pre-encoded

    X = df[numeric_features].copy()
    y = df["churned"].astype(int)

    print(f"  Dataset shape: {X.shape[0]} supporters × {X.shape[1]} features")
    print(f"  Churn rate: {y.mean():.1%} ({y.sum()} churned / {len(y)} total)")

    return X, y, numeric_features, categorical_features, df[["supporter_id", "churned"]]


def _build_preprocessor(numeric_features: list[str], categorical_features: list[str]) -> ColumnTransformer:
    transformers = [
        (
            "num",
            Pipeline([
                ("imputer", SimpleImputer(strategy="median")),
                ("scaler", StandardScaler()),
            ]),
            numeric_features,
        ),
    ]
    if categorical_features:
        transformers.append((
            "cat",
            Pipeline([
                ("imputer", SimpleImputer(strategy="most_frequent")),
                ("ohe", OneHotEncoder(handle_unknown="ignore", sparse_output=False)),
            ]),
            categorical_features,
        ))
    return ColumnTransformer(transformers=transformers)


def _tune_logistic_regression(
    X: pd.DataFrame, y: pd.Series,
    numeric_features: list[str], categorical_features: list[str],
    cv: StratifiedKFold,
) -> tuple[Pipeline, float, dict]:
    preprocessor = _build_preprocessor(numeric_features, categorical_features)
    pipe = Pipeline([
        ("preprocessor", preprocessor),
        ("model", LogisticRegression(class_weight="balanced", random_state=42, max_iter=1000)),
    ])
    param_grid = {
        "model__C": [0.01, 0.1, 0.5, 1.0],
        "model__solver": ["lbfgs", "liblinear"],
    }
    search = GridSearchCV(pipe, param_grid, cv=cv, scoring="roc_auc", n_jobs=-1, verbose=0)
    search.fit(X, y)
    best_params = search.best_params_
    best_auc = search.best_score_
    print(f"  LogReg best params: {best_params}, CV ROC-AUC: {best_auc:.4f}")
    return search.best_estimator_, best_auc, best_params


def _tune_random_forest(
    X: pd.DataFrame, y: pd.Series,
    numeric_features: list[str], categorical_features: list[str],
    cv: StratifiedKFold,
) -> tuple[Pipeline, float, dict]:
    preprocessor = _build_preprocessor(numeric_features, categorical_features)
    pipe = Pipeline([
        ("preprocessor", preprocessor),
        ("model", RandomForestClassifier(class_weight="balanced", random_state=42)),
    ])
    param_grid = {
        "model__max_depth": [2, 3, 4],
        "model__min_samples_leaf": [2, 3, 5],
        "model__n_estimators": [100, 200],
    }
    search = GridSearchCV(pipe, param_grid, cv=cv, scoring="roc_auc", n_jobs=-1, verbose=0)
    search.fit(X, y)
    best_params = search.best_params_
    best_auc = search.best_score_
    print(f"  RandomForest best params: {best_params}, CV ROC-AUC: {best_auc:.4f}")
    return search.best_estimator_, best_auc, best_params


def _evaluate_final(pipeline: Pipeline, X: pd.DataFrame, y: pd.Series, cv: StratifiedKFold) -> dict:
    """Full CV evaluation on all primary metrics."""
    auc_scores = cross_val_score(pipeline, X, y, cv=cv, scoring="roc_auc")
    f1_scores = cross_val_score(pipeline, X, y, cv=cv, scoring="f1")
    prec_scores = cross_val_score(pipeline, X, y, cv=cv, scoring="precision")
    rec_scores = cross_val_score(pipeline, X, y, cv=cv, scoring="recall")

    metrics = {
        "roc_auc_mean": round(auc_scores.mean(), 4),
        "roc_auc_std": round(auc_scores.std(), 4),
        "f1_mean": round(f1_scores.mean(), 4),
        "precision_mean": round(prec_scores.mean(), 4),
        "recall_mean": round(rec_scores.mean(), 4),
    }
    print(
        f"  CV ROC-AUC: {metrics['roc_auc_mean']:.4f} ± {metrics['roc_auc_std']:.4f}  "
        f"F1: {metrics['f1_mean']:.4f}  "
        f"Prec: {metrics['precision_mean']:.4f}  "
        f"Rec: {metrics['recall_mean']:.4f}"
    )
    return metrics


def _report_top_at_risk(
    pipeline: Pipeline,
    X: pd.DataFrame,
    supporter_label_df: pd.DataFrame,
    n: int = 10,
) -> None:
    """Print top-N donors with highest predicted churn probability."""
    proba = pipeline.predict_proba(X)[:, 1]
    risk_df = supporter_label_df.copy()
    risk_df["churn_probability"] = proba
    top = (
        risk_df.sort_values("churn_probability", ascending=False)
        .head(n)[["supporter_id", "churn_probability", "churned"]]
        .reset_index(drop=True)
    )
    print(f"\n  Top-{n} most at-risk donors (highest predicted churn probability):")
    print(top.to_string(index=False))


def train(engine, models_dir: Path) -> dict:
    print("\n[Pipeline 2] Donor Churn Prediction")

    print("  Loading data...")
    supporters, donations, donation_allocations = load_data(engine)
    print(
        f"  Loaded {len(supporters)} supporters, "
        f"{len(donations)} donations, "
        f"{len(donation_allocations)} allocation records."
    )

    print("  Engineering features...")
    X, y, numeric_features, categorical_features, supporter_label_df = engineer_features(
        supporters, donations, donation_allocations
    )

    # Validate label distribution against supporters.status (cross-reference only)
    if "status" in supporters.columns:
        supporters_with_status = supporters[["supporter_id", "status"]].copy()
        validation = supporter_label_df.merge(supporters_with_status, on="supporter_id", how="left")
        print("\n  Label validation cross-reference (churned vs supporters.status):")
        print(validation.groupby(["churned", "status"])["supporter_id"].count().to_string())
        print()

    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

    print("  Tuning Logistic Regression...")
    lr_pipeline, lr_auc, lr_params = _tune_logistic_regression(
        X, y, numeric_features, categorical_features, cv
    )

    print("  Tuning Random Forest...")
    rf_pipeline, rf_auc, rf_params = _tune_random_forest(
        X, y, numeric_features, categorical_features, cv
    )

    # Select winning model
    if lr_auc >= rf_auc:
        best_pipeline = lr_pipeline
        winning_model = "LogisticRegression"
        best_params = lr_params
        print(f"\n  Winner: Logistic Regression (ROC-AUC {lr_auc:.4f} >= RF {rf_auc:.4f})")
    else:
        best_pipeline = rf_pipeline
        winning_model = "RandomForest"
        best_params = rf_params
        print(f"\n  Winner: Random Forest (ROC-AUC {rf_auc:.4f} > LogReg {lr_auc:.4f})")

    # Re-fit winner on full dataset for final evaluation and export
    best_pipeline.fit(X, y)

    print("  Evaluating winning model (StratifiedKFold CV)...")
    metrics = _evaluate_final(best_pipeline, X, y, cv)
    metrics["winning_model"] = winning_model
    metrics["best_params"] = str(best_params)
    metrics["n_supporters"] = len(y)
    metrics["churn_rate"] = round(y.mean(), 4)
    metrics["lr_cv_auc"] = round(lr_auc, 4)
    metrics["rf_cv_auc"] = round(rf_auc, 4)

    _report_top_at_risk(best_pipeline, X, supporter_label_df)

    # ONNX export
    onnx_filename = (
        "pipeline_02_donor_churn_lr.onnx"
        if winning_model == "LogisticRegression"
        else "pipeline_02_donor_churn_rf.onnx"
    )
    output_path = models_dir / onnx_filename
    print(f"\n  Exporting {winning_model} to ONNX: {output_path}")

    export_to_onnx(
        pipeline=best_pipeline,
        X_train=X,
        output_path=output_path,
        schema_meta={
            "model_name": f"pipeline_02_donor_churn_{winning_model.lower()[:2]}",
            "output_tensors": [
                {
                    "name": "churn_label",
                    "dtype": "int64",
                    "shape": ["N"],
                    "description": "Predicted churn class: 0=retained, 1=churned",
                    "classes": [0, 1],
                    "class_meanings": ["retained", "churned"],
                },
                {
                    "name": "churn_probabilities",
                    "dtype": "float32",
                    "shape": ["N", 2],
                    "description": "Predicted probabilities [P(retained), P(churned)]",
                    "classes": [0, 1],
                    "class_meanings": ["retained", "churned"],
                },
            ],
        },
    )

    print("  Verifying ONNX round-trip...")
    verified = verify_onnx(
        onnx_path=output_path,
        sklearn_pipeline=best_pipeline,
        X_test=X,
        atol=0.02,
        is_classifier=True,
    )
    metrics["onnx_verified"] = verified
    if not verified:
        print("  WARNING: ONNX verification failed — keeping model but flagging.")

    log_metrics(PIPELINE_NAME, metrics)
    return metrics


if __name__ == "__main__":
    engine = get_engine()
    models_dir = ROOT / "models"
    models_dir.mkdir(exist_ok=True)
    train(engine, models_dir)
