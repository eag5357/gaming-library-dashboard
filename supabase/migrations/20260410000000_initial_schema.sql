-- Enable required extensions
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";
CREATE EXTENSION IF NOT EXISTS "pgcrypto";
CREATE EXTENSION IF NOT EXISTS "pg_cron";
CREATE EXTENSION IF NOT EXISTS "pg_net";

-- Create Enums
CREATE TYPE platform_name_enum AS ENUM ('STEAM', 'XBOX', 'PLAYSTATION', 'NINTENDO');
CREATE TYPE sync_status_enum AS ENUM ('OK', 'AUTH_FAILED', 'RATE_LIMITED');

-- 1. linked_accounts
CREATE TABLE public.linked_accounts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_name platform_name_enum NOT NULL,
    provider_account_id VARCHAR(255) NOT NULL,
    access_token BYTEA,
    refresh_token BYTEA,
    session_cookie BYTEA,
    last_sync_at TIMESTAMPTZ,
    sync_status sync_status_enum DEFAULT 'OK',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(platform_name, provider_account_id)
);

-- 2. games (Unified Catalog)
CREATE TABLE public.games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    normalized_title VARCHAR(255) NOT NULL,
    display_title VARCHAR(255) NOT NULL,
    cover_image_url TEXT,
    igdb_id INTEGER,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create index for normalized_title
CREATE INDEX idx_games_normalized_title ON public.games(normalized_title);

-- 3. platform_games
CREATE TABLE public.platform_games (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    platform_name platform_name_enum NOT NULL,
    provider_game_id VARCHAR(255) NOT NULL,
    game_id UUID REFERENCES public.games(id) ON DELETE SET NULL,
    raw_metadata JSONB,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(platform_name, provider_game_id)
);

-- 4. play_stats
CREATE TABLE public.play_stats (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    linked_account_id UUID NOT NULL REFERENCES public.linked_accounts(id) ON DELETE CASCADE,
    platform_game_id UUID NOT NULL REFERENCES public.platform_games(id) ON DELETE CASCADE,
    playtime_minutes INTEGER DEFAULT 0,
    last_played_at TIMESTAMPTZ,
    completion_percentage FLOAT,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW(),
    UNIQUE(linked_account_id, platform_game_id)
);

-- Function to automatically update 'updated_at' columns
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Triggers for 'updated_at'
CREATE TRIGGER update_linked_accounts_modtime
    BEFORE UPDATE ON public.linked_accounts
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_games_modtime
    BEFORE UPDATE ON public.games
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_platform_games_modtime
    BEFORE UPDATE ON public.platform_games
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

CREATE TRIGGER update_play_stats_modtime
    BEFORE UPDATE ON public.play_stats
    FOR EACH ROW EXECUTE PROCEDURE update_updated_at_column();

-- Setup pg_cron to call the edge function every 6 hours (example)
-- Note: Replace 'https://<project-ref>.supabase.co/functions/v1/sync-steam' 
-- and '<anon-key>' with actual values or use secrets.
-- SELECT cron.schedule(
--   'invoke-sync-steam',
--   '0 */6 * * *',
--   $$
--     SELECT net.http_post(
--         url:='https://YOUR_PROJECT_REF.supabase.co/functions/v1/sync-steam',
--         headers:='{"Content-Type": "application/json", "Authorization": "Bearer YOUR_ANON_KEY"}'::jsonb
--     ) as request_id;
--   $$
-- );