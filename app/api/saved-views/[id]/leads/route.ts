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

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const page = Math.max(1, Number(req.nextUrl.searchParams.get("page") ?? "1"));
  const pageSize = Math.min(Math.max(1, Number(req.nextUrl.searchParams.get("pageSize") ?? "50")), 200);

  try {
    const supa = createServiceClient();

    const { data: view, error: viewError } = await supa.from("saved_views").select("*").eq("id", params.id).single();
    if (viewError || !view) {
      return NextResponse.json({ ok: false, error: "view_not_found" }, { status: 404 });
    }

    const { data: ids, error: idsError } = await supa.rpc("rpc_lead_ids_for_filter", {
      p_account_id: view.account_id,
      p_filter: view.filter,
    });
    if (idsError) {
      return NextResponse.json({ ok: false, error: idsError.message }, { status: 500 });
    }

    const leadIds = (ids ?? [])
      .map((row: { lead_id: string | null }) => row.lead_id)
      .filter((id: string | null): id is string => Boolean(id));

    const total = leadIds.length;
    const from = (page - 1) * pageSize;
    const to = Math.min(from + pageSize - 1, Math.max(total - 1, 0));

    let rows: unknown[] = [];
    if (leadIds.length > 0 && from <= to) {
      let query = supa.from("v_leads_for_views").select("*").in("id", leadIds);
      const sortKey = view.sort?.key as string | undefined;
      if (sortKey) {
        query = query.order(sortKey, { ascending: (view.sort?.dir ?? "desc") === "asc" });
      }

      const { data: rowsData, error: rowsError } = await query.range(from, to);
      if (rowsError) {
        return NextResponse.json({ ok: false, error: rowsError.message }, { status: 500 });
      }
      rows = rowsData ?? [];
    }

    return NextResponse.json({
      ok: true,
      total,
      page,
      pageSize,
      rows,
      columns: view.columns ?? [],
    });
  } catch (err) {
    return NextResponse.json({ ok: false, error: (err as Error).message }, { status: 500 });
  }
}

