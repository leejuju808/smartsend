import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });

    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: ws, error: wsError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .single();

    if (wsError || !ws) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 404 }
      );
    }

    const workspaceId = ws.workspace_id;

    // Fetch inboxes with inspector reports
    const { data: inboxes, error: inboxesError } = await supabase
      .from("sender_inboxes")
      .select(`
        *,
        sender_domains!inner(
          id,
          domain,
          created_at
        ),
        inbox_inspector_reports (
          id,
          health_score,
          health_status,
          checked_at,
          dns_spf_valid,
          dns_dkim_valid,
          dns_dmarc_valid
        )
      `)
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (inboxesError) {
      console.error("Error fetching inboxes:", inboxesError);
      return NextResponse.json(
        { error: inboxesError.message },
        { status: 500 }
      );
    }

    // Get pending fixes count for each inbox
    const inboxIds = inboxes?.map((i) => i.id) || [];
    const { data: fixes } = await supabase
      .from("inspector_fixes")
      .select("inbox_id, fix_type, severity")
      .in("inbox_id", inboxIds)
      .eq("status", "pending");

    const fixesByInbox = (fixes || []).reduce((acc: any, fix: any) => {
      if (!acc[fix.inbox_id]) {
        acc[fix.inbox_id] = { count: 0, critical: 0, high: 0 };
      }
      acc[fix.inbox_id].count++;
      if (fix.severity === "critical") acc[fix.inbox_id].critical++;
      if (fix.severity === "high") acc[fix.inbox_id].high++;
      return acc;
    }, {});

    // Enrich inboxes with fixes count
    const enrichedInboxes = (inboxes || []).map((inbox: any) => ({
      ...inbox,
      fixes: fixesByInbox[inbox.id] || { count: 0, critical: 0, high: 0 },
    }));

    return NextResponse.json({
      inboxes: enrichedInboxes,
    });
  } catch (error: any) {
    console.error("Error in GET /api/inspector/inboxes:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



