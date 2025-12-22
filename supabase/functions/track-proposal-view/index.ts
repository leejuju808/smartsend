// Block 22264 — SmartSend Roofing Proposal PDF Intelligence v1
// Edge Function: track-proposal-view
// Tracks proposal views and heartbeats to calculate view heat score

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
    const { token, event_type, interval_seconds } = await req.json();

    if (!token || !event_type) {
      return new Response(
        JSON.stringify({ error: "Missing fields: token and event_type are required" }),
        {
          status: 400,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    // 1. Look up public link
    const { data: link, error: linkError } = await supabase
      .from("proposal_public_links")
      .select(
        `
        id,
        proposal_id,
        workspace_id,
        view_count,
        total_view_seconds
      `
      )
      .eq("token", token)
      .single();

    if (linkError || !link) {
      return new Response(
        JSON.stringify({ error: "Proposal link not found" }),
        {
          status: 404,
          headers: {
            "Content-Type": "application/json",
            "Access-Control-Allow-Origin": "*",
          },
        }
      );
    }

    const nowIso = new Date().toISOString();

    if (event_type === "view_start") {
      // Increment view_count, set first/last viewed, basic heat score bump
      const newViewCount = (link.view_count || 0) + 1;

      // Get proposal details
      const { data: proposal, error: proposalError } = await supabase
        .from("proposals")
        .select("id, lead_id, workspace_id")
        .eq("id", link.proposal_id)
        .single();

      if (proposalError || !proposal) {
        return new Response(
          JSON.stringify({ error: "Proposal not found" }),
          {
            status: 404,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
          }
        );
      }

      // Log event into proposal_events
      await supabase.from("proposal_events").insert({
        proposal_id: proposal.id,
        lead_id: proposal.lead_id,
        workspace_id: proposal.workspace_id,
        event_type: "proposal_viewed",
        metadata: { source: "public_link", token },
      });

      // Mark proposal as viewed if not already
      await supabase
        .from("proposals")
        .update({
          status: "viewed",
          viewed_at: nowIso,
        })
        .eq("id", proposal.id);

      // Update public link with view_count + timestamps
      await supabase
        .from("proposal_public_links")
        .update({
          view_count: newViewCount,
          first_viewed_at: link.view_count === 0 ? nowIso : link.first_viewed_at,
          last_viewed_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", link.id);

      // Mirror view_count into proposals table
      await supabase
        .from("proposals")
        .update({
          view_count: newViewCount,
        })
        .eq("id", link.proposal_id);
    }

    if (event_type === "heartbeat") {
      const sec = interval_seconds ?? 15;
      const newTotalSeconds = (link.total_view_seconds || 0) + sec;

      // Compute view_heat_score:
      // - 0s: 0.0
      // - 180s+ (3 min): cap at 1.0
      const score = Math.min(1, newTotalSeconds / 180);

      // Update public link
      await supabase
        .from("proposal_public_links")
        .update({
          total_view_seconds: newTotalSeconds,
          view_heat_score: score,
          last_viewed_at: nowIso,
          updated_at: nowIso,
        })
        .eq("id", link.id);

      // Mirror into proposals table for fast reading
      await supabase
        .from("proposals")
        .update({
          total_view_seconds: newTotalSeconds,
          view_heat_score: score,
        })
        .eq("id", link.proposal_id);
    }

    return new Response(
      JSON.stringify({ success: true }),
      {
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
      }
    );
  } catch (err) {
    console.error("Error tracking proposal view:", err);
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

