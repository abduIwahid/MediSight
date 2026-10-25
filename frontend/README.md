# MediSight frontend

Next.js 14 (App Router) + Tailwind CSS + shadcn/ui. This folder is the
web app: auth flows, role-based dashboards (patient / doctor / admin),
and the server-side API routes under `src/app/api/` that call the ML
service and Supabase.

For the full picture - architecture, the model, and setup for all three
parts of the project - see the [root README](../README.md).

## Develop

```bash
cp .env.example .env.local   # fill in real values; never commit .env.local
npm install
npm run dev                  # http://localhost:3000
```

`npm run build` also runs `scripts/fix-vercel-manifests.cjs` as a
postbuild step. Dev-only helper scripts live in `scripts/dev/`.
