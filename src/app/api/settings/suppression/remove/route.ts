import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: Request) {
  try {
    const { email } = await req.json();
    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

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
    const orgId = cookieStore.get("org_id")?.value;

    // Build delete query - try org_id first, then workspace_id, then project_id
    let deleteQuery = supabase
      .from("suppress_list")
      .delete()
      .eq("email", email.toLowerCase());

    if (orgId) {
      deleteQuery = deleteQuery.eq("org_id", orgId);
    } else if (workspaceId) {
      deleteQuery = deleteQuery.eq("workspace_id", workspaceId);
    } else {
      // Fallback: try to find user's workspace
      const { data: wsData } = await supabase
        .from("workspace_members")
        .select("workspace_id")
        .eq("user_id", user.id)
        .limit(1)
        .maybeSingle();
      
      if (wsData?.workspace_id) {
        deleteQuery = deleteQuery.eq("workspace_id", wsData.workspace_id);
      } else {
        return NextResponse.json({ error: "No workspace found" }, { status: 400 });
      }
    }

    const { error } = await deleteQuery;

    if (error) {
      console.error("Remove suppression error:", error);
      return NextResponse.json({ ok: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (e: any) {
    console.error("Remove suppression error:", e);
    return NextResponse.json({ ok: false, error: e?.message || "Unknown error" }, { status: 500 });
  }
}

