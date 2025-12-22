import { NextRequest, NextResponse } from "next/server";
import { createClient as createServiceClient } from "@supabase/supabase-js";
import { createClient } from "@/utils/supabase/server";
import { setAccountContext } from "@/app/api/_utils/account";

function getServiceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!url || !key) {
    throw new Error("Supabase credentials are not configured");
  }

  return createServiceClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const service = getServiceClient();
  const { data: view, error: viewError } = await service
    .from("saved_views")
    .select("id, account_id, definition")
    .eq("id", params.id)
    .maybeSingle();

  if (viewError) {
    return NextResponse.json({ ok: false, error: viewError.message }, { status: 500 });
  }

  if (!view) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const sql = typeof view.definition?.sql === "string" ? (view.definition.sql as string).trim() : "";

  if (sql) {
    const { data, error } = await service.rpc("exec_sql_json", { p_sql: sql });
    if (error) {
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }
    let rows: unknown = data;
    if (typeof rows === "string") {
      try {
        rows = JSON.parse(rows);
      } catch {
        rows = [];
      }
    }
    if (!Array.isArray(rows)) {
      rows = [];
    }
    return NextResponse.json({ ok: true, rows });
  }

  const supabase = createClient();
  await setAccountContext(supabase);

  const limit = 1000;
  const { data, error } = await supabase.rpc("run_saved_view", {
    p_view_id: params.id,
    p_limit: limit,
  });

  if (error) {
    return NextResponse.json({ ok: false, error: error.message }, { status: 400 });
  }

  return NextResponse.json({ ok: true, rows: data ?? [] });
}
