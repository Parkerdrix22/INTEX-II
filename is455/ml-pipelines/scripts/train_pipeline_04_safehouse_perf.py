"""
Pipeline 4: Safehouse Operational Performance Prediction
Business question: Can we predict next month's incident count per safehouse
so leadership can proactively allocate staff and resources before problems escalate?

Target: incident_count (integer, count regression)
Model: RandomForestRegressor (predictive, ONNX export) + LinearRegression (explanatory)
N: ~9 safehouses × ~50 months = ~450 rows; ~432 after lag drop
"""

import sys
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import RandomForestRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GridSearchCV, TimeSeriesSplit
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from utils.db_loader import get_engine, load_table
from utils.onnx_exporter import export_to_onnx, verify_onnx
from utils.metrics_logger import log_metrics

PIPELINE_NAME = "pipeline_04_safehouse_performance"


# ─────────────────────────────────────────────────────────────────────────────
# Data loading
# ─────────────────────────────────────────────────────────────────────────────

def load_data(engine) -> tuple[pd.DataFrame, pd.DataFrame, pd.DataFrame, pd.DataFrame]:
    metrics = load_table(engine, "safehouse_monthly_metrics")
    safehouses = load_table(engine, "safehouses")
    allocs = load_table(engine, "donation_allocations")
    donations = load_table(engine, "donations")
    return metrics, safehouses, allocs, donations


# ─────────────────────────────────────────────────────────────────────────────
# Feature engineering
# ─────────────────────────────────────────────────────────────────────────────

def _build_monthly_donations(allocs: pd.DataFrame, donations: pd.DataFrame) -> pd.DataFrame:
    """Aggregate donation flow to (safehouse_id, month_start) granularity."""
    don = donations[["donation_id", "donation_date", "amount"]].copy()
    don["donation_date"] = pd.to_datetime(don["donation_date"])
    don["month_start"] = don["donation_date"].dt.to_period("M").dt.to_timestamp()

    merged = allocs.merge(don, on="donation_id", how="left")
    monthly = (
        merged.groupby(["safehouse_id", "month_start"])["amount_allocated"]
        .sum()
        .reset_index()
        .rename(columns={"amount_allocated": "monthly_donation_total"})
    )
    return monthly


