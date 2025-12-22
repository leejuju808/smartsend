-- Block 292: Credit-Based Add-On System
-- Credits table and transactions ledger for usage-based monetization

-- 1) Credits table
create table if not exists workspace_credits (
  workspace_id uuid primary key references workspaces(id) on delete cascade,
  credits integer not null default 0,
  updated_at timestamp default now()
);

create index if not exists idx_workspace_credits_workspace on workspace_credits(workspace_id);

-- 2) Credit transactions ledger
create table if not exists credit_transactions (
  id uuid primary key default gen_random_uuid(),
  workspace_id uuid references workspaces(id) on delete cascade,
  delta integer not null,              -- positive = add, negative = deduct
  reason text not null,                -- "purchase", "send_overage", "ai_scan", "enrichment_boost", etc.
  created_at timestamp default now()
);

create index if not exists idx_credit_transactions_workspace on credit_transactions(workspace_id);
create index if not exists idx_credit_transactions_created on credit_transactions(created_at desc);

-- 3) RPC: Add Credits
create or replace function add_credits(
  workspace_id_input uuid,
  amount integer,
  reason_input text
)
returns void
language plpgsql
security definer
as $$
begin
  -- Insert or update credits balance
  insert into workspace_credits (workspace_id, credits, updated_at)
  values (workspace_id_input, amount, now())
  on conflict (workspace_id) 
  do update set 
    credits = workspace_credits.credits + amount,
    updated_at = now();

  -- Log transaction
  insert into credit_transactions (workspace_id, delta, reason)
  values (workspace_id_input, amount, reason_input);
end;
$$;

-- 4) RPC: Deduct Credits
create or replace function deduct_credits(
  workspace_id_input uuid,
  amount integer,
  reason_input text
)
returns boolean
language plpgsql
security definer
as $$
declare
  current_balance integer;
begin
  -- Get current balance
  select credits into current_balance
  from workspace_credits
  where workspace_id = workspace_id_input;

  -- If no record exists or insufficient credits, return false
  if current_balance is null or current_balance < amount then
    return false;
  end if;

  -- Deduct credits
  update workspace_credits
  set credits = credits - amount,
      updated_at = now()
  where workspace_id = workspace_id_input;

  -- Log transaction
  insert into credit_transactions (workspace_id, delta, reason)
  values (workspace_id_input, -amount, reason_input);

  return true;
end;
$$;

-- 5) Initialize credits for existing workspaces (optional - set to 0)
insert into workspace_credits (workspace_id, credits, updated_at)
select id, 0, now()
from workspaces
where id not in (select workspace_id from workspace_credits)
on conflict (workspace_id) do nothing;








