import { NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export const runtime = "nodejs";

export async function GET() {
  try {
    const supabase = createClient();
    const workspaceId = await getCurrentWorkspaceId();
    if (!workspaceId) return NextResponse.json({ error: "Workspace not found" }, { status: 404 });

    const {
      data: { user },
    } = await supabase.auth.getUser();
    if (!user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { data: campaigns, error } = await supabase
      .from("campaigns")
      .select("id,name,template_type,status,created_at")
      .eq("workspace_id", workspaceId)
      .not("template_type", "is", null)
      .order("created_at", { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ ok: true, campaigns: campaigns || [] });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || "Internal server error" }, { status: 500 });
  }
}










