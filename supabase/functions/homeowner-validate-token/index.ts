// Block 44000 — SmartSend Roofing Homeowner Portal + Live Job Tracker v1
// Edge Function: /homeowner/validate-token
// 
// Validates a magic link token and returns homeowner session
// Input: { token: string }
// Output: { homeowner_id: string, job_id: string, email: string, expires_at: string }

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
    const { token } = await req.json();

    if (!token) {
      return new Response(
        JSON.stringify({ error: "token is required" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Find session by token
    const { data: session, error: sessionError } = await supabase
      .from("homeowner_sessions")
      .select("*, homeowners(id, job_id, email)")
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

    // Check if expired
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

    return new Response(
      JSON.stringify({
        homeowner_id: session.homeowner_id,
        job_id: homeowner.job_id,
        email: homeowner.email,
        expires_at: session.expires_at,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Error in validate-token:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});
































