# WhyRisk

WhyRisk is a healthcare risk-prediction and clinical decision-support
platform built during a machine-learning internship at Ezitech Institute
(Eziline Software House), Islamabad (Jul-Sep 2026). It combines a Next.js
web application, a FastAPI machine-learning service, and a Supabase
(PostgreSQL) backend with row-level security.

> **Disclaimer:** WhyRisk is an experimental clinical
> decision-support and research tool. It is not a certified medical
> device and is not a substitute for professional medical diagnosis,
> treatment, or clinical judgment. Predictions must be reviewed by
> qualified healthcare professionals.

## Project status and honest scope

What is actually implemented and served today:

- **One trained model.** The ML service trains and serves a single model:
  **diabetes risk** (LightGBM, **AUC-ROC 0.8222** on a stratified
  held-out test split of the balanced 70,692-record dataset; because the
  split is 50/50 this is not comparable to performance on a real-world
  population) on the CDC BRFSS 2015 health-indicators dataset. Logistic
  Regression, Random Forest, and XGBoost were benchmarked against it,
  with MLflow experiment tracking.
- **SHAP explanations** for that model's predictions, served by the ML
  service (`/explain`), and a disclosure on each prediction of which of
  the 21 model inputs were recorded and which used documented population
  defaults.
- **A symptom checker** in the frontend that is a **rule-based
  heuristic**, and is labelled as such in the UI. It is not a trained
  model.
- **Platform features:** patient and doctor records, appointments, and
  role-based access (patient / doctor / admin) enforced by Next.js
  middleware and Supabase RLS (72 policies across the migrations).

What is **not** implemented yet: trained models for heart disease,
chronic kidney disease, stroke, liver disease, breast cancer, and
hypertension. Those six are roadmap items. The data model and parts of
the UI refer to them, but no model exists for them today.

The public demo is currently offline (the hosting projects were
removed). This repository is the source of truth.

## Architecture

```text
frontend/    Next.js 14 (App Router) + Tailwind CSS + shadcn/ui
             - browser UI, auth flows, server-side API routes (src/app/api/)
             - calls the ML service server-side; uses Supabase with the
               anon key (RLS enforced) and, in admin routes only, the
               service-role key
ml-service/  FastAPI + scikit-learn / LightGBM
             - /predict, /explain, /model-status, /drift-status, /retrain
             - loads its model artifact from models/production/
supabase/    PostgreSQL schema via migrations, RLS policies, seed SQL,
             and six Edge Functions. The Edge Functions are currently not
             invoked by the frontend - the Next.js API routes do that work.
```

## Repository layout

```text
frontend/                 Next.js app (see frontend/README.md)
frontend/src/app/         routes: (auth), (dashboard), admin-portal, api/
frontend/scripts/         build helper + dev/ data-seeding script
ml-service/app/           FastAPI application (main.py)
ml-service/model_training/  train.py, seed_db.py
ml-service/tests/         pytest suite (clinical features, API, RLS)
ml-service/data/          training dataset goes here (gitignored)
ml-service/models/        trained artifacts land here (gitignored)
supabase/migrations/      schema, RLS policies, seeds
supabase/functions/       Edge Functions (not wired to the frontend yet)
scripts/                  Windows quick-start launchers for local dev
Case Study #U2013 ML-003.pdf   the internship case study for this project
```

## The model

| | |
| --- | --- |
| Task | Diabetes risk (binary classification) |
| Dataset | CDC BRFSS 2015 - `diabetes_binary_5050split_health_indicators_BRFSS2015.csv` (50/50 split, 70,692 rows, 21 features, target `Diabetes_binary`) |
| Candidates | Logistic Regression, Random Forest, XGBoost, LightGBM |
| Selected | LightGBM - AUC-ROC 0.8222 (stratified 80/20 split, AUC on the test set) |
| Tracking | MLflow (experiment `MediSight_Diabetes_Prediction`) |
| Artifact | `ml-service/models/production/model.joblib` + `model_metadata.json` (gitignored, produced by training) |
| Explanations | SHAP values per prediction, served by `/explain` |

The 0.8222 AUC-ROC figure is for the diabetes task only. It does not
generalise to other conditions.

## Setup

Prerequisites: Node.js 18+, Python 3.11, Git. Optional: the Supabase CLI
and Docker, to run Supabase locally instead of using a hosted project.

### 1. Supabase

Create a Supabase project (or run `supabase start` locally), then apply
the migrations:

```bash
supabase link --project-ref <your-project-ref>
supabase db push
```

### 2. Environment variables

Frontend - copy the example and fill it in:

```bash
cp frontend/.env.example frontend/.env.local
```

The example lists every variable the frontend code reads: the Supabase
URL and keys, the ML service URL, the site URL used for auth redirects,
and the Gemini API key used by the AI-assistant chat route (server-side
only).

ML service - copy the example and fill it in:

```bash
cp ml-service/.env.example ml-service/.env
```

The app reads `ML_SERVICE_API_KEY` (authentication, see the API
contract below) and `ALLOWED_ORIGINS` (CORS). `DATABASE_URL` is only
used by the seeding script (Setup step 5).

### 3. ML service

```bash
cd ml-service
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt        # inference only
```

Three requirements files, all exactly pinned: `requirements.txt`
(inference), `requirements-train.txt` (adds MLflow and the seeder's
database driver, for training), `requirements-dev.txt` (adds pytest,
for the test suite).

Download and derive the dataset (no account needed - the script pulls
the canonical UCI file, dataset 891 "CDC Diabetes Health Indicators",
and derives the balanced 50/50 BRFSS 2015 CSV with a fixed seed):

