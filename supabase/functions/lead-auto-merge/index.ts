// Auto-merge engine triggered on new lead insert
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface Lead {
  id: string;
  account_id: string;
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  phone?: string;
  status?: string;
}

async function mergeLeads(
  primary: Lead,
  secondary: Lead,
  supabase: ReturnType<typeof createClient>,
  reason: string
) {
  const accountId = primary.account_id || secondary.account_id;
  
  // Set account context
  await supabase.rpc("set_account", { p_account_id: accountId });

  // Merge tags
  await supabase.rpc("merge_lead_tags", {
    primary_id: primary.id,
    secondary_id: secondary.id,
  });

  // Merge notes
  await supabase.rpc("merge_lead_notes", {
    primary_id: primary.id,
    secondary_id: secondary.id,
  });

  // Move activity timeline
  await supabase
    .from("email_events")
    .update({ lead_id: primary.id })
    .eq("lead_id", secondary.id);

  await supabase
    .from("email_replies")
    .update({ lead_id: primary.id })
    .eq("lead_id", secondary.id);

  // Record merge history
  const mergeHistoryEntry = {
    merged: secondary.id,
    at: new Date().toISOString(),
    reason,
  };

  const { data: currentLead } = await supabase
    .from("leads")
    .select("merge_history")
    .eq("id", primary.id)
    .single();

  const updatedHistory = [
    ...(currentLead?.merge_history || []),
    mergeHistoryEntry,
  ];

  await supabase
    .from("leads")
    .update({ merge_history: updatedHistory })
    .eq("id", primary.id);

  // Delete secondary lead
  await supabase.from("leads").delete().eq("id", secondary.id);

  // Update queue entry if exists
  await supabase
    .from("merge_queue")
    .update({ status: "resolved" })
    .or(`lead_a.eq.${secondary.id},lead_b.eq.${secondary.id}`);
}

async function queueMerge(
  leadAId: string,
  leadBId: string,
  supabase: ReturnType<typeof createClient>,
  reason: string,
  accountId: string
) {
  // Check if already queued
  const { data: existing } = await supabase
    .from("merge_queue")
    .select("id")
    .eq("account_id", accountId)
    .or(`and(lead_a.eq.${leadAId},lead_b.eq.${leadBId}),and(lead_a.eq.${leadBId},lead_b.eq.${leadAId})`)
    .eq("status", "pending")
    .maybeSingle();

  if (!existing) {
    await supabase.from("merge_queue").insert({
      account_id: accountId,
      lead_a: leadAId,
      lead_b: leadBId,
      reason,
      status: "pending",
    });
  }
}

Deno.serve(async (req) => {
  try {
    const { record } = await req.json();
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    const lead = record as Lead;

    if (!lead.account_id) {
      return new Response(JSON.stringify({ error: "No account_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Set account context
    await supabase.rpc("set_account", { p_account_id: lead.account_id });

    // 1) SAME EMAIL = auto merge
    if (lead.email) {
      const { data: match } = await supabase
        .from("leads")
        .select("*")
        .eq("email", lead.email.toLowerCase())
        .eq("account_id", lead.account_id)
        .neq("id", lead.id)
        .maybeSingle();

      if (match) {
        // Determine primary (keep non-bounced, older lead)
        const primary =
          match.status === "bounced" || lead.status !== "bounced"
            ? lead
            : match;
        const secondary = primary.id === lead.id ? match : lead;

        await mergeLeads(primary, secondary, supabase, "duplicate_email");
        return new Response(JSON.stringify({ merged: true, reason: "duplicate_email" }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    // 2) SAME DOMAIN + similar name
    if (lead.email) {
      const domain = lead.email.split("@")[1];
      const name = (lead.first_name || "").toLowerCase();

      const { data: matches } = await supabase
        .from("leads")
        .select("*")
        .ilike("email", `%@${domain}`)
        .eq("account_id", lead.account_id)
        .neq("id", lead.id);

      for (const m of matches || []) {
        const name2 = ((m.first_name || "") as string).toLowerCase();

        // Check if first letter matches or names are similar
        if (
          name2 &&
          name &&
          (name2[0] === name[0] ||
            name2.includes(name) ||
            name.includes(name2))
        ) {
          // Also check company match if available
          const companyMatch =
            !lead.company ||
            !m.company ||
            lead.company.toLowerCase() === m.company.toLowerCase();

          if (companyMatch) {
            // Suspicious match → send to review queue
            await queueMerge(m.id, lead.id, supabase, "fuzzy_name_match", lead.account_id);
          }
        }
      }
    }

    // 3) COMPANY + PHONE match
    if (lead.company && lead.phone) {
      const { data: matches } = await supabase
        .from("leads")
        .select("*")
        .eq("company", lead.company)
        .eq("phone", lead.phone)
        .eq("account_id", lead.account_id)
        .neq("id", lead.id);

      for (const m of matches || []) {
        await queueMerge(m.id, lead.id, supabase, "company_phone_match", lead.account_id);
      }
    }

    // 4) BOUNCED lead → merge into clean lead
    if (lead.status === "bounced") {
      const { data: cleanMatch } = await supabase
        .from("leads")
        .select("*")
        .eq("email", lead.email.toLowerCase())
        .eq("account_id", lead.account_id)
        .neq("id", lead.id)
        .neq("status", "bounced")
        .maybeSingle();

      if (cleanMatch) {
        await mergeLeads(cleanMatch, lead, supabase, "bounced_into_clean");
        return new Response(JSON.stringify({ merged: true, reason: "bounced_into_clean" }), {
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { "Content-Type": "application/json" },
    });
  } catch (error) {
    console.error("Auto-merge error:", error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : "Unknown error" }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});












