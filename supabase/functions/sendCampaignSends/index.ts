// Send Worker for campaign_sends table with A/B variant support
// Processes queued campaign_sends and sends emails using template_variant_id

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);
const MAX_CONCURRENCY = parseInt(Deno.env.get("WORKER_CONCURRENCY") ?? "50", 10);

// Helper to render template with merge tags
function renderTemplate(template: string, vars: Record<string, any>): string {
  let result = template;
  for (const [key, value] of Object.entries(vars)) {
    const regex = new RegExp(`{{\\s*${key}\\s*}}`, 'g');
    result = result.replace(regex, String(value ?? ""));
  }
  return result;
}

// Placeholder email sending - integrate with your actual provider (Gmail/Outlook/etc)
async function sendEmail(args: {
  to: string;
  subject: string;
  html: string;
  from_email?: string;
}): Promise<{ ok: boolean; error?: string; message_id?: string }> {
  // TODO: Replace with actual email provider integration
  // Example: Gmail API, Outlook API, Resend, etc.
  console.log(`[MOCK SEND] To: ${args.to}, Subject: ${args.subject}`);
  await new Promise(r => setTimeout(r, 50));
  return { ok: true, message_id: `mock-${Date.now()}` };
}

// Helper: Get user plan limits and daily send count
async function getUserPlanLimits(userId: string): Promise<{
  plan: string;
  dailySendLimit: number;
  sendsToday: number;
  remainingToday: number;
}> {
  // Use the check_daily_send_limit function
  const { data, error } = await supabase.rpc("check_daily_send_limit", {
    p_user_id: userId,
    p_count: 0, // Just checking, not consuming
    p_date: new Date().toISOString().split("T")[0], // Today's date
  });

  if (error || !data || data.length === 0) {
    console.warn(`Failed to check limits for user ${userId}, defaulting to unpaid gate`);
    return {
      plan: "free",
      dailySendLimit: 25,
      sendsToday: 0,
      remainingToday: 25,
    };
  }

  const result = data[0];
  return {
    plan: result.effective_plan || "free",
    dailySendLimit: result.daily_limit || 25,
    sendsToday: result.sends_today || 0,
    remainingToday: result.remaining || 0,
  };
}

