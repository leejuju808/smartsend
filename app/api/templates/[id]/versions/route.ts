import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

// GET: List versions for a template
export async function GET(
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
  const { data: template, error: templateError } = await supabase
    .from("templates")
    .select("id, workspace_id, created_by")
    .eq("id", params.id)
    .single();

  if (templateError || !template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Check workspace membership
  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", template.workspace_id)
    .eq("user_id", user.id)
    .single();

  if (!member) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  // Get versions (last 5 are kept automatically by trigger)
  const { data: versions, error } = await supabase
    .from("template_versions")
    .select("id, html, created_at")
    .eq("template_id", params.id)
    .order("created_at", { ascending: false })
    .limit(5);

  if (error) {
    console.error("Error fetching versions:", error);
    return NextResponse.json({ error: "Failed to fetch versions" }, { status: 500 });
  }

  return NextResponse.json({ versions: versions || [] });
}

// POST: Create a new version snapshot
export async function POST(
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
  const { data: template, error: templateError } = await supabase
    .from("templates")
    .select("id, workspace_id, created_by")
    .eq("id", params.id)
    .single();

  if (templateError || !template) {
    return NextResponse.json({ error: "Template not found" }, { status: 404 });
  }

  // Check workspace membership and ownership
  const { data: member } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("workspace_id", template.workspace_id)
    .eq("user_id", user.id)
    .single();

  if (!member || template.created_by !== user.id) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const body = await req.json();
  const { html } = body;

  if (!html) {
    return NextResponse.json({ error: "HTML content is required" }, { status: 400 });
  }

  // Check if last version was created more than 30 seconds ago
  const { data: lastVersion } = await supabase
    .from("template_versions")
    .select("created_at")
    .eq("template_id", params.id)
    .order("created_at", { ascending: false })
    .limit(1)
    .single();

  const now = new Date();
  const thirtySecondsAgo = new Date(now.getTime() - 30000);

  if (lastVersion && new Date(lastVersion.created_at) > thirtySecondsAgo) {
    // Skip creating version if less than 30s since last one
    return NextResponse.json({ ok: true, skipped: true });
  }

  // Create version snapshot
  const { data: version, error } = await supabase
    .from("template_versions")
    .insert({
      template_id: params.id,
      workspace_id: template.workspace_id,
      html,
    })
    .select()
    .single();

  if (error) {
    console.error("Error creating version:", error);
    return NextResponse.json({ error: "Failed to create version" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, version });
}