def engineer_features(
    metrics: pd.DataFrame,
    safehouses: pd.DataFrame,
    allocs: pd.DataFrame,
    donations: pd.DataFrame,
) -> tuple[pd.DataFrame, pd.Series, list[str], list[str]]:
    """Build lag features, join static and donation data, return X, y, feature lists."""

    df = metrics.copy()
    df["month_start"] = pd.to_datetime(df["month_start"])

    # CRITICAL: sort for correct lag computation
    df = df.sort_values(["safehouse_id", "month_start"]).reset_index(drop=True)

    # ── Impute high-missingness columns before lagging ────────────────────────
    df["avg_health_score"] = df["avg_health_score"].fillna(df["avg_health_score"].median())
    df["avg_education_progress"] = df["avg_education_progress"].fillna(
        df["avg_education_progress"].median()
    )

    # ── Lag features (grouped by safehouse_id) ───────────────────────────────
    grp = df.groupby("safehouse_id")

    df["incident_count_lag1"] = grp["incident_count"].shift(1)
    df["incident_count_lag2"] = grp["incident_count"].shift(2)

    # Rolling 3-month mean: shift first to avoid leakage, then rolling
    df["incident_count_rolling3_mean"] = (
        grp["incident_count"]
        .shift(1)
        .groupby(df["safehouse_id"])
        .transform(lambda s: s.rolling(3, min_periods=1).mean())
    )

    df["home_visitation_count_lag1"] = grp["home_visitation_count"].shift(1)
    df["process_recording_count_lag1"] = grp["process_recording_count"].shift(1)
    df["active_residents_lag1"] = grp["active_residents"].shift(1)
    df["avg_health_score_lag1"] = grp["avg_health_score"].shift(1)
    df["avg_education_progress_lag1"] = grp["avg_education_progress"].shift(1)

    # Drop first 2 rows per safehouse (insufficient lag history)
    df["_row_rank"] = grp.cumcount()
    df = df[df["_row_rank"] >= 2].drop(columns=["_row_rank"]).reset_index(drop=True)

    # ── Join static safehouse features ───────────────────────────────────────
    sh = safehouses[["safehouse_id", "capacity_girls", "region", "open_date"]].copy()
    sh["open_date"] = pd.to_datetime(sh["open_date"])
    df = df.merge(sh, on="safehouse_id", how="left")

    # Capacity utilization (lag, clipped to [0,1])
    df["capacity_utilization_lag1"] = (
        df["active_residents_lag1"] / df["capacity_girls"].replace(0, np.nan)
    ).clip(0, 1)

    # Safehouse age in months at each row's month_start
    df["safehouse_age_months"] = (
        (df["month_start"] - df["open_date"]).dt.days / 30.44
    ).clip(lower=0).round()

    # ── Monthly donation features ─────────────────────────────────────────────
    monthly_don = _build_monthly_donations(allocs, donations)
    df = df.merge(monthly_don, on=["safehouse_id", "month_start"], how="left")
    df["monthly_donation_total"] = df["monthly_donation_total"].fillna(0.0)

    # Donation lags (re-sort after merge just to be safe)
    df = df.sort_values(["safehouse_id", "month_start"]).reset_index(drop=True)
    don_grp = df.groupby("safehouse_id")
    df["monthly_donation_total_lag1"] = don_grp["monthly_donation_total"].shift(1).fillna(0.0)
    df["monthly_donation_rolling3"] = (
        don_grp["monthly_donation_total"]
        .shift(1)
        .groupby(df["safehouse_id"])
        .transform(lambda s: s.rolling(3, min_periods=1).sum())
        .fillna(0.0)
    )

    # ── Time features ─────────────────────────────────────────────────────────
    df["month_of_year"] = df["month_start"].dt.month
    # months_since_first: count from each safehouse's earliest row in the panel
    df["months_since_first"] = (
        df.groupby("safehouse_id")["month_start"]
        .transform(lambda s: ((s - s.min()).dt.days / 30.44).round().astype(int))
    )

    # ── Final feature sets ────────────────────────────────────────────────────
    numeric_features = [
        "incident_count_lag1",
        "incident_count_lag2",
        "incident_count_rolling3_mean",
        "home_visitation_count_lag1",
        "process_recording_count_lag1",
        "active_residents_lag1",
        "avg_health_score_lag1",
        "avg_education_progress_lag1",
        "capacity_girls",
        "capacity_utilization_lag1",
        "safehouse_age_months",
        "monthly_donation_total_lag1",
        "monthly_donation_rolling3",
        "months_since_first",
    ]
    # Keep only existing columns
    numeric_features = [c for c in numeric_features if c in df.columns]

    # OHE categoricals in pandas (ONNX-safe: no string columns in pipeline)
    cat_cols = [c for c in ["region"] if c in df.columns]
    df["month_of_year"] = df["month_of_year"].astype(str)
    cat_cols.append("month_of_year")

    dummies = pd.get_dummies(df[cat_cols], columns=cat_cols, dtype=float)
    df = pd.concat([df.reset_index(drop=True), dummies.reset_index(drop=True)], axis=1)

    dummy_cols = list(dummies.columns)
    all_features = numeric_features + dummy_cols
    categorical_features = []  # all pre-encoded

    X = df[all_features].copy()
    y = df["incident_count"].astype(float)

    return X, y, all_features, categorical_features, df


# ─────────────────────────────────────────────────────────────────────────────
# Time-based train/test split
# ─────────────────────────────────────────────────────────────────────────────

def time_based_split(
    X: pd.DataFrame,
    y: pd.Series,
    df_full: pd.DataFrame,
    test_fraction: float = 0.20,
) -> tuple:
    """
    Sort by month_start globally and split at the 80th percentile cutoff.
    This prevents any lag feature from leaking future data into training.
    """
    month_start = df_full.loc[X.index, "month_start"] if "month_start" in df_full.columns else df_full["month_start"]
    sorted_idx = month_start.sort_values().index
    cutoff = int(len(sorted_idx) * (1 - test_fraction))
    train_idx = sorted_idx[:cutoff]
    test_idx = sorted_idx[cutoff:]
    return X.loc[train_idx], X.loc[test_idx], y.loc[train_idx], y.loc[test_idx]


