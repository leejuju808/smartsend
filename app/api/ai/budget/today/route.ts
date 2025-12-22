import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

export async function GET() {
  const s = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);
  const day = new Date().toISOString().slice(0,10);

  const { data: rows } = await s.from('ai_cost_ledger').select('cost_usd').gte('created_at', `${day}T00:00:00Z`);
  const spent = (rows ?? []).reduce((a, r) => a + Number(r.cost_usd || 0), 0);
  const { data: cap } = await s.from('ai_cost_budget').select('*').eq('provider','openai').maybeSingle();

  return NextResponse.json({ spent, limit: Number(cap?.daily_cap_usd ?? 0) });
}
















