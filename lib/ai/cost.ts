import { createClient } from '@supabase/supabase-js';

type UsageType = 'eval' | 'online' | 'training';

export async function recordCost({
  usage_type,
  provider,
  model,
  calls = 1,
  input_tokens = 0,
  output_tokens = 0,
  cost_usd = 0,
}: {
  usage_type: UsageType;
  provider: string;
  model: string;
  calls?: number;
  input_tokens?: number;
  output_tokens?: number;
  cost_usd?: number;
}) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );

  await client.from('ai_cost_ledger').insert({
    provider,
    model,
    usage_type,
    calls,
    input_tokens,
    output_tokens,
    cost_usd,
  });
}

export async function checkBudget(provider: string, projected_cost: number) {
  const client = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
  );
  const day = new Date().toISOString().slice(0, 10);

  const { data: ledgerRows } = await client
    .from('ai_cost_ledger')
    .select('cost_usd')
    .gte('created_at', `${day}T00:00:00Z`);
  const spent = (ledgerRows ?? []).reduce((sum, row) => sum + Number(row.cost_usd ?? 0), 0);

  const { data: cap } = await client
    .from('ai_cost_budget')
    .select('*')
    .eq('provider', provider)
    .maybeSingle();

  const limit = Number(cap?.daily_cap_usd ?? 10);
  const hardStop = Boolean(cap?.hard_stop);
  const allowed = spent + projected_cost <= limit;

  return { allowed, spent, limit, hardStop };
}
















