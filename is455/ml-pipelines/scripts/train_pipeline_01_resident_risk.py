"""
Pipeline 1: Resident Risk Classification
Business question: Which residents are at high or critical risk so case managers
can prioritize interventions?

Target: binary high_risk_flag = 1 if current_risk_level in {High, Critical} else 0
Predictive model: RandomForestClassifier (class_weight='balanced')
Explanatory model: LogisticRegression (multinomial, all 4 risk classes)
N: ~60 residents — use StratifiedKFold(n_splits=5), never accuracy as metric.
"""

import re
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
from sklearn.metrics import (
    f1_score,
    make_scorer,
    precision_score,
    recall_score,
    roc_auc_score,
)
from sklearn.model_selection import GridSearchCV, StratifiedKFold, cross_validate
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from utils.db_loader import get_engine, load_table
from utils.metrics_logger import log_metrics
from utils.onnx_exporter import export_to_onnx, verify_onnx

PIPELINE_NAME = "pipeline_01_resident_risk"

# ---------------------------------------------------------------------------
# Risk ordinal maps
# ---------------------------------------------------------------------------
RISK_ORDINAL = {"Low": 0, "Medium": 1, "High": 2, "Critical": 3}
REINTEGRATION_ORDINAL = {
    "Not Started": 0,
    "On Hold": 1,
    "In Progress": 2,
    "Completed": 3,
    None: 0,
    "None": 0,
}
HIGH_RISK_CLASSES = {"High", "Critical"}
NEGATIVE_END_STATES = {"Sad", "Anxious", "Withdrawn", "Fearful"}

# Sub-category boolean columns from the residents table
SUB_CAT_COLS = [
    "sub_cat_orphaned",
    "sub_cat_trafficked",
    "sub_cat_child_labor",
    "sub_cat_physical_abuse",
    "sub_cat_sexual_abuse",
    "sub_cat_osaec",
    "sub_cat_cicl",
    "sub_cat_at_risk",
    "sub_cat_street_child",
    "sub_cat_child_with_hiv",
]


# ---------------------------------------------------------------------------
# String parsers (applied in pandas BEFORE sklearn pipeline)
# ---------------------------------------------------------------------------
def _parse_years_months(s) -> float:
    """Parse strings like '15 Years 9 months' or '2 years' into a float (years)."""
    if pd.isna(s) or s == "":
        return 0.0
    s = str(s)
    years_match = re.search(r"(\d+)\s*[Yy]ear", s)
    months_match = re.search(r"(\d+)\s*[Mm]onth", s)
    years = int(years_match.group(1)) if years_match else 0
    months = int(months_match.group(1)) if months_match else 0
    return float(years) + float(months) / 12.0


def _parse_length_of_stay_days(s) -> float:
    """
    Parse length_of_stay into days.
    Supports '1 Year 3 months', '45 Days', or bare numbers.
    Falls back to 0 on parse failure.
    """
    if pd.isna(s) or str(s).strip() == "":
        return 0.0
    s = str(s)
    # Try days directly
    days_match = re.search(r"(\d+)\s*[Dd]ay", s)
    if days_match:
        return float(days_match.group(1))
    # Try years + months → days
    years_match = re.search(r"(\d+)\s*[Yy]ear", s)
    months_match = re.search(r"(\d+)\s*[Mm]onth", s)
    if years_match or months_match:
        years = int(years_match.group(1)) if years_match else 0
        months = int(months_match.group(1)) if months_match else 0
        return float(years * 365 + months * 30)
    # Try bare number
    bare = re.search(r"^\s*(\d+(?:\.\d+)?)\s*$", s)
    if bare:
        return float(bare.group(1))
    return 0.0


def _bool_to_int(series: pd.Series) -> pd.Series:
    return series.map({True: 1, False: 0, "True": 1, "False": 0}).fillna(0).astype(int)


def _bool_rate(series: pd.Series) -> float:
    """Return proportion of truthy values in a boolean-like series."""
    mapped = series.map({True: 1, False: 0, "True": 1, "False": 0}).fillna(0)
    return mapped.mean() if len(mapped) > 0 else 0.0


