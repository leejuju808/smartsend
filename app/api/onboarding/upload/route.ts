import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(req: Request) {
  const supabase = createClient();

  const form = await req.formData();
  const file = form.get("file") as File;

  if (!file) {
    return NextResponse.json({ error: "No file" }, { status: 400 });
  }

  const bytes = await file.arrayBuffer();
  const buffer = Buffer.from(bytes);

  const { data: { user }, error: authError } = await supabase.auth.getUser();
  if (authError || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  // Get workspace_id
  const workspace_id = await getCurrentWorkspaceId();
  if (!workspace_id) {
    return NextResponse.json({ error: "Workspace not found" }, { status: 404 });
  }

  // Upload to Supabase Storage
  const { data, error } = await supabase.storage
    .from("lead_uploads")
    .upload(`${workspace_id}/onboarding/upload.csv`, buffer, {
      upsert: true,
      contentType: "text/csv",
    });

  if (error) {
    console.error("Storage upload error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  // Update onboarding step
  const { error: updateError } = await supabase
    .from("workspaces")
    .update({ onboarding_step: "map_columns" })
    .eq("id", workspace_id);

  if (updateError) {
    console.error("Failed to update onboarding step:", updateError);
    // Don't fail the request if update fails, but log it
  }

  return NextResponse.json({ success: true });
}











