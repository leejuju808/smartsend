import { NextResponse } from "next/server";

import { createClient } from "@/lib/supabase/server";

export async function GET(
  _request: Request,
  { params }: { params: { accountId: string } },
) {
  const accountId = params.accountId;
  const supabase = createClient();

  const { data: caps, error } = await supabase.rpc("read_plan_caps", {
    p_account: accountId,
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  const month = new Date();
  month.setUTCDate(1);
  month.setUTCHours(0, 0, 0, 0);

  const { data: usage, error: usageError } = await supabase
    .from("usage_counters")
    .select("metric,count")
    .eq("account_id", accountId)
    .eq("month", month.toISOString().slice(0, 10));

  if (usageError) {
    return NextResponse.json({ error: usageError.message }, { status: 400 });
  }

  const { data: seats, error: seatsError } = await supabase
    .from("account_seats")
    .select("seats_in_use, seats_purchased, over_limit, locked_at")
    .eq("account_id", accountId)
    .maybeSingle();

  if (seatsError) {
    return NextResponse.json({ error: seatsError.message }, { status: 400 });
  }

  const { data: locks, error: locksError } = await supabase
    .from("account_locks")
    .select("sending_locked, invites_locked, reason, updated_at")
    .eq("account_id", accountId)
    .maybeSingle();

  if (locksError) {
    return NextResponse.json({ error: locksError.message }, { status: 400 });
  }

  return NextResponse.json({
    caps: caps ?? {},
    usage: usage ?? [],
    seats: seats ?? null,
    locks: locks ?? null,
  });
}

