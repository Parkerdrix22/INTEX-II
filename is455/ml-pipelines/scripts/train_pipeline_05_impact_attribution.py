"""
Pipeline 5: Donation Impact Attribution
Business questions:
  1. What measurable impact do donations have on resident health and education
     outcomes? (explanatory — quantify the donation→outcome causal pathway)
  2. For each donor, what personalized impact report can we generate?
     (data product — no ML inference needed)

Explanatory model: statsmodels OLS (health score & education progress)
Predictive model:  sklearn LinearRegression → ONNX (health score estimator)
Data product:      generate_donor_impact_report() called by C# API at runtime
N: ~253 non-null health score rows after lag construction
"""

import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.pipeline import Pipeline as sklearn_Pipeline
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from utils.db_loader import get_engine, load_table
from utils.metrics_logger import log_metrics
from utils.onnx_exporter import export_to_onnx, verify_onnx

PIPELINE_NAME = "pipeline_05_impact_attribution"

# Program-area keyword mapping → donation bucket columns
PROGRAM_AREA_MAP = {
    "donation_to_health": ["Health", "Wellbeing"],
    "donation_to_education": ["Education"],
    "donation_to_counseling": ["Counsel", "Case"],
    "donation_to_operations": ["Operation", "Admin"],
}


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------
def load_data(engine) -> dict[str, pd.DataFrame]:
    tables = [
        "donation_allocations",
        "donations",
        "safehouse_monthly_metrics",
        "safehouses",
    ]
    return {t: load_table(engine, t) for t in tables}


# ---------------------------------------------------------------------------
# Feature / panel construction
# ---------------------------------------------------------------------------
def build_panel(tables: dict[str, pd.DataFrame]) -> pd.DataFrame:
    """
    Returns a panel DataFrame at (safehouse_id × month_start) grain with:
      - lagged donation amounts by program area (T-1)
      - lagged active_residents and capacity_utilization (T-1)
      - month_of_year control
      - avg_health_score and avg_education_progress targets (T)
    """
    alloc = tables["donation_allocations"].copy()
    don = tables["donations"].copy()
    metrics = tables["safehouse_monthly_metrics"].copy()
    sh = tables["safehouses"].copy()

    # --- Step 1: Join allocations → donations to get donation_date -----------
    don["donation_date"] = pd.to_datetime(don["donation_date"], errors="coerce")
    alloc = alloc.merge(
        don[["donation_id", "donation_date"]],
        on="donation_id",
        how="left",
    )
    alloc["amount_allocated"] = pd.to_numeric(alloc["amount_allocated"], errors="coerce").fillna(0)

    # Floor donation_date to first of month → month_start
    alloc["month_start"] = alloc["donation_date"].dt.to_period("M").dt.to_timestamp()

    # --- Step 2: Aggregate per (safehouse_id, month_start) by program area ---
    def _area_flag(series: pd.Series, keywords: list[str]) -> pd.Series:
        pattern = "|".join(keywords)
        return series.str.contains(pattern, case=False, na=False)

    agg_rows = []
    for (sh_id, ms), grp in alloc.groupby(["safehouse_id", "month_start"]):
        row: dict = {"safehouse_id": sh_id, "month_start": ms}
        for col, keywords in PROGRAM_AREA_MAP.items():
            mask = _area_flag(grp["program_area"], keywords)
            row[col] = grp.loc[mask, "amount_allocated"].sum()
        row["donation_total"] = grp["amount_allocated"].sum()
        agg_rows.append(row)

    if agg_rows:
        don_monthly = pd.DataFrame(agg_rows)
    else:
        don_monthly = pd.DataFrame(
            columns=["safehouse_id", "month_start"]
            + list(PROGRAM_AREA_MAP.keys())
            + ["donation_total"]
        )

    # --- Step 3: Join to safehouse_monthly_metrics (LEFT JOIN) ---------------
    metrics["month_start"] = pd.to_datetime(metrics["month_start"], errors="coerce")
    metrics["avg_health_score"] = pd.to_numeric(metrics["avg_health_score"], errors="coerce")
    metrics["avg_education_progress"] = pd.to_numeric(
        metrics["avg_education_progress"], errors="coerce"
    )
    metrics["active_residents"] = pd.to_numeric(metrics["active_residents"], errors="coerce")

    panel = metrics.merge(
        don_monthly,
        on=["safehouse_id", "month_start"],
        how="left",
    )

    # Fill NaN donation columns (months with zero donations to that safehouse)
    donation_cols = list(PROGRAM_AREA_MAP.keys()) + ["donation_total"]
    for col in donation_cols:
        if col in panel.columns:
            panel[col] = panel[col].fillna(0)
        else:
            panel[col] = 0.0

    # --- Step 4: Capacity utilization ----------------------------------------
    sh["capacity_girls"] = pd.to_numeric(sh["capacity_girls"], errors="coerce")
    sh_cap = sh[["safehouse_id", "capacity_girls"]].drop_duplicates("safehouse_id")
    panel = panel.merge(sh_cap, on="safehouse_id", how="left")
    panel["capacity_girls"] = panel["capacity_girls"].fillna(1)

    # --- Step 5: Sort and create lag features (T-1) within each safehouse ----
    panel = panel.sort_values(["safehouse_id", "month_start"]).reset_index(drop=True)

    lag_donation_cols = donation_cols
    for col in lag_donation_cols:
        panel[f"{col}_lag1"] = panel.groupby("safehouse_id")[col].shift(1)

    panel["active_residents_lag1"] = panel.groupby("safehouse_id")["active_residents"].shift(1)
    panel["capacity_utilization_lag1"] = (
        panel["active_residents_lag1"] / panel["capacity_girls"]
    ).clip(0, 1)

    panel["month_of_year"] = panel["month_start"].dt.month

    # Drop rows where lag is unavailable (first observation per safehouse)
    lag_cols = [f"{c}_lag1" for c in lag_donation_cols] + [
        "active_residents_lag1",
        "capacity_utilization_lag1",
    ]
    panel = panel.dropna(subset=lag_cols).reset_index(drop=True)

    return panel