# ─────────────────────────────────────────────────────────────────────────────
# Model building
# ─────────────────────────────────────────────────────────────────────────────

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


def build_rf_pipeline(numeric_features: list[str], categorical_features: list[str]) -> Pipeline:
    preprocessor = _build_preprocessor(numeric_features, categorical_features)
    model = RandomForestRegressor(random_state=42)
    return Pipeline([("preprocessor", preprocessor), ("model", model)])


def tune_rf(pipeline: Pipeline, X_train: pd.DataFrame, y_train: pd.Series) -> Pipeline:
    """GridSearchCV with TimeSeriesSplit to respect temporal ordering."""
    param_grid = {
        "model__max_depth": [3, 4, 5],
        "model__min_samples_leaf": [3, 5, 10],
        "model__n_estimators": [100, 200, 300],
    }
    tscv = TimeSeriesSplit(n_splits=5)
    search = GridSearchCV(
        pipeline,
        param_grid,
        cv=tscv,
        scoring="neg_root_mean_squared_error",
        n_jobs=-1,
        verbose=0,
    )
    search.fit(X_train, y_train)
    print(f"  Best params: {search.best_params_}")
    print(f"  Best CV RMSE: {-search.best_score_:.4f}")
    return search.best_estimator_


def build_lr_pipeline(numeric_features: list[str], categorical_features: list[str]) -> Pipeline:
    preprocessor = _build_preprocessor(numeric_features, categorical_features)
    return Pipeline([("preprocessor", preprocessor), ("model", LinearRegression())])


# ─────────────────────────────────────────────────────────────────────────────
# Evaluation
# ─────────────────────────────────────────────────────────────────────────────

def evaluate(pipeline, X_test: pd.DataFrame, y_test: pd.Series, y_train: pd.Series) -> dict:
    preds = pipeline.predict(X_test)

    rmse = mean_squared_error(y_test, preds) ** 0.5
    mae = mean_absolute_error(y_test, preds)
    r2 = r2_score(y_test, preds)

    # Naive baseline: predict last known incident count (incident_count_lag1)
    if "incident_count_lag1" in X_test.columns:
        baseline_preds = X_test["incident_count_lag1"].fillna(y_train.mean()).values
    else:
        baseline_preds = np.full(len(y_test), y_train.mean())
    baseline_rmse = mean_squared_error(y_test, baseline_preds) ** 0.5
    baseline_mae = mean_absolute_error(y_test, baseline_preds)

    beats_baseline = rmse < baseline_rmse

    metrics = {
        "rmse": round(rmse, 4),
        "mae": round(mae, 4),
        "r2": round(r2, 4),
        "baseline_rmse": round(baseline_rmse, 4),
        "baseline_mae": round(baseline_mae, 4),
        "beats_naive_baseline": beats_baseline,
        "rmse_pct_of_baseline": round((rmse / baseline_rmse) * 100, 1) if baseline_rmse > 0 else None,
        "n_test": len(y_test),
    }

    print(f"  RMSE: {rmse:.4f}  MAE: {mae:.4f}  R²: {r2:.4f}")
    print(f"  Naive baseline RMSE: {baseline_rmse:.4f}  MAE: {baseline_mae:.4f}")
    if beats_baseline:
        print(f"  Model BEATS naive baseline ({metrics['rmse_pct_of_baseline']}% of baseline RMSE)")
    else:
        print(
            f"  WARNING: Model does NOT beat naive baseline "
            f"(model RMSE {rmse:.4f} > baseline RMSE {baseline_rmse:.4f}). "
            f"Lag-1 is a strong predictor for low-variance count series."
        )

    return metrics


# ─────────────────────────────────────────────────────────────────────────────
# Main train() entry point
# ─────────────────────────────────────────────────────────────────────────────

