-- Add credit system for AI replies
-- This allows teams to purchase credit packs and use them before falling back to metered billing

-- Add credit balance to teams table
alter table public.teams
  add column if not exists credit_balance int default 0;   -- AI replies prepaid balance

-- Add coverage flag to AI reply events
alter table public.ai_reply_events
  add column if not exists covered_by_credit boolean default false;

-- Create function to safely consume team credits
create or replace function public.consume_team_credit(tid uuid, n int default 1)
returns jsonb
language plpgsql
as $$
declare bal int;
begin
  update public.teams
    set credit_balance = case
        when credit_balance >= n then credit_balance - n
        else credit_balance
      end
  where id = tid
  returning credit_balance into bal;

  return jsonb_build_object('balance', bal, 'covered', (bal is not null and bal >= 0));
end;
$$ security definer;

-- Create function to add credits to team
create or replace function public.add_team_credits(tid uuid, n int)
returns void language sql as $$
  update public.teams set credit_balance = credit_balance + n where id = tid;
$$;

-- Add RLS policy for credit balance (teams table should already have RLS)
-- Users can view their team's credit balance
create policy if not exists "Users can view their team credit balance" on public.teams
  for select using (
    id in (
      select team_id from public.workspace_members 
      where user_id = auth.uid()
    )
  ); 