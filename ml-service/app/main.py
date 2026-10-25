import json
import logging
import os
import secrets
import subprocess
import sys
import threading
from contextlib import asynccontextmanager
from datetime import datetime
from typing import List, Optional

import joblib
import numpy as np
import pandas as pd
import shap
from fastapi import BackgroundTasks, Depends, FastAPI, Header, HTTPException, Request, status
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("medisight-ml")

# Load paths
BASE_DIR = os.path.dirname(os.path.abspath(__file__))
MODEL_DIR = os.path.join(BASE_DIR, "..", "models", "production")
MODEL_PATH = os.path.join(MODEL_DIR, "model.joblib")
METADATA_PATH = os.path.join(MODEL_DIR, "model_metadata.json")

# The service ships exactly one trained model today (see README "honest scope").
DISEASE_SCOPE = ["Diabetes"]

# Global state for retraining status (mutated under _status_lock)
retraining_status = {
    "status": "ready",  # "ready" or "training"
    "last_run": None,
    "error": None
}
_status_lock = threading.Lock()

# Model state, loaded on startup
model = None
metadata = None
explainer = None
feature_names = []

def load_production_model():
    global model, metadata, explainer, feature_names
    if os.path.exists(MODEL_PATH) and os.path.exists(METADATA_PATH):
        try:
            model = joblib.load(MODEL_PATH)
            with open(METADATA_PATH, "r", encoding="utf-8") as f:
                metadata = json.load(f)
            feature_names = metadata["features"]

            # Initialize SHAP explainer
            explainer = shap.TreeExplainer(model)
            logger.info("Loaded production model: %s (AUC: %.4f)",
                        metadata['model_name'], metadata['metrics']['auc_roc'])
        except Exception:
            logger.exception("Error loading model artifacts")
    else:
        logger.warning(
            "Model artifact not found at %s. The service will start, but "
            "/predict and /explain return 503 until the model is trained "
            "(python model_training/train.py).", MODEL_PATH
        )

@asynccontextmanager
async def lifespan(app: FastAPI):
    if not os.environ.get("ML_SERVICE_API_KEY"):
        logger.warning(
            "ML_SERVICE_API_KEY is not set: running in DEV MODE with "
            "unauthenticated endpoints. Set ML_SERVICE_API_KEY before "
            "deploying this service anywhere reachable."
        )
    load_production_model()
    yield

app = FastAPI(
    title="WhyRisk ML Inference Service",
    description="FastAPI prediction and explainability service for early disease risk scoring.",
    version="1.0.0",
    lifespan=lifespan
)

# -- CORS -- origins are explicit and configurable. A wildcard subdomain
# entry used to sit here as a literal string; Starlette never expands
# wildcards in allow_origins, so it never matched anything.
def _allowed_origins() -> List[str]:
    raw = os.environ.get("ALLOWED_ORIGINS", "http://localhost:3000")
    return [origin.strip() for origin in raw.split(",") if origin.strip()]

app.add_middleware(
    CORSMiddleware,
    allow_origins=_allowed_origins(),
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# -- Error hygiene -- clients get a generic message; details stay in logs.
@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception):
    logger.exception("Unhandled error while handling %s %s", request.method, request.url.path)
    return JSONResponse(
        status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
        content={"detail": "Internal server error."},
    )


# -- API-key auth -------------------------------------------------------------
# Protected routes require the X-API-Key header to match ML_SERVICE_API_KEY.
# If the variable is unset the service runs in an explicit, loudly-logged dev
# mode (see lifespan) so local development and tests keep working.
def require_api_key(x_api_key: Optional[str] = Header(default=None, alias="X-API-Key")) -> None:
    expected = os.environ.get("ML_SERVICE_API_KEY")
    if not expected:
        return  # dev mode: no key configured
    if x_api_key is None or not secrets.compare_digest(x_api_key, expected):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Invalid or missing API key.",
        )


@app.get("/")
def read_root():
    return {
        "message": "Welcome to the WhyRisk Clinical Prediction Engine API.",
        "documentation": "/docs",
        "status": "active"
    }

# Input Pydantic model. Ranges follow the BRFSS 2015 coding of each field:
# binary indicators are 0/1, GenHlth is 1-5, the *Hlth day counts are 0-30,
# Age is the BRFSS 1-13 age group, Education 1-6, Income 1-8, and BMI is
# limited to the plausible range the model was trained on. Out-of-range
# input gets a clean 422 from FastAPI instead of a nonsense score.
_BINARY = {"ge": 0.0, "le": 1.0}