# ---------------------------------------------------------------------------
# Feature column definitions
# ---------------------------------------------------------------------------
def get_feature_cols() -> list[str]:
    """Predictive feature columns for sklearn LinearRegression (no OHE)."""
    lag_donation_cols = [f"{c}_lag1" for c in list(PROGRAM_AREA_MAP.keys()) + ["donation_total"]]
    return lag_donation_cols + [
        "active_residents_lag1",
        "capacity_utilization_lag1",
        "month_of_year",
    ]


def get_ols_feature_cols(panel: pd.DataFrame) -> list[str]:
    """Feature columns for OLS — includes safehouse fixed-effects (OHE)."""
    base_cols = get_feature_cols()
    ohe_cols = [c for c in panel.columns if c.startswith("sh_fe_")]
    return base_cols + ohe_cols


# ---------------------------------------------------------------------------
# OLS Explanatory Models
# ---------------------------------------------------------------------------
def _run_ols(df: pd.DataFrame, target: str, feature_cols: list[str]) -> dict:
    """
    Fit a statsmodels OLS model.
    Returns a dict of regression summary statistics.
    """
    try:
        import statsmodels.api as sm
    except ImportError:
        raise ImportError("Install statsmodels: pip install statsmodels>=0.14.0")

    sub = df[feature_cols + [target]].dropna()
    X_ols = sm.add_constant(sub[feature_cols].astype(float))
    y_ols = sub[target].astype(float)

    model = sm.OLS(y_ols, X_ols).fit()

    coef_table = []
    for var in model.params.index:
        coef_table.append(
            {
                "variable": var,
                "coef": round(float(model.params[var]), 6),
                "std_err": round(float(model.bse[var]), 6),
                "t_stat": round(float(model.tvalues[var]), 4),
                "p_value": round(float(model.pvalues[var]), 4),
                "ci_lower": round(float(model.conf_int().loc[var, 0]), 6),
                "ci_upper": round(float(model.conf_int().loc[var, 1]), 6),
            }
        )

    return {
        "n_obs": int(model.nobs),
        "r_squared": round(float(model.rsquared), 4),
        "adj_r_squared": round(float(model.rsquared_adj), 4),
        "f_statistic": round(float(model.fvalue), 4),
        "f_pvalue": round(float(model.f_pvalue), 6),
        "aic": round(float(model.aic), 2),
        "bic": round(float(model.bic), 2),
        "coef_table": coef_table,
    }


