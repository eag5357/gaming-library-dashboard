-- Update linked_accounts to enforce one account per platform per user
ALTER TABLE public.linked_accounts DROP CONSTRAINT IF EXISTS linked_accounts_user_platform_unique;
ALTER TABLE public.linked_accounts ADD CONSTRAINT linked_accounts_user_platform_unique UNIQUE (user_id, platform_name);
