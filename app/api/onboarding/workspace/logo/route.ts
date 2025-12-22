import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";

export const maxDuration = 60;

export async function POST(req: Request) {
  const supabase = createClient();

  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();

  if (error || !user) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
  }

  // Get workspace_id from user's workspace_members
  const { data: membership, error: membershipError } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .eq("user_id", user.id)
    .limit(1)
    .single();

  if (membershipError || !membership) {
    return NextResponse.json({ error: "No workspace found for user" }, { status: 400 });
  }

  const workspaceId = membership.workspace_id;

  const buffer = Buffer.from(await file.arrayBuffer());
  const ext = file.name.split(".").pop() || "png";

  const path = `${workspaceId}/logo.${ext}`;

  const { data: uploadData, error: uploadError } = await supabase.storage
    .from("workspace-assets")
    .upload(path, buffer, {
      upsert: true,
      contentType: file.type || "image/png",
    });

  if (uploadError || !uploadData) {
    console.error(uploadError);
    return NextResponse.json({ error: "Failed to upload" }, { status: 500 });
  }

  const {
    data: { publicUrl },
  } = supabase.storage.from("workspace-assets").getPublicUrl(path);

  // Save directly on workspace
  const { error: updateError } = await supabase
    .from("workspaces")
    .update({ logo_url: publicUrl })
    .eq("id", workspaceId);

  if (updateError) {
    console.error(updateError);
  }

  return NextResponse.json({ url: publicUrl });
}










