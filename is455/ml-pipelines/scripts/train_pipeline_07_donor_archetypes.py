"""
Pipeline 7: Donor Archetype Clustering

Business question: Different donors need different fundraising messaging. We
have ~60 donors with rich RFM history but no labeled segments. What natural
archetypes emerge from the data, and how should fundraisers approach each one?

Why clustering instead of LTV regression: We tried predicting next-12-month
donation amount as a regression and got chance-level performance (R² < 0).
The signal isn't there at this sample size. But UNSUPERVISED clustering doesn't
need a target — it groups donors by similarity in RFM-space. The output is
descriptive ("here are the four kinds of donors you have") rather than
predictive, which side-steps the small-N regression failure mode entirely.

Method: K-means on standardized RFM + tenure + recurring flag.
K chosen by silhouette + interpretability (K=4 gives the cleanest profiles).
Output: cluster centroids + feature scaling params + descriptive archetype
labels saved to JSON. The C# API reads this JSON and assigns archetypes at
request time — no ONNX export needed because k-means is just "find the
nearest centroid," which is trivial in any language.
"""

import json
import sys
from pathlib import Path

import numpy as np
import pandas as pd
from sklearn.cluster import KMeans
from sklearn.metrics import silhouette_score
from sklearn.preprocessing import StandardScaler

ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from utils.db_loader import get_engine, load_table  # noqa: E402
from utils.metrics_logger import log_metrics  # noqa: E402

PIPELINE_NAME = "pipeline_07_donor_archetypes"

# Feature names — order is the API contract with the C# side
FEATURE_NAMES = [
    "frequency",
    "log_monetary_total",
    "log_monetary_avg",
    "recency_days",
    "tenure_days",
    "has_recurring",
]

K = 4  # determined by silhouette + interpretability


# ---------------------------------------------------------------------------
# Feature engineering
# ---------------------------------------------------------------------------
def build_features(donations: pd.DataFrame, supporters: pd.DataFrame, today: pd.Timestamp) -> pd.DataFrame:
    """One row per donor with RFM + behavioral features."""
    donations = donations.copy()
    donations["donation_date"] = pd.to_datetime(donations["donation_date"], errors="coerce")
    donations["estimated_value"] = pd.to_numeric(donations["estimated_value"], errors="coerce").fillna(0)

    rows = []
    for _, sup in supporters.iterrows():
        sid = sup["supporter_id"]
        p = donations[donations["supporter_id"] == sid]
        if len(p) == 0:
            continue
        rows.append(
            {
                "supporter_id": int(sid),
                "frequency": float(len(p)),
                "monetary_total": float(p["estimated_value"].sum()),
                "monetary_avg": float(p["estimated_value"].mean()),
                "log_monetary_total": float(np.log1p(p["estimated_value"].sum())),
                "log_monetary_avg": float(np.log1p(p["estimated_value"].mean())),
                "recency_days": float((today - p["donation_date"].max()).days),
                "tenure_days": float(max((today - p["donation_date"].min()).days, 1)),
                "has_recurring": float(p["is_recurring"].fillna(False).any()),
            }
        )
    return pd.DataFrame(rows)


# ---------------------------------------------------------------------------
# Cluster profiling — convert centroids into descriptive archetype labels
# ---------------------------------------------------------------------------
def label_clusters(df: pd.DataFrame) -> dict[int, dict]:
    """
    Assign human-readable names to each cluster based on its centroid
    characteristics. The rules below match the K=4 archetype design we
    validated empirically. If clustering shifts (e.g. data changes shift
    centroids around), the rules degrade gracefully but may need updating.
    """
    profiles: dict[int, dict] = {}
    for c_raw in sorted(df["cluster"].unique()):
        c = int(c_raw)  # convert numpy int32 → python int for JSON
        sub = df[df["cluster"] == c_raw]
        recurring_pct = sub["has_recurring"].mean()
        mean_freq = sub["frequency"].mean()
        mean_recency = sub["recency_days"].mean()
        mean_tenure = sub["tenure_days"].mean()
        mean_total = sub["monetary_total"].mean()
        mean_avg = sub["monetary_avg"].mean()

        # Rule-based archetype assignment
        if recurring_pct >= 0.7:
            label = "The Loyal Sustainers"
            tagline = "Recurring monthly donors — the org's bread and butter"
            color = "#385f82"
            strategy = (
                "Steward fiercely. These donors are your most reliable income. "
                "Send personalized impact updates and recognize their consistency. "
                "Avoid asking them to upgrade until they're highly engaged — they "
                "already give regularly."
            )
        elif mean_tenure < 365 and mean_freq <= 2:
            label = "The New Sparks"
            tagline = "First-time donors who recently entered the funnel"
            color = "#c9983f"
            strategy = (
                "Make them feel welcome. Send a thank-you within 24 hours, share "
                "an impact story within 2 weeks, and invite them to a recurring "
                "gift after their second donation. The goal is to convert sparks "
                "into sustainers."
            )
        elif mean_recency >= 365:
            label = "The Lapsed Faithful"
            tagline = "Long-tenured donors who've gone quiet over a year ago"
            color = "#a05b3a"
            strategy = (
                "Reactivation campaign. These donors gave consistently in the past "
                "but have stopped — maybe a life event, maybe missed communication. "
                "A personal phone call or 'we miss you' email with a fresh impact "
                "story has the highest reactivation rate. Don't waste a generic "
                "appeal on them."
            )
        else:
            label = "The Active Engaged"
            tagline = "Frequent one-time donors — your largest segment"
            color = "#5f8448"
            strategy = (
                "Upgrade pathway. These donors give regularly but not on a "
                "recurring schedule. Test a 'become a sustainer' ask — converting "
                "even 20% of this segment to monthly recurring would meaningfully "
                "stabilize cash flow."
            )

        profiles[c] = {
            "cluster_id": int(c),
            "label": label,
            "tagline": tagline,
            "color": color,
            "strategy": strategy,
            "size": int(len(sub)),
            "characteristics": {
                "mean_frequency": round(mean_freq, 2),
                "mean_monetary_total": round(mean_total, 2),
                "mean_monetary_avg": round(mean_avg, 2),
                "mean_recency_days": round(mean_recency, 0),
                "mean_tenure_days": round(mean_tenure, 0),
                "recurring_pct": round(recurring_pct, 3),
            },
        }
    return profiles