class PatientFeatures(BaseModel):
    HighBP: float = Field(0.0, **_BINARY, description="1 if patient has high blood pressure, else 0")
    HighChol: float = Field(0.0, **_BINARY, description="1 if patient has high cholesterol, else 0")
    CholCheck: float = Field(1.0, **_BINARY, description="1 if checked cholesterol in last 5 years, else 0")
    BMI: float = Field(25.0, ge=10.0, le=80.0, description="Body Mass Index")
    Smoker: float = Field(0.0, **_BINARY, description="1 if smoked >= 100 cigarettes in life, else 0")
    Stroke: float = Field(0.0, **_BINARY, description="1 if patient had a stroke, else 0")
    HeartDiseaseorAttack: float = Field(0.0, **_BINARY, description="1 if coronary heart disease / MI history, else 0")
    PhysActivity: float = Field(1.0, **_BINARY, description="1 if physical activity in past 30 days, else 0")
    Fruits: float = Field(1.0, **_BINARY, description="1 if eats fruit >= 1/day, else 0")
    Veggies: float = Field(1.0, **_BINARY, description="1 if eats vegetables >= 1/day, else 0")
    HvyAlcoholConsump: float = Field(0.0, **_BINARY, description="1 if adult male >14 drinks/wk or female >7, else 0")
    AnyHealthcare: float = Field(1.0, **_BINARY, description="1 if has health coverage, else 0")
    NoDocbcCost: float = Field(0.0, **_BINARY, description="1 if could not see doc in past 12 mo due to cost, else 0")
    GenHlth: float = Field(3.0, ge=1.0, le=5.0, description="Self-reported health (1=excellent, 5=poor)")
    MentHlth: float = Field(0.0, ge=0.0, le=30.0, description="Number of bad mental health days in past 30 days")
    PhysHlth: float = Field(0.0, ge=0.0, le=30.0, description="Number of bad physical health days in past 30 days")
    DiffWalk: float = Field(0.0, **_BINARY, description="1 if serious difficulty walking/climbing stairs, else 0")
    Sex: float = Field(1.0, **_BINARY, description="1 for Male, 0 for Female")
    Age: float = Field(5.0, ge=1.0, le=13.0, description="BRFSS age group (1-13 scale)")
    Education: float = Field(5.0, ge=1.0, le=6.0, description="Education level (1-6 scale)")
    Income: float = Field(6.0, ge=1.0, le=8.0, description="Income scale (1-8 scale)")

# Response models
class PredictionResponse(BaseModel):
    probability: float  # the model's predict_proba probability of the positive class
    prediction: int
    severity: str
    # Probability the model assigns to the predicted class, max(p, 1-p),
    # derived directly from predict_proba. It is NOT a calibrated accuracy
    # estimate; see the README API contract.
    confidence: float
    model_version: str

class ExplanationResponse(BaseModel):
    shap_values: dict
    base_value: float
    clinical_explanation: str

def get_severity(prob: float) -> str:
    if prob < 0.2:
        return "Low"
    elif prob < 0.5:
        return "Moderate"
    elif prob < 0.8:
        return "High"
    else:
        return "Critical"

def predicted_class_probability(prob: float) -> float:
    """Probability the model assigns to the class it predicted.

    Derived directly from predict_proba: max(p, 1 - p). This replaces the
    old hand-written margin formula; the value is the model's own output
    probability for the predicted class, not an accuracy estimate.
    """
    return float(max(prob, 1.0 - prob))

