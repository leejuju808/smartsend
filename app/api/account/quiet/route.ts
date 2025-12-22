import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    throw new Error("Supabase admin env vars missing");
  }
  return createClient(url, key);
}

export async function GET(req: NextRequest) {
  const account = new URL(req.url).searchParams.get("account");
  if (!account) {
    return NextResponse.json({ ok: false, error: "account param required" }, { status: 400 });
  }

  const supa = serviceClient();
  const { data: acct, error: acctErr } = await supa
    .from("accounts")
    .select("id, timezone, quiet_hours")
    .eq("id", account)
    .maybeSingle();

  if (acctErr) {
    return NextResponse.json({ ok: false, error: acctErr.message }, { status: 500 });
  }

  const { data: isp, error: ispErr } = await supa
    .from("isp_quiet_overrides")
    .select("*")
    .eq("account_id", account);

  if (ispErr) {
    return NextResponse.json({ ok: false, error: ispErr.message }, { status: 500 });
  }

  return NextResponse.json({ ok: true, account: acct, isp_overrides: isp ?? [] });
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  if (!body?.account_id) {
    return NextResponse.json({ ok: false, error: "account_id required" }, { status: 400 });
  }

  const supa = serviceClient();

  if (body.timezone || body.quiet_hours) {
    const { error } = await supa
      .from("accounts")
      .update({
        timezone: body.timezone ?? undefined,
        quiet_hours: body.quiet_hours ?? undefined,
      })
      .eq("id", body.account_id);

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
  }

  if (Array.isArray(body.isp_overrides)) {
    for (const row of body.isp_overrides) {
      const { error } = await supa
        .from("isp_quiet_overrides")
        .upsert(
          {
            account_id: body.account_id,
            isp_key: row.isp_key,
            enabled: row.enabled,
            start_hhmm: row.start_hhmm,
            end_hhmm: row.end_hhmm,
          },
          { onConflict: "account_id,isp_key" },
        );
      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }
    }
  }

  return NextResponse.json({ ok: true });
}

