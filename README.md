# MediSight AI

MediSight AI is a healthcare risk-prediction and clinical decision-support
platform built during a machine-learning internship at Ezitech Institute
(Eziline Software House), Islamabad (Jul-Sep 2026). It combines a Next.js
web application, a FastAPI machine-learning service, and a Supabase
(PostgreSQL) backend with row-level security.

> **Disclaimer:** MediSight AI is an experimental clinical
> decision-support and research tool. It is not a certified medical
> device and is not a substitute for professional medical diagnosis,
> treatment, or clinical judgment. Predictions must be reviewed by
> qualified healthcare professionals.

## Project status and honest scope

What is actually implemented and served today:

- **One trained model.** The ML service trains and serves a single model:
  **diabetes risk** (LightGBM, **AUC-ROC 0.8307** on a held-out test
  split) on the CDC BRFSS 2015 health-indicators dataset. Logistic
  Regression, Random Forest, and XGBoost were benchmarked against it,
  with MLflow experiment tracking.
- **SHAP explanations** for that model's predictions, served by the ML
  service (`/explain`), plus clinical feature indicators computed in
  code: BMI classification, blood-pressure categorisation, eGFR staging,
  and cholesterol ratios.
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
| Selected | LightGBM - AUC-ROC 0.8307 (stratified 80/20 split, AUC on the test set) |
| Tracking | MLflow (experiment `MediSight_Diabetes_Prediction`) |
| Artifact | `ml-service/models/production/model.joblib` + `metadata.joblib` (gitignored, produced by training) |
| Explanations | SHAP values per prediction, served by `/explain` |

The 0.8307 AUC-ROC figure is for the diabetes task only. It does not
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

ML service - the FastAPI app itself reads no environment variables. Only
the seeding script does:

```bash
cp ml-service/.env.example ml-service/.env    # sets DATABASE_URL
```

### 3. ML service

```bash
cd ml-service
python -m venv venv
source venv/bin/activate          # Windows: venv\Scripts\activate
pip install -r requirements.txt
```

Download the dataset (Kaggle: "Diabetes Health Indicators Dataset",
BRFSS 2015) and place the CSV at:

```text
ml-service/data/diabetes-health-indicators-dataset/diabetes_binary_5050split_health_indicators_BRFSS2015.csv
```

Train (writes the artifact to `ml-service/models/production/`):

```bash
python model_training/train.py
```

Run the API:

```bash
uvicorn app.main:app --reload --port 8000
```

Interactive docs: http://localhost:8000/docs - train first: until a
model artifact exists, `/predict` and `/explain` have no model to serve.

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

## API endpoints (ML service)

| Method | Endpoint | Description |
| --- | --- | --- |
| GET | `/` | Health check |
| POST | `/predict` | Diabetes risk prediction |
| POST | `/explain` | SHAP explanation for a prediction |
| GET | `/model-status` | Loaded model and metadata |
| GET | `/drift-status` | Data-drift status |
| POST | `/retrain` | Retrain the model |

## Testing

```bash
pytest ml-service/tests/
```

The clinical-feature and RLS suites run standalone. The API tests need a
trained model artifact (Setup step 3); on a fresh clone without one they
fail, because the service has no model to load.

## Deployment

`render.yaml` at the repo root describes the ML service as a Docker web
service built from `ml-service/`. The frontend deploys from `frontend/`
to Vercel. Both hosting projects are currently removed, so there is no
live deployment at the moment.

## Further documentation

Additional project documents (PRD, viva notes) are archived on the
`backup-md` branch to keep `main` compact. The internship case study is
`Case Study #U2013 ML-003.pdf` in the repo root.

## License

MIT - see [LICENSE](LICENSE).

## Medical disclaimer

MediSight AI is an experimental clinical decision-support and research
platform. The predictions, risk scores, explanations, and recommendations
generated by this system should not be considered medical advice or a
definitive diagnosis. Healthcare professionals should independently
evaluate patient information and use appropriate clinical judgment before
making medical decisions. The developers and contributors are not
responsible for medical decisions, treatment outcomes, or patient harm
resulting from the use or misuse of this software.
