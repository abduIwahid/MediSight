"""Security and validation tests for the ML service (Phase 2).

Covers API-key auth (and the explicit dev mode when no key is configured),
BRFSS range validation on the prediction inputs, and the rule that 500
responses never leak internal exception text to clients.
"""

import os
import sys

import pytest
from fastapi.testclient import TestClient

sys.path.append(os.path.join(os.path.dirname(__file__), ".."))
import app.main as main_module
from app.main import app

API_KEY = "<MASKED_SECRET_001>"


@pytest.fixture
def sample_payload():
    return {
        "HighBP": 1.0, "HighChol": 1.0, "CholCheck": 1.0,
        "BMI": 30.0, "Smoker": 1.0, "Stroke": 0.0,
        "HeartDiseaseorAttack": 1.0, "PhysActivity": 0.0,
        "Fruits": 0.0, "Veggies": 1.0, "HvyAlcoholConsump": 0.0,
        "AnyHealthcare": 1.0, "NoDocbcCost": 0.0, "GenHlth": 4.0,
        "MentHlth": 10.0, "PhysHlth": 15.0, "DiffWalk": 1.0,
        "Sex": 1.0, "Age": 9.0, "Education": 4.0, "Income": 5.0
    }


@pytest.fixture
def client():
    with TestClient(app) as c:
        yield c


@pytest.fixture
def keyed_client(monkeypatch):
    """Client with ML_SERVICE_API_KEY configured (auth enforced)."""
    monkeypatch.setenv("ML_SERVICE_API_KEY", API_KEY)
    with TestClient(app) as c:
        yield c


# -- Auth: health and status stay open -------------------------------------

def test_health_open_without_key(keyed_client):
    assert keyed_client.get("/").status_code == 200


def test_model_status_open_without_key(keyed_client):
    response = keyed_client.get("/model-status")
    assert response.status_code == 200
    assert response.json()["diseases"] == ["Diabetes"]


# -- Auth: protected routes -------------------------------------------------

def test_predict_requires_key(keyed_client, sample_payload):
    assert keyed_client.post("/predict", json=sample_payload).status_code == 401


def test_predict_rejects_wrong_key(keyed_client, sample_payload):
    response = keyed_client.post(
        "/predict", json=sample_payload, headers={"X-API-Key": "wrong-key"}
    )
    assert response.status_code == 401


def test_predict_accepts_correct_key(keyed_client, sample_payload):
    response = keyed_client.post(
        "/predict", json=sample_payload, headers={"X-API-Key": API_KEY}
    )
    assert response.status_code == 200
    data = response.json()
    assert 0.0 <= data["probability"] <= 1.0
    # confidence is the model's probability for the predicted class
    assert data["confidence"] == pytest.approx(
        max(data["probability"], 1.0 - data["probability"])
    )


def test_explain_requires_key(keyed_client, sample_payload):
    assert keyed_client.post("/explain", json=sample_payload).status_code == 401


def test_retrain_requires_key(keyed_client):
    assert keyed_client.post("/retrain").status_code == 401


def test_drift_status_requires_key(keyed_client):
    assert keyed_client.get("/drift-status").status_code == 401


def test_dev_mode_allows_requests_without_key(client, sample_payload, monkeypatch):
    """With no key configured, the explicit dev mode serves requests."""
    monkeypatch.delenv("ML_SERVICE_API_KEY", raising=False)
    assert client.post("/predict", json=sample_payload).status_code == 200


# -- Input validation (clean 422s, no nonsense scores) ----------------------

@pytest.mark.parametrize("field,value", [
    ("BMI", 500.0), ("BMI", 5.0),
    ("Age", 99.0), ("Age", 0.0),
    ("HighBP", 2.0), ("Sex", -1.0),
    ("GenHlth", 0.0), ("GenHlth", 6.0),
    ("MentHlth", 31.0), ("PhysHlth", -1.0),
    ("Education", 7.0), ("Income", 9.0),
])
def test_out_of_range_inputs_get_422(client, sample_payload, field, value):
    payload = {**sample_payload, field: value}
    response = client.post("/predict", json=payload)
    assert response.status_code == 422


def test_boundary_inputs_are_accepted(client, sample_payload):
    for field, value in [("BMI", 10.0), ("BMI", 80.0), ("Age", 1.0),
                         ("Age", 13.0), ("GenHlth", 1.0), ("GenHlth", 5.0),
                         ("MentHlth", 0.0), ("MentHlth", 30.0)]:
        payload = {**sample_payload, field: value}
        assert client.post("/predict", json=payload).status_code == 200


# -- Error hygiene: 500s are generic ----------------------------------------

class _ExplodingModel:
    def predict_proba(self, df):
        raise RuntimeError("boom-internal-detail-12345")

    def predict(self, df):
        raise RuntimeError("boom-internal-detail-12345")


def test_500_response_does_not_leak_exception_text(monkeypatch, sample_payload):
    with TestClient(app, raise_server_exceptions=False) as c:
        monkeypatch.setattr(main_module, "model", _ExplodingModel())
        response = c.post("/predict", json=sample_payload)
    assert response.status_code == 500
    assert response.json()["detail"] == "Internal server error."
    assert "boom-internal-detail-12345" not in response.text
