"""Download the BRFSS 2015 training dataset from its canonical source.

The model trains on `diabetes_binary_5050split_health_indicators_BRFSS2015.csv`,
the balanced 50/50 file from the "Diabetes Health Indicators" dataset
(CDC BRFSS 2015). That file is a derivative: the canonical source is the
UCI Machine Learning Repository dataset 891, "CDC Diabetes Health
Indicators", whose data.csv holds all 253,680 survey rows.

This script downloads the UCI file (no account, no Kaggle login) and
re-derives the 50/50 split deterministically:

    all 35,346 positive rows + 35,346 negative rows sampled with
    seed 42, shuffled with seed 42  =  70,692 rows

Note: the original Kaggle upload used its own sampling, so the derived
file is not byte-identical to it -- but it is the same population, the
same balance, and the same size, drawn from the canonical source.

Usage:
    python model_training/fetch_dataset.py [--force]

The dataset is written to the path train.py expects:
    ml-service/data/diabetes-health-indicators-dataset/
        diabetes_binary_5050split_health_indicators_BRFSS2015.csv
(data/ is gitignored -- the dataset is never committed.)
"""

import os
import sys
import urllib.request

import pandas as pd

UCI_DATA_URL = "https://archive.ics.uci.edu/static/public/891/data.csv"
EXPECTED_ROWS = 253_680
EXPECTED_POSITIVES = 35_346
SEED = 42

BASE_DIR = os.path.dirname(os.path.abspath(__file__))
TARGET_PATH = os.path.join(
    BASE_DIR,
    "..",
    "data",
    "diabetes-health-indicators-dataset",
    "diabetes_binary_5050split_health_indicators_BRFSS2015.csv",
)

FEATURE_COLUMNS = [
    "HighBP", "HighChol", "CholCheck", "BMI", "Smoker", "Stroke",
    "HeartDiseaseorAttack", "PhysActivity", "Fruits", "Veggies",
    "HvyAlcoholConsump", "AnyHealthcare", "NoDocbcCost", "GenHlth",
    "MentHlth", "PhysHlth", "DiffWalk", "Sex", "Age", "Education",
    "Income",
]


def main() -> int:
    force = "--force" in sys.argv
    target = os.path.normpath(TARGET_PATH)
    if os.path.exists(target) and not force:
        print(f"Dataset already present at {target} (use --force to re-derive).")
        return 0

    print(f"Downloading {UCI_DATA_URL} ...")
    tmp_path = target + ".download"
    os.makedirs(os.path.dirname(target), exist_ok=True)
    urllib.request.urlretrieve(UCI_DATA_URL, tmp_path)

    df = pd.read_csv(tmp_path)
    os.remove(tmp_path)

    missing = [c for c in ["Diabetes_binary"] + FEATURE_COLUMNS if c not in df.columns]
    if missing:
        print(f"ERROR: downloaded file is missing expected columns: {missing}")
        return 1
    if len(df) != EXPECTED_ROWS:
        print(f"ERROR: expected {EXPECTED_ROWS} rows from UCI, got {len(df)}.")
        return 1

    df = df.drop(columns=["ID"], errors="ignore")
    positives = df[df["Diabetes_binary"] == 1]
    negatives = df[df["Diabetes_binary"] == 0]
    if len(positives) != EXPECTED_POSITIVES:
        print(f"ERROR: expected {EXPECTED_POSITIVES} positive rows, got {len(positives)}.")
        return 1

    balanced = (
        pd.concat([positives, negatives.sample(n=len(positives), random_state=SEED)])
        .sample(frac=1, random_state=SEED)
        .reset_index(drop=True)
    )
    balanced.to_csv(target, index=False)
    print(f"Wrote {len(balanced)} rows (50/50 split, seed {SEED}) to {target}")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
