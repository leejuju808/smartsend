// Block 44000 — SmartSend Roofing Homeowner Portal + Live Job Tracker v1
// Edge Function: /homeowner/create-magic-link
// 
// Creates a magic link for homeowner portal access
// Input: { homeowner_email: string, job_id: string }
// Output: { magic_link: string, expires_at: string }

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const siteUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL") || "http://localhost:3000";

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
    const { homeowner_email, job_id } = await req.json();

    if (!homeowner_email || !job_id) {
      return new Response(
        JSON.stringify({ error: "homeowner_email and job_id are required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Find or create homeowner record
    let { data: homeowner, error: homeownerError } = await supabase
      .from("homeowners")
      .select("id")
      .eq("job_id", job_id)
      .eq("email", homeowner_email.toLowerCase().trim())
      .single();

    if (homeownerError && homeownerError.code !== "PGRST116") {
      // PGRST116 = no rows returned, which is fine
      console.error("Error finding homeowner:", homeownerError);
      return new Response(
        JSON.stringify({ error: "Failed to find homeowner" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Create homeowner if doesn't exist
    if (!homeowner) {
      const { data: newHomeowner, error: createError } = await supabase
        .from("homeowners")
        .insert({
          job_id,
          email: homeowner_email.toLowerCase().trim(),
        })
        .select("id")
        .single();

      if (createError) {
        console.error("Error creating homeowner:", createError);
        return new Response(
          JSON.stringify({ error: "Failed to create homeowner record" }),
          {
            status: 500,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }

      homeowner = newHomeowner;
    }

    // Create magic link token
    const { data: tokenData, error: tokenError } = await supabase.rpc(
      "create_homeowner_magic_link",
      {
        p_homeowner_id: homeowner.id,
        p_expires_in_hours: 24,
      }
    );

    if (tokenError) {
      console.error("Error creating magic link:", tokenError);
      return new Response(
        JSON.stringify({ error: "Failed to create magic link" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Get session to get expires_at
    const { data: session, error: sessionError } = await supabase
      .from("homeowner_sessions")
      .select("expires_at")
      .eq("homeowner_id", homeowner.id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    const magicLink = `${siteUrl}/homeowner/${tokenData}`;

    return new Response(
      JSON.stringify({
        magic_link: magicLink,
        expires_at: session?.expires_at || null,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in create-magic-link:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
































