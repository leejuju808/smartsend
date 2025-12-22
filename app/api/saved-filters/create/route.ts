import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/src/lib/workspace";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const workspaceId = await getCurrentWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
    }

    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { name, context, filter, shared } = body;

    if (!name || !context || !filter) {
      return NextResponse.json(
        { error: "Missing required fields: name, context, filter" },
        { status: 400 }
      );
    }

    if (!["inbox", "leads", "pipeline", "campaigns"].includes(context)) {
      return NextResponse.json({ error: "Invalid context" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("saved_filters")
      .insert({
        workspace_id: workspaceId,
        name,
        context,
        filter,
        shared: shared ?? false,
        created_by: user.id,
      })
      .select()
      .single();

    if (error) {
      console.error("Error creating saved filter:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, filter: data });
  } catch (error: any) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

