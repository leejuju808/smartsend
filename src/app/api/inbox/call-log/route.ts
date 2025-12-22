import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

export async function POST(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { contact_id, thread_id, call_type, outcome, notes } = body;

    if (!contact_id || !thread_id) {
      return NextResponse.json(
        { error: "contact_id and thread_id are required" },
        { status: 400 }
      );
    }

    // Get workspace_id from contact
    const { data: contact, error: contactError } = await supabase
      .from("contacts")
      .select("workspace_id")
      .eq("id", contact_id)
      .single();

    if (contactError || !contact) {
      return NextResponse.json(
        { error: "Contact not found" },
        { status: 404 }
      );
    }

    // Verify user has access to this workspace
    const { data: member } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("workspace_id", contact.workspace_id)
      .eq("user_id", user.id)
      .single();

    if (!member) {
      return NextResponse.json(
        { error: "Access denied" },
        { status: 403 }
      );
    }

    // Insert call log
    const { data: callLog, error: insertError } = await supabase
      .from("call_logs")
      .insert({
        workspace_id: contact.workspace_id,
        contact_id,
        thread_id,
        call_type: call_type || "attempted",
        outcome,
        notes,
        created_by: user.id,
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting call log:", insertError);
      return NextResponse.json(
        { error: "Failed to log call", details: insertError.message },
        { status: 500 }
      );
    }

    // If outcome is provided, trigger task automation
    if (outcome) {
      try {
        await supabase.rpc("create_task_from_call_outcome", {
          p_call_log_id: callLog.id,
          p_outcome: outcome,
          p_contact_id: contact_id,
          p_thread_id: thread_id,
        });
      } catch (err) {
        // Don't fail if task creation fails
        console.error("Failed to create task from call outcome:", err);
      }
    }

    return NextResponse.json({ call_log: callLog });
  } catch (error: any) {
    console.error("Error in call-log route:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}



















































