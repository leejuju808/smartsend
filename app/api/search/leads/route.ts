import { createClient } from "@/lib/supabase/server";
import { NextRequest, NextResponse } from "next/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const searchParams = req.nextUrl.searchParams;
  const query = searchParams.get("q") || "";
  const workspaceId = searchParams.get("workspaceId");
  const limit = parseInt(searchParams.get("limit") || "50");

  if (!query.trim()) {
    return NextResponse.json({
      contacts: [],
      replies: [],
      notes: [],
      campaigns: [],
    });
  }

  // Get workspace_id from query param or from user's workspace
  let activeWorkspaceId = workspaceId;
  if (!activeWorkspaceId) {
    const { data: membership } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .maybeSingle();
    activeWorkspaceId = membership?.workspace_id;
  }

  if (!activeWorkspaceId) {
    return NextResponse.json(
      { error: "No workspace found" },
      { status: 400 }
    );
  }

  // Call the search_all RPC function
  const { data: results, error } = await supabase.rpc("search_all", {
    p_query: query,
    p_workspace_id: activeWorkspaceId,
    p_limit: limit,
  });

  if (error) {
    console.error("Search error:", error);
    return NextResponse.json(
      { error: "Search failed", details: error.message },
      { status: 500 }
    );
  }

  // Group results by type
  const contacts: any[] = [];
  const leads: any[] = [];
  const replies: any[] = [];
  const notes: any[] = [];
  const campaigns: any[] = [];

  results?.forEach((result: any) => {
    const item = {
      id: result.id,
      title: result.title,
      subtitle: result.subtitle,
      ...result.metadata,
    };

    switch (result.type) {
      case "contact":
        contacts.push(item);
        break;
      case "lead":
        leads.push(item);
        break;
      case "reply":
        replies.push(item);
        break;
      case "note":
        notes.push(item);
        break;
      case "campaign":
        campaigns.push(item);
        break;
    }
  });

  return NextResponse.json({
    contacts,
    leads,
    replies,
    notes,
    campaigns,
  });
}

