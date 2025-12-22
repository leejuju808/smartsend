import { NextResponse } from "next/server";
import { supabaseAdmin } from "@/server/supabase";
import { sendHtmlEmail } from "@/lib/notify/mailer";
import { renderTemplate } from "@/lib/renderTemplate";
import { sign } from "@/lib/events-sign";
import { 
  getLeastUsedMailbox, 
  checkDomainCap, 
  incrementMailboxUsage, 
  incrementDomainUsage,
  extractDomain,
  shouldRescheduleForSendWindow
} from "@/lib/mailbox-rotation";

function authorize(req: Request) {
  const key = new URL(req.url).searchParams.get("key");
  return key && key === process.env.CRON_SECRET;
}

export async function POST(req: Request) {
  if (!authorize(req)) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const nowISO = new Date().toISOString();

  // 1) Activate campaigns whose scheduled_at is due
  const { data: dueCampaigns } = await supabaseAdmin
    .from("campaigns")
    .select("id,user_id,status,workspace_id")
    .eq("status", "scheduled")
    .lte("scheduled_at", nowISO)
    .limit(25);

  // BLOCK 269500: workspace-wide outreach gate (scheduled campaigns should not start while paused)
  const dueWorkspaceIds = [...new Set((dueCampaigns || []).map((c: any) => c.workspace_id).filter(Boolean))] as string[];
  const duePaused = new Set<string>();
  if (dueWorkspaceIds.length > 0) {
    const { data: ws } = await supabaseAdmin
      .from("workspaces")
      .select("id, outreach_state")
      .in("id", dueWorkspaceIds);
    for (const row of ws || []) {
      if (String((row as any).outreach_state || "running") === "paused") {
        duePaused.add(String((row as any).id));
      }
    }
  }

  for (const camp of dueCampaigns || []) {
    if ((camp as any)?.workspace_id && duePaused.has(String((camp as any).workspace_id))) {
      continue;
    }
    await supabaseAdmin.from("campaigns").update({ status: "running", started_at: nowISO }).eq("id", camp.id);
  }

  // 2) Process batches for running campaigns
  const { data: running } = await supabaseAdmin
    .from("campaigns")
    .select("id,user_id,workspace_id,status,name,subject,body_html,from_name,from_email,is_sequence,current_step")
    .eq("status", "running")
    .limit(10);

  let processed = 0;

  // BLOCK 269500: workspace-wide outreach gate (running campaigns do not send while paused)
  const runningWorkspaceIds = [...new Set((running || []).map((c: any) => c.workspace_id).filter(Boolean))] as string[];
  const runningPaused = new Set<string>();
  if (runningWorkspaceIds.length > 0) {
    const { data: ws } = await supabaseAdmin
      .from("workspaces")
      .select("id, outreach_state")
      .in("id", runningWorkspaceIds);
    for (const row of ws || []) {
      if (String((row as any).outreach_state || "running") === "paused") {
        runningPaused.add(String((row as any).id));
      }
    }
  }

  for (const camp of running || []) {
    if ((camp as any)?.workspace_id && runningPaused.has(String((camp as any).workspace_id))) {
      continue;
    }
    // BLOCK 269700: Missed payment => immediate silence. Pause campaign if owner is not paid.
    try {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("subscription_status")
        .eq("id", camp.user_id)
        .maybeSingle();
      const status = String((prof as any)?.subscription_status || "");
      const isPaid = status === "active" || status === "trialing";
      if (!isPaid) {
        await supabaseAdmin.from("campaigns").update({ status: "paused" }).eq("id", camp.id);
        continue;
      }
    } catch {
      // If we can't verify, fail closed: pause.
      await supabaseAdmin.from("campaigns").update({ status: "paused" }).eq("id", camp.id);
      continue;
    }

    // For sequence campaigns, get recipients for current step
    // For regular campaigns, get any queued recipients
    const query = supabaseAdmin
      .from("campaign_recipients")
      .select("id, contact_id, email_lower, name, step_index, last_sent_step")
      .eq("campaign_id", camp.id)
      .eq("status", "queued")
      .limit(50);

    if (camp.is_sequence) {
      query.eq("step_index", camp.current_step || 0);
    }

    const { data: recips } = await query;

    if (!recips || recips.length === 0) {
      // Check if campaign is complete
      if (camp.is_sequence) {
        // For sequences, check if we've sent all steps
        const { data: nextStep } = await supabaseAdmin
          .from("campaign_steps")
          .select("step_index")
          .eq("campaign_id", camp.id)
          .gt("step_index", camp.current_step || 0)
          .order("step_index")
          .limit(1)
          .maybeSingle();

        if (!nextStep) {
          // No more steps, mark campaign as done
          await supabaseAdmin.from("campaigns").update({ 
            status: "done", 
            finished_at: new Date().toISOString() 
          }).eq("id", camp.id);
        } else {
          // Advance to next step
          await supabaseAdmin.from("campaigns").update({ 
            current_step: nextStep.step_index,
            updated_at: nowISO
          }).eq("id", camp.id);
        }
      } else {
        // Regular campaign - check if all recipients are processed
        const { data: remainingRecips } = await supabaseAdmin
          .from("campaign_recipients")
          .select("id")
          .eq("campaign_id", camp.id)
          .eq("status", "queued")
          .limit(1);

        if (!remainingRecips || remainingRecips.length === 0) {
          // complete campaign
          await supabaseAdmin.from("campaigns").update({ 
            status: "done", 
            finished_at: new Date().toISOString() 
          }).eq("id", camp.id);
          
          // Mark onboarding step as complete for the first campaign completion
          try {
            const { data: profile } = await supabaseAdmin
              .from("profiles")
              .select("id")
              .eq("id", camp.user_id)
              .maybeSingle();
            if (profile?.id) {
              await supabaseAdmin.rpc("merge_onboarding_step", { uid: profile.id, k: "send_campaign" });
            }
          } catch (e) {
            // Don't fail the campaign completion if onboarding update fails
            console.warn('Failed to update onboarding step:', e);
          }
        }
      }
      continue;
    }

    // Bulk-load contacts for personalization
    const contactIds = Array.from(new Set((recips || []).map((r: any) => (r as any).contact_id).filter(Boolean)));
    const contactsById: Record<string, any> = {};
    if (contactIds.length) {
      const { data: contacts } = await supabaseAdmin
        .from("contacts")
        .select("id, first_name, last_name, name, company, email")
        .in("id", contactIds);
      for (const c of contacts || []) contactsById[(c as any).id] = c;
    }

    for (const r of recips) {
      try {
        const contact = contactsById[(r as any).contact_id] || { name: (r as any).name, email: (r as any).email_lower };
        
        // Check send window
        const { shouldReschedule, nextSendTime } = await shouldRescheduleForSendWindow(
          camp.user_id,
          camp.workspace_id,
          new Date()
        );

        if (shouldReschedule && nextSendTime) {
          // Reschedule for next send window
          await supabaseAdmin
            .from("campaign_recipients")
            .update({ 
              next_eligible_at: nextSendTime.toISOString(),
              status: "queued"
            })
            .eq("id", (r as any).id);
          continue;
        }

        // Check domain cap
        const domain = extractDomain((r as any).email_lower);
        const canSendToDomain = await checkDomainCap(
          camp.user_id,
          camp.workspace_id,
          domain
        );

        if (!canSendToDomain) {
          // Domain cap reached, reschedule for tomorrow
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(9, 0, 0, 0); // 9 AM tomorrow
          
          await supabaseAdmin
            .from("campaign_recipients")
            .update({ 
              next_eligible_at: tomorrow.toISOString(),
              status: "queued"
            })
            .eq("id", (r as any).id);
          continue;
        }

        // Get least used mailbox
        const mailbox = await getLeastUsedMailbox(
          camp.user_id,
          camp.workspace_id
        );

        if (!mailbox) {
          // No available mailbox, reschedule
          const tomorrow = new Date();
          tomorrow.setDate(tomorrow.getDate() + 1);
          tomorrow.setHours(9, 0, 0, 0);
          
          await supabaseAdmin
            .from("campaign_recipients")
            .update({ 
              next_eligible_at: tomorrow.toISOString(),
              status: "queued"
            })
            .eq("id", (r as any).id);
          continue;
        }

        let subject: string;
        let html: string;

        let stepId: string | null = null;
        if (camp.is_sequence) {
          // Use step-specific content
          const { data: stepContent } = await supabaseAdmin
            .from("campaign_steps")
            .select("id, subject, body_html, subject_template, body_html_template, followup_enabled, followup_delay_days, followup_condition, followup_subject_template, followup_body_template")
            .eq("campaign_id", camp.id)
            .eq("step_index", (r as any).step_index)
            .maybeSingle();

          if (!stepContent) {
            throw new Error(`Step content not found for step ${(r as any).step_index}`);
          }

          stepId = stepContent.id;
          // Use template fields if available, otherwise fall back to direct fields
          const subjectTemplate = stepContent.subject_template || stepContent.subject || "";
          const bodyTemplate = stepContent.body_html_template || stepContent.body_html || "";
          subject = renderTemplate(subjectTemplate, contact).rendered;
          html = renderTemplate(bodyTemplate, contact).rendered;
        } else {
          // Use campaign-level content
          subject = renderTemplate((camp as any).subject || "", contact).rendered;
          html = renderTemplate((camp as any).body_html || (camp as any).body || "", contact).rendered;
        }

        // Inject tracking (legacy stable helper in this file)
        html = trackedHtml(html, camp.id, String((r as any).id));

        // Send email using selected mailbox
        await sendHtmlEmail({
          to: (r as any).email_lower,
          subject,
          html,
          fromName: mailbox.from_name || camp.from_name || undefined,
          fromEmail: mailbox.from_email,
        });

        // Increment usage counters
        await incrementMailboxUsage(mailbox.id);
        await incrementDomainUsage(camp.user_id, camp.workspace_id, domain);

        // Create email_messages record for tracking
        const sentAt = new Date().toISOString();
        const { data: emailMessage, error: emailMsgError } = await supabaseAdmin
          .from("email_messages")
          .insert({
            workspace_id: camp.workspace_id,
            campaign_id: camp.id,
            contact_id: (r as any).contact_id,
            direction: "outbound",
            subject,
            body_html: html,
            body_text: html.replace(/<[^>]*>/g, ""), // Simple HTML to text conversion
            sent_at: sentAt,
            created_at: sentAt,
          })
          .select("id")
          .single();

        if (emailMsgError) {
          console.error("Failed to create email_messages record:", emailMsgError);
        }

        // Create follow-up job if step has follow-up enabled
        if (stepId && emailMessage?.id && (r as any).contact_id) {
          const { data: step } = await supabaseAdmin
            .from("campaign_steps")
            .select("followup_enabled, followup_delay_days, followup_condition")
            .eq("id", stepId)
            .single();

          if (step?.followup_enabled) {
            const delayDays = step.followup_delay_days ?? 3;
            const runAfter = new Date(
              Date.now() + delayDays * 24 * 60 * 60 * 1000
            ).toISOString();

            try {
              await supabaseAdmin.from("followup_queue").insert({
                workspace_id: camp.workspace_id,
                campaign_id: camp.id,
                campaign_step_id: stepId,
                contact_id: (r as any).contact_id,
                email_message_id: emailMessage.id,
                run_after: runAfter,
              });
            } catch (err) {
              console.error("Failed to create follow-up job:", err);
              // Don't fail the send if follow-up job creation fails
            }
          }
        }

        // Update recipient status
        const updateData: any = { 
          status: "sent", 
          sent_at: new Date().toISOString(),
          last_sent_step: (r as any).step_index
        };

        if (camp.is_sequence) {
          // For sequences, schedule next step if available
          const { data: nextStep } = await supabaseAdmin
            .from("campaign_steps")
            .select("step_index, delay_days")
            .eq("campaign_id", camp.id)
            .gt("step_index", (r as any).step_index)
            .order("step_index")
            .limit(1)
            .maybeSingle();

          if (nextStep) {
            // Calculate next send time based on delay
            const nextSendAt = new Date();
            nextSendAt.setDate(nextSendAt.getDate() + (nextStep.delay_days || 0));
            
            // Add jitter (0-2 hours)
            const jitterMs = Math.random() * 2 * 60 * 60 * 1000;
            nextSendAt.setTime(nextSendAt.getTime() + jitterMs);

            updateData.step_index = nextStep.step_index;
            updateData.next_eligible_at = nextSendAt.toISOString();
            updateData.status = "queued"; // Re-queue for next step
          }
        }

        await supabaseAdmin
          .from("campaign_recipients")
          .update(updateData)
          .eq("id", (r as any).id);

        // Log event for timeline (Block 11200)
        try {
          // Get lead_id from contact_id or recipient
          let leadId: string | null = null;
          if ((r as any).contact_id) {
            const { data: contact } = await supabaseAdmin
              .from("contacts")
              .select("lead_id")
              .eq("id", (r as any).contact_id)
              .maybeSingle();
            leadId = contact?.lead_id || null;
          }
          
          // If no lead_id found, try to find by email
          if (!leadId && (r as any).email_lower) {
            const { data: lead } = await supabaseAdmin
              .from("leads")
              .select("id")
              .ilike("email", (r as any).email_lower)
              .limit(1)
              .maybeSingle();
            leadId = lead?.id || null;
          }

          if (leadId) {
            const stepNumber = camp.is_sequence ? ((r as any).step_index || 0) + 1 : 1;
            const stepName = camp.is_sequence ? `Step ${stepNumber}` : "Message 1";
            
            await supabaseAdmin.rpc("log_lead_event", {
              p_lead_id: leadId,
              p_type: "email_sent",
              p_content: `SmartSend sent ${stepName}${(camp as any).subject ? ` (${String((camp as any).subject).substring(0, 50)})` : ""}.`,
              p_metadata: {
                campaign_id: camp.id,
                campaign_name: (camp as any).name || null,
                step_number: stepNumber,
                step_name: stepName,
                subject: subject,
                body_preview: html.replace(/<[^>]*>/g, "").substring(0, 200),
              },
            });
          }
        } catch (eventError) {
          // Don't fail the send if event logging fails
          console.error("Error logging email sent event:", eventError);
        }

      } catch (e: any) {
        await supabaseAdmin
          .from("campaign_recipients")
          .update({ status: "failed", error: String(e?.message || e) })
          .eq("id", (r as any).id);
      }
      processed++;
    }
  }

  return NextResponse.json({ ok: true, processed });
}

function trackedHtml(bodyHtml: string, campId: string, recipId: string) {
  const base = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
  const re = /href="(https?:\/\/[^\"]+)"/gi;
  const withLinks = bodyHtml.replace(re, (_m, url) => {
    const u = Buffer.from(url, "utf8").toString("base64");
    const sig = sign(`${campId}:${recipId}:${u}`);
    return `href="${base}/t/c?cid=${campId}&rid=${recipId}&u=${encodeURIComponent(u)}&s=${sig}"`;
  });
  const sig = sign(`${campId}:${recipId}:open`);
  const pixel = `<img src="${base}/t/o?cid=${campId}&rid=${recipId}&s=${sig}" width="1" height="1" style="display:none" />`;
  return `${withLinks}\n${pixel}`;
}

