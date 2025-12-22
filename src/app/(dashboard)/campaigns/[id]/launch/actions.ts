"use server";

import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { z } from "zod";
import { getCampaignRole } from "@/lib/auth/role";
import { can } from "@/lib/auth/permissions";
import { getTeamPlan } from "@/lib/billing/limits";
import { resolveEnqueueVersionId } from "@/lib/send/version-resolver";
import {
  chooseSmartTemplateVersion,
  recordSmartTemplateAttribution,
} from "@/lib/smart-templates/router";

const schema = z.object({
  campaignId: z.string().uuid(),
});

function renderBody(tpl: string, lead: any) {
  return tpl
    .replaceAll("{{first_name}}", lead.first_name ?? "")
    .replaceAll("{{company}}", lead.company ?? "")
    .replaceAll("{{title}}", lead.title ?? "");
}

export async function launchCampaign(_: any, formData: FormData) {
  const { campaignId } = schema.parse({ campaignId: formData.get("campaignId") });
  const cookieStore = await cookies();
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    },
  );

  const { data: { user } } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  // Check permissions
  const role = await getCampaignRole(campaignId);
  if (!can(role, "canSend")) {
    throw new Error("Unauthorized: You don't have permission to launch this campaign.");
  }

  // 1) Get campaign (remove user_id check since we're using role-based access)
  const { data: campaign, error: campErr } = await supabase
    .from("campaigns").select("*").eq("id", campaignId).single();
  if (campErr || !campaign) throw new Error("Campaign not found");

  // Guard: if campaign is paused, block launch
  if (campaign.status === "paused") {
    throw new Error("Campaign is paused. Resume before launching new sends.");
  }

  // Fetch chosen variants if A/B testing is enabled
  let varA: any = null, varB: any = null;
  if (campaign.ab_enabled && campaign.ab_template_id && campaign.ab_variant_a && campaign.ab_variant_b) {
    const { data: vars, error: varsErr } = await supabase
      .from("template_versions")
      .select("id, variant_key, subject, body")
      .eq("template_id", campaign.ab_template_id)
      .in("variant_key", [campaign.ab_variant_a, campaign.ab_variant_b]);
    
    if (varsErr) throw new Error("Failed to fetch A/B variants");
    
    varA = vars?.find(v => v.variant_key === campaign.ab_variant_a) || null;
    varB = vars?.find(v => v.variant_key === campaign.ab_variant_b) || null;
    
    if (!varA || !varB) {
      throw new Error("A/B variants missing. Please ensure both variants exist in template_versions.");
    }
  }

  // 2) Leads not yet queued/sent (no existing queue rows)
  // First get campaign_leads, then join to leads to get contact info
  const { data: campaignLeads, error: clErr } = await supabase
    .from("campaign_leads")
    .select("id, lead_id")
    .eq("campaign_id", campaignId);
  if (clErr) throw clErr;

  const leadIds = campaignLeads?.map(cl => cl.lead_id) || [];
  if (!leadIds.length) return { queued: 0, firstSendAt: null };

  // Get the actual lead contact info
  const { data: leads, error: leadErr } = await supabase
    .from("leads")
    .select("id, email, first_name, company, title")
    .in("id", leadIds)
    .eq("user_id", user.id);
  if (leadErr) throw leadErr;

  // fetch already queued lead ids
  const { data: existingQ } = await supabase
    .from("send_queue")
    .select("lead_id")
    .eq("campaign_id", campaignId)
    .eq("user_id", user.id);
  const existingSet = new Set((existingQ ?? []).map(r => r.lead_id));

  // Map campaign_leads to actual leads for filtering
  const campaignLeadsMap = new Map(campaignLeads?.map(cl => [cl.lead_id, cl.id]) || []);
  
  const toQueue = leads!.filter(l => !existingSet.has(campaignLeadsMap.get(l.id)!));

  // 2.4) Filter invalid leads based on verification status
  const campaignLeadIds = Array.from(campaignLeadsMap.values());
  const { data: verif } = await supabase
    .from("lead_verifications")
    .select("lead_id, status, reasons")
    .eq("campaign_id", campaignId)
    .in("lead_id", campaignLeadIds);

  const vMap = new Map((verif ?? []).map(v => [v.lead_id, v]));
  const skipped: string[] = [];

  const filtered = toQueue.filter(l => {
    const campaignLeadId = campaignLeadsMap.get(l.id);
    if (!campaignLeadId) return false;
    const v = vMap.get(campaignLeadId);
    const status = v?.status ?? "unknown";
    if (status === "invalid") {
      skipped.push(l.email);
      return false;
    }
    return true;
  });

  const skippedInvalid = toQueue.length - filtered.length;
  if (skippedInvalid > 0) {
    // Log but don't throw - just skip invalid leads
    console.log(`Skipped ${skippedInvalid} invalid email addresses`);
  }

  const toQueueVerified = filtered;

  // 2.5) Plan gates: enforce daily_cap from plan
  if (campaign.team_id && toQueue.length > 0) {
    const plan = await getTeamPlan(campaign.team_id);
    if (!plan) {
      throw new Error("Unable to determine plan limits for this team.");
    }

    // Count emails already sent today by this team
    const todayStart = new Date(new Date().setHours(0, 0, 0, 0)).toISOString();
    const { data: teamCampaigns } = await supabase
      .from("campaigns")
      .select("id")
      .eq("team_id", campaign.team_id);

    const campaignIds = teamCampaigns?.map(c => c.id) ?? [];
    const { count: sentToday } = await supabase
      .from("send_queue")
      .select("id", { count: "exact", head: true })
      .eq("status", "sent")
      .gte("created_at", todayStart)
      .in("campaign_id", campaignIds);

    const remainingToday = Math.max(0, (plan.daily_cap ?? 25) - (sentToday ?? 0));
    
    if (remainingToday <= 0) {
      throw new Error(
        `Daily send limit reached for your ${plan.plan} plan. Upgrade to send more emails today.`
      );
    }
  }

  // 3) Get mailboxes for this campaign/user
  const { data: mailboxes } = await supabase
    .from("connected_accounts")
    .select("id")
    .eq("user_id", user.id)
    // Optionally filter by campaign-specific mailbox selection if you have that
    // .eq("campaign_id", campaignId) if you relate mailboxes to campaigns
    .limit(10); // reasonable limit

  const mailboxIds = (mailboxes || []).map(m => m.id);
  if (mailboxIds.length === 0) {
    throw new Error("No active mailbox connected. Please connect an email account first.");
  }

  // 4) Check if campaign uses steps, otherwise use RPC
  const { data: steps } = await supabase
    .from("campaign_steps")
    .select("step_number, delay_days, template_id, mailbox_id")
    .eq("campaign_id", campaignId)
    .order("step_number");

  let queuedCount = 0;

  if (steps && steps.length > 0) {
    // Build queue from campaign steps
    const sendStart = new Date();
    let mailboxIndex = 0;
    let cumulativeDelay = 0; // Track cumulative delay across steps

    for (const st of steps) {
      // Get template for this step
      const { data: tpl } = await supabase
        .from("templates")
        .select("subject, body")
        .eq("id", st.template_id)
        .single();

      if (!tpl) {
        // Still accumulate delay even if template is missing
        cumulativeDelay += st.delay_days || 0;
        continue; // Skip steps without valid templates
      }

      if (toQueueVerified.length > 0) {
        const quotaCheck = await supabase.rpc("enforce_campaign_quota", {
          p_campaign: campaignId,
          p_kind: "send",
          p_qty: toQueueVerified.length,
        });

        if (quotaCheck.error) {
          throw new Error(`Quota enforcement failed: ${quotaCheck.error.message}`);
        }

        if (!quotaCheck.data) {
          throw new Error("Daily send limit reached. Try again after reset.");
        }
      }

      // Add this step's delay to cumulative delay
      cumulativeDelay += st.delay_days || 0;

      // For each lead, schedule this step
      for (const lead of toQueueVerified) {
        // Calculate schedule time: sendStart + cumulative delay up to this step
        const schedule = new Date(sendStart.getTime() + cumulativeDelay * 86400000);

        // Select mailbox: use step's mailbox_id if set, otherwise round-robin
        const selectedMailboxId = st.mailbox_id || mailboxIds[mailboxIndex % mailboxIds.length];
        mailboxIndex++;

        // Render template with lead data
        const subject = renderBody(tpl.subject || "", lead);
        const body = renderBody(tpl.body || "", lead);

        // Insert into queue
        const { error: insertErr } = await supabase.from("send_queue").insert({
          user_id: user.id,
          campaign_id: campaignId,
          lead_id: lead.id,
          subject: `${subject} [SS|${lead.id}]`.trim(),
          body_html: body,
          to_email: lead.email,
          mailbox_id: selectedMailboxId,
          account_id: selectedMailboxId, // Set account_id from selected mailbox
          scheduled_at: schedule.toISOString(),
          status: "pending",
        });

        if (!insertErr) {
          queuedCount++;
        }
      }
    }
  } else {
    if (toQueueVerified.length > 0) {
      const quotaCheck = await supabase.rpc("enforce_campaign_quota", {
        p_campaign: campaignId,
        p_kind: "send",
        p_qty: toQueueVerified.length,
      });

      if (quotaCheck.error) {
        throw new Error(`Quota enforcement failed: ${quotaCheck.error.message}`);
      }

      if (!quotaCheck.data) {
        throw new Error("Daily send limit reached. Try again after reset.");
      }
    }

    // Build queue using RPC (respects caps/windows) - legacy single-template approach
    const spacingSeconds = 90; // default spacing between sends
    const { data: rpcCount, error: queueErr } = await supabase.rpc("build_send_queue", {
      p_campaign: campaignId,
      p_mailboxes: mailboxIds,
      p_spacing_seconds: spacingSeconds,
    });

    if (queueErr) {
      throw new Error(`Failed to build send queue: ${queueErr.message}`);
    }

    queuedCount = rpcCount || 0;
  }

  // 5) Update queue items with rendered subject/body from templates (for non-step campaigns)
  // Get the newly queued items
  const { data: queuedItems } = await supabase
    .from("send_queue")
    .select("id, lead_id")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .order("created_at", { ascending: false })
    .limit(queuedCount || 1000); // reasonable limit

  // Only update queue items if we used RPC (non-step campaigns need template rendering)
  if (!steps || steps.length === 0) {
    if (queuedItems && queuedItems.length > 0) {
      const tokenizedSubject = (s: string, leadId: string) => `${s} ${leadId ? `[SS|${leadId}]` : ""}`.trim();
      
      // Get lead info for rendering
      const queueLeadIds = queuedItems.map(q => q.lead_id);
      const { data: queueLeads } = await supabase
        .from("leads")
        .select("id, email, first_name, company, title")
        .in("id", queueLeadIds);

      const leadMap = new Map(queueLeads?.map(l => [l.id, l]) || []);
      let i = 0;

      for (const queueItem of queuedItems) {
        const lead = leadMap.get(queueItem.lead_id);
        if (!lead) continue;

        let subject = campaign.subject;
        let body = renderBody(campaign.body_template, lead);
        let variant_key: string | null = null;
        let template_version_id: string | null = null;
        let smart_template_version_id: string | null = null;

        if (campaign.ab_enabled && varA && varB) {
          const pickA = i % 2 === 0;
          const chosen = pickA ? varA : varB;
          variant_key = chosen.variant_key;
          template_version_id = chosen.id;
          subject = chosen.subject;
          body = renderBody(chosen.body, lead);
        } else {
          // Use version resolver for default variant (checks split first, then active)
          variant_key = "default";
          template_version_id = await resolveEnqueueVersionId(campaignId, "default");
          
          // If active version exists, fetch its content
          if (template_version_id) {
            const { data: activeVersion } = await supabase
              .from("template_versions")
              .select("subject, body_md")
              .eq("id", template_version_id)
              .single();
            
            if (activeVersion) {
              subject = activeVersion.subject;
              body = renderBody(activeVersion.body_md, lead);
            }
          }

          if (campaign.smart_template_id) {
            smart_template_version_id = await chooseSmartTemplateVersion(
              campaign.smart_template_id,
              supabase,
            );
            if (smart_template_version_id) {
              const { data: smartVersion } = await supabase
                .from("smart_template_versions")
                .select("subject, body")
                .eq("id", smart_template_version_id)
                .maybeSingle();
              if (smartVersion) {
                subject = smartVersion.subject ?? subject;
                body = renderBody(smartVersion.body, lead);
              }
            }
          }
        }

        // Update the queue item with subject/body
        await supabase
          .from("send_queue")
          .update({
            subject: tokenizedSubject(subject, queueItem.lead_id),
            body_html: body,
            to_email: lead.email,
            variant_key,
            template_version_id,
            smart_template_id: campaign.smart_template_id ?? null,
            smart_template_version_id,
          })
          .eq("id", queueItem.id);

        if (campaign.smart_template_id && smart_template_version_id) {
          const accountId = campaign.account_id ?? campaign.user_id ?? null;
          if (accountId) {
            await recordSmartTemplateAttribution(
              {
                accountId,
                templateId: campaign.smart_template_id,
                versionId: smart_template_version_id,
                queueId: queueItem.id,
                leadId: queueItem.lead_id,
                campaignId,
                identityId: campaign.identity_id ?? null,
              },
              supabase,
            );
          }
        }

        i++;
      }
    }
  }

  // 6) Get first scheduled time for response
  const { data: firstScheduled } = await supabase
    .from("send_queue")
    .select("scheduled_at")
    .eq("campaign_id", campaignId)
    .eq("status", "pending")
    .order("scheduled_at", { ascending: true })
    .limit(1)
    .single();

  // 7) Mark campaign active (RLS will enforce permissions)
  await supabase.from("campaigns").update({ status: "active" }).eq("id", campaignId);

  // 8) Log activity
  await supabase.from("activity_logs").insert({
    campaign_id: campaignId,
    actor_id: user.id,
    event_type: "campaign_launched",
    meta: { queued: queuedCount || 0, firstSendAt: firstScheduled?.scheduled_at ?? null },
  });

  return { queued: queuedCount || 0, firstSendAt: firstScheduled?.scheduled_at ?? null };
}

