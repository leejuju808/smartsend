// Block 94000 — Homeowner Reschedule Request API
// POST /api/homeowner/reschedule-request
// Creates a reschedule request from homeowner portal

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();
    const {
      portal_token,
      job_id,
      preferred_date,
      preferred_time,
      reason,
    } = body;

    if (!portal_token || !job_id || !preferred_date) {
      return NextResponse.json(
        { error: "portal_token, job_id, and preferred_date are required" },
        { status: 400 }
      );
    }

    // Validate portal token
    const { data: portal, error: portalError } = await supabase
      .from("homeowner_portals")
      .select("id, job_id, workspace_id")
      .eq("portal_token", portal_token)
      .eq("is_active", true)
      .single();

    if (portalError || !portal) {
      return NextResponse.json(
        { error: "Invalid portal token" },
        { status: 404 }
      );
    }

    // Get current production slot for this job
    const { data: currentSlot, error: slotError } = await supabase
      .from("job_production_slots")
      .select("id, start_date, end_date, crew_id")
      .eq("job_id", job_id)
      .eq("status", "scheduled")
      .order("start_date", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (slotError) {
      console.error("Error fetching production slot:", slotError);
    }

    // Create reschedule request in production_calendar_reschedule_log
    // Mark it as homeowner_request type
    const rescheduleData: any = {
      workspace_id: portal.workspace_id,
      production_slot_id: currentSlot?.id || null,
      job_id: job_id,
      old_start_date: currentSlot?.start_date || new Date().toISOString().split("T")[0],
      old_end_date: currentSlot?.end_date || new Date().toISOString().split("T")[0],
      new_start_date: preferred_date,
      new_end_date: preferred_date, // Default to same day, can be adjusted
      reschedule_type: "homeowner_request",
      triggered_by: "homeowner_portal",
      reschedule_reason: reason
        ? `Homeowner request: ${reason}`
        : `Homeowner requested reschedule. Preferred time: ${preferred_time}`,
      homeowner_notified: false, // Will be notified when confirmed
      crew_notified: false,
      supplier_notified: false,
    };

    const { data: rescheduleLog, error: logError } = await supabase
      .from("production_calendar_reschedule_log")
      .insert(rescheduleData)
      .select()
      .single();

    if (logError) {
      console.error("Error creating reschedule log:", logError);
      // If production_calendar_reschedule_log doesn't exist, create a message instead
      const { data: message, error: messageError } = await supabase
        .from("homeowner_messages")
        .insert({
          portal_id: portal.id,
          job_id: job_id,
          direction: "incoming",
          channel: "portal",
          body: `Reschedule request: Preferred date ${preferred_date}, time: ${preferred_time}${reason ? `. Reason: ${reason}` : ""}`,
        })
        .select()
        .single();

      if (messageError) {
        console.error("Error creating message:", messageError);
        return NextResponse.json(
          { error: "Failed to submit reschedule request" },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        message: "Reschedule request submitted via message",
        request_id: message.id,
      });
    }

    // Also create a message for visibility
    await supabase.from("homeowner_messages").insert({
      portal_id: portal.id,
      job_id: job_id,
      direction: "incoming",
      channel: "portal",
      body: `Reschedule request submitted. Preferred date: ${preferred_date}, time: ${preferred_time}${reason ? `. Reason: ${reason}` : ""}`,
    });

    return NextResponse.json({
      success: true,
      reschedule_request: rescheduleLog,
      message: "Reschedule request submitted successfully",
    });
  } catch (error: any) {
    console.error("Error in reschedule-request API:", error);
    return NextResponse.json(
      { error: error.message || "Internal server error" },
      { status: 500 }
    );
  }
}



























