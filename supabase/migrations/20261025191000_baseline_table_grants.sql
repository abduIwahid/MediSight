-- Phase 6 fix (2026-10-25): baseline table privileges for the API roles.
--
-- The hosted project was created with "Automatically expose new tables"
-- OFF, so no default grants exist. The migrations define RLS policies but
-- (like most Supabase projects) assume the platform's baseline grants.
-- Without them, policy subqueries that touch other tables fail:
-- e.g. the profiles directory policy reads `doctors`, so EVERY profiles
-- SELECT by an authenticated user died with 42501 "permission denied for
-- table doctors" — which surfaced in the app as the login portal
-- flip-flopping ("registered as a Patient" / "registered as a Doctor")
-- because the profile fetch returned nothing.
--
-- Posture: grants are the coarse layer, RLS remains the authorization
-- layer (every public table has RLS enabled with policies; a grant
-- without a matching policy still exposes zero rows).

GRANT USAGE ON SCHEMA public TO anon, authenticated, service_role;

GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated, service_role;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO anon;

GRANT USAGE, SELECT ON ALL SEQUENCES IN SCHEMA public TO authenticated, service_role;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO authenticated, service_role;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT SELECT ON TABLES TO anon;
ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  GRANT USAGE, SELECT ON SEQUENCES TO authenticated, service_role;
