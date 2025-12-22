// Block 20030 — Property Intelligence Builder
// Triggered when: new reply detected

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabaseClient = createClient(supabaseUrl, supabaseKey, {
  auth: { persistSession: false },
});

serve(async (req) => {
  try {
    const { thread_id, homeowner_email } = await req.json();

    if (!thread_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "thread_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get thread with contact info
    const { data: thread, error: threadError } = await supabaseClient
      .from("inbox_threads")
      .select("id, contact_id, campaign_id")
      .eq("id", thread_id)
      .single();

    if (threadError || !thread) {
      console.error("Failed to load thread:", threadError);
      return new Response(
        JSON.stringify({ ok: false, error: "Thread not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get contact info if contact_id exists
    let contactEmail = homeowner_email;
    let address = null;
    
    if (thread.contact_id && !homeowner_email) {
      const { data: contact } = await supabaseClient
        .from("contacts")
        .select("email, street, city, state, zip")
        .eq("id", thread.contact_id)
        .maybeSingle();

      if (contact) {
        contactEmail = contact.email;
        if (contact.street) {
          const parts = [
            contact.street,
            contact.city,
            contact.state,
            contact.zip
          ].filter(Boolean);
          address = parts.join(", ");
        }
      }
    }

    // Mock lookup for v1 (replace later with real API)
    // In production, this would call a property data API (e.g., PropertyRadar, CoreLogic, etc.)
    // For now, use mock data - in production, use the address to lookup real property data
    const mockData = {
      address: address || "1234 Elm St",
      sqft: 1890,
      beds: 3,
      baths: 2,
      year_built: 1998,
      roof_age: 17,
      last_replacement_year: 2008,
      property_value: 436000,
    };

    // Update thread with property intelligence
    const { error: updateError } = await supabaseClient
      .from("inbox_threads")
      .update({
        property_address: mockData.address,
        property_sqft: mockData.sqft,
        property_beds: mockData.beds,
        property_baths: mockData.baths,
        property_year_built: mockData.year_built,
        roof_age_estimated: mockData.roof_age,
        last_roof_replacement_year: mockData.last_replacement_year,
        property_value_estimated: mockData.property_value,
        updated_at: new Date().toISOString(),
      })
      .eq("id", thread_id);

    if (updateError) {
      console.error("Failed to update thread:", updateError);
      return new Response(
        JSON.stringify({ ok: false, error: updateError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({ 
        ok: true, 
        property_data: mockData 
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Property intel error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

