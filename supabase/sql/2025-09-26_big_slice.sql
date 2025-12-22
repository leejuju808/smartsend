-- === BIG SLICE: SMTP Accounts, Sequences, Message Queue, Sender Stats ===

-- 0) Prereqs: ensure required enums/tables exist from earlier slices (safe no-ops)
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'suppression_reason') THEN
    CREATE TYPE suppression_reason AS ENUM (
      'unsubscribed','complaint','bounced','manual','role_account','invalid_format'
    );
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.contacts (
  id uuid PRIMARY KEY DEFAULT genrandomuuid(),
  workspace_id uuid NOT NULL,
  email text NOT NULL,
  first_name text,
  last_name text,
  company text,
  title text,
  phone text,
  custom jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS contacts_workspace_email_uidx ON public.contacts(workspace_id, lower(email));

CREATE TABLE IF NOT EXISTS public.suppressions (
  id uuid PRIMARY KEY DEFAULT genrandomuuid(),
  workspace_id uuid NOT NULL,
  email text NOT NULL,
  reason suppression_reason NOT NULL,
  metadata jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS suppressions_workspace_email_uidx ON public.suppressions(workspace_id, lower(email));

-- 1) SMTP accounts (ciphertext storage for secret; decrypt app-side only)
CREATE TABLE IF NOT EXISTS public.smtp_accounts (
  id uuid PRIMARY KEY DEFAULT genrandomuuid(),
  workspace_id uuid NOT NULL,
  label text NOT NULL,                        -- e.g., "Julian - Primary"
  host text NOT NULL,
  port integer NOT NULL CHECK (port > 0),
  secure boolean NOT NULL DEFAULT false,
  username text NOT NULL,
  secret_ciphertext text NOT NULL,            -- AES-GCM ciphertext produced app-side
  from_name text,
  from_email text NOT NULL,
  rate_limit_per_minute integer NOT NULL DEFAULT 60, -- safety throttle
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS smtp_accounts_workspace_idx ON public.smtp_accounts(workspace_id);

-- 2) Sequences & steps
CREATE TABLE IF NOT EXISTS public.sequences (
  id uuid PRIMARY KEY DEFAULT genrandomuuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.sequence_steps (
  id uuid PRIMARY KEY DEFAULT genrandomuuid(),
  sequence_id uuid NOT NULL REFERENCES public.sequences(id) ON DELETE CASCADE,
  step_order integer NOT NULL,
  subject_template text NOT NULL,   -- Mustache-like: "Quick chat, {{first_name}}?"
  body_text_template text NOT NULL, -- Plaintext for now; HTML later
  delay_minutes integer NOT NULL DEFAULT 0, -- after subscription/enqueue
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE UNIQUE INDEX IF NOT EXISTS sequence_steps_unique ON public.sequence_steps(sequence_id, step_order);

-- 3) Campaigns (minimal if not present)
CREATE TABLE IF NOT EXISTS public.campaigns (
  id uuid PRIMARY KEY DEFAULT genrandomuuid(),
  workspace_id uuid NOT NULL,
  name text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4) Messages queue
DO $$
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'message_status') THEN
    CREATE TYPE message_status AS ENUM ('queued','sending','sent','failed','skipped');
  END IF;
END$$;

CREATE TABLE IF NOT EXISTS public.messages (
  id uuid PRIMARY KEY DEFAULT genrandomuuid(),
  workspace_id uuid NOT NULL,
  campaign_id uuid REFERENCES public.campaigns(id) ON DELETE SET NULL,
  sequence_id uuid REFERENCES public.sequences(id) ON DELETE SET NULL,
  sequence_step_id uuid REFERENCES public.sequence_steps(id) ON DELETE SET NULL,
  smtp_account_id uuid REFERENCES public.smtp_accounts(id) ON DELETE SET NULL,

  contact_id uuid REFERENCES public.contacts(id) ON DELETE SET NULL,
  to_email text NOT NULL,
  subject text NOT NULL,
  body_text text NOT NULL,

  status message_status NOT NULL DEFAULT 'queued',
  attempts integer NOT NULL DEFAULT 0,
  last_error text,
  scheduled_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS messages_workspace_status_idx ON public.messages(workspace_id, status, scheduled_at);
CREATE INDEX IF NOT EXISTS messages_smtp_scheduled_idx ON public.messages(smtp_account_id, status, scheduled_at);

-- 5) Sender stats (rollup; keep simple and compute mostly app-side)
CREATE TABLE IF NOT EXISTS public.sender_stats (
  smtp_account_id uuid PRIMARY KEY,
  workspace_id uuid NOT NULL,
  last_rolling_24h_sent integer NOT NULL DEFAULT 0,
  last_rolling_7d_sent integer NOT NULL DEFAULT 0,
  last_bounce_count integer NOT NULL DEFAULT 0,
  health_score integer NOT NULL DEFAULT 80, -- 0-100 heuristic
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- 6) RLS policies (scoped by workspace)
ALTER TABLE public.smtp_accounts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequences ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sequence_steps ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.sender_stats ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contacts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.suppressions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.campaigns ENABLE ROW LEVEL SECURITY;

-- Assume public.profiles(id = auth.uid(), workspace_id) exists.
CREATE POLICY IF NOT EXISTS smtp_accounts_rw_policy ON public.smtp_accounts
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = smtp_accounts.workspace_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = smtp_accounts.workspace_id));

CREATE POLICY IF NOT EXISTS sequences_rw_policy ON public.sequences
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = sequences.workspace_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = sequences.workspace_id));

CREATE POLICY IF NOT EXISTS sequence_steps_rw_policy ON public.sequence_steps
  FOR ALL USING (EXISTS (
    SELECT 1 FROM public.sequences s JOIN public.profiles p ON p.workspace_id = s.workspace_id AND p.id = auth.uid()
    WHERE s.id = sequence_steps.sequence_id
  ))
  WITH CHECK (EXISTS (
    SELECT 1 FROM public.sequences s JOIN public.profiles p ON p.workspace_id = s.workspace_id AND p.id = auth.uid()
    WHERE s.id = sequence_steps.sequence_id
  ));

CREATE POLICY IF NOT EXISTS messages_rw_policy ON public.messages
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = messages.workspace_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = messages.workspace_id));

CREATE POLICY IF NOT EXISTS sender_stats_rw_policy ON public.sender_stats
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = sender_stats.workspace_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = sender_stats.workspace_id));

CREATE POLICY IF NOT EXISTS contacts_rw_policy ON public.contacts
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = contacts.workspace_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = contacts.workspace_id));

CREATE POLICY IF NOT EXISTS suppressions_rw_policy ON public.suppressions
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = suppressions.workspace_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = suppressions.workspace_id));

CREATE POLICY IF NOT EXISTS campaigns_rw_policy ON public.campaigns
  FOR ALL USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = campaigns.workspace_id))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.workspace_id = campaigns.workspace_id));