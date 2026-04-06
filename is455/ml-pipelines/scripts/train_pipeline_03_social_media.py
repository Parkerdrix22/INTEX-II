"""
Pipeline 3: Social Media Engagement Prediction
Business question: What post characteristics drive higher engagement,
and does campaign-linked content translate to donations vs just likes?

Target: engagement_rate (continuous regression)
Model: GradientBoostingRegressor (predictive) + LinearRegression (explanatory)
N: ~812 social_media_posts rows — largest, cleanest dataset. Start here.
"""

import sys
from pathlib import Path
import numpy as np
import pandas as pd
from sklearn.compose import ColumnTransformer
from sklearn.ensemble import GradientBoostingRegressor
from sklearn.impute import SimpleImputer
from sklearn.linear_model import LinearRegression
from sklearn.metrics import mean_absolute_error, mean_squared_error, r2_score
from sklearn.model_selection import GridSearchCV, KFold, cross_val_score, train_test_split
from sklearn.pipeline import Pipeline
from sklearn.preprocessing import OneHotEncoder, StandardScaler

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from utils.db_loader import load_table
from utils.onnx_exporter import export_to_onnx, verify_onnx
from utils.metrics_logger import log_metrics

PIPELINE_NAME = "pipeline_03_social_media"


def load_data(engine) -> pd.DataFrame:
    posts = load_table(engine, "social_media_posts")
    donations = load_table(engine, "donations")

    # Donation attribution: sum of estimated_value referred by each post
    if "referral_post_id" in donations.columns:
        attribution = (
            donations[donations["referral_post_id"].notna()]
            .groupby("referral_post_id")
            .agg(
                referred_donations_count=("donation_id", "count"),
                referred_donation_value=("estimated_value", "sum"),
            )
            .reset_index()
            .rename(columns={"referral_post_id": "post_id"})
        )
        posts = posts.merge(attribution, on="post_id", how="left")
        posts["referred_donations_count"] = posts["referred_donations_count"].fillna(0)
        posts["referred_donation_value"] = posts["referred_donation_value"].fillna(0)
        posts["drove_donation"] = (posts["referred_donations_count"] > 0).astype(int)
    else:
        posts["referred_donations_count"] = 0
        posts["referred_donation_value"] = 0.0
        posts["drove_donation"] = 0

    return posts


def _engineer_features(df: pd.DataFrame) -> tuple[pd.DataFrame, pd.Series]:
    # Drop rows missing the target
    df = df.dropna(subset=["engagement_rate"]).copy()

    # Drop high-missingness columns (>85% null)
    high_miss_cols = [
        "watch_time_seconds", "avg_view_duration_seconds",
        "subscriber_count_at_post", "forwards",
    ]
    df = df.drop(columns=[c for c in high_miss_cols if c in df.columns])

    # Derived features (in pandas — FunctionTransformer not ONNX-safe)
    df["log_follower_count"] = np.log1p(df["follower_count_at_post"].fillna(0))
    df["is_weekend"] = df["day_of_week"].isin(["Saturday", "Sunday"]).astype(int)
    df["has_campaign"] = df["campaign_name"].notna().astype(int)

    # Cast boolean-like columns to int
    bool_cols = ["has_call_to_action", "features_resident_story", "is_boosted"]
    for col in bool_cols:
        if col in df.columns:
            df[col] = df[col].map({True: 1, False: 0, "True": 1, "False": 0}).fillna(0).astype(int)

    # Feature sets
    base_numeric = [
        "caption_length", "num_hashtags", "mentions_count", "post_hour",
        "log_follower_count", "is_boosted", "has_call_to_action",
        "features_resident_story", "is_weekend", "has_campaign",
    ]
    categorical_features = [
        "platform", "post_type", "media_type", "content_topic",
        "sentiment_tone", "day_of_week",
    ]

    base_numeric = [c for c in base_numeric if c in df.columns]
    categorical_features = [c for c in categorical_features if c in df.columns]

    # One-hot encode categoricals in pandas (ONNX-safe: no string columns in pipeline)
    dummies = pd.get_dummies(df[categorical_features], columns=categorical_features, dtype=float)
    X = pd.concat([df[base_numeric].reset_index(drop=True), dummies.reset_index(drop=True)], axis=1)
    y = df["engagement_rate"].astype(float).reset_index(drop=True)

    all_numeric_features = list(X.columns)
    return X, y, all_numeric_features, []  # no categorical features for pipeline


