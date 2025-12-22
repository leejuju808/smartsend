-- =========================================================
-- Block 8710 — Billing Plans + Workspace Subscriptions
-- =========================================================

-- 1) Subscription plans (static, but stored for reference)
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id            text PRIMARY KEY, -- starter, growth, domination
  name          text NOT NULL,
  price_cents   integer NOT NULL,
  currency      text NOT NULL DEFAULT 'usd',
  stripe_price_id text,          -- link to Stripe price
  max_campaigns integer,
  max_emails_per_month integer,
  created_at    timestamptz NOT NULL DEFAULT now()
);

-- seed basic plans if not present
INSERT INTO public.subscription_plans (id, name, price_cents, currency, max_campaigns, max_emails_per_month)
VALUES
  ('starter', 'Starter', 9900, 'usd', 1, 500),
  ('growth', 'Growth', 19900, 'usd', 3, 2000),
  ('domination', 'Domination', 39900, 'usd', NULL, NULL)
ON CONFLICT (id) DO NOTHING;


-- 2) Workspace subscriptions
CREATE TABLE IF NOT EXISTS public.workspace_subscriptions (
  id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  workspace_id    uuid NOT NULL,
  plan_id         text NOT NULL REFERENCES public.subscription_plans(id),
  stripe_customer_id text,
  stripe_subscription_id text,
  status          text NOT NULL DEFAULT 'inactive', -- inactive / active / past_due / canceled
  current_period_start timestamptz,
  current_period_end   timestamptz,
  created_at      timestamptz NOT NULL DEFAULT now(),
  updated_at      timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_workspace_subscriptions_workspace
  ON public.workspace_subscriptions (workspace_id);

ALTER TABLE public.workspace_subscriptions ENABLE ROW LEVEL SECURITY;

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_policies
    WHERE tablename = 'workspace_subscriptions'
      AND policyname = 'Workspace subscriptions scoped to workspace'
  ) THEN
    CREATE POLICY "Workspace subscriptions scoped to workspace"
    ON public.workspace_subscriptions
    FOR ALL
    USING (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    )
    WITH CHECK (
      workspace_id IN (
        SELECT workspace_id
        FROM public.workspace_members
        WHERE user_id = auth.uid()
      )
    );
  END IF;
END;
$$;

-- updated_at trigger
CREATE OR REPLACE FUNCTION public.set_workspace_subscriptions_updated_at()
RETURNS trigger
LANGUAGE plpgsql
AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_set_workspace_subscriptions_updated_at
ON public.workspace_subscriptions;

CREATE TRIGGER trg_set_workspace_subscriptions_updated_at
BEFORE UPDATE ON public.workspace_subscriptions
FOR EACH ROW
EXECUTE FUNCTION public.set_workspace_subscriptions_updated_at();


























