def generate_text_explanation(shap_dict, inputs: PatientFeatures) -> str:
    # Sort features by absolute contribution
    sorted_features = sorted(shap_dict.items(), key=lambda x: abs(x[1]), reverse=True)

    positive_drivers = []
    negative_drivers = []

    # Map raw features to patient-friendly terminology
    feature_labels = {
        "HighBP": "High Blood Pressure",
        "HighChol": "High Cholesterol",
        "BMI": f"BMI of {inputs.BMI}",
        "Age": "Age category",
        "GenHlth": f"General Health rating ({int(inputs.GenHlth)}/5)",
        "Smoker": "Smoking history",
        "Stroke": "Stroke history",
        "HeartDiseaseorAttack": "Heart disease history",
        "PhysActivity": "Lack of regular exercise" if inputs.PhysActivity == 0 else "Regular physical activity",
        "MentHlth": "Elevated stress/mental health days",
        "PhysHlth": "Elevated poor physical health days",
        "DiffWalk": "Difficulty walking/mobility issues",
        "HvyAlcoholConsump": "Heavy alcohol consumption"
    }

    for feat, val in sorted_features[:4]:
        label = feature_labels.get(feat, feat.replace("_", " "))
        if val > 0.01:
            positive_drivers.append(label)
        elif val < -0.01:
            negative_drivers.append(label)

    explanation_parts = []
    if positive_drivers:
        explanation_parts.append(f"risk is elevated primarily due to {', '.join(positive_drivers)}")
    if negative_drivers:
        explanation_parts.append(f"risk is mitigated by {', '.join(negative_drivers)}")

    if explanation_parts:
        text = "Patient's Diabetes " + " and ".join(explanation_parts) + "."
    else:
        text = "Diabetes risk is within standard range with no abnormal indicators."

    return text

def _features_frame(payload: PatientFeatures) -> pd.DataFrame:
    data_dict = {feat: [getattr(payload, feat)] for feat in feature_names}
    return pd.DataFrame(data_dict)

@app.post("/predict", response_model=PredictionResponse, dependencies=[Depends(require_api_key)])
def predict(payload: PatientFeatures):
    if model is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model is not loaded. Please train first."
        )

    df = _features_frame(payload)

    # Predict probability -- the risk score IS the model's probability.
    prob = float(model.predict_proba(df)[0, 1])
    pred = int(model.predict(df)[0])

    return PredictionResponse(
        probability=prob,
        prediction=pred,
        severity=get_severity(prob),
        confidence=predicted_class_probability(prob),
        model_version=metadata.get("version", "1.0.0")
    )

@app.post("/explain", response_model=ExplanationResponse, dependencies=[Depends(require_api_key)])
def explain(payload: PatientFeatures):
    if model is None or explainer is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="Model or SHAP explainer is not loaded."
        )

    df = _features_frame(payload)

    # Compute SHAP values
    shap_vals = explainer(df)

    # In newer SHAP versions, shap_vals is an Explanation object.
    # The values shape is (samples, features, classes) for binary classifiers
    # with 2 class outputs, or (samples, features) for a single output.
    if len(shap_vals.values.shape) == 3:  # Binary classifier with 2 class outputs
        raw_shap = shap_vals.values[0, :, 1].tolist()  # Class 1 (positive case)
        base_val = float(shap_vals.base_values[0, 1])
    else:  # Single output probability/logit
        raw_shap = shap_vals.values[0].tolist()
        base_val = float(shap_vals.base_values[0])

    # Map back to feature names
    shap_dict = {feat: float(val) for feat, val in zip(feature_names, raw_shap)}

    # Generate textual explanation summary
    explanation_text = generate_text_explanation(shap_dict, payload)

    return ExplanationResponse(
        shap_values=shap_dict,
        base_value=base_val,
        clinical_explanation=explanation_text
    )

def _set_retraining_status(**updates) -> None:
    with _status_lock:
        retraining_status.update(updates)

def run_retraining_background():
    _set_retraining_status(status="training", error=None)

    try:
        script_path = os.path.join(BASE_DIR, "..", "model_training", "train.py")
        subprocess.run(
            [sys.executable, script_path],
            capture_output=True,
            text=True,
            check=True
        )
        # Reload model
        load_production_model()
        _set_retraining_status(status="ready", last_run=datetime.now().isoformat())
    except subprocess.CalledProcessError as e:
        # Details go to the server log only; clients see a generic message.
        logger.error("Training script failed: %s", e.stderr)
        _set_retraining_status(status="ready", error="Training script failed. See server logs.")
    except Exception:
        logger.exception("Retraining failed")
        _set_retraining_status(status="ready", error="Retraining failed. See server logs.")

@app.post("/retrain", dependencies=[Depends(require_api_key)])
def retrain(background_tasks: BackgroundTasks):
    with _status_lock:
        if retraining_status["status"] == "training":
            return {"status": "retraining already in progress"}

    background_tasks.add_task(run_retraining_background)
    return {"status": "retraining triggered asynchronously"}

