import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { createServiceClient } from "@/lib/supabase/server";
import { resolveAccountContext } from "@/app/api/dupes/_helpers";

const DEFAULT_WINDOWS = {
  mon: [9, 17],
  tue: [9, 17],
  wed: [9, 17],
  thu: [9, 17],
  fri: [9, 17],
  sat: null,
  sun: null,
};

function clampHour(value: unknown, fallback: number, min = 0, max = 24) {
  const num = Number(value);
  if (!Number.isFinite(num)) return fallback;
  return Math.max(min, Math.min(max, Math.floor(num)));
}

function ensureWindows(payload: any) {
  if (payload && typeof payload === "object") {
    const result: Record<string, [number, number] | null> = { ...DEFAULT_WINDOWS };
    for (const day of Object.keys(DEFAULT_WINDOWS)) {
      const raw = payload[day];
      if (Array.isArray(raw) && raw.length === 2) {
        const start = clampHour(raw[0], DEFAULT_WINDOWS[day as keyof typeof DEFAULT_WINDOWS]?.[0] ?? 9, 0, 23);
        const end = clampHour(raw[1], DEFAULT_WINDOWS[day as keyof typeof DEFAULT_WINDOWS]?.[1] ?? 17, 1, 24);
        result[day] = start < end ? [start, end] : null;
      } else {
        result[day] = null;
      }
    }
    return result;
  }
  return DEFAULT_WINDOWS;
}

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const context = await resolveAccountContext(supabase);

  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const { searchParams } = new URL(req.url);
  const requestedAccountId = searchParams.get("account_id");

  if (requestedAccountId && requestedAccountId !== context.accountId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const accountId = requestedAccountId ?? context.accountId;
  const admin = createServiceClient();

  const { data: policy, error: policyError } = await admin
    .from("send_time_policies")
    .select("*")
    .eq("account_id", accountId)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (policyError && policyError.code !== "PGRST116") {
    return NextResponse.json({ error: policyError.message }, { status: 400 });
  }

  const { data: pacingRows, error: pacingError } = await admin
    .from("isp_pacing_rules")
    .select("bucket, max_per_minute, burst")
    .eq("account_id", accountId);

  if (pacingError) {
    return NextResponse.json({ error: pacingError.message }, { status: 400 });
  }

  const pacing: Record<string, number> = {};
  pacingRows?.forEach((row) => {
    pacing[row.bucket] = row.max_per_minute;
  });

  return NextResponse.json({
    policy: policy ?? null,
    pacing,
  });
}

export async function POST(req: NextRequest) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const supabase = createClient();
  const context = await resolveAccountContext(supabase);

  if (!context.ok) {
    return NextResponse.json({ error: context.message }, { status: context.status });
  }

  const role = (context.role ?? "").toLowerCase();
  if (!["owner", "admin"].includes(role)) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const requestedAccountId = typeof body?.account_id === "string" ? body.account_id : undefined;
  if (requestedAccountId && requestedAccountId !== context.accountId) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const accountId = requestedAccountId ?? context.accountId;
  const admin = createServiceClient();

  const windows = ensureWindows(body.windows);
  const minHour = clampHour(body?.min_hour, 8, 0, 23);
  const maxHour = clampHour(body?.max_hour, 18, 1, 24);

  if (minHour >= maxHour) {
    return NextResponse.json({ error: "min_hour must be less than max_hour" }, { status: 400 });
  }

  const { error: upsertError } = await admin
    .from("send_time_policies")
    .upsert(
      {
        account_id: accountId,
        name: "Default",
        windows,
        min_hour: minHour,
        max_hour: maxHour,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,name" }
    );

  if (upsertError) {
    return NextResponse.json({ error: upsertError.message }, { status: 400 });
  }

  const pacing: Record<string, number> = body?.pacing && typeof body.pacing === "object" ? body.pacing : {};
  const allowedBuckets = new Set(["gmail", "outlook", "yahoo", "other"]);

  for (const [bucket, value] of Object.entries(pacing)) {
    if (!allowedBuckets.has(bucket)) continue;
    const maxPerMinute = Math.max(1, Number(value) || 1);

    const { error: pacingUpsertError } = await admin.from("isp_pacing_rules").upsert(
      {
        account_id: accountId,
        bucket,
        max_per_minute: maxPerMinute,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "account_id,bucket" }
    );

    if (pacingUpsertError) {
      return NextResponse.json({ error: pacingUpsertError.message }, { status: 400 });
    }
  }

  return NextResponse.json({ ok: true });
}

