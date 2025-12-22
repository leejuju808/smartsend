-- Feature flag to control role-account auto-suppression on import
ALTER TABLE public.profiles
  ADD COLUMN IF NOT EXISTS auto_suppress_role_accounts boolean NOT NULL DEFAULT true;

CREATE INDEX IF NOT EXISTS profiles_auto_suppress_role_accounts_idx
  ON public.profiles (auto_suppress_role_accounts);