# ---------------------------------------------------------------------------
# Main train()
# ---------------------------------------------------------------------------
def train(engine, models_dir: Path) -> dict:
    print("\n[Pipeline 7] Donor Archetype Clustering")

    today = pd.Timestamp("2026-04-07")  # snapshot for relative recency
    print(f"  Snapshot date: {today.date()}")

    print("  Loading data...")
    donations = load_table(engine, "donations")
    supporters = load_table(engine, "supporters")
    print(f"    donations: {len(donations)}, supporters: {len(supporters)}")

    print("  Building per-donor features...")
    df = build_features(donations, supporters, today)
    print(f"    {len(df)} donors with at least one donation")

    X = df[FEATURE_NAMES].astype(float).values
    scaler = StandardScaler()
    X_s = scaler.fit_transform(X)

    # Fit K-means
    print(f"\n  Fitting K-means (K={K}, n_init=50)...")
    km = KMeans(n_clusters=K, n_init=50, random_state=42)
    df["cluster"] = km.fit_predict(X_s)
    sil = silhouette_score(X_s, df["cluster"])
    inertia = km.inertia_
    print(f"    Silhouette: {sil:.4f}")
    print(f"    Inertia:    {inertia:.2f}")
    print(f"    Sizes:      {dict(df['cluster'].value_counts().sort_index())}")

    # Profile + label clusters
    profiles = label_clusters(df)
    print("\n  Archetype profiles:")
    for c, p in profiles.items():
        print(f"    [{c}] {p['label']:25s}  n={p['size']}  {p['tagline']}")

    # Save model artifacts (everything the C# controller needs)
    model_path = models_dir / "pipeline_07_donor_archetypes.json"
    artifact = {
        "trained_at_utc": pd.Timestamp.now("UTC").isoformat(),
        "snapshot_date": today.isoformat(),
        "n_donors": int(len(df)),
        "n_clusters": K,
        "silhouette": round(float(sil), 4),
        "inertia": round(float(inertia), 2),
        "feature_order": FEATURE_NAMES,
        "scaler": {
            "mean": [round(float(m), 6) for m in scaler.mean_.tolist()],
            "scale": [round(float(s), 6) for s in scaler.scale_.tolist()],
        },
        "centroids": [[round(float(v), 6) for v in row] for row in km.cluster_centers_.tolist()],
        "archetypes": profiles,
        "interpretation": (
            "K-means on standardized RFM + tenure + recurring flag. To assign a "
            "donor to an archetype, compute features in the order shown, "
            "standardize using (x - mean) / scale, then find the centroid with "
            "the smallest Euclidean distance."
        ),
    }
    # Convert top-level archetype keys to strings for JSON
    artifact["archetypes"] = {str(k): v for k, v in artifact["archetypes"].items()}
    model_path.write_text(json.dumps(artifact, indent=2))
    print(f"\n  Saved model artifact → {model_path.name}")

    metrics = {
        "n_donors": int(len(df)),
        "n_clusters": K,
        "silhouette": round(float(sil), 4),
        "inertia": round(float(inertia), 2),
        "cluster_sizes": [int(p["size"]) for p in profiles.values()],
        "archetype_labels": [p["label"] for p in profiles.values()],
    }
    log_metrics(PIPELINE_NAME, metrics, status="success")
    return metrics


# ---------------------------------------------------------------------------
# Standalone entry
# ---------------------------------------------------------------------------
if __name__ == "__main__":
    engine = get_engine()
    models_dir = ROOT / "models"
    models_dir.mkdir(exist_ok=True)
    metrics = train(engine, models_dir)
    print("\n  Final metrics:")
    for k, v in metrics.items():
        print(f"    {k}: {v}")
