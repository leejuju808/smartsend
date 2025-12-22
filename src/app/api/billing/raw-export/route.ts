import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import { supabaseAdmin } from "@/lib/supabaseAdmin";

function isoDaysAgoStartUTC(days: number) {
  const d = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
  const start = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), d.getUTCDate(), 0, 0, 0, 0));
  return start.toISOString();
}

/**
 * GET /api/billing/raw-export?workspace_id=...
 *
 * Produces a *raw* JSON export intended as a data dump, not a usable system.
 * This is deliberately un-opinionated: no joins, no cleanup, no migration tooling.
 */
export async function GET(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const workspaceId = req.nextUrl.searchParams.get("workspace_id");
    if (!workspaceId) return NextResponse.json({ error: "workspace_id required" }, { status: 400 });

    // Verify membership (never trust client input)
    const { data: membership, error: memberErr } = await supabase
      .from("workspace_members")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (memberErr) return NextResponse.json({ error: "Membership check failed" }, { status: 500 });
    if (!membership) return NextResponse.json({ error: "Forbidden" }, { status: 403 });

    const nowIso = new Date().toISOString();
    const since90d = isoDaysAgoStartUTC(90);

    const limit = 5000;

    const [ws, campaigns, leads, appointments] = await Promise.all([
      supabaseAdmin.from("workspaces").select("*").eq("id", workspaceId).maybeSingle(),
      supabaseAdmin.from("campaigns").select("*").eq("workspace_id", workspaceId).limit(limit),
      supabaseAdmin.from("leads").select("*").eq("workspace_id", workspaceId).limit(limit),
      supabaseAdmin.from("appointments").select("*").eq("workspace_id", workspaceId).limit(limit),
    ]);

    const campaignIds = (campaigns.data || []).map((c: any) => c?.id).filter(Boolean);

    // send_logs + reply events are campaign-scoped; export only the workspace's campaigns (last 90 days).
    const [sendLogs, replies] = campaignIds.length
      ? await Promise.all([
          supabaseAdmin
            .from("send_logs")
            .select("*")
            .in("campaign_id", campaignIds)
            .gte("sent_at", since90d)
            .order("sent_at", { ascending: false })
            .limit(limit),
          supabaseAdmin
            .from("smartsend_reply_events")
            .select("*")
            .in("campaign_id", campaignIds)
            .gte("created_at", since90d)
            .order("created_at", { ascending: false })
            .limit(limit),
        ])
      : [
          { data: [] as any[] },
          { data: [] as any[] },
        ];

    const payload = {
      export_version: "raw_v1",
      generated_at: nowIso,
      workspace_id: workspaceId,
      notes: [
        "This is a raw data dump.",
        "No joins, cleanup, or schema normalization is applied.",
        "Some tables are truncated for safety/performance (limit=5000).",
        "send_logs and smartsend_reply_events are exported for the last 90 days only.",
      ],
      tables: {
        workspaces: ws.data ? [ws.data] : [],
        campaigns: campaigns.data || [],
        leads: leads.data || [],
        appointments: appointments.data || [],
        send_logs: sendLogs.data || [],
        smartsend_reply_events: replies.data || [],
      },
      truncated: {
        campaigns: (campaigns.data?.length || 0) >= limit,
        leads: (leads.data?.length || 0) >= limit,
        appointments: (appointments.data?.length || 0) >= limit,
        send_logs: (sendLogs.data?.length || 0) >= limit,
        smartsend_reply_events: (replies.data?.length || 0) >= limit,
      },
    };

    const filename = `smartsend-raw-export-${workspaceId}-${nowIso.slice(0, 10)}.json`;

    return new NextResponse(JSON.stringify(payload, null, 2), {
      headers: {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
        "Content-Disposition": `attachment; filename="${filename}"`,
      },
    });
  } catch (e: any) {
    console.error("[billing/raw-export] error", e);
    return NextResponse.json({ error: e?.message || "Internal error" }, { status: 500 });
  }
}