serve(async () => {
  try {
    // 1) Get next batch of queued jobs from campaign_sends (exclude paused)
    const { data: jobs, error: selErr } = await supabase
      .from("campaign_sends")
      .select("id, lead_id, template_variant_id, campaign_id, org_id")
      .eq("status", "queued")
      .or("paused.is.null,paused.eq.false")
      .order("queued_at", { ascending: true })
      .limit(MAX_CONCURRENCY);

    if (selErr) throw selErr;
    if (!jobs?.length) {
      return new Response(JSON.stringify({ processed: 0 }), { status: 200 });
    }

    // 1.5) Fetch campaigns to get owner_id for each job
    const campaignIds = [...new Set(jobs.map((j) => j.campaign_id))];
    const { data: campaigns, error: campaignErr } = await supabase
      .from("campaigns")
      .select("id, owner_id")
      .in("id", campaignIds);

    if (campaignErr) throw campaignErr;
    const campaignMap = new Map(
      (campaigns || []).map((c: any) => [c.id, c])
    );

    // 1.6) Group jobs by owner and check limits
    const jobsByOwner = new Map<string, typeof jobs>();
    for (const job of jobs) {
      const campaign = campaignMap.get(job.campaign_id);
      const ownerId = campaign?.owner_id;
      if (!ownerId) {
        console.warn(`Campaign ${job.campaign_id} has no owner_id, skipping`);
        continue;
      }
      if (!jobsByOwner.has(ownerId)) {
        jobsByOwner.set(ownerId, []);
      }
      jobsByOwner.get(ownerId)!.push(job);
    }

    // 1.7) Filter jobs based on daily limits per owner
    const jobsToProcess: typeof jobs = [];
    const skippedOwners: string[] = [];

    for (const [ownerId, ownerJobs] of jobsByOwner.entries()) {
      const limits = await getUserPlanLimits(ownerId);
      
      if (limits.remainingToday <= 0) {
        console.log(
          `Send cap reached for user ${ownerId}. Plan=${limits.plan}, daily limit=${limits.dailySendLimit}, sends today=${limits.sendsToday}`
        );
        skippedOwners.push(ownerId);
        // Mark these jobs as failed with limit error
        for (const job of ownerJobs) {
          await supabase
            .from("campaign_sends")
            .update({
              status: "failed",
              error: `Daily send limit reached (${limits.sendsToday}/${limits.dailySendLimit}). Upgrade to Starter to unlock 50/day.`,
            })
            .eq("id", job.id);
        }
        continue;
      }

      // Only take as many jobs as remaining limit allows
      const batchSize = Math.min(ownerJobs.length, limits.remainingToday);
      jobsToProcess.push(...ownerJobs.slice(0, batchSize));

      // If we couldn't process all jobs, mark the rest as failed
      if (ownerJobs.length > batchSize) {
        for (const job of ownerJobs.slice(batchSize)) {
          await supabase
            .from("campaign_sends")
            .update({
              status: "failed",
              error: `Daily send limit would be exceeded. Remaining: ${limits.remainingToday}`,
            })
            .eq("id", job.id);
        }
      }
    }

    if (!jobsToProcess.length) {
      return new Response(
        JSON.stringify({
          processed: 0,
          skipped: jobs.length,
          reason: skippedOwners.length > 0 ? "Daily send limits reached" : "No jobs to process",
        }),
        { status: 200 }
      );
    }

    // 2) Mark as sending
    const ids = jobsToProcess.map(j => j.id);
    const { error: markErr } = await supabase
      .from("campaign_sends")
      .update({ status: "sending" })
      .in("id", ids);

    if (markErr) throw markErr;

    // 3) Fetch leads
    const leadIds = jobsToProcess.map(j => j.lead_id);
    const { data: leads, error: leadErr } = await supabase
      .from("leads")
      .select("id, email, first_name, last_name, company")
      .in("id", leadIds);

    if (leadErr) throw leadErr;
    const leadMap = new Map(leads?.map(l => [l.id, l]) || []);

    // 4) Fetch variants
    const variantIds = [...new Set(jobsToProcess.map(j => j.template_variant_id).filter(Boolean))];
    const { data: variants, error: variantErr } = await supabase
      .from("template_variants")
      .select("id, subject, body")
      .in("id", variantIds);

    if (variantErr) throw variantErr;
    const variantMap = new Map(variants?.map(v => [v.id, v]) || []);

    // 5) Process each job
    const results = await Promise.all(jobsToProcess.map(async (job) => {
      const lead = leadMap.get(job.lead_id);
      if (!lead) {
        await supabase
          .from("campaign_sends")
          .update({ 
            status: "failed", 
            error: "Lead not found",
            attempt: job.attempt + 1
          })
          .eq("id", job.id);
        return { id: job.id, ok: false };
      }

      // Check if lead already replied
      if (lead.status === "replied") {
        await supabase
          .from("campaign_sends")
          .update({ status: "canceled", error: "Lead already replied" })
          .eq("id", job.id);
        return { id: job.id, ok: false, canceled: true };
      }

      // Get variant or fallback to base template
      const variant = job.template_variant_id ? variantMap.get(job.template_variant_id) : null;
      
      if (!variant) {
        // If no variant, try to get from campaign template
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("template_id, subject_template, body_template")
          .eq("id", job.campaign_id)
          .maybeSingle();

        if (!campaign || (!campaign.subject_template && !campaign.body_template)) {
          await supabase
            .from("campaign_sends")
            .update({ 
              status: "failed", 
              error: "No template found",
              attempt: job.attempt + 1
            })
            .eq("id", job.id);
          return { id: job.id, ok: false };
        }

        // Use campaign templates
        const subject = renderTemplate(campaign.subject_template || "", {
          first_name: lead.first_name || "",
          last_name: lead.last_name || "",
          company: lead.company || "",
          email: lead.email || "",
        });

        const body = renderTemplate(campaign.body_template || "", {
          first_name: lead.first_name || "",
          last_name: lead.last_name || "",
          company: lead.company || "",
          email: lead.email || "",
        });

        // Send email
        const res = await sendEmail({
          to: lead.email,
          subject,
          html: body,
        });

        if (res.ok) {
          await supabase
            .from("campaign_sends")
            .update({ 
              status: "sent", 
              sent_at: new Date().toISOString() 
            })
            .eq("id", job.id);
          return { id: job.id, ok: true };
        } else {
          await supabase
            .from("campaign_sends")
            .update({ 
              status: "failed", 
              error: res.error || "Send failed",
              attempt: job.attempt + 1
            })
            .eq("id", job.id);
          return { id: job.id, ok: false };
        }
      }

      // Render variant templates
      const subject = renderTemplate(variant.subject || "", {
        first_name: lead.first_name || "",
        last_name: lead.last_name || "",
        company: lead.company || "",
        email: lead.email || "",
      });

      const body = renderTemplate(variant.body || "", {
        first_name: lead.first_name || "",
        last_name: lead.last_name || "",
        company: lead.company || "",
        email: lead.email || "",
      });

      // Send email
      const res = await sendEmail({
        to: lead.email,
        subject,
        html: body,
      });

      if (res.ok) {
        await supabase
          .from("campaign_sends")
          .update({ 
            status: "sent", 
            sent_at: new Date().toISOString() 
          })
          .eq("id", job.id);
        return { id: job.id, ok: true };
      } else {
        await supabase
          .from("campaign_sends")
          .update({ 
            status: "failed", 
            error: res.error || "Send failed",
            attempt: job.attempt + 1
          })
          .eq("id", job.id);
        return { id: job.id, ok: false };
      }
    }));

    const processed = results.length;
    const sent = results.filter(r => r.ok).length;
    const failed = results.filter(r => !r.ok && !r.canceled).length;

    return new Response(
      JSON.stringify({ processed, sent, failed }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (e: any) {
    console.error("sendCampaignSends error:", e);
    return new Response(
      JSON.stringify({ error: e.message || "Unknown error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

