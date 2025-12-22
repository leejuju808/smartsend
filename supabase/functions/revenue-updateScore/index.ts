// supabase/functions/revenue-updateScore/index.ts
// Block 16400 — Revenue Engine v2: Update Close Probability Score
// Updates close probability score for a contact

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response(
      JSON.stringify({ error: "Method not allowed" }),
      { status: 405, headers: { "Content-Type": "application/json" } }
    );
  }

  try {
    const body = await req.json();
    const { contact_id } = body;

    if (!contact_id) {
      return new Response(
        JSON.stringify({ error: "Missing required field: contact_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Call the database function to calculate close probability
    const { data, error } = await supabase.rpc("calculate_close_probability", {
      p_contact_id: contact_id,
    });

    if (error) {
      console.error("Error calculating close probability:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch the updated close probability data
    const { data: closeProbData, error: fetchError } = await supabase
      .from("close_probability")
      .select("*")
      .eq("contact_id", contact_id)
      .single();

    if (fetchError) {
      console.error("Error fetching close probability:", fetchError);
      return new Response(
        JSON.stringify({ error: fetchError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        contact_id,
        close_probability: data,
        breakdown: closeProbData,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});





















































