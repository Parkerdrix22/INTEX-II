# IS455 Notebook Setup (Postgres Source of Truth)

This folder contains `dataAnalysis.ipynb`, which **loads data from PostgreSQL** (schema `lighthouse`) and performs EDA.  
CSV files are **not** used by the notebook.

## Prereqs

- Python 3
- Postgres is reachable (example: AWS RDS)

## 1) Create/activate the virtual environment

From the repo root:

```bash
cd is455
# If .venv already exists, you can skip creating it.
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

## 2) Configure database connection

Edit `is455/.env` (already formatted for Postgres). Example:

```env
PGHOST=your-host
PGDATABASE=postgres
PGUSER=postgres
PGPASSWORD=your-password
PGPORT=5432
PGSSLMODE=require
```

Notes:
- Most managed Postgres (including RDS) requires SSL; `PGSSLMODE=require` enables it.
- The notebook auto-loads env vars from `is455/.env` (and will also find `.env` if you move it).

## 3) Start Jupyter and run the notebook

```bash
cd is455
source .venv/bin/activate
jupyter notebook
```

Open `dataAnalysis.ipynb` and run cells top-to-bottom.

## Troubleshooting

- **Can’t connect to Postgres**
  - Verify `PGHOST/PGPORT/PGDATABASE/PGUSER/PGPASSWORD` in `is455/.env`
  - Check network/VPC/security group rules for your DB host
- **`lighthouse` schema not found**
  - Import/load the dataset into Postgres first (the notebook expects tables under schema `lighthouse`)
- **Wrong Python environment in Jupyter**
  - Start Jupyter only after `source .venv/bin/activate`
  - In Cursor, select the interpreter at `INTEX-II/.venv/bin/python` (repo root)

