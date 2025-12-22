// Block 52000 — SmartSend Roofing Warranty Tracking + Service Call System v1
// Edge Function: /service/create-ticket
// Creates a service ticket from homeowner portal or owner dashboard

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
    const {
      job_id,
      homeowner_id,
      category,
      description,
      homeowner_photos,
      urgency,
    } = await req.json();

    if (!job_id || !category || !description) {
      return new Response(
        JSON.stringify({
          error: "job_id, category, and description are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Validate category
    const validCategories = [
      "leak",
      "missing_shingle",
      "vent_issue",
      "flashing_issue",
      "gutter_issue",
      "other",
    ];
    if (!validCategories.includes(category)) {
      return new Response(
        JSON.stringify({ error: "Invalid category" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select("id, workspace_id")
      .eq("id", job_id)
      .single();

    if (jobError || !job) {
      return new Response(
        JSON.stringify({ error: "Job not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get homeowner_id if not provided
    let finalHomeownerId = homeowner_id;
    if (!finalHomeownerId) {
      const { data: homeowner } = await supabase
        .from("homeowners")
        .select("id")
        .eq("job_id", job_id)
        .limit(1)
        .maybeSingle();

      finalHomeownerId = homeowner?.id || null;
    }

    // Get warranty_id if exists
    const { data: warranty } = await supabase
      .from("warranties")
      .select("id")
      .eq("job_id", job_id)
      .eq("status", "active")
      .gte("expiration_date", new Date().toISOString().split("T")[0])
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    // Determine urgency based on category if not provided
    let finalUrgency = urgency || "medium";
    if (category === "leak") {
      finalUrgency = "high";
    }

    // Create service ticket (warranty_status will be auto-classified by trigger)
    const { data: ticket, error: ticketError } = await supabase
      .from("service_tickets")
      .insert({
        job_id: job.id,
        homeowner_id: finalHomeownerId,
        warranty_id: warranty?.id || null,
        workspace_id: job.workspace_id,
        category: category,
        description: description,
        homeowner_photos: homeowner_photos || [],
        urgency: finalUrgency,
        status: "open",
        warranty_status: "in_warranty", // Will be auto-classified by trigger
      })
      .select()
      .single();

    if (ticketError) {
      console.error("Error creating service ticket:", ticketError);
      return new Response(
        JSON.stringify({ error: ticketError.message }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Re-fetch ticket to get auto-classified warranty_status
    const { data: finalTicket } = await supabase
      .from("service_tickets")
      .select("*")
      .eq("id", ticket.id)
      .single();

    return new Response(
      JSON.stringify({
        success: true,
        ticket: finalTicket,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in service/create-ticket:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
































