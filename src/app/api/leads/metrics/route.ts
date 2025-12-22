import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  { auth: { persistSession: false, autoRefreshToken: false } }
);

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const workspace_id = searchParams.get("workspace_id");
    const campaign_id = searchParams.get("campaign_id");
    const from = searchParams.get("from");
    const to = searchParams.get("to");
    if (!workspace_id) return NextResponse.json({ error: "workspace_id required" }, { status: 400 });

    const { data, error } = await supabase.rpc("lead_status_counts", {
      p_workspace: workspace_id,
      p_campaign: campaign_id || null,
      p_from: from ? new Date(from).toISOString() : null,
      p_to: to ? new Date(to).toISOString() : null,
    });
    if (error) return NextResponse.json({ error: error.message }, { status: 500 });

    const statuses = ["new","queued","sending","sent","failed","replied"] as const;
    const map = new Map((data ?? []).map((r: any) => [r.status, Number(r.count)]));
    const out = Object.fromEntries(statuses.map(s => [s, map.get(s) ?? 0]));
    return NextResponse.json(out, { status: 200 });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message ?? "Unknown error" }, { status: 500 });
  }
}