# ---------------------------------------------------------------------------
# Health trend helper
# ---------------------------------------------------------------------------
def _health_trend(grp: pd.DataFrame) -> float:
    """Slope of general_health_score over time (positive = improving)."""
    sub = grp[["record_date", "general_health_score"]].dropna()
    if len(sub) < 2:
        return 0.0
    x = pd.to_datetime(sub["record_date"]).astype(np.int64) // 10**9  # seconds
    y = sub["general_health_score"].astype(float).values
    try:
        slope = np.polyfit(x.values, y, 1)[0]
        return float(slope)
    except Exception:
        return 0.0


# ---------------------------------------------------------------------------
# Data loading
# ---------------------------------------------------------------------------
def load_data(engine) -> dict[str, pd.DataFrame]:
    tables = [
        "residents",
        "health_wellbeing_records",
        "education_records",
        "process_recordings",
        "home_visitations",
        "incident_reports",
        "intervention_plans",
    ]
    return {t: load_table(engine, t) for t in tables}


# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------
def engineer_features(tables: dict[str, pd.DataFrame]) -> tuple[pd.DataFrame, pd.Series, pd.Series]:
    """
    Returns (X, y_binary, y_multi) where:
      y_binary: high_risk_flag (0/1)
      y_multi:  current_risk_level ordinal (0-3) for explanatory model
    """
    residents = tables["residents"].copy()

    # ---- Target ----
    residents["high_risk_flag"] = residents["current_risk_level"].apply(
        lambda v: 1 if str(v) in HIGH_RISK_CLASSES else 0
    )
    residents["risk_ordinal"] = residents["current_risk_level"].map(RISK_ORDINAL).fillna(0).astype(int)

    # ---- Resident-level features ----
    residents["age_at_intake"] = residents["age_upon_admission"].apply(_parse_years_months)
    residents["length_of_stay_days"] = residents["length_of_stay"].apply(_parse_length_of_stay_days)
    residents["initial_risk_ordinal"] = residents["initial_risk_level"].map(RISK_ORDINAL).fillna(0).astype(int)
    residents["reintegration_ordinal"] = (
        residents["reintegration_status"]
        .map(REINTEGRATION_ORDINAL)
        .fillna(0)
        .astype(int)
    )
    for col in SUB_CAT_COLS:
        if col in residents.columns:
            residents[col] = _bool_to_int(residents[col])

    # ---- Health aggregates ----
    hw = tables["health_wellbeing_records"].copy()
    hw["record_date"] = pd.to_datetime(hw["record_date"], errors="coerce")
    hw["general_health_score"] = pd.to_numeric(hw["general_health_score"], errors="coerce")
    hw["nutrition_score"] = pd.to_numeric(hw["nutrition_score"], errors="coerce")
    hw["sleep_quality_score"] = pd.to_numeric(hw["sleep_quality_score"], errors="coerce")

    hw_agg = hw.groupby("resident_id").agg(
        mean_health_score=("general_health_score", "mean"),
        health_record_count=("health_record_id", "count"),
        mean_nutrition_score=("nutrition_score", "mean"),
        mean_sleep_quality_score=("sleep_quality_score", "mean"),
    ).reset_index()

    # latest health score
    hw_sorted = hw.sort_values("record_date")
    hw_latest = hw_sorted.groupby("resident_id")["general_health_score"].last().reset_index()
    hw_latest.columns = ["resident_id", "latest_health_score"]

    # health trend (slope)
    hw_trend = (
        hw.groupby("resident_id")
        .apply(_health_trend)
        .reset_index()
        .rename(columns={0: "health_trend"})
    )

    hw_agg = hw_agg.merge(hw_latest, on="resident_id", how="left")
    hw_agg = hw_agg.merge(hw_trend, on="resident_id", how="left")

    # ---- Education aggregates ----
    ed = tables["education_records"].copy()
    ed["attendance_rate"] = pd.to_numeric(ed["attendance_rate"], errors="coerce")
    ed["progress_percent"] = pd.to_numeric(ed["progress_percent"], errors="coerce")
    ed["record_date"] = pd.to_datetime(ed["record_date"], errors="coerce")

    ed_agg = ed.groupby("resident_id").agg(
        mean_attendance_rate=("attendance_rate", "mean"),
        mean_progress_percent=("progress_percent", "mean"),
        ed_record_count=("education_record_id", "count"),
    ).reset_index()

    ed_latest = (
        ed.sort_values("record_date")
        .groupby("resident_id")["progress_percent"]
        .last()
        .reset_index()
        .rename(columns={"progress_percent": "latest_progress_percent"})
    )
    ed_agg = ed_agg.merge(ed_latest, on="resident_id", how="left")

    # ---- Process recordings aggregates ----
    pr = tables["process_recordings"].copy()
    pr["concerns_flagged_int"] = _bool_to_int(pr["concerns_flagged"])
    pr["progress_noted_int"] = _bool_to_int(pr["progress_noted"])
    pr["referral_made_int"] = _bool_to_int(pr["referral_made"])
    pr["negative_end"] = pr["emotional_state_end"].apply(
        lambda v: 1 if str(v) in NEGATIVE_END_STATES else 0
    )

    pr_agg = pr.groupby("resident_id").agg(
        session_count=("recording_id", "count"),
        concerns_flagged_rate=("concerns_flagged_int", "mean"),
        progress_noted_rate=("progress_noted_int", "mean"),
        referral_made_rate=("referral_made_int", "mean"),
        negative_endstate_rate=("negative_end", "mean"),
    ).reset_index()

    # ---- Home visitation aggregates ----
    hv = tables["home_visitations"].copy()
    hv["safety_int"] = _bool_to_int(hv["safety_concerns_noted"])
    hv["uncooperative"] = (hv["family_cooperation_level"] == "Uncooperative").astype(int)
    hv["favorable"] = (hv["visit_outcome"] == "Favorable").astype(int)

    hv_agg = hv.groupby("resident_id").agg(
        visitation_count=("visitation_id", "count"),
        safety_concerns_rate=("safety_int", "mean"),
        uncooperative_family_rate=("uncooperative", "mean"),
        favorable_outcome_rate=("favorable", "mean"),
    ).reset_index()

    # ---- Incident report aggregates ----
    inc = tables["incident_reports"].copy()
    inc["high_sev"] = inc["severity"].apply(
        lambda v: 1 if str(v) in {"High", "Critical"} else 0
    )
    inc["self_harm"] = inc["incident_type"].apply(
        lambda v: 1 if re.search(r"[Ss]elf", str(v)) else 0
    )
    inc["runaway"] = inc["incident_type"].apply(
        lambda v: 1 if re.search(r"[Rr]un|[Rr]unaway", str(v)) else 0
    )
    inc["unresolved"] = inc["resolved"].map(
        {True: 0, False: 1, "True": 0, "False": 1}
    ).fillna(0).astype(int)

    inc_agg = inc.groupby("resident_id").agg(
        incident_count=("incident_id", "count"),
        high_severity_count=("high_sev", "sum"),
        self_harm_count=("self_harm", "sum"),
        runaway_count=("runaway", "sum"),
        unresolved_count=("unresolved", "sum"),
    ).reset_index()

    # ---- Intervention plan aggregates ----
    ip = tables["intervention_plans"].copy()
    ip["achieved"] = ip["status"].apply(
        lambda v: 1 if str(v) in {"Achieved", "Completed"} else 0
    )
    ip["on_hold"] = (ip["status"] == "On Hold").astype(int)
    ip["safety_plan"] = ip["plan_category"].apply(
        lambda v: 1 if re.search(r"[Ss]afety", str(v)) else 0
    )

    ip_agg = ip.groupby("resident_id").agg(
        plan_count=("plan_id", "count"),
        achieved_rate=("achieved", "mean"),
        on_hold_rate=("on_hold", "mean"),
        has_safety_plan=("safety_plan", "max"),
    ).reset_index()

    # ---- Merge all aggregates onto residents ----
    base = residents.copy()
    for agg_df in [hw_agg, ed_agg, pr_agg, hv_agg, inc_agg, ip_agg]:
        base = base.merge(agg_df, on="resident_id", how="left")

    # Fill numeric aggregates with 0
    numeric_agg_cols = [
        "mean_health_score", "latest_health_score", "health_trend",
        "mean_nutrition_score", "mean_sleep_quality_score", "health_record_count",
        "mean_attendance_rate", "mean_progress_percent", "latest_progress_percent",
        "ed_record_count", "session_count", "concerns_flagged_rate",
        "progress_noted_rate", "referral_made_rate", "negative_endstate_rate",
        "visitation_count", "safety_concerns_rate", "uncooperative_family_rate",
        "favorable_outcome_rate", "incident_count", "high_severity_count",
        "self_harm_count", "runaway_count", "unresolved_count",
        "plan_count", "achieved_rate", "on_hold_rate", "has_safety_plan",
    ]
    for col in numeric_agg_cols:
        if col in base.columns:
            base[col] = base[col].fillna(0)

    # OHE case_category in pandas (ONNX-safe: no string columns in pipeline)
    if "case_category" in base.columns:
        cat_dummies = pd.get_dummies(base["case_category"], prefix="case_cat", dtype=float)
        base = pd.concat([base.reset_index(drop=True), cat_dummies.reset_index(drop=True)], axis=1)

    return base, base["high_risk_flag"], base["risk_ordinal"]


