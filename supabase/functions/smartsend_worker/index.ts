// Block 8100 - SmartSend Worker
// Runs every minute → sends queued email → marks sent → retries if failed

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sendEmail } from "../_shared/sendEmail.ts";
import { sendWithAccount } from "../_shared/sendWithAccount.ts";
import { renderTemplate } from "../_shared/renderTemplate.ts";
import { reserveSendSlot } from "../_shared/mailboxSafety.ts";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async () => {
  try {
    const now = new Date().toISOString();

    // Block 9900: Fetch job with sending account
    // Fetch one job at a time (prevent overlap)
    const { data: job, error: fetchError } = await supabase
      .from("smartsend_queue")
      .select("*, leads(*), campaigns(*), sending_account:sending_account_id(*)")
      .eq("status", "pending")
      .lte("scheduled_at", now)
      .order("scheduled_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (fetchError) {
      console.error("Error fetching job:", fetchError);
      return new Response(
        JSON.stringify({ error: "Failed to fetch job", details: fetchError.message }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    if (!job) {
      return new Response(
        JSON.stringify({ message: "No jobs", processed: 0 }),
        { headers: { "content-type": "application/json" } }
      );
    }

    // Mark as processing
    const { error: updateError } = await supabase
      .from("smartsend_queue")
      .update({
        status: "processing",
        processed_at: now,
      })
      .eq("id", job.id);

    if (updateError) {
      console.error("Error updating job status:", updateError);
      return new Response(
        JSON.stringify({ error: "Failed to update job status", details: updateError.message }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }

    // Get lead, campaign, and sending account data
    const lead = job.leads as any;
    const campaign = job.campaigns as any;
    const sendingAccount = job.sending_account as any;

    // Block 9900: Check for sending account
    if (!lead || !campaign) {
      await supabase
        .from("smartsend_queue")
        .update({
          status: "failed",
          error: "Missing lead or campaign data",
          attempts: job.attempts + 1,
        })
        .eq("id", job.id);

      return new Response(
        JSON.stringify({ error: "Missing lead or campaign data" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    if (!sendingAccount) {
      await supabase
        .from("smartsend_queue")
        .update({
          status: "failed",
          error: "No sending_account for job",
          attempts: job.attempts + 1,
        })
        .eq("id", job.id);

      await supabase.from("logs").insert({
        scope: "send",
        message: `No sending_account for job ${job.id}`,
      }).catch(() => {});

      return new Response(
        JSON.stringify({ error: "No sending account configured" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // Extract domain from lead email for safety checks
    const domain = lead.email?.split("@")[1];
    if (!domain) {
      await supabase
        .from("smartsend_queue")
        .update({
          status: "failed",
          error: "Invalid email address",
          attempts: job.attempts + 1,
        })
        .eq("id", job.id);

      return new Response(
        JSON.stringify({ error: "Invalid email address" }),
        { status: 400, headers: { "content-type": "application/json" } }
      );
    }

    // Block 8300: RUN SAFETY CHECK before sending
    const { data: canSend, error: safetyCheckError } = await supabase.rpc("smartsend_can_send", {
      p_user_id: campaign.user_id,
      p_domain: domain,
    });

    if (safetyCheckError) {
      console.error("Safety check error:", safetyCheckError);
      // If safety check fails due to error, allow sending (fail open)
      // But log the error
    }

    if (canSend === false) {
      // Safety conditions not met - throttle and retry later
      await supabase
        .from("smartsend_queue")
        .update({
          status: "retry",
          attempts: job.attempts + 1,
          error: "Safety conditions not met, throttled",
        })
        .eq("id", job.id);

      // Reschedule for later (add delay)
      const retryDelay = 60000; // 1 minute delay
      const retryAt = new Date(Date.now() + retryDelay).toISOString();

      await supabase
        .from("smartsend_queue")
        .update({
          scheduled_at: retryAt,
        })
        .eq("id", job.id);

      return new Response(
        JSON.stringify({ message: "Throttled - safety conditions not met" }),
        { headers: { "content-type": "application/json" } }
      );
    }

    // Block 10000: Check mailbox daily limit before sending
    const ok = await reserveSendSlot(sendingAccount.id);
    if (!ok) {
      // Daily limit reached - mark job as skipped
      await supabase.from("logs").insert({
        scope: "safety",
        message: `Daily limit reached for account ${sendingAccount.from_email}, job ${job.id} skipped`
      }).catch(() => {});

      // Mark job as skipped_limit (won't be retried today)
      await supabase
        .from("smartsend_queue")
        .update({
          status: "skipped_limit",
          error: "Daily limit reached for sending account"
        })
        .eq("id", job.id);

      return new Response(
        JSON.stringify({ message: "Daily limit reached for sending account" }),
        { headers: { "content-type": "application/json" } }
      );
    }

    try {
      // Block 9900: Sending account is already loaded from queue query above

      // Block 9800: Get or create unsubscribe token for this lead+campaign
      const APP_URL = Deno.env.get("NEXT_PUBLIC_APP_URL") || 
                     Deno.env.get("TRACKING_BASE_URL") || 
                     "https://app.smartsendhq.com";
      
      const { data: existingToken } = await supabase
        .from("smartsend_unsubscribe_tokens")
        .select("*")
        .eq("lead_id", job.lead_id)
        .eq("campaign_id", job.campaign_id)
        .maybeSingle();
      
      let tokenRow = existingToken;
      if (!tokenRow) {
        const token = crypto.randomUUID();
        const { data: inserted, error: insertErr } = await supabase
          .from("smartsend_unsubscribe_tokens")
          .insert({
            user_id: campaign.user_id,
            lead_id: job.lead_id,
            campaign_id: job.campaign_id,
            token,
          })
          .select()
          .single();
        
        if (insertErr) {
          console.error("Failed to create unsubscribe token:", insertErr);
          // Continue anyway - unsubscribe link failure shouldn't block sending
        } else {
          tokenRow = inserted;
        }
      }
      
      const unsubscribeUrl = tokenRow ? `${APP_URL}/u/${tokenRow.token}` : null;

      // Block 8600: Render template with personalization
      // Block 8900: Use subject/body from step if available, otherwise fall back to campaign
      const subjectTemplate = job.subject || campaign.subject || campaign.subject_template || "Hello";
      const bodyTemplate = job.body || campaign.body_html || campaign.body_template || campaign.body || "";
      
      const personalizedSubject = renderTemplate(subjectTemplate, lead, campaign);
      let personalizedBodyRaw = renderTemplate(bodyTemplate, lead, campaign);
      
      // Block 9800: Replace {{unsubscribe_link}} if present, or append if not
      let personalizedBody = personalizedBodyRaw;
      if (unsubscribeUrl) {
        // If template uses {{unsubscribe_link}}, replace it
        personalizedBody = personalizedBodyRaw.replaceAll(
          "{{unsubscribe_link}}",
          unsubscribeUrl
        );
        
        // If user didn't add it, optionally append a tiny line (MVP)
        if (!personalizedBodyRaw.includes("{{unsubscribe_link}}")) {
          personalizedBody +=
            `<br/><br/><span style="font-size:11px;color:#888;">` +
            `If you prefer not to receive emails like this, you can <a href="${unsubscribeUrl}">unsubscribe here</a>.` +
            `</span>`;
        }
      }

      // Block 8500: Create open-tracking link + pixel URL
      const trackingBaseUrl = Deno.env.get("TRACKING_BASE_URL") || 
                              Deno.env.get("NEXT_PUBLIC_APP_URL") || 
                              "https://app.smartsendhq.com";
      
      const token = crypto.randomUUID();
      const { data: openLink, error: openErr } = await supabase
        .from("smartsend_links")
        .insert({
          campaign_id: job.campaign_id,
          lead_id: job.lead_id,
          url: "open",
          type: "open",
          token
        })
        .select()
        .single();

      if (openErr) {
        console.error("Failed to create open link", openErr);
        // Continue anyway - tracking failure shouldn't block sending
      } else {
        // Inject tracking pixel into HTML body
        const pixelUrl = `${trackingBaseUrl}/api/t/o/${token}`;
        // Append pixel as hidden image tag
        personalizedBody = personalizedBody + `<img src="${pixelUrl}" width="1" height="1" style="display:none;" />`;
      }

      // Block 9900: Send email using sending account
      const sendResult = await sendWithAccount(sendingAccount, {
        to: lead.email,
        subject: personalizedSubject,
        htmlBody: personalizedBody,
      });

      // Block 9900: Check send result
      if (sendResult.success) {
        // Success - mark as sent
        await supabase
          .from("smartsend_queue")
          .update({
            status: "sent",
          })
          .eq("id", job.id);

        // Block 9000: Log outbound email into thread
        try {
          // Find or create thread
          const { data: thread } = await supabase
            .from("smartsend_threads")
            .select("*")
            .eq("lead_id", job.lead_id)
            .eq("campaign_id", job.campaign_id)
            .maybeSingle();

          let threadId = thread?.id;

          if (!threadId) {
            const { data: created, error: createError } = await supabase
              .from("smartsend_threads")
              .insert({
                lead_id: job.lead_id,
                campaign_id: job.campaign_id,
                last_message_at: now,
              })
              .select()
              .single();

            if (createError) {
              console.error("Failed to create thread:", createError);
            } else {
              threadId = created.id;
            }
          }

          // Insert outbound message
          if (threadId) {
            await supabase.from("smartsend_thread_messages").insert({
              thread_id: threadId,
              direction: "outbound",
              subject: personalizedSubject,
              body: personalizedBody,
              sent_at: now,
            }).catch((err) => {
              console.error("Failed to insert thread message:", err);
            });

            // Update thread timestamp
            await supabase
              .from("smartsend_threads")
              .update({ last_message_at: now })
              .eq("id", threadId)
              .catch((err) => {
                console.error("Failed to update thread timestamp:", err);
              });
          }
        } catch (threadErr) {
          console.error("Error logging to thread:", threadErr);
          // Don't fail the send if thread logging fails
        }

        // Block 8900: Move lead to next step or mark as completed
        const currentStep = lead.current_step || 1;
        const stepPosition = job.step_position || currentStep;
        
        // Check if there's a next step
        const { data: nextStep } = await supabase.rpc("smartsend_get_next_step", {
          p_campaign_id: campaign.id,
          p_current_step: stepPosition + 1,
        });

        if (!nextStep) {
          // No more steps - mark lead as completed
          await supabase
            .from("leads")
            .update({ 
              status: "completed",
              last_step_sent_at: now,
            })
            .eq("id", job.lead_id);
        } else {
          // Move to next step
          const delayMs = (nextStep.delay_days || 0) * 86400000; // Convert days to milliseconds
          const nextStepAt = new Date(Date.now() + delayMs).toISOString();
          
          await supabase
            .from("leads")
            .update({
              current_step: stepPosition + 1,
              last_step_sent_at: now,
              next_step_at: nextStepAt,
              status: "pending", // Keep as pending for next step
            })
            .eq("id", job.lead_id);
        }

        // Block 8300: Log the send into domain + quota tables
        await supabase.from("smartsend_domain_logs").insert({
          user_id: campaign.user_id,
          domain: domain,
        }).catch((err) => {
          console.error("Could not write to domain logs:", err);
        });

        await supabase.from("smartsend_quota").insert({
          user_id: campaign.user_id,
        }).catch((err) => {
          console.error("Could not write to quota logs:", err);
        });

        // Block 8400: Update stats when email sent
        const today = new Date().toISOString().slice(0, 10);
        await supabase.rpc("smartsend_increment_stat", {
          p_campaign_id: campaign.id,
          p_date: today,
          p_field: "emails_sent"
        }).catch((err) => {
          console.error("Could not update campaign stats:", err);
        });

        // Log success
        await supabase.from("logs").insert({
          scope: "smartsend_worker",
          message: `Sent email to ${lead.email}`,
          meta: {
            campaign_id: campaign.id,
            lead_id: lead.id,
            queue_id: job.id,
          },
        }).catch((err) => {
          // Log table might not exist, that's ok
          console.log("Could not write to logs table:", err);
        });

        return new Response(
          JSON.stringify({
            message: "Email sent successfully",
            lead_email: lead.email,
            campaign_id: campaign.id,
          }),
          { headers: { "content-type": "application/json" } }
        );
      } else {
        // Failed - mark for retry or failed
        const errorMsg = sendResult.error || "Send failed";
        
        // Block 9900: Update sending account status on error
        if (sendingAccount.status === "connected") {
          await supabase
            .from("smartsend_sending_accounts")
            .update({ status: "error" })
            .eq("id", sendingAccount.id)
            .catch(() => {});
        }
        
        // Block 8300: Auto-Cooldown on Error Spikes
        const isMajorError = errorMsg.toLowerCase().includes("quota") ||
                             errorMsg.toLowerCase().includes("rate") ||
                             errorMsg.toLowerCase().includes("blocked") ||
                             errorMsg.toLowerCase().includes("limit");

        if (isMajorError && campaign.user_id) {
          const cooldownUntil = new Date(Date.now() + 1000 * 300).toISOString(); // 5 minutes cooldown

          await supabase
            .from("campaigns")
            .update({
              status: "cooldown",
              cooldown_until: cooldownUntil,
            })
            .eq("id", campaign.id)
            .catch((updateErr) => {
              console.error("Could not update campaign cooldown:", updateErr);
            });

          // Mark all pending jobs for this campaign as retry
          await supabase
            .from("smartsend_queue")
            .update({ status: "retry" })
            .eq("campaign_id", campaign.id)
            .neq("status", "sent")
            .catch((updateErr) => {
              console.error("Could not update queue for cooldown:", updateErr);
            });
        }

        const maxAttempts = 3;
        const shouldRetry = job.attempts < maxAttempts;

        await supabase
          .from("smartsend_queue")
          .update({
            status: shouldRetry ? "retry" : "failed",
            attempts: job.attempts + 1,
            error: errorMsg,
          })
          .eq("id", job.id);

        // Block 8400: Update stats on failures (only when max attempts reached)
        if (!shouldRetry) {
          const today = new Date().toISOString().slice(0, 10);
          await supabase.rpc("smartsend_increment_stat", {
            p_campaign_id: campaign.id,
            p_date: today,
            p_field: "failures"
          }).catch((err) => {
            console.error("Could not update campaign stats for failure:", err);
          });
        }

        // If retry, reschedule for later
        if (shouldRetry) {
          const retryDelay = Math.min(300000, 60000 * Math.pow(2, job.attempts)); // Exponential backoff, max 5 min
          const retryAt = new Date(Date.now() + retryDelay).toISOString();

          await supabase
            .from("smartsend_queue")
            .update({
              scheduled_at: retryAt,
            })
            .eq("id", job.id);
        }

        return new Response(
          JSON.stringify({
            message: shouldRetry ? "Email send failed, will retry" : "Email send failed",
            error: errorMsg,
            attempts: job.attempts + 1,
          }),
          { status: 500, headers: { "content-type": "application/json" } }
        );
      }
    } catch (err) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      console.error("Error sending email:", errorMsg);

      // Block 8300: Auto-Cooldown on Error Spikes
      const isMajorError = errorMsg.toLowerCase().includes("quota") ||
                           errorMsg.toLowerCase().includes("rate") ||
                           errorMsg.toLowerCase().includes("blocked") ||
                           errorMsg.toLowerCase().includes("limit");

      if (isMajorError && campaign.user_id) {
        const cooldownUntil = new Date(Date.now() + 1000 * 300).toISOString(); // 5 minutes cooldown

        await supabase
          .from("campaigns")
          .update({
            status: "cooldown",
            cooldown_until: cooldownUntil,
          })
          .eq("id", campaign.id)
          .catch((updateErr) => {
            console.error("Could not update campaign cooldown:", updateErr);
          });

        // Mark all pending jobs for this campaign as retry
        await supabase
          .from("smartsend_queue")
          .update({ status: "retry" })
          .eq("campaign_id", campaign.id)
          .neq("status", "sent")
          .catch((updateErr) => {
            console.error("Could not update queue for cooldown:", updateErr);
          });
      }

      const maxAttempts = 3;
      const shouldRetry = job.attempts < maxAttempts;

      await supabase
        .from("smartsend_queue")
        .update({
          status: shouldRetry ? "retry" : "failed",
          attempts: job.attempts + 1,
          error: errorMsg,
        })
        .eq("id", job.id);

      // Block 8400: Update stats on failures (only when max attempts reached)
      if (!shouldRetry) {
        const today = new Date().toISOString().slice(0, 10);
        await supabase.rpc("smartsend_increment_stat", {
          p_campaign_id: campaign.id,
          p_date: today,
          p_field: "failures"
        }).catch((err) => {
          console.error("Could not update campaign stats for failure:", err);
        });
      }

      // If retry, reschedule for later
      if (shouldRetry) {
        const retryDelay = Math.min(300000, 60000 * Math.pow(2, job.attempts));
        const retryAt = new Date(Date.now() + retryDelay).toISOString();

        await supabase
          .from("smartsend_queue")
          .update({
            scheduled_at: retryAt,
          })
          .eq("id", job.id);
      }

      return new Response(
        JSON.stringify({
          error: "Send failed",
          details: errorMsg,
          attempts: job.attempts + 1,
        }),
        { status: 500, headers: { "content-type": "application/json" } }
      );
    }
  } catch (err) {
    const errorMsg = err instanceof Error ? err.message : String(err);
    console.error("Worker error:", errorMsg);
    return new Response(
      JSON.stringify({ error: "Worker failed", details: errorMsg }),
      { status: 500, headers: { "content-type": "application/json" } }
    );
  }
});