def train(engine, models_dir: Path) -> dict:
    print("\n[Pipeline 4] Safehouse Operational Performance Prediction")

    print("  Loading tables...")
    metrics, safehouses, allocs, donations = load_data(engine)
    print(
        f"  Loaded: safehouse_monthly_metrics={len(metrics)} rows, "
        f"safehouses={len(safehouses)}, "
        f"donation_allocations={len(allocs)}, "
        f"donations={len(donations)}"
    )

    print("  Engineering features (lag construction)...")
    X, y, numeric_features, categorical_features, df_full = engineer_features(
        metrics, safehouses, allocs, donations
    )
    print(
        f"  After lag drop: {len(X)} rows  |  "
        f"{len(numeric_features)} numeric + {len(categorical_features)} categorical features"
    )
    print(f"  Target (incident_count): mean={y.mean():.2f}  std={y.std():.2f}  max={y.max()}")

    print("  Performing time-based train/test split (80/20)...")
    # Align df_full index to X
    df_aligned = df_full.loc[X.index].reset_index(drop=True)
    X_reset = X.reset_index(drop=True)
    y_reset = y.reset_index(drop=True)

    month_order = df_aligned["month_start"].argsort()
    sorted_positions = month_order.values
    cutoff = int(len(sorted_positions) * 0.80)
    train_positions = sorted_positions[:cutoff]
    test_positions = sorted_positions[cutoff:]

    X_train = X_reset.iloc[train_positions]
    X_test = X_reset.iloc[test_positions]
    y_train = y_reset.iloc[train_positions]
    y_test = y_reset.iloc[test_positions]
    print(f"  Train: {len(X_train)} rows  |  Test: {len(X_test)} rows")

    print("  Tuning RandomForestRegressor with TimeSeriesSplit CV...")
    rf_base = build_rf_pipeline(numeric_features, categorical_features)
    rf_pipeline = tune_rf(rf_base, X_train, y_train)

    print("  Evaluating RandomForest on test set...")
    metrics_rf = evaluate(rf_pipeline, X_test, y_test, y_train)
    metrics_rf["model_type"] = "RandomForestRegressor"

    print("  Training LinearRegression (explanatory model)...")
    lr_pipeline = build_lr_pipeline(numeric_features, categorical_features)
    lr_pipeline.fit(X_train, y_train)
    metrics_lr = evaluate(lr_pipeline, X_test, y_test, y_train)
    metrics_lr["model_type"] = "LinearRegression"
    print(f"  LR  RMSE: {metrics_lr['rmse']:.4f}  R²: {metrics_lr['r2']:.4f}")

    output_path = models_dir / "pipeline_04_safehouse_perf_rf.onnx"
    print("  Exporting RandomForest pipeline to ONNX...")
    export_to_onnx(
        pipeline=rf_pipeline,
        X_train=X_train,
        output_path=output_path,
        schema_meta={
            "model_name": "pipeline_04_safehouse_perf_rf",
            "version": "1.0",
            "output_tensors": [
                {
                    "name": "predicted_incident_count",
                    "dtype": "float32",
                    "shape": ["N", 1],
                    "description": "Predicted next-month incident count for a safehouse",
                }
            ],
        },
    )

    print("  Verifying ONNX round-trip...")
    verified = verify_onnx(
        onnx_path=output_path,
        sklearn_pipeline=rf_pipeline,
        X_test=X_test,
        atol=1e-3,
        is_classifier=False,
    )
    metrics_rf["onnx_verified"] = verified
    if not verified:
        print("  WARNING: ONNX verification failed — model exported but flagged.")

    all_metrics = {
        "rf": metrics_rf,
        "lr": metrics_lr,
        "n_train": len(X_train),
        "n_test": len(X_test),
        "n_features": len(numeric_features) + len(categorical_features),
    }

    log_metrics(PIPELINE_NAME, all_metrics)
    return all_metrics


# ─────────────────────────────────────────────────────────────────────────────
# Standalone execution
# ─────────────────────────────────────────────────────────────────────────────

if __name__ == "__main__":
    engine = get_engine()
    models_dir = ROOT / "models"
    models_dir.mkdir(exist_ok=True)
    result = train(engine, models_dir)
    print("\nFinal metrics:")
    for k, v in result.items():
        print(f"  {k}: {v}")
