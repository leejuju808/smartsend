import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export async function PATCH(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  const supabase = createClient();
  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser();

  if (userError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Check if template exists and user has access
  const { data: existing, error: fetchError } = await supabase
    .from("templates")
    .select("id, workspace_id, created_by")
    .eq("id", params.id)
    .single();

  if (fetchError || !existing) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Check workspace membership
  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", existing.workspace_id)
    .eq("user_id", user.id)
    .single();

  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { html, subject } = body;

  if (!html) {
    return NextResponse.json({ error: "HTML content is required" }, { status: 400 });
  }

  const updateData: any = { html };
  if (subject !== undefined) updateData.subject = subject;

  // Update template
  const { data, error } = await supabase
    .from("templates")
    .update(updateData)
    .eq("id", params.id)
    .select()
    .single();

  if (error) {
    console.error("Error autosaving template:", error);
    return NextResponse.json({ error: "Failed to autosave" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, template: data });
}









