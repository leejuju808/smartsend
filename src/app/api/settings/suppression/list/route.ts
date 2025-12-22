import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";

export async function GET() {
  try {
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: () => cookies() }
    );

    // Get current user
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Try to get workspace_id from cookie or user's first workspace
    const cookieStore = cookies();
    const workspaceId = cookieStore.get("ws")?.value || cookieStore.get("active_ws")?.value;
    
    // Also try org_id
    const orgId = cookieStore.get("org_id")?.value;

    // Build query - try org_id first, then workspace_id, then project_id
    let query = supabase
      .from("suppress_list")
      .select("email, kind, reason, source, created_at")
      .order("created_at", { ascending: false });

    if (orgId) {
      query = query.eq("org_id", orgId);
    } else if (workspaceId) {
      query = query.eq("workspace_id", workspaceId);
    } else {
      // Fallback: try to find user's workspace
      const { data: wsData } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      
      if (wsData?.workspace_id) {
        query = query.eq("workspace_id", wsData.workspace_id);
      } else {
        return NextResponse.json({ rows: [] });
      }
    }

    const { data, error } = await query;

    if (error) {
      console.error("Suppression list error:", error);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ rows: data || [] });
  } catch (e: any) {
    console.error("Suppression list error:", e);
    return NextResponse.json({ error: e?.message || "Unknown error" }, { status: 500 });
  }
}

