import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";

/**
 * POST /api/inbox/calendar/suggest-times
 * Generate AI-powered time suggestions for appointments
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const {
      thread_id,
      contact_id,
      job_type,
      severity,
      urgency,
      location_zip,
    } = body;

    if (!thread_id && !contact_id) {
      return NextResponse.json(
        { error: "thread_id or contact_id is required" },
        { status: 400 }
      );
    }

    // Get user's workspace
    const { data: workspaceMember } = await supabase
      .from("workspace_members")
      .select("workspace_id")
      .eq("user_id", user.id)
      .limit(1)
      .single();

    if (!workspaceMember) {
      return NextResponse.json(
        { error: "No workspace found" },
        { status: 404 }
      );
    }

    // Get thread/contact context if available
    let threadData = null;
    let contactData = null;

    if (thread_id) {
      const { data: thread } = await supabase
        .from("inbox_threads")
        .select(`
          id,
          contact_id,
          ai_overall_intent,
          highest_lead_score,
          revenue_metadata
        `)
        .eq("id", thread_id)
        .single();

      threadData = thread;
    }

    if (contact_id) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("id, zip_code")
        .eq("id", contact_id)
        .single();

      contactData = contact;
    }

    // Extract metadata
    const finalJobType = job_type || threadData?.revenue_metadata?.job_type || null;
    const finalSeverity = severity || threadData?.ai_overall_intent || null;
    const finalUrgency = urgency || (finalSeverity === "hot" ? "emergency" : "normal");
    const finalZip = location_zip || contactData?.zip_code || null;

    // Generate smart time suggestions using database function
    const { data: suggestions, error: suggestError } = await supabase.rpc(
      "generate_smart_time_suggestions",
      {
        p_workspace_id: workspaceMember.workspace_id,
        p_thread_id: thread_id || null,
        p_contact_id: contact_id || threadData?.contact_id || null,
        p_job_type: finalJobType,
        p_severity: finalSeverity,
        p_urgency: finalUrgency,
        p_location_zip: finalZip,
      }
    );

    if (suggestError) {
      console.error("Error generating suggestions:", suggestError);
      // Fallback to simple suggestions
      const fallbackSuggestions = [
        {
          suggested_start_time: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
          suggested_end_time: new Date(Date.now() + 25 * 60 * 60 * 1000).toISOString(),
          confidence_score: 0.7,
          suggestion_reason: "Next available time slot",
        },
      ];
      return NextResponse.json({ suggestions: fallbackSuggestions });
    }

    return NextResponse.json({ suggestions: suggestions || [] });
  } catch (error: any) {
    console.error("Error in suggest-times route:", error);
    return NextResponse.json(
      { error: "Internal server error", details: error.message },
      { status: 500 }
    );
  }
}



















