# ---------------------------------------------------------------------------
# Feature column selection
# ---------------------------------------------------------------------------
def get_feature_columns(base: pd.DataFrame) -> tuple[list[str], list[str]]:
    numeric_features = (
        [
            "age_at_intake",
            "length_of_stay_days",
            "initial_risk_ordinal",
            "reintegration_ordinal",
        ]
        + [c for c in SUB_CAT_COLS if c in base.columns]
        + [
            "mean_health_score",
            "latest_health_score",
            "health_trend",
            "mean_nutrition_score",
            "mean_sleep_quality_score",
            "health_record_count",
            "mean_attendance_rate",
            "mean_progress_percent",
            "latest_progress_percent",
            "ed_record_count",
            "session_count",
            "concerns_flagged_rate",
            "progress_noted_rate",
            "referral_made_rate",
            "negative_endstate_rate",
            "visitation_count",
            "safety_concerns_rate",
            "uncooperative_family_rate",
            "favorable_outcome_rate",
            "incident_count",
            "high_severity_count",
            "self_harm_count",
            "runaway_count",
            "unresolved_count",
            "plan_count",
            "achieved_rate",
            "on_hold_rate",
            "has_safety_plan",
        ]
    )
    # Keep only columns that exist in base
    # Add OHE case_category columns
    case_cat_cols = [c for c in base.columns if c.startswith("case_cat_")]
    numeric_features = [c for c in numeric_features if c in base.columns] + case_cat_cols
    categorical_features = []  # all pre-encoded in pandas
    return numeric_features, categorical_features


