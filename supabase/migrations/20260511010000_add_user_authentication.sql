-- Add user_id to linked_accounts
ALTER TABLE public.linked_accounts ADD COLUMN user_id UUID REFERENCES auth.users(id);

-- Update unique constraint to include user_id
ALTER TABLE public.linked_accounts DROP CONSTRAINT linked_accounts_platform_name_provider_account_id_key;
ALTER TABLE public.linked_accounts ADD CONSTRAINT linked_accounts_user_platform_unique UNIQUE (user_id, platform_name, provider_account_id);

-- Enable RLS on linked_accounts
ALTER TABLE public.linked_accounts ENABLE ROW LEVEL SECURITY;

-- Create policies for linked_accounts
CREATE POLICY "Users can view their own linked accounts"
ON public.linked_accounts FOR SELECT
USING (auth.uid() = user_id);

CREATE POLICY "Users can insert their own linked accounts"
ON public.linked_accounts FOR INSERT
WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can update their own linked accounts"
ON public.linked_accounts FOR UPDATE
USING (auth.uid() = user_id);

CREATE POLICY "Users can delete their own linked accounts"
ON public.linked_accounts FOR DELETE
USING (auth.uid() = user_id);

-- Update play_stats policies to be user-specific via linked_accounts
DROP POLICY IF EXISTS "Allow public read access on play_stats" ON public.play_stats;
CREATE POLICY "Users can view their own play stats"
ON public.play_stats FOR SELECT
USING (
    EXISTS (
        SELECT 1 FROM public.linked_accounts
        WHERE public.linked_accounts.id = public.play_stats.linked_account_id
        AND public.linked_accounts.user_id = auth.uid()
    )
);

CREATE POLICY "Users can manage their own play stats"
ON public.play_stats FOR ALL
USING (
    EXISTS (
        SELECT 1 FROM public.linked_accounts
        WHERE public.linked_accounts.id = public.play_stats.linked_account_id
        AND public.linked_accounts.user_id = auth.uid()
    )
);

-- Games and platform_games remain public read-only for normalization purposes, 
-- but we can restrict platform_games if we want to be strict.
-- For now, let's keep games public as they are a canonical catalog.
