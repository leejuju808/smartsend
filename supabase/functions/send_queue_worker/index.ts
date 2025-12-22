// supabase/functions/send_queue_worker/index.ts
// Block 21505 — SmartSend Roofing Send Queue Engine v1
// The engine that actually sends outreach, at the perfect schedule, safely, and consistently

import { serve } from "https://deno.land/x/sift@0.6.0/mod.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const EMAIL_PROVIDER_URL = Deno.env.get("SEND_EMAIL_URL") || Deno.env.get("EMAIL_PROVIDER_URL");
const EMAIL_PROVIDER_KEY = Deno.env.get("SEND_EMAIL_KEY") || Deno.env.get("EMAIL_PROVIDER_KEY") || Deno.env.get("RESEND_API_KEY");
const EDGE_FUNCTIONS_URL = Deno.env.get("EDGE_FUNCTIONS_URL") || Deno.env.get("SUPABASE_URL") + "/functions/v1";

// Helper: Get first day of current month in UTC
function getMonthStart(): string {
  const now = new Date();
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1, 0, 0, 0));
  return d.toISOString();
}

// Helper: Get user's monthly email usage
async function getUserMonthlyUsage(
  supabase: any,
  userId: string
): Promise<number> {
  const monthStart = getMonthStart();

  // Get all campaigns owned by this user
  const { data: userCampaigns, error: campaignsError } = await supabase
    .from("campaigns")
    .select("id")
    .eq("user_id", userId);

  if (campaignsError || !userCampaigns || userCampaigns.length === 0) {
    return 0;
  }

  const campaignIds = userCampaigns.map((c: any) => c.id);

  // Count all sends from campaigns owned by this user in current month
  const { data, error } = await supabase
    .from("email_sends")
    .select("id")
    .gte("sent_at", monthStart)
    .in("campaign_id", campaignIds);

  if (error) {
    console.error("monthly usage error:", error);
    return 0;
  }

  return (data as any[])?.length ?? 0;
}

