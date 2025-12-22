import { NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";

export async function POST(req: Request) {
  const supabase = createRouteHandlerClient({ cookies });
  const { lead_id, content, mentions } = await req.json();

  if (!lead_id || !content) {
    return NextResponse.json(
      { error: "lead_id and content are required" },
      { status: 400 }
    );
  }

  // Get user id
  const {
    data: { user }
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json(
      { error: "Not authenticated" },
      { status: 401 }
    );
  }

  // Verify user has access to this lead's workspace
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
    .insert({
      lead_id,
      created_by: user.id,
      content,
      mentions: mentions ?? []
    })
    .select("*")
    .single();

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json(data);
}










