```bash
pip install -r requirements-train.txt
python model_training/fetch_dataset.py
```

Manual alternative: download "Diabetes Health Indicators Dataset"
(Kaggle, BRFSS 2015) and place the CSV at
`ml-service/data/diabetes-health-indicators-dataset/diabetes_binary_5050split_health_indicators_BRFSS2015.csv`.

Train (benchmarks LR / Random Forest / XGBoost / LightGBM and writes
the best artifact to `ml-service/models/production/`):

```bash
python model_training/train.py
```

Run the API:

```bash
uvicorn app.main:app --reload --port 8000
```

Interactive docs: http://localhost:8000/docs - train first: until a
model artifact exists, `/predict` and `/explain` return 503.

Docker: the image ships the trained artifact, so train first, then
build (the build fails loudly if the artifact is missing):

```bash
cd ml-service
docker build -t medisight-ml .
docker run -p 8000:8000 -e ML_SERVICE_API_KEY=<your-key> medisight-ml
```

### 4. Frontend

```bash
cd frontend
npm install
npm run dev
```

Dev server: http://localhost:3000 - on Windows, `scripts/quickstart.bat`
and `scripts/quickstart.ps1` automate starting Supabase, the ML service,
and the frontend together.

### 5. Seed demo data (optional, development only)

With `DATABASE_URL` set (see `ml-service/.env.example`):

```bash
python ml-service/model_training/seed_db.py
```

Demo doctor accounts are seeded by the later migrations and by
`supabase/seed_doctors_via_sql_editor.sql`.

For a fuller, self-contained demo dataset (hospitals, 12 doctors,
40 patient records with vitals, diagnoses, stored risk assessments
and appointments), run `supabase/seed-demo.sql` once in the SQL Editor
after the migrations. It is synthetic demonstration data only - every
person in it is fictional - and `supabase/seed-demo-teardown.sql`
removes exactly those rows. Seed structure and distributions follow
two public synthetic Kaggle datasets ("Multi-Location Healthcare
Clinic Revenue Dataset" by Nudrat Abbas, CC0; "Synthetic Hospital
Visits and Billing Records" by Aya A Saad, MIT); all named identities
in the pack are fictional demo personas created for this project.

## API endpoints (ML service)

| Method | Endpoint | Auth | Description |
| --- | --- | --- | --- |
| GET | `/` | no | Health check |
| POST | `/predict` | API key | Diabetes risk prediction |
| POST | `/explain` | API key | SHAP explanation for a prediction |
| GET | `/model-status` | no | Loaded model and metadata |
| GET | `/drift-status` | API key | Data-drift status (PSI) |
| POST | `/retrain` | API key | Retrain the model (training environment only) |

**Authentication.** Protected endpoints require an `X-API-Key` header
matching the `ML_SERVICE_API_KEY` environment variable. If the variable
is unset, the service runs in an explicitly logged **dev mode** with no
authentication - never deploy it that way.

**Response contract for `/predict`.** `probability` is the model's own
`predict_proba` probability of diabetes - that probability is the risk
score. `confidence` is the probability the model assigns to the class it
predicted, `max(p, 1 - p)`, derived directly from `predict_proba`; it is
not a calibrated accuracy estimate. `severity` bands the probability
(Low < 0.2, Moderate < 0.5, High < 0.8, Critical otherwise).

**Inputs and errors.** Request fields are the 21 BRFSS 2015 features,
range-validated against their BRFSS coding (binary indicators 0/1,
`GenHlth` 1-5, `MentHlth`/`PhysHlth` 0-30, `Age` 1-13, `Education` 1-6,
`Income` 1-8, `BMI` 10-80); out-of-range input returns a clean 422.
Missing or wrong API key: 401. No model artifact loaded: 503 on
`/predict` and `/explain`. Unexpected failures return a generic 500 -
internal exception details are logged server-side only, never sent to
clients.

## Testing

```bash
cd ml-service
pip install -r requirements-dev.txt
pytest tests/
```

The suite is self-contained: on a fresh clone (no model artifact - it
is gitignored), a test fixture trains a tiny LightGBM model on synthetic
BRFSS-shaped data so the API tests run green without the dataset or a
production artifact. If a real artifact from `train.py` exists, it is
used instead and never overwritten. The security tests cover the API-key
contract, the input ranges, and the generic-500 rule.

## Deployment

`render.yaml` at the repo root describes the ML service as a Docker web
service built from `ml-service/` (Dockerfile in `ml-service/`). The
image contains the trained model, so run the training step before
building, and set `ML_SERVICE_API_KEY` on the host - callers (the Next.js
`/api/predict` route) must send it as the `X-API-Key` header. The
frontend deploys from `frontend/` to Vercel. Both hosting projects are
currently removed, so there is no live deployment at the moment.

## Further documentation

Additional project documents (PRD, viva notes) are archived on the
`backup-md` branch to keep `main` compact. The internship case study is
`Case Study #U2013 ML-003.pdf` in the repo root.

## License

MIT - see [LICENSE](LICENSE).

## Medical disclaimer

WhyRisk is an experimental clinical decision-support and research
platform. The predictions, risk scores, explanations, and recommendations
generated by this system should not be considered medical advice or a
definitive diagnosis. Healthcare professionals should independently
evaluate patient information and use appropriate clinical judgment before
making medical decisions. The developers and contributors are not
responsible for medical decisions, treatment outcomes, or patient harm
resulting from the use or misuse of this software.