serve({
  "/": async () => {
    const now = new Date().toISOString();

    // 1) Pull pending queue items that are due
    const { data: queueItems, error: queueError } = await supabase
      .from("send_queue")
      .select("id, campaign_id, lead_id, step, scheduled_for")
      .eq("status", "pending")
      .lte("scheduled_for", now)
      .order("scheduled_for", { ascending: true })
      .limit(20);

    if (queueError) {
      console.error("Queue fetch error:", queueError);
      return new Response("fail", { status: 500 });
    }

    if (!queueItems || queueItems.length === 0) {
      return new Response("ok", { status: 200 });
    }

    for (const item of queueItems) {
      try {
        // Lock row so other workers can't pick it up
        const { error: lockError } = await supabase
          .from("send_queue")
          .update({ status: "processing" })
          .eq("id", item.id)
          .eq("status", "pending");

        if (lockError) {
          console.error("Failed to lock queue item:", lockError);
          continue; // Skip this item, another worker may have picked it up
        }

        // ---- PLAN + USAGE CHECKS ----

        // Load campaign with owner
        const { data: campaign, error: campaignError } = await supabase
          .from("campaigns")
          .select("id, steps, personalize, workspace_id, account_id, user_id")
          .eq("id", item.campaign_id)
          .maybeSingle();

        if (campaignError || !campaign) {
          throw new Error("Campaign missing: " + (campaignError?.message || "not found"));
        }

        if (!campaign.user_id) {
          throw new Error("Campaign missing user_id");
        }

        // Load profile / plan tier
        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("plan_tier")
          .eq("id", campaign.user_id)
          .maybeSingle();

        const tier = profile?.plan_tier || "starter";

        const { data: limits, error: limitsError } = await supabase
          .from("plan_limits")
          .select("*")
          .eq("tier", tier)
          .maybeSingle();

        if (limitsError || !limits) {
          throw new Error("Plan limits missing");
        }

        // Monthly usage check
        const monthlyUsage = await getUserMonthlyUsage(
          supabase,
          campaign.user_id
        );

        if (monthlyUsage >= limits.monthly_email_limit) {
          // Plan limit hit: mark as failed w/ reason and skip send
          await supabase
            .from("send_queue")
            .update({
              status: "failed",
              last_error: "plan_limit_reached",
              updated_at: new Date().toISOString(),
            })
            .eq("id", item.id);

          continue; // move to next queue item
        }

        // ---- (rest of existing send logic) ----

        // Handle steps as JSONB array or try campaign_steps table
        let stepDef: any = null;
        
        if (campaign.steps && Array.isArray(campaign.steps)) {
          // Steps stored as JSONB array in campaigns table
          stepDef = campaign.steps.find((s: any) => s.step === item.step);
        } else {
          // Try campaign_steps table
          const { data: campaignStep } = await supabase
            .from("campaign_steps")
            .select("subject, body, subject_template, body_template, body_html_template")
            .eq("campaign_id", item.campaign_id)
            .eq("step_no", item.step)
            .maybeSingle();
          
          if (campaignStep) {
            stepDef = {
              subject: campaignStep.subject || campaignStep.subject_template,
              body: campaignStep.body || campaignStep.body_template || campaignStep.body_html_template,
            };
          }
        }

        if (!stepDef || !stepDef.subject || !stepDef.body) {
          throw new Error(`Step template missing for step ${item.step}`);
        }

        // 3) Load homeowner info
        const { data: lead, error: leadError } = await supabase
          .from("leads")
          .select("id, first_name, email, city, roof_age_years, property_notes")
          .eq("id", item.lead_id)
          .maybeSingle();

        if (leadError || !lead) {
          throw new Error("Lead missing: " + (leadError?.message || "not found"));
        }

        if (!lead.email) {
          throw new Error("Lead email missing");
        }

        // 3.5) Find or create thread for this user + email
        const primaryEmail = (lead.email || "").toLowerCase();
        
        let { data: thread, error: threadError } = await supabase
          .from("email_threads")
          .select("*")
          .eq("user_id", campaign.user_id)
          .eq("primary_email", primaryEmail)
          .maybeSingle();

        if (threadError) {
          console.error("thread fetch error:", threadError);
        }

        if (!thread) {
          const { data: newThread, error: newThreadError } = await supabase
            .from("email_threads")
            .insert({
              user_id: campaign.user_id,
              lead_id: lead.id,
              primary_email: primaryEmail,
              subject: stepDef.subject,
              last_message_at: new Date().toISOString(),
              last_intent: null,
              unread_count: 0,
            })
            .select("*")
            .single();

          if (newThreadError) {
            console.error("thread create error:", newThreadError);
          } else {
            thread = newThread;
          }
        }

        // 4) Personalize email via personalization engine
        let subject = stepDef.subject;
        let body = stepDef.body;

        if (campaign.personalize !== false) {
          try {
            // Try calling the personalize_email edge function or API endpoint
            const personalizeUrl = `${EDGE_FUNCTIONS_URL}/personalize_email`;
            
            // Fallback to Next.js API route if edge function doesn't exist
            const apiUrl = Deno.env.get("NEXT_PUBLIC_SITE_URL") 
              ? `${Deno.env.get("NEXT_PUBLIC_SITE_URL")}/api/ai/personalize`
              : null;

            const personalizePayload = {
              campaign_id: campaign.id,
              lead_id: lead.id,
              step: item.step,
              template_subject: stepDef.subject,
              template_body: stepDef.body,
              homeowner: lead,
              personalize: campaign.personalize,
            };

            let personalizeRes: Response | null = null;
            
            // Try edge function first
            try {
              personalizeRes = await fetch(personalizeUrl, {
                method: "POST",
                headers: { 
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")}`,
                },
                body: JSON.stringify(personalizePayload),
              });
            } catch (e) {
              console.warn("Edge function personalize_email not available, trying API route");
            }

            // Fallback to API route if edge function failed
            if ((!personalizeRes || !personalizeRes.ok) && apiUrl) {
              personalizeRes = await fetch(apiUrl, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  template_body: stepDef.body,
                  template_subject: stepDef.subject,
                  contact_id: lead.id,
                  campaign_id: campaign.id,
                }),
              });
            }

            if (personalizeRes && personalizeRes.ok) {
              const personalizeData = await personalizeRes.json();
              subject = personalizeData.subject || stepDef.subject;
              body = personalizeData.body || stepDef.body;
            } else {
              console.warn("Personalization failed, using template as-is");
            }
          } catch (personalizeError) {
            console.error("Personalization error:", personalizeError);
            // Continue with template as-is
          }
        }

        // 5) Send via email provider
        if (!EMAIL_PROVIDER_URL) {
          throw new Error("EMAIL_PROVIDER_URL not configured");
        }

        const providerPayload: any = {
          to: lead.email,
          subject,
          html: body.replace(/\n/g, "<br/>"),
        };

        // Add from if available from campaign account
        if (campaign.account_id) {
          const { data: account } = await supabase
            .from("connected_accounts")
            .select("email, from_email")
            .eq("id", campaign.account_id)
            .maybeSingle();
          
          if (account?.email || account?.from_email) {
            providerPayload.from = account.email || account.from_email;
          }
        }

        const providerRes = await fetch(EMAIL_PROVIDER_URL, {
          method: "POST",
          headers: {
            ...(EMAIL_PROVIDER_KEY ? { Authorization: `Bearer ${EMAIL_PROVIDER_KEY}` } : {}),
            "Content-Type": "application/json",
          },
          body: JSON.stringify(providerPayload),
        });

        if (!providerRes.ok) {
          const errorText = await providerRes.text();
          throw new Error(`Email provider error: ${providerRes.status} ${errorText}`);
        }

        const providerData = await providerRes.json();
        const providerId = providerData?.id || providerData?.messageId || null;

        // 6) Log send
        await supabase.from("email_sends").insert({
          campaign_id: item.campaign_id,
          lead_id: item.lead_id,
          step: item.step,
          subject,
          body,
          provider_id: providerId,
          thread_id: thread?.id ?? null,
        });

        // 6.5) Update thread last_message_at
        if (thread?.id) {
          await supabase
            .from("email_threads")
            .update({
              subject,
              last_message_at: new Date().toISOString(),
              updated_at: new Date().toISOString(),
            })
            .eq("id", thread.id);
        }

        // 7) Mark queue item sent
        await supabase
          .from("send_queue")
          .update({ status: "sent", updated_at: new Date().toISOString() })
          .eq("id", item.id);

      } catch (err) {
        console.error("Send queue error:", err);

        await supabase
          .from("send_queue")
          .update({
            status: "failed",
            last_error: String(err),
            updated_at: new Date().toISOString(),
          })
          .eq("id", item.id);
      }
    }

    return new Response("ok", { status: 200 });
  },
});