# ---------------------------------------------------------------------------
# Pipeline builders
# ---------------------------------------------------------------------------
def build_rf_pipeline(numeric_features: list[str], categorical_features: list[str]) -> ImbPipeline:
    """
    Build the Random Forest pipeline with SMOTE for minority-class oversampling.

    SMOTE is applied INSIDE the imblearn Pipeline so scikit-learn's GridSearchCV
    and cross_validate automatically apply it to training folds only — the test
    fold is never touched. This is the canonical leakage-free way to use SMOTE
    with k-fold CV (textbook Ch. 14 + imbalanced-learn docs).

    k_neighbors=3 is set explicitly because Pipeline 1 has only ~6 positives;
    the SMOTE default of k=5 would fail when the minority class is smaller
    than 6 in some folds. k=3 guarantees SMOTE always has enough neighbors
    to synthesize from, even in the smallest training fold.
    """
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
    preprocessor = ColumnTransformer(transformers=transformers)
    # Keep class_weight='balanced' alongside SMOTE — belt + suspenders.
    clf = RandomForestClassifier(class_weight="balanced", random_state=42)
    return ImbPipeline([
        ("preprocessor", preprocessor),
        ("smote", SMOTE(random_state=42, k_neighbors=3)),
        ("model", clf),
    ])