def run_ols_models(panel: pd.DataFrame) -> tuple[dict, dict]:
    """
    Fit OLS for both health score and education progress targets.
    Returns (health_ols_results, edu_ols_results).
    """
    # Safehouse fixed effects via OHE (drop first to avoid multicollinearity)
    sh_dummies = pd.get_dummies(
        panel["safehouse_id"].astype(str), prefix="sh_fe", drop_first=True, dtype=float
    )
    panel_fe = pd.concat([panel.reset_index(drop=True), sh_dummies], axis=1)

    feature_cols = get_ols_feature_cols(panel_fe)
    feature_cols = [c for c in feature_cols if c in panel_fe.columns]

    health_results = _run_ols(panel_fe, "avg_health_score", feature_cols)
    edu_results = _run_ols(panel_fe, "avg_education_progress", feature_cols)

    return health_results, edu_results


# ---------------------------------------------------------------------------
# sklearn Predictive Model
# ---------------------------------------------------------------------------
def train_predictive_model(
    panel: pd.DataFrame,
) -> tuple[LinearRegression, pd.DataFrame, pd.Series, pd.DataFrame, pd.Series, list[str]]:
    """
    Train sklearn LinearRegression predicting avg_health_score.
    Uses time-based split: sorted by safehouse_id + month_start, 80% train.
    Returns (model, X_train, y_train, X_test, y_test, feature_cols).
    """
    feature_cols = get_feature_cols()
    feature_cols = [c for c in feature_cols if c in panel.columns]

    sub = panel[feature_cols + ["avg_health_score"]].dropna(subset=["avg_health_score"])
    sub = sub.copy()

    X = sub[feature_cols].astype(float)
    y = sub["avg_health_score"].astype(float)

    split_idx = int(len(sub) * 0.8)
    X_train, X_test = X.iloc[:split_idx], X.iloc[split_idx:]
    y_train, y_test = y.iloc[:split_idx], y.iloc[split_idx:]

    preprocessor = ColumnTransformer(
        transformers=[
            (
                "num",
                sklearn_Pipeline([
                    ("imputer", SimpleImputer(strategy="median")),
                    ("scaler", StandardScaler()),
                ]),
                feature_cols,
            ),
        ]
    )
    model = sklearn_Pipeline([("preprocessor", preprocessor), ("model", LinearRegression())])
    model.fit(X_train, y_train)

    return model, X_train, y_train, X_test, y_test, feature_cols


def evaluate_predictive(
    model: LinearRegression,
    X_train: pd.DataFrame,
    y_train: pd.Series,
    X_test: pd.DataFrame,
    y_test: pd.Series,
) -> dict:
    """Compute R², RMSE, MAE for train and test splits."""
    y_pred_train = model.predict(X_train)
    y_pred_test = model.predict(X_test)

    return {
        "train_r2": round(float(r2_score(y_train, y_pred_train)), 4),
        "test_r2": round(float(r2_score(y_test, y_pred_test)), 4) if len(y_test) > 1 else None,
        "test_rmse": round(float(np.sqrt(mean_squared_error(y_test, y_pred_test))), 4)
        if len(y_test) > 1
        else None,
        "test_mae": round(float(mean_absolute_error(y_test, y_pred_test)), 4)
        if len(y_test) > 1
        else None,
        "n_train": int(len(y_train)),
        "n_test": int(len(y_test)),
    }


