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

    // Fetch domains with reputation
    const { data: domains, error: domainsError } = await supabase
      .from("sender_domains")
      .select(`
        *,
        domain_reputation (*)
      `)
      .eq("workspace_id", workspaceId);

    if (domainsError) {
      console.error("Error fetching domains:", domainsError);
      return NextResponse.json(
        { error: domainsError.message },
        { status: 500 }
      );
    }

    // Fetch inboxes with health
    const { data: inboxes, error: inboxesError } = await supabase
      .from("sender_inboxes")
      .select(`
        *,
        inbox_health (*)
      `)
      .eq("workspace_id", workspaceId);

    if (inboxesError) {
      console.error("Error fetching inboxes:", inboxesError);
      return NextResponse.json(
        { error: inboxesError.message },
        { status: 500 }
      );
    }

    // Fetch workspace-level stats
    const { data: workspaceStats, error: workspaceError } = await supabase
      .from("workspace_deliverability")
      .select("*")
      .eq("workspace_id", workspaceId)
      .maybeSingle();

    if (workspaceError) {
      console.error("Error fetching workspace stats:", workspaceError);
      // Don't fail if stats don't exist yet
    }

    return NextResponse.json({
      domains: domains || [],
      inboxes: inboxes || [],
      workspace: workspaceStats || null,
    });
  } catch (error: any) {
    console.error("Error in GET /api/deliverability:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



