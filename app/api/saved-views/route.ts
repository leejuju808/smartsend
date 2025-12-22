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

export async function GET(req: NextRequest) {
  const url = new URL(req.url);
  const scope = url.searchParams.get("scope") ?? "inbox";
  const account = url.searchParams.get("account") ?? "00000000-0000-0000-0000-000000000001";

  try {
    const supa = createServiceClient();
    const { data, error } = await supa
      .from("saved_views")
      .select("id,name,scope,created_at,filters,sort,definition")
      .eq("account_id", account)
      .eq("scope", scope)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    const items = data ?? [];
    return NextResponse.json({ ok: true, items, views: items });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  let body: any;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ ok: false, error: "invalid_json" }, { status: 400 });
  }

  const accountId = body?.account_id;
  const name = body?.name;
  const scope = body?.scope ?? "inbox";
  const filters = body?.filters ?? {};
  const sort = body?.sort ?? {};

  if (!accountId || !name) {
    return NextResponse.json({ ok: false, error: "missing_account_or_name" }, { status: 400 });
  }

  try {
    const supa = createServiceClient();
    const { data, error } = await supa
      .from("saved_views")
      .insert({
        account_id: accountId,
        name,
        scope,
        filters,
        sort,
      })
      .select("id")
      .single();

    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, id: data?.id });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

