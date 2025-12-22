import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const supabase = createClient();
  const { id } = await params;
  const leadId = id;

  // Get authenticated user
  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Verify lead exists and user has access
  const { data: lead, error: leadErr } = await supabase
    .from("leads")
    .select("id, workspace_id")
    .eq("id", leadId)
    .single();

  if (leadErr || !lead) {
    return NextResponse.json({ error: "Lead not found" }, { status: 404 });
  }

  // Verify workspace access
  const { data: membership, error: memErr } = await supabase
    .from("team_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .single();

  if (memErr || !membership) {
    return NextResponse.json({ error: "no_workspace" }, { status: 400 });
  }

  // Verify lead belongs to user's workspace
  if (lead.workspace_id !== membership.workspace_id) {
    return NextResponse.json({ error: "Access denied" }, { status: 403 });
  }

  const updates = await req.json();

  // Only allow updating specific fields
  const allowedFields = [
    "first_name",
    "last_name",
    "email",
    "company",
    "phone",
    "notes",
  ];

  const filteredUpdates: Record<string, any> = {};
  for (const key of allowedFields) {
    if (key in updates) {
      filteredUpdates[key] = updates[key];
    }
  }

  const { error } = await supabase
    .from("leads")
    .update(filteredUpdates)
    .eq("id", leadId);

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ success: true });
}



