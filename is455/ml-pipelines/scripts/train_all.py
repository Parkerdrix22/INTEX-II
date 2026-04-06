"""
Nightly retraining orchestrator.
Discovers all train_pipeline_*.py scripts in this directory and runs them in sequence.
Adding a new pipeline requires only adding a new train_pipeline_NN_*.py file.

Usage:
    python ml-pipelines/scripts/train_all.py
    python ml-pipelines/scripts/train_all.py --pipeline pipeline_03_social_media
"""

import argparse
import importlib.util
import json
import subprocess
import sys
from pathlib import Path

# Make utils importable regardless of cwd
ROOT = Path(__file__).parent.parent
sys.path.insert(0, str(ROOT))

from utils.db_loader import get_engine
from utils.metrics_logger import METRICS_FILE, log_metrics

SCRIPTS_DIR = Path(__file__).parent
MODELS_DIR = ROOT / "models"


def discover_pipelines(filter_name: str | None = None) -> list[Path]:
    scripts = sorted(SCRIPTS_DIR.glob("train_pipeline_*.py"))
    if filter_name:
        scripts = [s for s in scripts if filter_name in s.stem]
    return scripts


def run_pipeline_script(script_path: Path, engine) -> bool:
    """
    Dynamically import a pipeline script and run its train() entry point.
    Each script must expose: train(engine, models_dir) -> dict (metrics)
    Returns True on success, False on failure.
    """
    pipeline_name = script_path.stem.replace("train_", "")
    print(f"\n{'='*60}")
    print(f"  Running: {script_path.name}")
    print(f"{'='*60}")

    spec = importlib.util.spec_from_file_location(script_path.stem, script_path)
    module = importlib.util.module_from_spec(spec)
    try:
        spec.loader.exec_module(module)
        metrics = module.train(engine, MODELS_DIR)
        log_metrics(pipeline_name, metrics, status="success")
        return True
    except Exception as e:
        print(f"  ERROR in {script_path.name}: {e}")
        log_metrics(pipeline_name, {"error": str(e)}, status="failed")
        return False


def main():
    parser = argparse.ArgumentParser(description="Run nightly ML pipeline retraining.")
    parser.add_argument(
        "--pipeline",
        help="Run only a specific pipeline (partial name match, e.g. 'pipeline_03')",
        default=None,
    )
    args = parser.parse_args()

    print("Connecting to PostgreSQL...")
    engine = get_engine()
    print("  Connected.\n")

    scripts = discover_pipelines(filter_name=args.pipeline)
    if not scripts:
        print(f"No pipeline scripts found matching: {args.pipeline}")
        sys.exit(1)

    print(f"Found {len(scripts)} pipeline(s) to run:")
    for s in scripts:
        print(f"  - {s.name}")

    results = {}
    for script in scripts:
        success = run_pipeline_script(script, engine)
        results[script.stem] = "success" if success else "failed"

    print(f"\n{'='*60}")
    print("  Retraining Summary")
    print(f"{'='*60}")
    for name, status in results.items():
        icon = "✓" if status == "success" else "✗"
        print(f"  {icon} {name}: {status}")

    failed = [k for k, v in results.items() if v == "failed"]
    if failed:
        print(f"\n  {len(failed)} pipeline(s) failed. Check logs above.")
        sys.exit(1)
    else:
        print(f"\n  All {len(results)} pipeline(s) completed successfully.")


if __name__ == "__main__":
    main()
