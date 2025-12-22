// supabase/functions/notify-hot-lead/index.ts
// Block 8380 — Hot Lead Alerts (Auto-Notify on High-Intent Replies)

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const webhookUrl = Deno.env.get("HOT_LEAD_WEBHOOK_URL") ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase env vars");
}
if (!webhookUrl) {
  console.warn("HOT_LEAD_WEBHOOK_URL is not set. Notifications will only be logged in DB.");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

// Block 8470 — Plan gating helpers
type PlanName = "free" | "pro" | "enterprise" | "unknown";

function normalizePlan(plan?: string | null, status?: string | null): {
  plan: PlanName;
  status: string;
} {
  const rawPlan = (plan ?? "free").toLowerCase() as PlanName;
  const rawStatus = (status ?? "inactive").toLowerCase();

  if (rawPlan === "pro" && ["active", "trialing"].includes(rawStatus)) {
    return { plan: "pro", status: rawStatus };
  }
  if (rawPlan === "enterprise" && ["active", "trialing"].includes(rawStatus)) {
    return { plan: "enterprise", status: rawStatus };
  }
  if (rawPlan === "free") {
    return { plan: "free", status: rawStatus };
  }
  return { plan: "unknown", status: rawStatus };
}

function hasProAI(planInfo: { plan: PlanName; status: string }): boolean {
  return planInfo.plan === "pro" || planInfo.plan === "enterprise";
}

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = await req.json().catch(() => null);
    const campaignId = body?.campaign_id as string | undefined;
    const leadId = body?.lead_id as string | undefined;
    const source = (body?.source as string | undefined) ?? "reply_intent";

    if (!campaignId || !leadId) {
      return new Response("Missing campaign_id or lead_id", { status: 400 });
    }

    // 1. Load campaign_leads + summary + lead + campaign
    const { data: cl, error: clError } = await supabase
      .from("campaign_leads")
      .select(
        `
        id,
        campaign_id,
        lead_id,
        status_enum,
        last_reply_intent,
        replied_at,
        thread_summary,
        thread_stage,
        thread_next_action,
        thread_priority,
        lead:leads (
          name,
          email
        ),
        campaign:campaigns (
          name,
          user_id,
          owner_id
        )
      `
      )
      .eq("campaign_id", campaignId)
      .eq("lead_id", leadId)
      .single();

    if (clError || !cl) {
      console.error("No campaign_leads row found for notification:", clError);
      return new Response("Campaign lead not found", { status: 404 });
    }

    const leadEmail = cl.lead?.email ?? "";
    const leadName = cl.lead?.name ?? null;
    const campaignName = cl.campaign?.name ?? "Unknown campaign";
    const ownerUserId = cl.campaign?.owner_id ?? cl.campaign?.user_id ?? null;

    // Block 8470 — Plan gating: Check if user has Pro AI access for webhooks
    let proAI = false;
    if (ownerUserId) {
      const { data: profile, error: profileError } = await supabase
        .from("profiles")
        .select("plan, plan_status")
        .eq("id", ownerUserId)
        .single();

      if (profileError || !profile) {
        console.error("No profile found for hot lead owner:", profileError);
      } else {
        const planInfo = normalizePlan(profile.plan, profile.plan_status);
        proAI = hasProAI(planInfo);
      }
    }

    // 2. Build notification payload
    const payload = {
      type: "hot_lead",
      source,
      campaign: {
        id: cl.campaign_id,
        name: campaignName,
        owner_user_id: ownerUserId,
      },
      lead: {
        id: cl.lead_id,
        name: leadName,
        email: leadEmail,
      },
      status: cl.status_enum,
      last_reply_intent: cl.last_reply_intent,
      replied_at: cl.replied_at,
      summary: cl.thread_summary,
      stage: cl.thread_stage,
      next_action: cl.thread_next_action,
      priority: cl.thread_priority,
      created_at: new Date().toISOString(),
    };

    // 3. Insert notification row (status = pending)
    // Free users get log_only, Pro users get webhook if configured
    const channel = proAI && webhookUrl ? "webhook" : "log_only";
    const { data: notif, error: notifError } = await supabase
      .from("lead_notifications")
      .insert({
        campaign_lead_id: cl.id,
        campaign_id: cl.campaign_id,
        lead_id: cl.lead_id,
        type: "hot_lead",
        channel,
        payload,
        status: proAI && webhookUrl ? "pending" : "sent",
        sent_at: proAI && webhookUrl ? null : new Date().toISOString(),
      })
      .select("id")
      .single();

    if (notifError || !notif) {
      console.error("Failed to insert lead_notifications:", notifError);
      return new Response("Failed to insert notification", { status: 500 });
    }

    let finalStatus: "sent" | "failed" | "pending" = proAI && webhookUrl ? "pending" : "sent";
    let errorMsg: string | null = null;

    // 4. Fire webhook if configured and user has Pro AI
    if (proAI && webhookUrl) {
      try {
        const res = await fetch(webhookUrl, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });

        if (!res.ok) {
          finalStatus = "failed";
          errorMsg = `Webhook responded with ${res.status}`;
          console.error("Hot lead webhook failed:", errorMsg);
        } else {
          finalStatus = "sent";
        }
      } catch (err) {
        finalStatus = "failed";
        errorMsg = `Webhook error: ${String(err)}`;
        console.error("Hot lead webhook error:", err);
      }

      // 5. Update notification row with final status
      const { error: updateNotifError } = await supabase
        .from("lead_notifications")
        .update({
          status: finalStatus,
          sent_at: finalStatus === "sent" ? new Date().toISOString() : null,
          error: errorMsg,
        })
        .eq("id", notif.id);

      if (updateNotifError) {
        console.error("Failed to update lead_notifications:", updateNotifError);
      }
    }

    return Response.json({
      status: "ok",
      notification_id: notif.id,
      final_status: finalStatus,
    });
  } catch (err) {
    console.error("Unhandled error in notify-hot-lead:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});

