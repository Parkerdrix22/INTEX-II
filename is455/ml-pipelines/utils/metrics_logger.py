"""
Shared metrics logging for nightly retraining runs.
Writes per-pipeline metrics to ml-pipelines/models/training_metrics.json.
"""

import json
import time
from datetime import datetime, timezone
from pathlib import Path


METRICS_FILE = Path(__file__).parent.parent / "models" / "training_metrics.json"


def log_metrics(pipeline_name: str, metrics: dict, status: str = "success") -> None:
    """
    Append or update metrics for a pipeline in training_metrics.json.

    Args:
        pipeline_name: Identifier string (e.g., "pipeline_03_social_media").
        metrics: Dict of {metric_name: value} to record.
        status: "success" | "failed" | "skipped"
    """
    METRICS_FILE.parent.mkdir(parents=True, exist_ok=True)

    if METRICS_FILE.exists():
        with open(METRICS_FILE) as f:
            all_metrics = json.load(f)
    else:
        all_metrics = {}

    all_metrics[pipeline_name] = {
        "status": status,
        "trained_at": datetime.now(timezone.utc).isoformat(),
        "metrics": metrics,
    }

    with open(METRICS_FILE, "w") as f:
        json.dump(all_metrics, f, indent=2)

    print(f"  Metrics logged for {pipeline_name}: {metrics}")
