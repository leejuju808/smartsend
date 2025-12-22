import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE, {
  auth: { persistSession: false },
});

serve(async (req: Request) => {
  if (req.method !== "POST") {
    return new Response("Method not allowed", { status: 405 });
  }

  try {
    const payload = await req.json().catch(() => null);
    if (!payload) {
      return new Response("Invalid payload", { status: 400 });
    }

    // Extract booking data (adapt this mapping to your booking tool structure)
    const email = (payload.email || payload.guest_email || payload.invitee_email || "").toLowerCase().trim();
    const startTime = payload.start_time || payload.start_time_utc || payload.event_start_time;
    const endTime = payload.end_time || payload.end_time_utc || payload.event_end_time || null;
    const externalId = payload.id || payload.event_id || payload.booking_id || null;
    const location = payload.location || payload.location_name || "On-site";
    const notes = payload.notes || payload.event_notes || "";

    if (!email || !startTime) {
      console.error("Missing required fields:", { email, startTime });
      return new Response("Missing email/start_time", { status: 400 });
    }

    // 1) Find lead by email
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("email", email)
      .maybeSingle();

    if (leadError) {
      console.error("Lead lookup error:", leadError);
      return new Response("ok", { status: 200 }); // don't break webhook
    }

    if (!lead) {
      console.log("Lead not found for booking:", email);
      return new Response("ok", { status: 200 }); // don't break webhook
    }

    // Get user_id from lead (may be in user_id, workspace_id, or team_id)
    let userId = lead.user_id;
    if (!userId && lead.workspace_id) {
      // Get first workspace member as user_id
      const { data: member } = await supabase
        .from("workspace_members")
        .select("user_id")
        .eq("workspace_id", lead.workspace_id)
        .limit(1)
        .single();
      if (member) userId = member.user_id;
    }
    if (!userId && lead.team_id) {
      // Get first team member as user_id
      const { data: member } = await supabase
        .from("team_members")
        .select("user_id")
        .eq("team_id", lead.team_id)
        .limit(1)
        .single();
      if (member) userId = member.user_id;
    }

    if (!userId) {
      console.error("Could not determine user_id for lead:", lead.id);
      return new Response("ok", { status: 200 }); // don't break webhook
    }

    // 2) Create estimate
    const { data: estimate, error: estError } = await supabase
      .from("estimates")
      .insert({
        user_id: userId,
        lead_id: lead.id,
        start_time: startTime,
        end_time: endTime,
        source: "booking_link",
        location,
        notes,
        external_id: externalId,
      })
      .select("*")
      .single();

    if (estError) {
      console.error("estimate insert error:", estError);
      return new Response("Error", { status: 500 });
    }

    // 3) Move pipeline stage + set next_estimate_at
    const { error: stageError } = await supabase.rpc("mark_estimate_scheduled", {
      p_lead_id: lead.id,
      p_when: startTime,
    });

    if (stageError) {
      console.error("mark_estimate_scheduled error:", stageError);
    }

    // 4) Close any booking-related tasks
    const { error: taskError } = await supabase
      .from("tasks")
      .update({
        status: "done",
        completed_at: new Date().toISOString(),
      })
      .eq("lead_id", lead.id)
      .in("type", ["send_booking_link", "call_homeowner"]);

    if (taskError) {
      console.error("task update error:", taskError);
    }

    return new Response("ok", { status: 200 });
  } catch (error) {
    console.error("Webhook handler error:", error);
    return new Response("Internal server error", { status: 500 });
  }
});














































