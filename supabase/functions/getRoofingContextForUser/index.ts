// Block 95000 — Roofing Context Edge Function
// Returns roofing company context (city, state, market tags) for localized coaching

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const supabase = createClient(supabaseUrl, supabaseServiceRoleKey, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
        'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
      },
    });
  }

  try {
    const { user_id } = await req.json();

    if (!user_id) {
      return new Response(
        JSON.stringify({ error: "Missing required parameter: user_id" }),
        { 
          status: 400, 
          headers: { 
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    // 1. Get company info from roofing_companies table
    const { data: company, error: companyError } = await supabase
      .from("roofing_companies")
      .select("company_city, company_state, primary_zip, roof_focus, trade")
      .eq("owner_id", user_id)
      .eq("is_active", true)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    if (companyError || !company) {
      // Return default context if no company found
      return new Response(
        JSON.stringify({
          city: null,
          state: null,
          zip: null,
          focus: null,
          trade: 'roofing',
          market_tags: []
        }),
        { 
          status: 200, 
          headers: { 
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    // 2. Get market segments by state
    const { data: segments, error: segmentsError } = await supabase
      .from("state_market_segments")
      .select(`
        market_segment_id,
        market_segments (
          key,
          label
        )
      `)
      .eq("state_code", company.company_state);

    if (segmentsError) {
      console.error("Error fetching market segments:", segmentsError);
    }

    const tags = (segments || [])
      .map((s: any) => s.market_segments?.key)
      .filter((key: string | undefined) => key !== undefined);

    return new Response(
      JSON.stringify({
        city: company.company_city,
        state: company.company_state,
        zip: company.primary_zip,
        focus: company.roof_focus,
        trade: company.trade || 'roofing',
        market_tags: tags
      }),
      { 
        status: 200, 
        headers: { 
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*',
        } 
      }
    );
  } catch (error: any) {
    console.error("getRoofingContextForUser error:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { 
        status: 500, 
        headers: { 
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*',
        } 
      }
    );
  }
});


























