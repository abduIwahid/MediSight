-- Phase 6 (2026-10-25): read the critical-alert webhook settings from
-- Supabase Vault instead of app.settings.* GUCs. On hosted Supabase the
-- app.settings.* parameters cannot be set through the SQL API
-- (42501 permission denied — platform-reserved), while Vault secrets can.
-- The GUC reads and the local-dev fallbacks are kept as a second layer.

CREATE OR REPLACE FUNCTION public.notify_critical_prediction()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  edge_function_url text;
  service_role_key text;
  request_body jsonb;
BEGIN
  IF NEW.severity = 'Critical' THEN
    -- Build the JSON payload
    request_body := jsonb_build_object(
      'prediction_id', NEW.id,
      'patient_id', NEW.patient_id
    );

    -- Settings come from Vault first, then app.settings.* GUCs,
    -- then local dev defaults.
    edge_function_url := coalesce(
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'edge_function_base_url' LIMIT 1),
      current_setting('app.settings.edge_function_base_url', true),
      'http://host.docker.internal:54321/functions/v1'
    ) || '/send-alert';

    service_role_key := coalesce(
      (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'service_role_key' LIMIT 1),
      current_setting('app.settings.service_role_key', true),
      'LOCAL_SERVICE_ROLE_KEY'
    );

    -- Dispatch asynchronous HTTP POST request via pg_net
    PERFORM net.http_post(
      url := edge_function_url,
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || service_role_key
      ),
      body := request_body
    );
  END IF;

  RETURN NEW;
END;
$$;

-- Trigger unchanged from 20260723143100_critical_alert_webhook
DROP TRIGGER IF EXISTS trigger_notify_critical_prediction ON public.predictions;
CREATE TRIGGER trigger_notify_critical_prediction
AFTER INSERT ON public.predictions
FOR EACH ROW
EXECUTE FUNCTION public.notify_critical_prediction();
