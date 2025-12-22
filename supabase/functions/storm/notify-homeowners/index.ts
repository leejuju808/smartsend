// Block 53000 — SmartSend Roofing "Storm Response + Emergency Dispatch System" v1
// Edge Function: /storm/notify-homeowners
// 
// Sends alerts to each homeowner in affected zip codes

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { storm_id, workspace_id } = await req.json();

    if (!storm_id) {
      return new Response(
        JSON.stringify({ error: "storm_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Get storm event
    const { data: stormEvent, error: stormError } = await supabase
      .from("storm_events")
      .select("*")
      .eq("id", storm_id)
      .single();

    if (stormError || !stormEvent) {
      throw new Error("Storm event not found");
    }

    const wsId = workspace_id || stormEvent.workspace_id;
    if (!wsId) {
      throw new Error("workspace_id is required");
    }

    // Get homeowners in affected zip codes
    const { data: homeowners, error: homeownersError } = await supabase
      .rpc("get_homeowners_in_zips", {
        p_workspace_id: wsId,
        p_zip_codes: stormEvent.affected_zips,
      });

    if (homeownersError) {
      throw homeownersError;
    }

    if (!homeowners || homeowners.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, message: "No homeowners found in affected areas", notified: 0 }),
        { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Also check leads/contacts in affected zips
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("id, email, name, zip_code")
      .eq("workspace_id", wsId)
      .in("zip_code", stormEvent.affected_zips);

    const { data: contacts, error: contactsError } = await supabase
      .from("contacts")
      .select("id, email, name, zip_code")
      .eq("workspace_id", wsId)
      .in("zip_code", stormEvent.affected_zips);

    let notified = 0;
    const notifications = [];

    // Notify homeowners
    for (const homeowner of homeowners || []) {
      if (!homeowner.email) continue;

      const notificationChannels: string[] = ["email"];

      // Create notification record
      const { data: notification, error: notifError } = await supabase
        .from("storm_notifications")
        .insert({
          storm_id,
          workspace_id: wsId,
          homeowner_id: homeowner.homeowner_id,
          lead_id: homeowner.lead_id,
          contact_id: homeowner.contact_id,
          email: homeowner.email,
          zip_code: homeowner.zip_code,
          notified_via: notificationChannels,
          notified_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (!notifError && notification) {
        notifications.push(notification);
        notified++;

        // Send email notification
        await sendStormEmail({
          to: homeowner.email,
          name: homeowner.name || "Homeowner",
          stormType: stormEvent.storm_type,
          eventDate: stormEvent.event_date,
          zipCode: homeowner.zip_code,
          workspaceId: wsId,
        });
      }
    }

    // Notify leads
    for (const lead of leads || []) {
      if (!lead.email) continue;

      // Check if already notified
      const existing = notifications.find(n => n.email === lead.email);
      if (existing) continue;

      const { data: notification, error: notifError } = await supabase
        .from("storm_notifications")
        .insert({
          storm_id,
          workspace_id: wsId,
          lead_id: lead.id,
          email: lead.email,
          zip_code: lead.zip_code,
          notified_via: ["email"],
          notified_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (!notifError && notification) {
        notifications.push(notification);
        notified++;

        await sendStormEmail({
          to: lead.email,
          name: lead.name || "Homeowner",
          stormType: stormEvent.storm_type,
          eventDate: stormEvent.event_date,
          zipCode: lead.zip_code,
          workspaceId: wsId,
        });
      }
    }

    // Notify contacts
    for (const contact of contacts || []) {
      if (!contact.email) continue;

      const existing = notifications.find(n => n.email === contact.email);
      if (existing) continue;

      const { data: notification, error: notifError } = await supabase
        .from("storm_notifications")
        .insert({
          storm_id,
          workspace_id: wsId,
          contact_id: contact.id,
          email: contact.email,
          zip_code: contact.zip_code,
          notified_via: ["email"],
          notified_at: new Date().toISOString(),
        })
        .select()
        .single();

      if (!notifError && notification) {
        notifications.push(notification);
        notified++;

        await sendStormEmail({
          to: contact.email,
          name: contact.name || "Homeowner",
          stormType: stormEvent.storm_type,
          eventDate: stormEvent.event_date,
          zipCode: contact.zip_code,
          workspaceId: wsId,
        });
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        notified,
        notifications: notifications.length,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in storm/notify-homeowners:", error);
    return new Response(
      JSON.stringify({
        ok: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});

async function sendStormEmail({
  to,
  name,
  stormType,
  eventDate,
  zipCode,
  workspaceId,
}: {
  to: string;
  name: string;
  stormType: string;
  eventDate: string;
  zipCode: string;
  workspaceId: string;
}) {
  // Get workspace info for branding
  const { data: workspace } = await supabase
    .from("workspaces")
    .select("name")
    .eq("id", workspaceId)
    .single();

  const companyName = workspace?.name || "Your Roofing Company";

  const stormTypeLabel = {
    hail: "Hailstorm",
    wind: "High Wind Event",
    rain: "Severe Rain",
    ice: "Ice Storm",
    tree_impact: "Tree Impact",
  }[stormType] || "Storm Event";

  const subject = `${stormTypeLabel} Detected in Your Area`;
  const body = `
Hi ${name},

A ${stormTypeLabel.toLowerCase()} was detected in your area (${zipCode}) on ${eventDate}.

Your roof may have been impacted.

Click here to request a free emergency inspection: [INSPECTION_LINK]

Best regards,
${companyName}
  `.trim();

  // In production, use your email service (Resend, SendGrid, etc.)
  // For now, log it
  console.log(`Would send email to ${to}:`, { subject, body });

  // TODO: Integrate with email service
  // await sendEmail({ to, subject, body });
}
































