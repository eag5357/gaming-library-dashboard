-- Enable pg_net extension to allow HTTP requests from Postgres
CREATE EXTENSION IF NOT EXISTS pg_net;

-- Enable pg_cron extension for scheduling
CREATE EXTENSION IF NOT EXISTS pg_cron;

-- Create a helper function to trigger the master sync
-- This allows us to easily test it and manage headers/secrets
CREATE OR REPLACE FUNCTION trigger_master_sync()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
DECLARE
  server_url text;
  service_role_key text;
BEGIN
  -- In a real production environment, you should use vault.get_secret()
  -- For this implementation, we expect these to be configured in the environment or passed via vault
  -- We'll try to find the service role key in the vault if it exists
  BEGIN
    SELECT decrypted_secret INTO service_role_key FROM vault.decrypted_secrets WHERE name = 'SERVICE_ROLE_KEY' LIMIT 1;
  EXCEPTION WHEN OTHERS THEN
    service_role_key := NULL;
  END;

  -- Default to local address if not in vault (useful for local testing)
  IF service_role_key IS NULL THEN
    -- Fallback/Warning: This requires the user to set the secret in Supabase Vault
    -- or we can use a placeholder that they must update.
    RAISE WARNING 'SERVICE_ROLE_KEY not found in vault.decrypted_secrets. Master sync may fail if not running locally with no auth.';
  END IF;

  -- Trigger the Edge Function via pg_net
  -- We'll try to determine the base URL. If not in vault, we'll use a placeholder.
  -- In production, the user should ensure their project reference is correct.
  PERFORM
    net.http_post(
      url := (SELECT COALESCE(
        (SELECT decrypted_secret FROM vault.decrypted_secrets WHERE name = 'API_URL' LIMIT 1),
        'http://host.docker.internal:54321' -- Local fallback
      )) || '/functions/v1/sync-all',
      headers := jsonb_build_object(
        'Content-Type', 'application/json',
        'Authorization', 'Bearer ' || COALESCE(service_role_key, '')
      ),
      body := '{}'::jsonb
    );
END;
$$;

-- Schedule the sync to run daily at 3:00 AM UTC
-- We use the function wrapper to keep the cron table clean
SELECT cron.schedule(
  'daily-platform-sync',
  '0 3 * * *',
  'SELECT trigger_master_sync();'
);
