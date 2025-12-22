// Block 33602 — Get Booking Link Edge Function
// Generates a unique booking link for a contractor-lead pair

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const { contractor_id, lead_id, expires_in_hours } = await req.json();

    if (!contractor_id || !lead_id) {
      return new Response(
        JSON.stringify({ error: "contractor_id and lead_id are required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Verify contractor and lead exist
    const { data: contractor } = await supabase
      .from("profiles")
      .select("id")
      .eq("id", contractor_id)
      .single();

    if (!contractor) {
      return new Response(
        JSON.stringify({ error: "Contractor not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    const { data: lead } = await supabase
      .from("leads")
      .select("id")
      .eq("id", lead_id)
      .single();

    if (!lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Generate booking link token using database function
    const { data: token, error: tokenError } = await supabase.rpc(
      "generate_booking_link",
      {
        p_contractor_id: contractor_id,
        p_lead_id: lead_id,
        p_expires_in_hours: expires_in_hours || 168, // Default 7 days
      }
    );

    if (tokenError || !token) {
      console.error("Error generating booking link:", tokenError);
      return new Response(
        JSON.stringify({ error: "Failed to generate booking link" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get app URL from environment
    const appUrl = Deno.env.get("APP_URL") || Deno.env.get("NEXT_PUBLIC_APP_URL") || "https://smartsend.ai";
    const bookingUrl = `${appUrl}/book?t=${token}&c=${contractor_id}&l=${lead_id}`;

    return new Response(
      JSON.stringify({ 
        ok: true, 
        url: bookingUrl,
        token: token,
        expires_in_hours: expires_in_hours || 168
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error: any) {
    console.error("Error in get-booking-link:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

































