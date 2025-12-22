import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);
  const page = Number(url.searchParams.get("page") ?? "1");
  const pageSize = Math.min(100, Number(url.searchParams.get("pageSize") ?? "20"));
  const offset = (page - 1) * pageSize;

  const base = supabase
    .from("reply_drafts")
    .select(
      "id, created_at, campaign_id, thread_id, lead_id, subject, status, queued_at, sent_at, source, meta",
      { count: "exact" },
    )
    .eq("campaign_id", params.id)
    .in("status", ["draft", "queued"])
    .order("created_at", { ascending: false })
    .range(offset, offset + pageSize - 1);

  const { data, error, count } = await base;
  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  const ids = (data ?? []).map((d) => d.lead_id).filter(Boolean);
  let leadsMap: Record<string, any> = {};
  if (ids.length) {
    const { data: leads } = await supabase
      .from("leads")
      .select("id, first_name, last_name, email, company")
      .in("id", ids);
    (leads ?? []).forEach((l) => {
      leadsMap[l.id] = l;
    });
  }

  return NextResponse.json({
    items: data ?? [],
    count: count ?? 0,
    page,
    pageSize,
    leads: leadsMap,
  });
}


