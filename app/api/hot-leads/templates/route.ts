// app/api/hot-leads/templates/route.ts
// Block 97000 — Hot Reply Templates API
// Returns one-click reply templates for hot leads

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function GET(req: NextRequest) {
  const supabase = createClient();
  
  const {
    data: { user },
    error: authError,
  } = await supabase.auth.getUser();

  if (authError || !user) {
    return NextResponse.json(
      { error: "Unauthorized" },
      { status: 401 }
    );
  }

  // Get workspace
  const { data: membership } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .eq("is_default", true)
    .single();

  const workspaceId = membership?.workspace_id;

  // Get templates (global + workspace-specific)
  const { data: templates, error } = await supabase
    .from("hot_reply_templates")
    .select("*")
    .or(`workspace_id.is.null,workspace_id.eq.${workspaceId}`)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error fetching reply templates:", error);
    return NextResponse.json(
      { error: "Failed to fetch templates" },
      { status: 500 }
    );
  }

  return NextResponse.json(templates || []);
}


























