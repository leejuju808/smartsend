// supabase/functions/revenue-syncQuote/index.ts
// Block 16400 — Revenue Engine v2: Sync Quote Data
// Syncs quote data when a quote is sent, updates job value and close probability

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
    const { contact_id, quote_amount, quote_pdf_url } = body;

    if (!contact_id || !quote_amount) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: contact_id and quote_amount" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Call the database function to sync quote data
    const { data, error } = await supabase.rpc("sync_quote_data", {
      p_contact_id: contact_id,
      p_quote_amount: parseFloat(quote_amount),
      p_quote_pdf_url: quote_pdf_url || null,
    });

    if (error) {
      console.error("Error syncing quote data:", error);
      return new Response(
        JSON.stringify({ error: error.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        success: true,
        ...data,
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





















































