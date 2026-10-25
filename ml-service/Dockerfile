# MediSight ML service -- inference image.
# Build context: this directory (ml-service/), matching render.yaml.
#
# TRAIN BEFORE YOU BUILD: the image ships the trained artifact, so
# models/production/model.joblib must exist before `docker build`
# (see "ML service" in the README). The build fails loudly if the
# artifact is missing -- this service never silently serves without
# a model.
FROM python:3.12-slim

WORKDIR /app

# libgomp1 is required by LightGBM at runtime.
RUN apt-get update && apt-get install -y --no-install-recommends \
    libgomp1 \
    && rm -rf /var/lib/apt/lists/*

# Production dependencies only (no MLflow, no pytest in the image).
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Application code and the trained model artifact.
COPY app ./app
COPY models ./models

# Fail the build if training has not produced a complete artifact.
RUN test -f models/production/model.joblib \
    && test -f models/production/model_metadata.json \
    || (echo "ERROR: model artifact missing. Train first: pip install -r requirements-train.txt && python model_training/train.py" && exit 1)

# Run as a non-root user.
RUN useradd --create-home appuser && chown -R appuser:appuser /app
USER appuser

ENV PYTHONUNBUFFERED=1
EXPOSE 8000

# Fail loudly at container start too if the artifact is absent (for
# example an empty volume mounted over /app/models).
CMD ["sh", "-c", "test -f models/production/model.joblib || { echo 'FATAL: model artifact missing -- train the model before deploying (see README).'; exit 1; }; exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT:-8000}"]
