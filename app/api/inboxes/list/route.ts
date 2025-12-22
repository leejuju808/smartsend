import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET() {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Get user's workspace
    const { data: workspaceMember, error: wsError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .single();

    if (wsError || !workspaceMember) {
      return NextResponse.json({ inboxes: [] });
    }

    // Get inboxes for workspace with domain info
    const { data: inboxes, error } = await supabase
      .from("sender_inboxes")
      .select(`
        *,
        domain:sender_domains!domain_id(domain)
      `)
      .eq("workspace_id", workspaceMember.workspace_id)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    // Transform the data to match expected format
    const transformedInboxes = (inboxes || []).map((inbox: any) => ({
      ...inbox,
      domain: inbox.domain ? { domain: inbox.domain.domain } : null,
    }));

    return NextResponse.json({ inboxes: transformedInboxes });
  } catch (error: any) {
    console.error("Error listing inboxes:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



