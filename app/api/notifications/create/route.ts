import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

function createServiceClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
  );
}

export async function POST(req: NextRequest) {
  try {
    const { user_id, type, title, body, link, workspace_id } = await req.json();

    if (!user_id || !type || !title) {
      return NextResponse.json(
        { error: "user_id, type, and title are required" },
        { status: 400 }
      );
    }

    const supabase = createServiceClient();

    // Determine workspace_id if not provided
    let finalWorkspaceId = workspace_id;
    if (!finalWorkspaceId) {
      const { data: member } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user_id)
        .limit(1)
        .maybeSingle();

      if (member?.workspace_id) {
        finalWorkspaceId = member.workspace_id;
      }
    }

    const { data, error } = await supabase
      .from("notifications")
      .insert({
        user_id,
        workspace_id: finalWorkspaceId,
        type,
        title,
        body,
        link,
      })
      .select()
      .single();

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ ok: true, notification: data });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}










