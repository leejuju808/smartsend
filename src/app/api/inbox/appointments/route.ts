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
    const {
      contact_id,
      thread_id,
      date,
      time,
      duration_minutes,
      job_type,
      address,
      notes,
    } = body;

    if (!contact_id || !date || !time) {
      return NextResponse.json(
        { error: "contact_id, date, and time are required" },
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

    // Insert appointment
    const { data: appointment, error: insertError } = await supabase
      .from("appointments")
      .insert({
        workspace_id: contact.workspace_id,
        contact_id,
        thread_id,
        date,
        time,
        duration_minutes: duration_minutes || 30,
        job_type,
        address,
        notes,
        created_by: user.id,
        status: "scheduled",
      })
      .select()
      .single();

    if (insertError) {
      console.error("Error inserting appointment:", insertError);
      return NextResponse.json(
        { error: "Failed to create appointment", details: insertError.message },
        { status: 500 }
      );
    }

    // Update contact status to "booked" if not already
    await supabase
      .from("contacts")
      .update({ status: "booked" })
      .eq("id", contact_id)
      .neq("status", "won");

    // Create or update CRM job
    if (thread_id) {
      try {
        await supabase.rpc("sync_crm_job_from_action", {
          p_thread_id: thread_id,
          p_contact_id: contact_id,
          p_action_type: "mark_booked",
          p_metadata: JSON.stringify({
            job_type,
            appointment_id: appointment.id,
            date,
            time,
          }),
        });
      } catch (err) {
        // Don't fail if CRM sync fails
        console.error("Failed to sync CRM job:", err);
      }
    }

    return NextResponse.json({ appointment });
  } catch (error: any) {
    console.error("Error in appointments route:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}



















































