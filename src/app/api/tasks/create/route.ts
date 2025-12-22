import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { getCurrentWorkspaceId } from "@/lib/workspace";

export async function POST(req: NextRequest) {
  try {
    const { thread_id, lead_id, title, description, assigned_to, due_date } = await req.json();

    if (!title) {
      return NextResponse.json(
        { error: "title is required" },
        { status: 400 }
      );
    }

    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    let workspace_id: string | null = null;
    let final_lead_id: string | null = lead_id || null;

    // If thread_id is provided, get workspace_id and lead_id from thread
    if (thread_id) {
      const { data: thread, error: threadError } = await supabase
        .from("reply_threads")
        .select("lead_id, campaign_id")
        .eq("id", thread_id)
        .single();

      if (threadError || !thread) {
        return NextResponse.json(
          { error: "Thread not found" },
          { status: 404 }
        );
      }

      final_lead_id = thread.lead_id;

      // Get workspace_id from lead or campaign
      if (thread.campaign_id) {
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("workspace_id")
          .eq("id", thread.campaign_id)
          .single();
        workspace_id = campaign?.workspace_id || null;
      }

      if (!workspace_id && thread.lead_id) {
        const { data: lead } = await supabase
          .from("leads")
          .select("workspace_id")
          .eq("id", thread.lead_id)
          .single();
        workspace_id = lead?.workspace_id || null;
      }
    } else if (lead_id) {
      // If no thread_id but lead_id is provided, get workspace_id from lead
      const { data: lead } = await supabase
        .from("leads")
        .select("workspace_id")
        .eq("id", lead_id)
        .single();
      workspace_id = lead?.workspace_id || null;
    }

    // Fallback to current workspace if not found
    if (!workspace_id) {
      workspace_id = await getCurrentWorkspaceId();
    }

    if (!workspace_id) {
      return NextResponse.json(
        { error: "Workspace not found" },
        { status: 400 }
      );
    }

    // Create task
    const { data: task, error: insertError } = await supabase
      .from("tasks")
      .insert({
        workspace_id,
        thread_id: thread_id || null,
        lead_id: final_lead_id,
        assigned_to: assigned_to || null,
        created_by: user.id,
        title,
        description: description || null,
        due_date: due_date || null,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error creating task:", insertError);
      return NextResponse.json(
        { error: insertError.message },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true, task });
  } catch (error) {
    console.error("Error in create task:", error);
    return NextResponse.json(
      { error: "Internal server error" },
      { status: 500 }
    );
  }
}

