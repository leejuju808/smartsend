import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type WeightMap = Record<string, number>;

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

serve(async (req) => {
  try {
    const { campaign_id, org_id } = await req.json();

    if (!campaign_id || !org_id) {
      return new Response(JSON.stringify({ error: "campaign_id and org_id required" }), { status: 400 });
    }

    // 1) Load campaign + variants
    const { data: campaign, error: cErr } = await supabase
      .from("campaigns")
      .select("id, org_id, template_id, ab_mode, variant_weights")
      .eq("id", campaign_id)
      .single();
    
    if (cErr || !campaign) {
      throw new Error(cErr?.message || "Campaign not found");
    }

    // Check org match (support both org_id and workspace_id patterns)
    const campaignOrgId = campaign.org_id;
    if (campaignOrgId && campaignOrgId !== org_id) {
      throw new Error("Org mismatch");
    }

    if (!campaign.template_id) {
      throw new Error("Campaign has no template_id");
    }

    // Load variants for the template
    const { data: variants, error: vErr } = await supabase
      .from("template_variants")
      .select("id, variant_label")
      .eq("template_id", campaign.template_id);
    
    if (vErr) throw new Error(vErr.message);
    if (!variants?.length) throw new Error("No variants for template");

    // 2) Load leads that don't yet have a queued send for this campaign
    const { data: existingSends } = await supabase
      .from("campaign_sends")
      .select("lead_id")
      .eq("campaign_id", campaign_id)
      .in("status", ["queued", "sending", "sent"]);

    const existingLeadIds = new Set((existingSends || []).map((s: any) => s.lead_id));

    // Load leads for this org (and optionally filter by campaign_id if column exists)
    let leadsQuery = supabase
      .from("leads")
      .select("id")
      .eq("org_id", org_id);

    // Try to filter by campaign_id if the column exists (gracefully handle if it doesn't)
    try {
      const { data: testLeads } = await supabase
        .from("leads")
        .select("id")
        .eq("org_id", org_id)
        .eq("campaign_id", campaign_id)
        .limit(1);
      
      // If the query succeeded, campaign_id column exists
      if (testLeads !== null) {
        leadsQuery = leadsQuery.eq("campaign_id", campaign_id);
      }
    } catch {
      // Column doesn't exist or other error - continue without campaign_id filter
    }

    const { data: allLeads, error: lErr } = await leadsQuery;
    if (lErr) throw new Error(lErr.message);

    // Filter out leads that already have sends
    const leads = (allLeads || []).filter((l: any) => !existingLeadIds.has(l.id));

    if (!leads.length) {
      return new Response(JSON.stringify({ ok: true, queued: 0, message: "All leads already have sends" }), { status: 200 });
    }

    // Helper: variant picker
    let pick: (i: number) => string;
    
    if (campaign.ab_mode === "weighted") {
      const weights: WeightMap = campaign.variant_weights || {};
      const pool = variants.flatMap((v: any) => 
        Array(Math.round((weights[v.variant_label] ?? 0) * 100)).fill(v.id)
      );
      
      if (pool.length === 0) {
        // fallback to even
        pick = (i: number) => variants[i % variants.length].id;
      } else {
        pick = () => pool[Math.floor(Math.random() * pool.length)];
      }
    } else if (campaign.ab_mode === "single") {
      pick = () => variants[0].id; // use first as the single variant
    } else {
      // even split (round-robin)
      pick = (i: number) => variants[i % variants.length].id;
    }

    // 3) Enqueue sends
    const rows = leads.map((l: any, i: number) => ({
      org_id,
      campaign_id,
      lead_id: l.id,
      template_variant_id: pick(i),
      status: "queued",
    }));

    // Chunk inserts for large batches
    const chunked = (arr: any[], size = 1000) => 
      Array.from({ length: Math.ceil(arr.length / size) }, (_, k) => 
        arr.slice(k * size, (k + 1) * size)
      );

    let totalInserted = 0;
    for (const chunk of chunked(rows, 1000)) {
      const { error } = await supabase.from("campaign_sends").insert(chunk);
      if (error) throw error;
      totalInserted += chunk.length;
    }

    return new Response(JSON.stringify({ ok: true, queued: totalInserted }), { status: 200 });
  } catch (e: any) {
    console.error("enqueueSends error:", e);
    return new Response(JSON.stringify({ error: e.message || "Unknown error" }), { status: 400 });
  }
});