def build_pipeline(X_train, y_train, numeric_features, categorical_features) -> Pipeline:
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

    model = GradientBoostingRegressor(
        n_estimators=200,
        max_depth=3,
        learning_rate=0.05,
        subsample=0.8,
        random_state=42,
    )

    pipeline = Pipeline([("preprocessor", preprocessor), ("model", model)])
    pipeline.fit(X_train, y_train)
    return pipeline


def _tune_hyperparameters(pipeline, X_train, y_train) -> Pipeline:
    param_grid = {
        "model__n_estimators": [100, 200, 300],
        "model__max_depth": [2, 3, 4],
        "model__learning_rate": [0.01, 0.05, 0.1],
    }
    cv = KFold(n_splits=5, shuffle=True, random_state=42)
    search = GridSearchCV(
        pipeline, param_grid, cv=cv, scoring="r2", n_jobs=-1, verbose=0
    )
    search.fit(X_train, y_train)
    print(f"  Best params: {search.best_params_}")
    print(f"  Best CV R²: {search.best_score_:.4f}")
    return search.best_estimator_


def evaluate(pipeline, X_test, y_test) -> dict:
    preds = pipeline.predict(X_test)
    rmse = mean_squared_error(y_test, preds) ** 0.5
    mae = mean_absolute_error(y_test, preds)
    r2 = r2_score(y_test, preds)
    baseline_rmse = mean_squared_error(y_test, [y_test.mean()] * len(y_test)) ** 0.5

    metrics = {
        "r2": round(r2, 4),
        "rmse": round(rmse, 6),
        "mae": round(mae, 6),
        "baseline_rmse": round(baseline_rmse, 6),
        "rmse_vs_baseline_pct": round((rmse / baseline_rmse) * 100, 1),
        "n_test": len(y_test),
    }
    print(f"  R²: {r2:.4f}  RMSE: {rmse:.6f}  MAE: {mae:.6f}")
    print(f"  Baseline RMSE: {baseline_rmse:.6f}  ({metrics['rmse_vs_baseline_pct']}% of baseline)")
    return metrics


def train(engine, models_dir: Path) -> dict:
    print("\n[Pipeline 3] Social Media Engagement Prediction")

    print("  Loading data...")
    df = load_data(engine)
    print(f"  Loaded {len(df)} posts.")

    X, y, numeric_features, categorical_features = _engineer_features(df)
    print(f"  Features: {len(X.columns)} ({len(numeric_features)} numeric, {len(categorical_features)} categorical)")
    print(f"  Target range: [{y.min():.4f}, {y.max():.4f}], mean={y.mean():.4f}")

    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42
    )

    print("  Tuning hyperparameters (GradientBoostingRegressor)...")
    base_pipeline = build_pipeline(X_train, y_train, numeric_features, categorical_features)
    pipeline = _tune_hyperparameters(base_pipeline, X_train, y_train)

    print("  Evaluating on test set...")
    metrics = evaluate(pipeline, X_test, y_test)

    output_path = models_dir / "pipeline_03_social_media_gbr.onnx"
    print("  Exporting to ONNX...")

    # ONNX requires all-numeric input — convert categoricals with the fitted preprocessor
    # We pass X_train as the reference for shape/schema
    export_to_onnx(
        pipeline=pipeline,
        X_train=X_train,
        output_path=output_path,
        schema_meta={
            "model_name": "pipeline_03_social_media_gbr",
            "output_tensors": [
                {
                    "name": "variable",
                    "dtype": "float32",
                    "shape": ["N", 1],
                    "description": "Predicted engagement_rate",
                }
            ],
        },
    )

    print("  Verifying ONNX round-trip...")
    verified = verify_onnx(
        onnx_path=output_path,
        sklearn_pipeline=pipeline,
        X_test=X_test,
        atol=0.02,
        is_classifier=False,
    )
    metrics["onnx_verified"] = verified

    if not verified:
        print("  WARNING: ONNX verification failed — keeping model but flagging.")

    return metrics


if __name__ == "__main__":
    from utils.db_loader import get_engine
    engine = get_engine()
    models_dir = ROOT / "models"
    models_dir.mkdir(exist_ok=True)
    train(engine, models_dir)
