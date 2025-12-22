import { NextRequest, NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { getCurrentWorkspaceId } from "@/lib/workspace";
import { cookies } from "next/headers";

export async function POST(req: NextRequest) {
  try {
    const { thread_id, owner_id } = await req.json();
    if (!thread_id) {
      return NextResponse.json({ error: "Thread ID required" }, { status: 400 });
    }

    // Get current user for permission check
    const cookieStore = await cookies();
    const { createServerClient } = await import("@supabase/ssr");
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get: (k) => cookieStore.get(k)?.value,
        },
      }
    );
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    // Get workspace from thread
    const { data: thread } = await supabaseAdmin
      .from("email_threads")
      .select("workspace_id")
      .eq("id", thread_id)
      .single();

    if (!thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    // Check permission: user must be owner/admin in the workspace
    const { data: member } = await supabaseAdmin
      .from("team_members")
      .select("role")
      .eq("workspace_id", thread.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      // Fallback to workspace_members
      const { data: wm } = await supabaseAdmin
        .from("workspace_members")
        .select("role")
        .eq("workspace_id", thread.workspace_id)
        .eq("user_id", user.id)
        .single();
      
      if (!wm || (wm.role !== 'owner' && wm.role !== 'admin')) {
        return NextResponse.json({ error: "Permission denied" }, { status: 403 });
      }
    }

    // Update thread owner
    const { error: updateError } = await supabaseAdmin
      .from("email_threads")
      .update({ owner_id: owner_id || null })
      .eq("id", thread_id);

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error: any) {
    console.error("Error assigning thread owner:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}

