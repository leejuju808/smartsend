// Block 44000 — SmartSend Roofing Homeowner Portal + Live Job Tracker v1
// Edge Function: /homeowner/approve-change-order
// 
// Handles homeowner approval/decline of change orders
// Input: { token: string, change_order_id: string, action: 'approved' | 'declined' }
// Output: { success: boolean, change_order: object }

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
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { token, change_order_id, action } = await req.json();

    if (!token || !change_order_id || !action) {
      return new Response(
        JSON.stringify({ error: "token, change_order_id, and action are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (action !== "approved" && action !== "declined") {
      return new Response(
        JSON.stringify({ error: "action must be 'approved' or 'declined'" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate token and get homeowner
    const { data: session, error: sessionError } = await supabase
      .from("homeowner_sessions")
      .select("*, homeowners(id, job_id)")
      .eq("token", token)
      .single();

    if (sessionError || !session) {
      return new Response(
        JSON.stringify({ error: "Invalid or expired token" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (new Date(session.expires_at) < new Date()) {
      return new Response(
        JSON.stringify({ error: "Token has expired" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const homeowner = session.homeowners as any;

    // Verify change order belongs to homeowner's job
    const { data: changeOrder, error: coError } = await supabase
      .from("change_orders")
      .select("*, job_id")
      .eq("id", change_order_id)
      .single();

    if (coError || !changeOrder) {
      return new Response(
        JSON.stringify({ error: "Change order not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (changeOrder.job_id !== homeowner.job_id) {
      return new Response(
        JSON.stringify({ error: "Change order does not belong to this job" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if already has an action
    const { data: existingAction } = await supabase
      .from("homeowner_change_order_action")
      .select("id")
      .eq("change_order_id", change_order_id)
      .single();

    if (existingAction) {
      return new Response(
        JSON.stringify({ error: "Change order already has a homeowner action" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Insert homeowner action (trigger will update change order status)
    const { data: actionData, error: actionError } = await supabase
      .from("homeowner_change_order_action")
      .insert({
        change_order_id,
        homeowner_id: homeowner.id,
        action: action === "approved" ? "approved" : "declined",
      })
      .select()
      .single();

    if (actionError) {
      console.error("Error inserting homeowner action:", actionError);
      return new Response(
        JSON.stringify({ error: "Failed to record homeowner action" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Fetch updated change order
    const { data: updatedCO, error: updatedError } = await supabase
      .from("change_orders")
      .select("*")
      .eq("id", change_order_id)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        change_order: updatedCO,
        homeowner_action: actionData,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in approve-change-order:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
































