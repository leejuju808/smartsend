// Block 21845 — SmartSend Roofing Pipeline Board v1
// Edge Function — Get Pipeline Data
// Fetches all leads with their pipeline status for the kanban board

import { serve } from "https://deno.land/std@0.177.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.6";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

serve(async (req) => {
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
    // Get workspace_id from query params or request body
    const url = new URL(req.url);
    let workspace_id = url.searchParams.get('workspace_id');
    
    if (!workspace_id && req.method === 'POST') {
      try {
        const body = await req.json();
        workspace_id = body.workspace_id;
      } catch {
        // Ignore JSON parse errors
      }
    }

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "Missing required parameter: workspace_id" }),
        { 
          status: 400, 
          headers: { 
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    // Fetch leads with related data
    const { data: leads, error } = await supabase
      .from("leads")
      .select(`
        id,
        name,
        first_name,
        last_name,
        email,
        phone,
        address,
        city,
        state,
        zip,
        status,
        heat_score,
        job_probability,
        estimated_job_value,
        estimator_id,
        workspace_id,
        homeowner_experience_score,
        experience_trend,
        risk_score,
        risk_category,
        created_at,
        updated_at,
        profiles:estimator_id (
          id,
          full_name,
          email
        )
      `)
      .eq("workspace_id", workspace_id)
      .order("created_at", { ascending: false });

    if (error) {
      return new Response(
        JSON.stringify({ error: error.message }),
        { 
          status: 400, 
          headers: { 
            "Content-Type": "application/json",
            'Access-Control-Allow-Origin': '*',
          } 
        }
      );
    }

    // Get homeowner tone from lead_activities (most recent message)
    // We'll join this separately since it's in a different table
    const leadIds = leads?.map(l => l.id) || [];
    let homeownerTones: Record<string, string> = {};

    if (leadIds.length > 0) {
      const { data: activities } = await supabase
        .from("lead_activities")
        .select("lead_id, homeowner_tone")
        .in("lead_id", leadIds)
        .eq("kind", "message_in")
        .not("homeowner_tone", "is", null)
        .order("created_at", { ascending: false });

      // Get the most recent tone for each lead
      if (activities) {
        const seen = new Set<string>();
        for (const activity of activities) {
          if (!seen.has(activity.lead_id)) {
            homeownerTones[activity.lead_id] = activity.homeowner_tone;
            seen.add(activity.lead_id);
          }
        }
      }
    }

    // Format leads for frontend
    const formattedLeads = leads?.map(lead => ({
      id: lead.id,
      name: lead.name || `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || 'Unknown',
      email: lead.email,
      phone: lead.phone,
      address: lead.address,
      city: lead.city,
      state: lead.state,
      zip: lead.zip,
      status: lead.status || 'new_lead',
      heat_score: lead.heat_score || 0,
      job_probability: lead.job_probability || 0,
      estimated_job_value: lead.estimated_job_value || 0,
      estimator_id: lead.estimator_id,
      estimator_name: lead.profiles?.full_name || lead.profiles?.email || null,
      homeowner_tone: homeownerTones[lead.id] || null,
      homeowner_experience_score: lead.homeowner_experience_score || null,
      experience_trend: lead.experience_trend || null,
      risk_score: lead.risk_score || null,
      risk_category: lead.risk_category || null,
      created_at: lead.created_at,
      updated_at: lead.updated_at,
      last_activity: lead.updated_at
    })) || [];

    return new Response(
      JSON.stringify({ leads: formattedLeads }),
      { 
        status: 200, 
        headers: { 
          "Content-Type": "application/json",
          'Access-Control-Allow-Origin': '*',
        } 
      }
    );
  } catch (error) {
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

