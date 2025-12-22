import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function clampNumber(value: unknown, fallback: number, min = 0, max?: number) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  const lowerBound = Math.max(min, num);
  return typeof max === "number" ? Math.min(lowerBound, max) : lowerBound;
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const accountId = body?.account_id as string | undefined;
  if (!accountId) {
    return NextResponse.json({ error: "account_id is required" }, { status: 400 });
  }

  let provider = (body?.provider as string | undefined)?.toLowerCase();
  if (provider !== "gmail" && provider !== "outlook") {
    const { data: account, error } = await supabase
      .from("mail_accounts")
      .select("provider")
      .eq("id", accountId)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    provider = (account?.provider ?? "gmail").toLowerCase();
  }

  const dailyCap = clampNumber(body?.daily_cap, 150, 0);
  const hourlyCap = clampNumber(body?.hourly_cap, 30, 0);
  const warmupDay = clampNumber(body?.warmup_day, 1, 1, 365);
  const warmupEnabled = Boolean(body?.warmup_enabled ?? true);
  const timezone = typeof body?.timezone === "string" && body.timezone.length > 0
    ? body.timezone
    : "America/Los_Angeles";
  const ramp = body?.ramp;

  const upsertPayload: Record<string, any> = {
    account_id: accountId,
    provider,
    daily_cap: dailyCap,
    hourly_cap: hourlyCap,
    warmup_enabled: warmupEnabled,
    warmup_day: warmupDay,
    timezone,
  };

  if (ramp && typeof ramp === "object") {
    upsertPayload.ramp = ramp;
  }

  const { data, error } = await supabase
    .from("send_limits")
    .upsert(upsertPayload, { onConflict: "account_id" })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 400 });
  }

  return NextResponse.json(data);
}