@app.get("/model-status")
def model_status():
    if metadata is None:
        return {
            "status": retraining_status["status"],
            "model_loaded": False,
            "diseases": DISEASE_SCOPE,
            "error": retraining_status["error"]
        }

    return {
        "status": retraining_status["status"],
        "model_loaded": True,
        "model_name": metadata["model_name"],
        "version": metadata["version"],
        "metrics": metadata["metrics"],
        "last_trained": metadata["last_trained"],
        "diseases": DISEASE_SCOPE,
        "retraining_error": retraining_status["error"]
    }


def compute_psi(expected: np.ndarray, actual: np.ndarray, buckets: int = 10) -> float:
    """
    Compute Population Stability Index (PSI) between two probability distributions.
    PSI < 0.1: stable, 0.1-0.25: slight shift, > 0.25: significant drift.
    """
    breakpoints = np.linspace(0, 1, buckets + 1)
    expected_percents = np.histogram(expected, bins=breakpoints)[0] / len(expected)
    actual_percents = np.histogram(actual, bins=breakpoints)[0] / len(actual)

    # Avoid log(0) by clipping to tiny value
    expected_percents = np.clip(expected_percents, 1e-6, 1)
    actual_percents = np.clip(actual_percents, 1e-6, 1)

    psi = np.sum((actual_percents - expected_percents) * np.log(actual_percents / expected_percents))
    return float(round(psi, 6))


@app.get("/drift-status", dependencies=[Depends(require_api_key)])
def drift_status():
    """
    Compute feature drift (PSI) of prediction probability distribution.
    Compares the historical baseline (from training metrics) to a simulated
    recent production window using the loaded model's output probabilities.

    In production, 'actual' probabilities would come from a live predictions log.
    Here we simulate a production sample using the model on a held-out subset
    of the training data to compute a real (not mocked) PSI value.
    """
    if model is None or metadata is None:
        return {
            "available": False,
            "reason": "Model not loaded"
        }

    try:
        DATA_PATH = os.path.join(
            BASE_DIR, "..", "data",
            "diabetes-health-indicators-dataset",
            "diabetes_binary_5050split_health_indicators_BRFSS2015.csv"
        )

        if not os.path.exists(DATA_PATH):
            return {
                "available": False,
                "reason": "Training dataset not found for drift calculation",
                "current_psi": None,
                "psi_history": []
            }

        df = pd.read_csv(DATA_PATH)
        target_col = "Diabetes_binary"
        feature_cols = [col for col in df.columns if col != target_col]
        X = df[feature_cols]

        # Use first 5000 rows as reference distribution ("training window")
        X_ref = X.iloc[:5000]
        # Use rows 5000-7500 as "production window" (simulates recent data)
        X_prod = X.iloc[5000:7500]

        ref_probs = model.predict_proba(X_ref)[:, 1]
        prod_probs = model.predict_proba(X_prod)[:, 1]

        current_psi = compute_psi(ref_probs, prod_probs)
        drift_detected = current_psi > 0.10

        # Build a small historical PSI series (last 7 windows of 2500 rows each)
        psi_history = []
        window_size = 2500
        n_windows = min(7, (len(X) - 5000) // window_size)
        for i in range(n_windows):
            start = 5000 + i * window_size
            end = start + window_size
            if end > len(X):
                break
            X_win = X.iloc[start:end]
            win_probs = model.predict_proba(X_win)[:, 1]
            win_psi = compute_psi(ref_probs[:len(win_probs)], win_probs)
            from datetime import timedelta
            window_date = (datetime.now() - timedelta(days=(n_windows - i))).strftime("%b %d")
            psi_history.append({"date": window_date, "psi": win_psi})

        return {
            "available": True,
            "current_psi": current_psi,
            "drift_detected": drift_detected,
            "drift_threshold": 0.10,
            "reference_window_size": len(X_ref),
            "production_window_size": len(X_prod),
            "psi_history": psi_history,
            "model_name": metadata["model_name"],
            "computed_at": datetime.now().isoformat()
        }
    except Exception:
        logger.exception("Drift calculation failed")
        return {
            "available": False,
            "reason": "Drift calculation failed. See server logs.",
            "current_psi": None,
            "psi_history": []
        }