# ---------------------------------------------------------------------------
# Donor impact report (data product — no ML)
# ---------------------------------------------------------------------------
def generate_donor_impact_report(engine, supporter_id: str) -> dict:
    """
    For a given supporter, compute their personalized impact report.
    Traverses: supporter → donations → donation_allocations → safehouses
               → safehouse_monthly_metrics.
    Returns JSON-serializable dict.

    Called by the C# API at request time.
    """
    tables = load_data(engine)
    supporters = load_table(engine, "supporters")
    alloc = tables["donation_allocations"].copy()
    don = tables["donations"].copy()
    metrics = tables["safehouse_monthly_metrics"].copy()
    sh = tables["safehouses"].copy()

    don["donation_date"] = pd.to_datetime(don["donation_date"], errors="coerce")
    don["amount"] = pd.to_numeric(don["amount"], errors="coerce").fillna(0)
    metrics["avg_health_score"] = pd.to_numeric(metrics["avg_health_score"], errors="coerce")
    metrics["avg_education_progress"] = pd.to_numeric(
        metrics["avg_education_progress"], errors="coerce"
    )
    metrics["active_residents"] = pd.to_numeric(metrics["active_residents"], errors="coerce")
    metrics["month_start"] = pd.to_datetime(metrics["month_start"], errors="coerce")
    alloc["amount_allocated"] = pd.to_numeric(alloc["amount_allocated"], errors="coerce").fillna(0)

    # Supporter info
    sup_row = supporters[supporters["supporter_id"].astype(str) == str(supporter_id)]
    if sup_row.empty:
        return {"error": f"supporter_id {supporter_id!r} not found", "supporter_id": supporter_id}

    sup = sup_row.iloc[0]
    display_name = str(sup.get("display_name", "")) or str(
        f"{sup.get('first_name', '')} {sup.get('last_name', '')}".strip()
    )

    # Donations by this supporter
    sup_donations = don[don["supporter_id"].astype(str) == str(supporter_id)].copy()
    if sup_donations.empty:
        return {
            "supporter_id": supporter_id,
            "display_name": display_name,
            "total_contributed": 0.0,
            "donation_count": 0,
            "safehouses_supported": [],
            "program_area_breakdown_pct": {},
            "avg_health_score_at_funded_safehouses": None,
            "avg_education_progress_at_funded_safehouses": None,
            "residents_supported_estimate": None,
            "message": "No donations found for this supporter.",
        }

    total_contributed = float(sup_donations["amount"].sum())
    donation_count = int(len(sup_donations))
    first_donation = sup_donations["donation_date"].min()
    last_donation = sup_donations["donation_date"].max()

    # Allocations linked to supporter's donations
    sup_alloc = alloc[alloc["donation_id"].isin(sup_donations["donation_id"])].copy()
    total_allocated = float(sup_alloc["amount_allocated"].sum())

    # Program area breakdown
    program_area_totals = sup_alloc.groupby("program_area")["amount_allocated"].sum()
    if total_allocated > 0:
        program_area_pct = (program_area_totals / total_allocated * 100).round(1).to_dict()
    else:
        program_area_pct = {}

    # Safehouses funded
    funded_safehouse_ids = sup_alloc["safehouse_id"].dropna().unique().tolist()
    sh_info = sh[sh["safehouse_id"].isin(funded_safehouse_ids)][
        ["safehouse_id", "name", "city", "province", "country"]
    ].copy()
    safehouses_list = sh_info.to_dict(orient="records")

    # Metrics at funded safehouses during the support period
    if len(funded_safehouse_ids) > 0:
        funded_metrics = metrics[metrics["safehouse_id"].isin(funded_safehouse_ids)].copy()
        # Filter to the support period (first → last donation month)
        if pd.notna(first_donation) and pd.notna(last_donation):
            funded_metrics = funded_metrics[
                (funded_metrics["month_start"] >= first_donation)
                & (funded_metrics["month_start"] <= last_donation + pd.DateOffset(months=1))
            ]
        avg_health = (
            float(funded_metrics["avg_health_score"].mean())
            if funded_metrics["avg_health_score"].notna().any()
            else None
        )
        avg_edu = (
            float(funded_metrics["avg_education_progress"].mean())
            if funded_metrics["avg_education_progress"].notna().any()
            else None
        )
        avg_residents = (
            float(funded_metrics["active_residents"].mean())
            if funded_metrics["active_residents"].notna().any()
            else None
        )
    else:
        avg_health = None
        avg_edu = None
        avg_residents = None

    return {
        "supporter_id": supporter_id,
        "display_name": display_name,
        "total_contributed": round(total_contributed, 2),
        "donation_count": donation_count,
        "first_donation_date": first_donation.isoformat() if pd.notna(first_donation) else None,
        "last_donation_date": last_donation.isoformat() if pd.notna(last_donation) else None,
        "safehouses_supported": safehouses_list,
        "program_area_breakdown_pct": program_area_pct,
        "avg_health_score_at_funded_safehouses": (
            round(avg_health, 2) if avg_health is not None else None
        ),
        "avg_education_progress_at_funded_safehouses": (
            round(avg_edu, 2) if avg_edu is not None else None
        ),
        "residents_supported_estimate": (
            round(avg_residents, 1) if avg_residents is not None else None
        ),
    }


