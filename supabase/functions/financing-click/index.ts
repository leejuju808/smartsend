// Block 33155 — SmartSend Roofing "Smart Financing Engine + Homeowner Offer Flow" v1
// Edge Function: financing-click
// Logs financing button clicks and events

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  // Handle CORS
  if (req.method === "OPTIONS") {
    return new Response(null, {
      status: 204,
      headers: {
        "Access-Control-Allow-Origin": "*",
        "Access-Control-Allow-Methods": "POST, OPTIONS",
        "Access-Control-Allow-Headers": "Content-Type",
      },
    });
  }

  try {
    const {
      lead_id,
      job_id,
      proposal_id,
      workspace_id,
      event_type,
      source,
      amount,
      ip_address,
      user_agent,
    } = await req.json();

    if (!event_type) {
      return new Response(
        JSON.stringify({ error: "event_type is required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Validate event_type
    const validEventTypes = [
      "clicked_financing_button",
      "viewed_calculator",
      "started_application",
      "abandoned_application",
    ];
    if (!validEventTypes.includes(event_type)) {
      return new Response(
        JSON.stringify({ error: "Invalid event_type" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Get workspace_id from lead, job, or proposal if not provided
    let finalWorkspaceId = workspace_id;
    if (!finalWorkspaceId) {
      if (lead_id) {
        const { data: lead } = await supabase
          .from("leads")
          .select("workspace_id")
          .eq("id", lead_id)
          .single();
        if (lead) finalWorkspaceId = lead.workspace_id;
      } else if (job_id) {
        const { data: job } = await supabase
          .from("jobs")
          .select("workspace_id")
          .eq("id", job_id)
          .single();
        if (job) finalWorkspaceId = job.workspace_id;
      } else if (proposal_id) {
        const { data: proposal } = await supabase
          .from("proposals")
          .select("workspace_id")
          .eq("id", proposal_id)
          .single();
        if (proposal) finalWorkspaceId = proposal.workspace_id;
      }
    }

    if (!finalWorkspaceId) {
      return new Response(
        JSON.stringify({ error: "workspace_id is required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // Insert click event
    const { error: insertError } = await supabase
      .from("financing_click_events")
      .insert({
        lead_id: lead_id || null,
        job_id: job_id || null,
        proposal_id: proposal_id || null,
        workspace_id: finalWorkspaceId,
        event_type,
        source: source || null,
        amount: amount || null,
        ip_address: ip_address || null,
        user_agent: user_agent || null,
      });

    if (insertError) {
      console.error("Error inserting financing click event:", insertError);
      return new Response(
        JSON.stringify({ error: "Failed to log click event" }),
        {
          status: 500,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    return new Response(
      JSON.stringify({ ok: true }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    console.error("Error logging financing click:", err);
    return new Response(
      JSON.stringify({ error: String(err) }),
      {
        status: 500,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  }
});

































