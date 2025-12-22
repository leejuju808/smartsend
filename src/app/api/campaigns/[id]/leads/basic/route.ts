import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function GET(req: NextRequest, { params }: { params: { id: string }}) {
  const sb = createRouteHandlerClient({ cookies });
  const { data: { user } } = await sb.auth.getUser();

  if (!user) return NextResponse.json({ error: "unauthorized" }, { status: 401 });

  const { searchParams } = new URL(req.url);
  const limit = Number(searchParams.get("limit") || 50);

  // Distinct recent leads touched by this campaign (logs first, then queue)
  const { data, error } = await sb
    .from("send_logs")
    .select("lead_id, created_at, leads!inner(id, email, first_name, last_name, company)")
    .eq("campaign_id", params.id)
    .order("created_at", { ascending: false })
    .limit(limit);

  if (error) return NextResponse.json({ error: error.message }, { status: 400 });

  const seen = new Set<string>();
  const rows = [];
  for (const r of data || []) {
    const l = (r as any).leads;
    if (!l?.id || seen.has(l.id)) continue;
    seen.add(l.id);
    rows.push({ id: l.id, email: l.email, first_name: l.first_name, last_name: l.last_name, company: l.company });
  }

  // Fallback: if empty, just offer the most recent global leads (owner scope)
  if (rows.length === 0) {
    const fb = await sb.from("leads")
      .select("id, email, first_name, last_name, company")
      .eq("user_id", user.id)
      .order("created_at", { ascending: false })
      .limit(limit);
    if (!fb.error && fb.data) {
      for (const l of fb.data) rows.push(l);
    }
  }

  return NextResponse.json({ leads: rows });
}



