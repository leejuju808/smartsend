import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function createServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase credentials are not configured");
  }

  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export async function POST(req: NextRequest) {
  let body: any;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const accountId = body?.account_id;
  const scope = body?.scope;
  const filters = body?.filters ?? {};
  const limit = body?.limit;

  if (!accountId || !scope) {
    return NextResponse.json({ ok: false, error: "missing_account_or_scope" }, { status: 400 });
  }

  try {
    const supa = createServiceClient();

    if (scope === "inbox") {
      const { data, error } = await supa.rpc("rpc_run_view_inbox", {
        p_account_id: accountId,
        p_filters: filters,
        p_limit: limit ?? 200,
      });

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, rows: data ?? [] });
    }

    if (scope === "leads") {
      const { data, error } = await supa.rpc("rpc_run_view_leads", {
        p_account_id: accountId,
        p_filters: filters,
        p_limit: limit ?? 500,
      });

      if (error) {
        return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({ ok: true, rows: data ?? [] });
    }

    return NextResponse.json({ ok: false, error: "bad_scope" }, { status: 400 });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

