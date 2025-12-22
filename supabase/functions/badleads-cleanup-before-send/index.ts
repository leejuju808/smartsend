// supabase/functions/badleads-cleanup-before-send/index.ts
// Block 17800 — Pre-Send Bad Lead Cleanup Worker

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface CleanupRequest {
  workspace_id: string;
  campaign_id?: string;
  lead_ids?: string[];
  contact_ids?: string[];
}

serve(async (req) => {
  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);
    const body: CleanupRequest = await req.json();

    const { workspace_id, campaign_id, lead_ids, contact_ids } = body;

    if (!workspace_id) {
      return new Response(
        JSON.stringify({ error: "workspace_id is required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    let leadsToCheck: Array<{ id: string; email: string }> = [];

    // Get leads to check
    if (lead_ids && lead_ids.length > 0) {
      const { data: leads, error: leadsError } = await supabase
        .from("leads")
        .select("id, email")
        .eq("workspace_id", workspace_id)
        .in("id", lead_ids);

      if (leadsError) {
        throw leadsError;
      }

      leadsToCheck = leads || [];
    } else if (contact_ids && contact_ids.length > 0) {
      const { data: contacts, error: contactsError } = await supabase
        .from("contacts")
        .select("id, email")
        .eq("workspace_id", workspace_id)
        .in("id", contact_ids);

      if (contactsError) {
        throw contactsError;
      }

      // Convert contacts to lead-like structure
      leadsToCheck = (contacts || []).map((c) => ({
        id: c.id,
        email: c.email,
      }));
    } else if (campaign_id) {
      // Get all leads from campaign
      const { data: campaignLeads, error: clError } = await supabase
        .from("campaign_leads")
        .select("lead_id, leads(id, email)")
        .eq("campaign_id", campaign_id);

      if (clError) {
        throw clError;
      }

      leadsToCheck = (campaignLeads || [])
        .filter((cl: any) => cl.leads)
        .map((cl: any) => ({
          id: cl.lead_id,
          email: cl.leads.email,
        }));
    } else {
      return new Response(
        JSON.stringify({ error: "Must provide lead_ids, contact_ids, or campaign_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Use RPC function to clean up
    const leadIdsArray = leadsToCheck.map((l) => l.id);

    const { data: cleanupResult, error: cleanupError } = await supabase.rpc(
      "cleanup_bad_leads_before_send",
      {
        p_workspace_id: workspace_id,
        p_lead_ids: leadIdsArray,
      }
    );

    if (cleanupError) {
      throw cleanupError;
    }

    const cleanedCount = cleanupResult?.cleaned_count || 0;
    const remainingCount = cleanupResult?.remaining_count || 0;
    const cleanedLeadIds = cleanupResult?.cleaned_lead_ids || [];

    // Get details of cleaned leads
    const cleanedLeads = leadsToCheck.filter(
      (l) => !cleanedLeadIds.includes(l.id)
    );

    return new Response(
      JSON.stringify({
        success: true,
        total_checked: leadsToCheck.length,
        cleaned_count: cleanedCount,
        remaining_count: remainingCount,
        cleaned_leads: cleanedLeads.slice(0, 100), // Limit response size
        message: `Cleaned ${cleanedCount} bad lead(s) before sending. ${remainingCount} lead(s) ready to send.`,
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error: any) {
    console.error("Cleanup before send error:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});





















































