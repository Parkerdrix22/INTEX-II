"""
Shared database utilities for all ML pipeline scripts.
Reads connection parameters from environment variables (same as is455/.env).
"""

import os
from pathlib import Path
import pandas as pd
from sqlalchemy import create_engine, text


def _find_env_file() -> Path | None:
    """Walk up from cwd looking for a .env file, up to 8 levels."""
    current = Path.cwd()
    for _ in range(8):
        candidate = current / ".env"
        if candidate.exists():
            return candidate
        candidate = current / "is455" / ".env"
        if candidate.exists():
            return candidate
        if current.parent == current:
            break
        current = current.parent
    return None


def _load_env_file(path: Path) -> None:
    """Parse a .env file and set missing environment variables."""
    with open(path) as f:
        for line in f:
            line = line.strip()
            if not line or line.startswith("#") or "=" not in line:
                continue
            key, _, value = line.partition("=")
            key = key.strip()
            value = value.strip().strip('"').strip("'")
            if key and key not in os.environ:
                os.environ[key] = value


def get_engine():
    """
    Create a SQLAlchemy engine using PGHOST/PGDATABASE/PGUSER/PGPASSWORD/PGPORT env vars.
    Auto-loads from .env if the vars are not already set.
    """
    env_path = _find_env_file()
    if env_path:
        _load_env_file(env_path)

    required = ["PGHOST", "PGDATABASE", "PGUSER", "PGPASSWORD"]
    missing = [k for k in required if not os.environ.get(k)]
    if missing:
        raise EnvironmentError(
            f"Missing required environment variables: {missing}. "
            "Set them in your .env file or environment."
        )

    host = os.environ["PGHOST"]
    database = os.environ["PGDATABASE"]
    user = os.environ["PGUSER"]
    password = os.environ["PGPASSWORD"]
    port = os.environ.get("PGPORT", "5432")
    sslmode = os.environ.get("PGSSLMODE", os.environ.get("SSLMODE", "require"))

    url = (
        f"postgresql+psycopg2://{user}:{password}@{host}:{port}/{database}"
        f"?sslmode={sslmode}"
    )
    return create_engine(url, pool_pre_ping=True)


def load_table(engine, table_name: str) -> pd.DataFrame:
    """Load a full table from the lighthouse schema."""
    return pd.read_sql(f"SELECT * FROM lighthouse.{table_name}", engine)


def run_query(engine, sql: str) -> pd.DataFrame:
    """Run an arbitrary SQL query and return a DataFrame."""
    return pd.read_sql(text(sql), engine)
