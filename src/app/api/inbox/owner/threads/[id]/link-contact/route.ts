import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * POST /api/inbox/owner/threads/[id]/link-contact
 * BLOCK 271000 — Default Reality Sprint
 * If a conversation has no contact_id, create/get a contact and link it.
 */
export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  try {
    const supabase = createClient();

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Not authenticated" }, { status: 401 });
    }

    const threadId = params.id;
    if (!threadId) return NextResponse.json({ error: "Missing thread id" }, { status: 400 });

    const body = await req.json().catch(() => ({}));
    const email = String(body?.email || "").trim();
    const first_name = body?.first_name ? String(body.first_name).trim() : null;
    const last_name = body?.last_name ? String(body.last_name).trim() : null;

    if (!email) {
      return NextResponse.json({ error: "email is required" }, { status: 400 });
    }

    // Load thread → workspace_id (via campaign), and ensure user has access.
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select(
        `
          id,
          contact_id,
          campaign_id,
          campaigns:campaign_id (
            workspace_id
          )
        `
      )
      .eq("id", threadId)
      .single();

    if (threadError || !thread) {
      return NextResponse.json({ error: "Thread not found" }, { status: 404 });
    }

    const workspaceId = (thread as any)?.campaigns?.workspace_id ?? null;
    if (!workspaceId) {
      return NextResponse.json({ error: "Thread workspace not found" }, { status: 400 });
    }

    const { data: membership, error: membershipError } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", workspaceId)
      .eq("user_id", user.id)
      .maybeSingle();

    if (membershipError || !membership) {
      return NextResponse.json({ error: "Not allowed" }, { status: 403 });
    }

    // Create (or reuse) a contact inside the workspace, then link it to the thread.
    const { data: contactId, error: contactError } = await supabase.rpc("get_or_create_contact", {
      p_workspace_id: workspaceId,
      p_email: email,
      p_first_name: first_name,
      p_last_name: last_name,
    });

    if (contactError || !contactId) {
      return NextResponse.json({ error: contactError?.message || "Failed to create contact" }, { status: 500 });
    }

    const { data: updated, error: updateError } = await supabase
      .from("inbox_threads")
      .update({ contact_id: contactId })
      .eq("id", threadId)
      .select("id, contact_id")
      .single();

    if (updateError) {
      return NextResponse.json({ error: updateError.message }, { status: 500 });
    }

    return NextResponse.json({ ok: true, thread: updated });
  } catch (error: any) {
    console.error("Error in link-contact route:", error);
    return NextResponse.json({ error: error.message || "Internal server error" }, { status: 500 });
  }
}





