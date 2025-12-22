import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/src/lib/workspace";

export async function GET(
  req: NextRequest,
  { params }: { params: { context: string } }
) {
  try {
    const supabase = createClient();
    const workspaceId = await getCurrentWorkspaceId();

    if (!workspaceId) {
      return NextResponse.json({ error: "Workspace not found" }, { status: 400 });
    }

    const context = params.context;
    if (!["inbox", "leads", "pipeline", "campaigns"].includes(context)) {
      return NextResponse.json({ error: "Invalid context" }, { status: 400 });
    }

    const { data, error } = await supabase
      .from("saved_filters")
      .select("*")
      .eq("workspace_id", workspaceId)
      .eq("context", context)
      .order("created_at", { ascending: false });

    if (error) {
      console.error("Error fetching saved filters:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ filters: data ?? [] });
  } catch (error: any) {
    console.error("Unexpected error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

