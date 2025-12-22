import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export async function GET(
  _req: NextRequest,
  { params }: { params: { accountId: string } }
) {
  const accountId = params.accountId;

  if (!accountId) {
    return NextResponse.json({ error: "Missing accountId" }, { status: 400 });
  }

  // ensure seeded (in case)
  const seedResult = await supabase.rpc("rpc_seed_rate_limit_from_plan", {
    p_account_id: accountId,
  });

  if (seedResult.error) {
    return NextResponse.json(
      { error: seedResult.error.message },
      { status: 500 }
    );
  }

  const { data, error } = await supabase
    .from("rate_limits")
    .select("capacity, refill_per_sec, tokens, updated_at")
    .eq("account_id", accountId)
    .maybeSingle();

  if (error || !data) {
    return NextResponse.json(
      { error: error?.message ?? "not found" },
      { status: 500 }
    );
  }

  const allowance = Math.min(
    data.capacity,
    data.tokens + data.refill_per_sec * 3600
  );

  return NextResponse.json({
    account_id: accountId,
    capacity: data.capacity,
    refill_per_sec: data.refill_per_sec,
    tokens: data.tokens,
    allowance_next_hour: Math.floor(allowance),
    updated_at: data.updated_at,
  });
}



