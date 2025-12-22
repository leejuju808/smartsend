import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { type, id, user_id } = await req.json();

    const { data: { user }, error: userError } = await supabase.auth.getUser();
    if (userError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) {
      return NextResponse.json({ error: "No workspace found" }, { status: 400 });
    }

    if (type !== "lead" && type !== "thread") {
      return NextResponse.json({ error: "Invalid type. Use 'lead' or 'thread'" }, { status: 400 });
    }

    const table = type === "lead" ? "leads" : "reply_threads";

    // Update the owner
    const { error: updateError } = await supabase
      .from(table)
      .update({ owner_id: user_id || null })
      .eq("id", id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 400 });
    }

    // Log activity (don't await - fire and forget)
    supabase.from("activity_feed").insert({
      workspace_id: workspaceId,
      type: "assigned_to_user",
      metadata: { type, id, user_id: user_id || null },
      created_by: user.id,
    }).then(() => {}).catch(() => {});

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error assigning:", error);
    return NextResponse.json({ error: error.message || "Failed to assign" }, { status: 500 });
  }
}

