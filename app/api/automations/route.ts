import { NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import { cookies } from "next/headers";

export async function GET(req: Request) {
  try {
    const supabase = createClient();
    const { searchParams } = new URL(req.url);
    
    // Get workspace_id from query params or cookie
    const cookieStore = await cookies();
    const workspaceId =
      searchParams.get("workspace_id") ||
      cookieStore.get("active_ws")?.value ||
      cookieStore.get("active_wid")?.value ||
      cookieStore.get("ws")?.value;

    if (!workspaceId) {
      return NextResponse.json(
        { error: "workspace_id is required" },
        { status: 400 }
      );
    }

    const { data, error } = await supabase
      .from("automations")
      .select("*")
      .eq("workspace_id", workspaceId)
      .order("created_at", { ascending: false });

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    return NextResponse.json({ automations: data ?? [] });
  } catch (error) {
    console.error("Error fetching automations:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}










