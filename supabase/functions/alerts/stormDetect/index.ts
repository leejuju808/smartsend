import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

interface StormAlertPayload {
  workspace_id: string;
  contact_id?: string;
  message_id?: string;
  storm_type: string; // 'hail', 'wind', 'leak', 'water_damage'
  location?: string;
  severity?: 'low' | 'medium' | 'high';
  metadata?: Record<string, any>;
}

Deno.serve(async (req) => {
  try {
    const payload: StormAlertPayload = await req.json();

    if (!payload.workspace_id || !payload.storm_type) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get contact info if provided
    let contactName = "Homeowner";
    let location = payload.location || "Unknown";

    if (payload.contact_id) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("email, first_name, last_name, city, state, postal_code")
        .eq("id", payload.contact_id)
        .single();

      if (contact) {
        contactName = contact.first_name || contact.email.split("@")[0];
        if (contact.city && contact.state) {
          location = `${contact.city}, ${contact.state}`;
        } else if (contact.postal_code) {
          location = contact.postal_code;
        }
      }
    }

    // Create alert message
    const stormEmoji = payload.storm_type === "hail" ? "🌨️" : 
                      payload.storm_type === "wind" ? "💨" : 
                      payload.storm_type === "leak" ? "💧" : "🌪️";

    const title = `${stormEmoji} Storm Damage — ${contactName} reported ${payload.storm_type}`;
    const message = `Location: ${location}. ${payload.severity === 'high' ? 'PRIORITY' : 'Review needed'}.`;

    // Get workspace members
    const { data: members } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", payload.workspace_id);

    if (!members || members.length === 0) {
      return new Response(
        JSON.stringify({ error: "No workspace members found" }),
        { status: 404 }
      );
    }

    // Create alerts
    const alertPromises = members.map(member =>
      supabase.rpc("create_alert", {
        p_workspace_id: payload.workspace_id,
        p_user_id: member.user_id,
        p_type: "storm_damage",
        p_title: title,
        p_message: message,
        p_contact_id: payload.contact_id || null,
        p_metadata: {
          storm_type: payload.storm_type,
          location,
          severity: payload.severity || "medium",
          ...payload.metadata,
        },
        p_source: "storm_detection",
      })
    );

    await Promise.all(alertPromises);

    return new Response(
      JSON.stringify({ ok: true, alerts_created: members.length }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in alerts/stormDetect:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});





















































