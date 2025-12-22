import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const url = new URL(req.url);
  const lead_id = url.searchParams.get("lead_id");

  if (!lead_id) {
    return NextResponse.json(
      { error: "lead_id required" },
      { status: 400 }
    );
  }

  // Verify user has access to this lead's workspace
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  const { data: lead, error: leadError } = await supabase
    .from("leads")
    .select("id, workspace_id")
    .eq("id", lead_id)
    .single();

  if (leadError || !lead) {
    return NextResponse.json(
      { error: "Lead not found" },
      { status: 404 }
    );
  }

  // Check workspace access
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", lead.workspace_id)
    .eq("user_id", user.id)
    .maybeSingle();

  // Also check if user is workspace owner
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("owner_id")
    .eq("id", lead.workspace_id)
    .single();

  if (!membership && workspace?.owner_id !== user.id) {
    return NextResponse.json(
      { error: "No access to this workspace" },
      { status: 403 }
    );
  }

  const { data, error } = await supabase
    .from("lead_notes")
    .select("id, content, mentions, created_at, created_by")
    .eq("lead_id", lead_id)
    .order("created_at", { ascending: false });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Get unique user IDs from notes
  const userIds = [...new Set((data || []).map((n: any) => n.created_by).filter(Boolean))];

  // Fetch profiles for all users
  const { data: profiles } = userIds.length > 0
    ? await supabase
        .from("profiles")
        .select("id, full_name, email")
        .in("id", userIds)
    : { data: [] };

  // Create a map for quick lookup
  const profileMap = new Map((profiles || []).map((p: any) => [p.id, p]));

  // Transform data to match expected format
  const transformedData = (data || []).map((note: any) => ({
    id: note.id,
    content: note.content,
    mentions: note.mentions || [],
    created_at: note.created_at,
    users: profileMap.get(note.created_by) || null
  }));

  return NextResponse.json(transformedData);
}

