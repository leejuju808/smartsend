// Block 62000 — SmartSend Roofing Material Shortage Checker v1
// Edge Function: /materials-check-shortage
// 
// Compares forecast vs delivery

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
    const { order_id } = await req.json();

    if (!order_id) {
      return new Response(
        JSON.stringify({ error: "order_id is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Use database function to check shortage
    const { data: shortageResult, error: shortageError } = await supabase
      .rpc("check_material_shortage", { p_order_id: order_id });

    if (shortageError) {
      console.error("Shortage check error:", shortageError);
      return new Response(
        JSON.stringify({ error: shortageError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Also check for over-orders
    const { data: overOrderResult } = await supabase
      .rpc("check_over_order", { p_order_id: order_id });

    return new Response(
      JSON.stringify({
        success: true,
        shortage_check: shortageResult,
        over_order_check: overOrderResult || { has_over_order: false, over_orders: [] }
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error in materials-check-shortage:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});





























