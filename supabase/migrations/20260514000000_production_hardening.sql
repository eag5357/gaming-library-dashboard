-- Production Hardening Migration
-- 1. Ensure play_stats is private (authenticated users only via linked_accounts)
DROP POLICY IF EXISTS "Allow public read access on play_stats" ON public.play_stats;

-- 2. Restrict platform_games to authenticated users
-- While not strictly sensitive, it's better not to leak library sizes to the public
DROP POLICY IF EXISTS "Allow public read access on platform_games" ON public.platform_games;
CREATE POLICY "Authenticated users can view platform_games" 
ON public.platform_games FOR SELECT 
TO authenticated 
USING (true);

-- 3. Ensure games catalog is public read-only (standard for unified catalogs)
-- This is already set but we reinforce it here
ALTER TABLE public.games ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Allow public read access on games" ON public.games;
CREATE POLICY "Allow public read access on games" 
ON public.games FOR SELECT 
USING (true);

-- 4. Linked Accounts security check
-- Ensure users can only interact with their own data
-- (This is already set in 20260511010000 but we double-check)
ALTER TABLE public.linked_accounts ENABLE ROW LEVEL SECURITY;
