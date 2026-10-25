"""Make the API test suite self-sufficient on a fresh clone.

The production model artifact (models/production/) is gitignored, so a
fresh clone has no model and the API tests used to fail with 503s. This
session fixture trains a tiny LightGBM model on synthetic BRFSS-shaped
data when -- and only when -- no artifact exists, and writes it to the
same location the app loads from. A real artifact produced by
model_training/train.py is never touched.
"""

import json
import os
from datetime import datetime

import joblib
import numpy as np
import pandas as pd
import pytest

BASE_DIR = os.path.join(os.path.dirname(__file__), "..")
MODEL_DIR = os.path.join(BASE_DIR, "models", "production")
MODEL_PATH = os.path.join(MODEL_DIR, "model.joblib")
METADATA_PATH = os.path.join(MODEL_DIR, "model_metadata.json")

# The 21 BRFSS 2015 features, in dataset column order.
FEATURES = [
    "HighBP", "HighChol", "CholCheck", "BMI", "Smoker", "Stroke",
    "HeartDiseaseorAttack", "PhysActivity", "Fruits", "Veggies",
    "HvyAlcoholConsump", "AnyHealthcare", "NoDocbcCost", "GenHlth",
    "MentHlth", "PhysHlth", "DiffWalk", "Sex", "Age", "Education",
    "Income",
]


def _synthetic_brfss(n: int = 4000, seed: int = 42) -> pd.DataFrame:
    """Synthetic data with a genuinely learnable diabetes-risk signal."""
    rng = np.random.default_rng(seed)

    def bern(p):
        return rng.binomial(1, p, n).astype(float)

    data = {
        "HighBP": bern(0.42),
        "HighChol": bern(0.42),
        "CholCheck": bern(0.94),
        "BMI": np.clip(rng.normal(28.5, 6.0, n), 14, 55),
        "Smoker": bern(0.44),
        "Stroke": bern(0.04),
        "HeartDiseaseorAttack": bern(0.09),
        "PhysActivity": bern(0.75),
        "Fruits": bern(0.63),
        "Veggies": bern(0.80),
        "HvyAlcoholConsump": bern(0.06),
        "AnyHealthcare": bern(0.95),
        "NoDocbcCost": bern(0.09),
        "GenHlth": rng.choice([1, 2, 3, 4, 5], n,
                              p=[0.18, 0.30, 0.29, 0.15, 0.08]).astype(float),
        "MentHlth": np.clip(rng.poisson(3.5, n), 0, 30).astype(float),
        "PhysHlth": np.clip(rng.poisson(4.3, n), 0, 30).astype(float),
        "DiffWalk": bern(0.16),
        "Sex": bern(0.45),
        "Age": rng.integers(1, 14, n).astype(float),
        "Education": rng.integers(1, 7, n).astype(float),
        "Income": rng.integers(1, 9, n).astype(float),
    }
    df = pd.DataFrame(data)[FEATURES]

    logit = (
        -3.4
        + 0.95 * df["HighBP"]
        + 0.75 * df["HighChol"]
        + 0.30 * df["CholCheck"]
        + 0.10 * (df["BMI"] - 25)
        + 0.55 * df["Smoker"]
        + 0.90 * df["Stroke"]
        + 1.00 * df["HeartDiseaseorAttack"]
        - 0.55 * df["PhysActivity"]
        - 0.15 * df["Fruits"]
        - 0.15 * df["Veggies"]
        + 0.35 * df["HvyAlcoholConsump"]
        - 0.10 * df["AnyHealthcare"]
        + 0.20 * df["NoDocbcCost"]
        + 0.55 * (df["GenHlth"] - 1)
        + 0.03 * df["MentHlth"]
        + 0.05 * df["PhysHlth"]
        + 0.80 * df["DiffWalk"]
        + 0.10 * df["Sex"]
        + 0.28 * df["Age"]
        - 0.08 * df["Education"]
        - 0.10 * df["Income"]
    )
    prob = 1.0 / (1.0 + np.exp(-logit))
    df["Diabetes_binary"] = rng.binomial(1, prob).astype(float)
    return df


def _train_fixture_model() -> None:
    from lightgbm import LGBMClassifier
    from sklearn.metrics import (accuracy_score, f1_score, precision_score,
                                 recall_score, roc_auc_score)
    from sklearn.model_selection import train_test_split

    df = _synthetic_brfss()
    X = df[FEATURES]
    y = df["Diabetes_binary"]
    X_train, X_test, y_train, y_test = train_test_split(
        X, y, test_size=0.2, random_state=42, stratify=y
    )
    clf = LGBMClassifier(n_estimators=60, random_state=42, verbose=-1)
    clf.fit(X_train, y_train)

    y_pred = clf.predict(X_test)
    y_prob = clf.predict_proba(X_test)[:, 1]
    metrics = {
        "accuracy": float(accuracy_score(y_test, y_pred)),
        "precision": float(precision_score(y_test, y_pred)),
        "recall": float(recall_score(y_test, y_pred)),
        "f1_score": float(f1_score(y_test, y_pred)),
        "auc_roc": float(roc_auc_score(y_test, y_prob)),
    }
    metadata = {
        "model_name": "LightGBM",
        "features": FEATURES,
        "metrics": metrics,
        "last_trained": datetime.now().isoformat(),
        "version": "test-fixture",
    }

    os.makedirs(MODEL_DIR, exist_ok=True)
    joblib.dump(clf, MODEL_PATH)
    with open(METADATA_PATH, "w", encoding="utf-8") as f:
        json.dump(metadata, f, indent=4)


@pytest.fixture(scope="session", autouse=True)
def ensure_model_artifact():
    """Train the tiny fixture model iff no production artifact exists."""
    if not (os.path.exists(MODEL_PATH) and os.path.exists(METADATA_PATH)):
        _train_fixture_model()
    yield