# ---------------------------------------------------------------------------
# Main train() function
# ---------------------------------------------------------------------------
def train(engine, models_dir: Path) -> dict:
    print("\n[Pipeline 5] Donation Impact Attribution")

    print("  Loading data...")
    tables = load_data(engine)
    for t, df in tables.items():
        print(f"    {t}: {len(df)} rows")

    print("  Building panel...")
    panel = build_panel(tables)
    print(f"  Panel shape: {panel.shape}")
    n_health = panel["avg_health_score"].notna().sum()
    n_edu = panel["avg_education_progress"].notna().sum()
    print(f"  Non-null health score rows: {n_health}")
    print(f"  Non-null education progress rows: {n_edu}")

    # ------------------------------------------------------------------
    # 1. Explanatory OLS models
    # ------------------------------------------------------------------
    print("\n  Fitting OLS explanatory models...")
    health_ols, edu_ols = run_ols_models(panel)
    print(
        f"  Health OLS  → R²={health_ols['r_squared']:.4f}, "
        f"F={health_ols['f_statistic']:.2f} (p={health_ols['f_pvalue']:.4f}), "
        f"n={health_ols['n_obs']}"
    )
    print(
        f"  Education OLS → R²={edu_ols['r_squared']:.4f}, "
        f"F={edu_ols['f_statistic']:.2f} (p={edu_ols['f_pvalue']:.4f}), "
        f"n={edu_ols['n_obs']}"
    )

    # Print coefficient table highlights
    for result_name, ols_result in [("Health", health_ols), ("Education", edu_ols)]:
        print(f"\n  OLS [{result_name}] — key donation coefficients:")
        for row in ols_result["coef_table"]:
            if "donation_to" in row["variable"] or row["variable"] == "const":
                sig = "***" if row["p_value"] < 0.01 else ("**" if row["p_value"] < 0.05 else ("*" if row["p_value"] < 0.10 else ""))
                print(
                    f"    {row['variable']:45s} coef={row['coef']:+.4f}  "
                    f"p={row['p_value']:.4f}{sig}  "
                    f"95% CI=[{row['ci_lower']:+.4f}, {row['ci_upper']:+.4f}]"
                )

    # ------------------------------------------------------------------
    # 2. Predictive sklearn LinearRegression
    # ------------------------------------------------------------------
    print("\n  Training sklearn LinearRegression (health score predictor)...")
    lr_model, X_train, y_train, X_test, y_test, feature_cols = train_predictive_model(panel)
    pred_metrics = evaluate_predictive(lr_model, X_train, y_train, X_test, y_test)
    print(
        f"  Train R²: {pred_metrics['train_r2']:.4f}  |  "
        f"Test R²: {pred_metrics.get('test_r2')}  |  "
        f"Test RMSE: {pred_metrics.get('test_rmse')}  |  "
        f"Test MAE: {pred_metrics.get('test_mae')}"
    )
    print(f"  n_train={pred_metrics['n_train']}, n_test={pred_metrics['n_test']}")

    # ------------------------------------------------------------------
    # 3. ONNX export
    # ------------------------------------------------------------------
    onnx_path = models_dir / "pipeline_05_impact_attribution_health_lr.onnx"
    print(f"\n  Exporting LinearRegression to ONNX → {onnx_path.name}")
    export_to_onnx(
        pipeline=lr_model,
        X_train=X_train,
        output_path=onnx_path,
        schema_meta={
            "model_name": "pipeline_05_impact_attribution_health_lr",
            "version": "1.0",
            "output_tensors": [
                {
                    "name": "predicted_health_score",
                    "dtype": "float32",
                    "shape": ["N", 1],
                    "description": (
                        "Predicted avg_health_score for residents at a safehouse "
                        "given donation amounts by program area in the prior month. "
                        "Powers the Donor Impact Estimator dashboard feature."
                    ),
                }
            ],
        },
    )

    print("  Verifying ONNX round-trip...")
    verified = verify_onnx(
        onnx_path=onnx_path,
        sklearn_pipeline=lr_model,
        X_test=X_test if len(X_test) > 0 else X_train.iloc[:10],
        atol=1e-4,
        is_classifier=False,
    )
    if not verified:
        print("  WARNING: ONNX verification failed — keeping model but flagging.")

    # ------------------------------------------------------------------
    # 4. Collate and log metrics
    # ------------------------------------------------------------------
    all_metrics = {
        # OLS health
        "ols_health_r2": health_ols["r_squared"],
        "ols_health_adj_r2": health_ols["adj_r_squared"],
        "ols_health_f_stat": health_ols["f_statistic"],
        "ols_health_f_pvalue": health_ols["f_pvalue"],
        "ols_health_aic": health_ols["aic"],
        "ols_health_bic": health_ols["bic"],
        "ols_health_n_obs": health_ols["n_obs"],
        # OLS education
        "ols_edu_r2": edu_ols["r_squared"],
        "ols_edu_adj_r2": edu_ols["adj_r_squared"],
        "ols_edu_f_stat": edu_ols["f_statistic"],
        "ols_edu_f_pvalue": edu_ols["f_pvalue"],
        "ols_edu_aic": edu_ols["aic"],
        "ols_edu_bic": edu_ols["bic"],
        "ols_edu_n_obs": edu_ols["n_obs"],
        # Predictive LR
        **{f"lr_{k}": v for k, v in pred_metrics.items()},
        "onnx_verified": verified,
        "panel_rows": int(len(panel)),
        "n_health_rows": int(n_health),
        "n_edu_rows": int(n_edu),
    }
    log_metrics(PIPELINE_NAME, all_metrics, status="success")

    return all_metrics


# ---------------------------------------------------------------------------
# Standalone entry point
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    engine = get_engine()
    models_dir = ROOT / "models"
    models_dir.mkdir(exist_ok=True)
    metrics = train(engine, models_dir)
    print("\n  Final metrics summary:")
    for k, v in metrics.items():
        if not isinstance(v, list):
            print(f"    {k}: {v}")