def build_lr_pipeline(numeric_features: list[str], categorical_features: list[str]) -> Pipeline:
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
    preprocessor = ColumnTransformer(transformers=transformers)
    clf = LogisticRegression(
        class_weight="balanced",
        max_iter=1000,
        solver="lbfgs",
        random_state=42,
    )
    return Pipeline([("preprocessor", preprocessor), ("model", clf)])


# ---------------------------------------------------------------------------
# Main train function
# ---------------------------------------------------------------------------
def train(engine, models_dir: Path) -> dict:
    print("\n[Pipeline 1] Resident Risk Classification")

    print("  Loading data...")
    tables = load_data(engine)
    n_residents = len(tables["residents"])
    print(f"  Loaded {n_residents} residents.")

    print("  Engineering features...")
    base, y_binary, y_multi = engineer_features(tables)
    print(f"  Class distribution (binary): {y_binary.value_counts().to_dict()}")
    print(f"  Class distribution (multi):  {y_multi.value_counts().to_dict()}")

    numeric_features, categorical_features = get_feature_columns(base)
    feature_cols = numeric_features + categorical_features
    X = base[feature_cols].copy()

    print(f"  Feature matrix: {X.shape[0]} rows x {X.shape[1]} cols")
    print(f"    Numeric: {len(numeric_features)}, Categorical: {len(categorical_features)}")

    # StratifiedKFold — n_splits=5 because only ~6 positives
    cv = StratifiedKFold(n_splits=5, shuffle=True, random_state=42)

    # ------------------------------------------------------------------
    # 1. Predictive model: RandomForestClassifier (binary)
    # ------------------------------------------------------------------
    print("\n  Tuning RandomForest (binary)...")
    rf_pipeline = build_rf_pipeline(numeric_features, categorical_features)

    rf_param_grid = {
        "model__max_depth": [2, 3, 4],
        "model__min_samples_leaf": [2, 3, 5],
        "model__n_estimators": [100, 200],
    }
    rf_search = GridSearchCV(
        rf_pipeline,
        rf_param_grid,
        cv=cv,
        scoring="roc_auc",
        n_jobs=-1,
        verbose=0,
        refit=True,
    )
    rf_search.fit(X, y_binary)
    best_imb = rf_search.best_estimator_  # imblearn Pipeline (SMOTE inside)
    print(f"  Best RF params: {rf_search.best_params_}")
    print(f"  Best CV ROC-AUC: {rf_search.best_score_:.4f}")

    # Cross-validate with multiple metrics on best model.
    # NOTE: we pass the imblearn pipeline so SMOTE is applied per training fold.
    scoring = {
        "roc_auc": "roc_auc",
        "f1": make_scorer(f1_score, zero_division=0),
        "precision": make_scorer(precision_score, zero_division=0),
        "recall": make_scorer(recall_score, zero_division=0),
    }
    cv_results = cross_validate(best_imb, X, y_binary, cv=cv, scoring=scoring, return_train_score=False)

    # Extract the fitted preprocessor + RF into a plain sklearn Pipeline for
    # ONNX export. SMOTE is training-time only — at inference, the pipeline
    # is just preprocessor → model, which skl2onnx converts cleanly. Using
    # the extracted sklearn Pipeline for export and verification avoids
    # skl2onnx having to understand imblearn's Pipeline class.
    best_rf = Pipeline([
        ("preprocessor", best_imb.named_steps["preprocessor"]),
        ("model", best_imb.named_steps["model"]),
    ])

    rf_metrics = {
        "cv_roc_auc_mean": round(float(np.mean(cv_results["test_roc_auc"])), 4),
        "cv_roc_auc_std": round(float(np.std(cv_results["test_roc_auc"])), 4),
        "cv_f1_mean": round(float(np.mean(cv_results["test_f1"])), 4),
        "cv_f1_std": round(float(np.std(cv_results["test_f1"])), 4),
        "cv_precision_mean": round(float(np.mean(cv_results["test_precision"])), 4),
        "cv_recall_mean": round(float(np.mean(cv_results["test_recall"])), 4),
        "n_samples": int(len(y_binary)),
        "n_positives": int(y_binary.sum()),
        "best_rf_params": rf_search.best_params_,
    }
    print(f"  CV ROC-AUC: {rf_metrics['cv_roc_auc_mean']:.4f} ± {rf_metrics['cv_roc_auc_std']:.4f}")
    print(f"  CV F1:      {rf_metrics['cv_f1_mean']:.4f} ± {rf_metrics['cv_f1_std']:.4f}")
    print(f"  CV Prec:    {rf_metrics['cv_precision_mean']:.4f}   CV Recall: {rf_metrics['cv_recall_mean']:.4f}")

    # ------------------------------------------------------------------
    # 2. Explanatory model: LogisticRegression (multinomial, 4 classes)
    # ------------------------------------------------------------------
    print("\n  Tuning LogisticRegression (multinomial, 4-class)...")
    lr_pipeline = build_lr_pipeline(numeric_features, categorical_features)

    lr_param_grid = {
        "model__C": [0.01, 0.1, 1.0],
    }
    lr_search = GridSearchCV(
        lr_pipeline,
        lr_param_grid,
        cv=StratifiedKFold(n_splits=5, shuffle=True, random_state=42),
        scoring="f1_weighted",
        n_jobs=-1,
        verbose=0,
        refit=True,
    )
    lr_search.fit(X, y_multi)
    best_lr = lr_search.best_estimator_
    print(f"  Best LR params: {lr_search.best_params_}")
    print(f"  Best CV F1-weighted: {lr_search.best_score_:.4f}")

    lr_cv = cross_validate(
        best_lr, X, y_multi,
        cv=StratifiedKFold(n_splits=5, shuffle=True, random_state=42),
        scoring={"f1_weighted": "f1_weighted"},
        return_train_score=False,
    )
    lr_metrics = {
        "cv_f1_weighted_mean": round(float(np.mean(lr_cv["test_f1_weighted"])), 4),
        "cv_f1_weighted_std": round(float(np.std(lr_cv["test_f1_weighted"])), 4),
        "best_lr_C": lr_search.best_params_.get("model__C"),
    }
    print(f"  LR CV F1-weighted: {lr_metrics['cv_f1_weighted_mean']:.4f} ± {lr_metrics['cv_f1_weighted_std']:.4f}")

    # ------------------------------------------------------------------
    # 3. ONNX export (RF binary classifier)
    # ------------------------------------------------------------------
    output_path = models_dir / "pipeline_01_resident_risk_rf.onnx"
    print("\n  Exporting RandomForest to ONNX...")
    export_to_onnx(
        pipeline=best_rf,
        X_train=X,
        output_path=output_path,
        schema_meta={
            "model_name": "pipeline_01_resident_risk_rf",
            "version": "1.0",
            "output_tensors": [
                {
                    "name": "label",
                    "dtype": "int64",
                    "shape": ["N"],
                    "description": "Predicted high_risk_flag (0=low_medium_risk, 1=high_critical_risk)",
                    "classes": [0, 1],
                    "class_meanings": ["low_medium_risk", "high_critical_risk"],
                },
                {
                    "name": "probabilities",
                    "dtype": "float32",
                    "shape": ["N", 2],
                    "description": "Class probabilities [P(low_medium), P(high_critical)]",
                },
            ],
        },
    )

    print("  Verifying ONNX round-trip...")
    verified = verify_onnx(
        onnx_path=output_path,
        sklearn_pipeline=best_rf,
        X_test=X,
        atol=0.02,
        is_classifier=True,
    )

    if not verified:
        print("  WARNING: ONNX verification failed — keeping model but flagging.")

    # ------------------------------------------------------------------
    # 4. Collate and log metrics
    # ------------------------------------------------------------------
    all_metrics = {**rf_metrics, **lr_metrics, "onnx_verified": verified}
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
        print(f"    {k}: {v}")
