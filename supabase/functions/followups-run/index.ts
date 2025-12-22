import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (_req) => {
  const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
  const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

  if (!supabaseUrl || !supabaseServiceKey) {
    return new Response(
      JSON.stringify({ error: "Missing Supabase configuration" }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const nowIso = new Date().toISOString();

  // 1) Fetch due follow-ups that aren't processed
  const { data: jobs, error } = await supabase
    .from("followup_queue")
    .select(`
      id,
      workspace_id,
      campaign_id,
      campaign_step_id,
      contact_id,
      email_message_id,
      run_after
    `)
    .is("processed_at", null)
    .lte("run_after", nowIso)
    .limit(50);

  if (error || !jobs?.length) {
    return new Response(
      JSON.stringify({ ok: true, processed: 0, message: "no jobs" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }

  let processed = 0;
  let sent = 0;
  let skipped = 0;

  for (const job of jobs) {
    try {
      // Load step config
      const { data: step, error: stepError } = await supabase
        .from("campaign_steps")
        .select(
          "id, followup_condition, followup_subject_template, followup_body_template"
        )
        .eq("id", job.campaign_step_id)
        .single();

      if (stepError || !step) {
        await markJobProcessed(supabase, job.id);
        skipped++;
        continue;
      }

      // Load original email message to get sent_at time
      const { data: originalMessage } = await supabase
        .from("email_messages")
        .select("sent_at, created_at")
        .eq("id", job.email_message_id)
        .single();

      const originalSentAt = originalMessage?.sent_at || originalMessage?.created_at || job.run_after;

      // Check if conditions are met
      const shouldSend = await shouldSendFollowup(
        supabase,
        {
          job,
          step,
          originalSentAt,
        }
      );

      if (!shouldSend) {
        await markJobProcessed(supabase, job.id);
        skipped++;
        continue;
      }

      // Build email from followup_subject_template/body and contact/company placeholders
      const { subject, body } = await buildFollowupEmail(
        supabase,
        job,
        step
      );

      if (!subject || !body) {
        await markJobProcessed(supabase, job.id);
        skipped++;
        continue;
      }

      // Enqueue / send followup email via your existing send pipeline
      const followupMessageId = await sendFollowupEmail(
        supabase,
        job,
        subject,
        body
      );

      // Mark job processed
      await markJobProcessed(supabase, job.id);

      // Optionally log to contact_activity if table exists
      try {
        await supabase.from("contact_activity").insert({
          contact_id: job.contact_id,
          activity_type: "email_sent",
          title: "Auto Follow-up Sent",
          body,
          meta: {
            campaign_id: job.campaign_id,
            campaign_step_id: job.campaign_step_id,
            followup_for_message_id: job.email_message_id,
          },
        });
      } catch (e) {
        // Ignore if contact_activity table doesn't exist
        console.log("contact_activity insert skipped:", e);
      }

      // Log event for timeline (Block 11200)
      try {
        // Get lead_id from contact_id
        const { data: contact } = await supabase
          .from("contacts")
          .select("lead_id, email")
          .eq("id", job.contact_id)
          .maybeSingle();

        let leadId: string | null = contact?.lead_id || null;

        // If no lead_id, try to find by email
        if (!leadId && contact?.email) {
          const { data: lead } = await supabase
            .from("leads")
            .select("id")
            .ilike("email", contact.email)
            .limit(1)
            .maybeSingle();
          leadId = lead?.id || null;
        }

        if (leadId) {
          // Get step number from campaign_step_id
          const { data: stepData } = await supabase
            .from("campaign_steps")
            .select("step_index, delay_days")
            .eq("id", job.campaign_step_id)
            .maybeSingle();

          const stepNumber = (stepData?.step_index || 0) + 1;
          const delayDays = stepData?.delay_days || 0;

          await supabase.rpc("log_lead_event", {
            p_lead_id: leadId,
            p_type: "followup_triggered",
            p_content: `SmartSend sent Follow-Up ${stepNumber}${delayDays ? ` (No reply after ${delayDays} days)` : ""}.`,
            p_metadata: {
              campaign_id: job.campaign_id,
              campaign_step_id: job.campaign_step_id,
              step_number: stepNumber,
              delay_days: delayDays,
              subject: subject,
            },
          });
        }
      } catch (eventError) {
        // Don't fail the follow-up if event logging fails
        console.error("Error logging follow-up event:", eventError);
      }

      sent++;
      processed++;
    } catch (err) {
      console.error("followup job failed", err);
      // Leave the job unprocessed; next run can retry
      skipped++;
    }
  }

  return new Response(
    JSON.stringify({
      ok: true,
      processed,
      sent,
      skipped,
    }),
    {
      status: 200,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    }
  );
});

async function markJobProcessed(supabase: any, jobId: string) {
  await supabase
    .from("followup_queue")
    .update({ processed_at: new Date().toISOString() })
    .eq("id", jobId);
}

async function shouldSendFollowup(
  supabase: any,
  {
    job,
    step,
    originalSentAt,
  }: {
    job: any;
    step: any;
    originalSentAt: string;
  }
): Promise<boolean> {
  const condition = step.followup_condition || "no_reply";

  // Load inbound replies to this contact after original email
  // Handle both 'inbound'/'outbound' and 'in'/'out' direction values
  const { data: replies, error } = await supabase
    .from("email_messages")
    .select("id, intent_label, created_at, direction")
    .eq("contact_id", job.contact_id)
    .in("direction", ["inbound", "in", "received"])
    .gte("created_at", originalSentAt)
    .order("created_at", { ascending: true });

  if (error) {
    console.error("Error checking replies:", error);
    return false;
  }

  if (condition === "always") {
    return true;
  }

  if (!replies || replies.length === 0) {
    // no replies at all
    return condition === "no_reply" || condition === "no_hot_or_warm";
  }

  const hasReply = replies.length > 0;
  const hasHotOrWarm = replies.some((r: any) =>
    ["hot_lead", "warm_lead"].includes(r.intent_label ?? "")
  );

  if (condition === "no_reply") {
    return !hasReply;
  }

  if (condition === "no_hot_or_warm") {
    return !hasHotOrWarm;
  }

  return false;
}

async function buildFollowupEmail(
  supabase: any,
  job: any,
  step: any
): Promise<{ subject: string; body: string }> {
  const { data: contact } = await supabase
    .from("contacts")
    .select("id, first_name, last_name, email, company, city")
    .eq("id", job.contact_id)
    .single();

  // Get workspace profile for company info
  const { data: workspaceProfile } = await supabase
    .from("workspace_profile")
    .select("*")
    .eq("workspace_id", job.workspace_id)
    .maybeSingle();

  // Try campaigns table for company name if workspace_profile doesn't exist
  let companyName = "";
  if (!workspaceProfile) {
    const { data: campaign } = await supabase
      .from("campaigns")
      .select("from_name")
      .eq("id", job.campaign_id)
      .single();
    companyName = campaign?.from_name || "";
  } else {
    companyName = workspaceProfile?.company_name || "";
  }

  const context = {
    contact: {
      first_name: contact?.first_name ?? "",
      last_name: contact?.last_name ?? "",
      email: contact?.email ?? "",
    },
    city: contact?.city ?? workspaceProfile?.primary_city ?? "",
    company: {
      name: companyName,
    },
    sender: {
      signature: companyName || "Your roofing company",
    },
  };

  const subject = renderTemplate(step.followup_subject_template || "", context);
  const body = renderTemplate(step.followup_body_template || "", context);

  return { subject, body };
}

// Simple {{key.path}} renderer
function renderTemplate(template: string, context: any): string {
  if (!template) return "";
  return template.replace(/\{\{\s*([^}]+)\s*\}\}/g, (_, key) => {
    const path = key.split(".");
    let cur: any = context;
    for (const p of path) {
      if (cur == null) break;
      cur = cur[p];
    }
    return cur ?? "";
  });
}

async function sendFollowupEmail(
  supabase: any,
  job: any,
  subject: string,
  body: string
): Promise<string> {
  // Create email_messages record
  const { data: newMsg, error } = await supabase
    .from("email_messages")
    .insert({
      workspace_id: job.workspace_id,
      campaign_id: job.campaign_id,
      campaign_step_id: job.campaign_step_id,
      contact_id: job.contact_id,
      direction: "outbound",
      subject,
      body_html: body,
      body_text: body.replace(/<[^>]*>/g, ""), // Simple HTML to text
      sent_at: new Date().toISOString(),
      created_at: new Date().toISOString(),
    })
    .select("id")
    .single();

  if (error) throw error;

  // The actual send happens via your existing queue/worker
  // For now, we'll just log it. You can integrate with your send pipeline here.
  // Example: enqueue to send_queue or call your send API

  return newMsg.id;
}

