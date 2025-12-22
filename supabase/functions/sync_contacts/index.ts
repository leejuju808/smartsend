import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

interface SyncContactsRequest {
  org_id: string;
  leads?: any[];
  limit?: number;
}

serve(async (req) => {
  try {
    // Verify auth
    const authHeader = req.headers.get("Authorization");
    const cronToken = req.headers.get("x-cron-token");
    const aurevSyncKey = req.headers.get("x-aurev-sync");
    
    if (!authHeader && cronToken !== Deno.env.get("CRON_SECRET") && 
        aurevSyncKey !== Deno.env.get("AUREV_SYNC_KEY")) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
    }

    let body: SyncContactsRequest = {};
    if (req.method === "POST") {
      body = await req.json();
    }

    const orgId = body.org_id;
    if (!orgId) {
      return new Response(JSON.stringify({ error: "org_id required" }), { status: 400 });
    }

    // Fetch leads from SmartSend
    const limit = body.limit || 1000;
    const { data: leads, error: leadsError } = await supabase
      .from("leads")
      .select("id, email, first_name, last_name, company, title, phone, org_id, created_at")
      .eq("org_id", orgId)
      .order("created_at", { ascending: false })
      .limit(limit);

    if (leadsError) {
      console.error("Error fetching leads:", leadsError);
      return new Response(JSON.stringify({ error: leadsError.message }), { status: 500 });
    }

    if (!leads || leads.length === 0) {
      return new Response(JSON.stringify({ 
        synced: 0, 
        message: "No leads to sync",
        leads: []
      }), { status: 200 });
    }

    // Transform leads to OpsGrid contacts format
    const contacts = leads.map(lead => ({
      email: lead.email,
      first_name: lead.first_name,
      last_name: lead.last_name,
      company: lead.company,
      title: lead.title,
      phone: lead.phone,
      smartsend_lead_id: lead.id, // Reference back to SmartSend
      org_id: orgId,
      created_at: lead.created_at
    }));

    // If OpsGrid API is available, sync there
    const opsgridUrl = Deno.env.get("OPSGRID_SYNC_URL") || "https://opsgridhq.com/api/import";
    let opsgridSynced = 0;
    
    try {
      const response = await fetch(opsgridUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${Deno.env.get("AUREV_SYNC_KEY")}`
        },
        body: JSON.stringify({ org_id: orgId, contacts })
      });

      if (response.ok) {
        const result = await response.json();
        opsgridSynced = result.synced || 0;
      }
    } catch (error) {
      console.error("OpsGrid sync failed:", error);
      // Continue even if OpsGrid sync fails
    }

    // Store sync record
    await supabase
      .from("aurev_sync_logs")
      .insert({
        org_id: orgId,
        sync_type: "contacts",
        source_module: "smartsend",
        target_module: "opsgrid",
        records_synced: leads.length,
        status: "success",
        metadata: { opsgrid_synced: opsgridSynced }
      });

    return new Response(
      JSON.stringify({
        synced: leads.length,
        opsgrid_synced: opsgridSynced,
        leads: contacts,
        timestamp: new Date().toISOString()
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );

  } catch (error) {
    console.error("Error in sync_contacts function:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      { status: 500 }
    );
  }
});

