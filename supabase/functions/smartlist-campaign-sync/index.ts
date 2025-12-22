// Block 179 — SmartList Auto-Sync to Campaigns
// Daily edge function that refreshes campaign audiences using updated SmartList rules

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

type SegmentRuleNode = {
  type: "condition" | "group";
  field?: string;
  op?: string;
  value?: any;
  mode?: "AND" | "OR";
  children?: SegmentRuleNode[];
};

/**
 * Apply SmartList rules to get matching leads
 * Simplified version for Deno edge function
 */
async function applyRules(
  rules: SegmentRuleNode | null,
  accountId: string
): Promise<any[]> {
  if (!rules) {
    // No rules = return all leads for account
    const { data } = await supabase
      .from("leads")
      .select("id")
      .eq("account_id", accountId);
    return data ?? [];
  }

  // Build query based on rules
  let query = supabase.from("leads").select("id").eq("account_id", accountId);

  // Simple rule application - for complex nested rules, you may need to expand this
  if (rules.type === "condition" && rules.field && rules.op) {
    const { field, op, value } = rules;
    
    switch (op) {
      case "eq":
        query = query.eq(field, value);
        break;
      case "neq":
        query = query.neq(field, value);
        break;
      case "contains":
        query = query.ilike(field, `%${value}%`);
        break;
      case "gt":
        query = query.gt(field, value);
        break;
      case "gte":
        query = query.gte(field, value);
        break;
      case "lt":
        query = query.lt(field, value);
        break;
      case "lte":
        query = query.lte(field, value);
        break;
      case "in":
        if (Array.isArray(value)) {
          query = query.in(field, value);
        }
        break;
      default:
        console.warn(`Unsupported operator: ${op}`);
    }
  } else if (rules.type === "group" && rules.children) {
    // For groups, apply AND logic (all children must match)
    // Note: This is simplified - full implementation would handle OR groups too
    for (const child of rules.children) {
      const childLeads = await applyRules(child, accountId);
      const childIds = childLeads.map((l: any) => l.id);
      if (childIds.length > 0) {
        query = query.in("id", childIds);
      } else {
        // If any child has no matches, return empty
        return [];
      }
    }
  }

  const { data, error } = await query;
  if (error) {
    console.error("Error applying rules:", error);
    return [];
  }
  return data ?? [];
}

Deno.serve(async () => {
  try {
    // 1. Find all campaigns using SmartLists with auto_refresh = true
    const { data: campaigns, error: campaignsError } = await supabase
      .from("campaigns")
      .select("*")
      .not("smartlist_id", "is", null)
      .eq("auto_refresh", true);

    if (campaignsError) {
      console.error("Error loading campaigns:", campaignsError);
      return new Response(
        JSON.stringify({ error: campaignsError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    if (!campaigns || campaigns.length === 0) {
      return new Response(
        JSON.stringify({ ok: true, processed: 0, message: "No campaigns with auto-refresh SmartLists found" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    let processed = 0;
    let errors = 0;

    for (const campaign of campaigns) {
      try {
        // 2. Load SmartList rules
        const { data: smartlist, error: slError } = await supabase
          .from("shared_resources")
          .select("llm_rules")
          .eq("id", campaign.smartlist_id)
          .eq("smart", true)
          .single();

        if (slError || !smartlist) {
          console.error(`SmartList ${campaign.smartlist_id} not found for campaign ${campaign.id}`);
          errors++;
          continue;
        }

        const rules = (smartlist.llm_rules as SegmentRuleNode | null) ?? null;

        // 3. Get updated leads matching SmartList rules
        const leads = await applyRules(rules, campaign.account_id);

        if (leads.length === 0) {
          console.log(`Campaign ${campaign.id}: No leads match SmartList rules`);
          processed++;
          continue;
        }

        // 4. Clear existing send_queue entries for future steps (pending status only)
        const { error: deleteError } = await supabase
          .from("send_queue")
          .delete()
          .eq("campaign_id", campaign.id)
          .eq("status", "pending");

        if (deleteError) {
          console.error(`Error clearing send_queue for campaign ${campaign.id}:`, deleteError);
          errors++;
          continue;
        }

        // 5. Insert refreshed audience into send_queue
        const rows = leads.map((lead: any) => ({
          campaign_id: campaign.id,
          account_id: campaign.account_id,
          lead_id: lead.id,
          status: "pending",
        }));

        // Insert in batches of 500
        const chunk = 500;
        for (let i = 0; i < rows.length; i += chunk) {
          const slice = rows.slice(i, i + chunk);
          const { error: insertError } = await supabase
            .from("send_queue")
            .insert(slice);

          if (insertError) {
            console.error(`Error inserting send_queue batch for campaign ${campaign.id}:`, insertError);
            errors++;
            break;
          }
        }

        console.log(`Campaign ${campaign.id}: Refreshed ${leads.length} leads`);
        processed++;
      } catch (err) {
        console.error(`Error processing campaign ${campaign.id}:`, err);
        errors++;
      }
    }

    return new Response(
      JSON.stringify({
        ok: true,
        processed,
        errors,
        total: campaigns.length,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (err: any) {
    console.error("Error in smartlist-campaign-sync:", err);
    return new Response(
      JSON.stringify({ error: err.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});












