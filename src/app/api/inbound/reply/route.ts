import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import type { SupabaseClient } from "@supabase/supabase-js";
import { detectIntent } from "@/lib/replyDetection/detectIntent";
import { log } from "@/lib/logger";
import { applyScoreEvent, containsRoofingKeywords, containsBookingIntent, containsPhoneNumber } from "@/lib/lead-scoring/engine";
import { ActivityLogger } from "@/lib/activity-log";
import { insertUnifiedMessage, getCompanyIdFromLead } from "@/lib/unified-messages";
import { classifyReplyHotWarmDeadV1 } from "@/lib/replyDetection/hotWarmDead";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

type ReplyFollowupLabel = "hot" | "warm";

export async function POST(req: NextRequest) {
  // Verify webhook signature
  const secret = req.headers.get("x-smartsend-signature");
  if (process.env.INBOUND_SECRET && secret !== process.env.INBOUND_SECRET) {
    await log.warn('reply_detection', 'Unauthorized reply webhook attempt', {
      has_secret: !!secret,
    });
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  try {
    const {
      provider,
      provider_message_id,
      in_reply_to,
      from: from_email,
      to: to_email,
      subject,
      body_text,
      body_html,
    } = await req.json();

    await log.info('reply_detection', 'Processing inbound reply', {
      provider,
      from_email,
      to_email,
      has_body_text: !!body_text,
      has_body_html: !!body_html,
    });

    if (!from_email || !(body_text || body_html)) {
      return NextResponse.json({ error: "Missing fields" }, { status: 400 });
    }

    const replyText = (body_text || stripHtml(body_html) || "").trim();
    const nowIso = new Date().toISOString();

    // 0) First-choice match: parse lead token from subject "[SS|<leadId>]"
    const tokenLeadId = extractLeadIdFromSubject(subject || "");

    // 1) Find originating email_log (legacy)
    let emailLogId: string | null = null;

    if (in_reply_to) {
      const { data: byRef } = await supabase
        .from("email_logs")
        .select("id,user_id")
        .eq("provider_message_id", in_reply_to)
        .limit(1)
        .maybeSingle();
      if (byRef?.id) emailLogId = byRef.id;
    }

    if (!emailLogId) {
      // Fallback thread match: same recipient as original "to_email" == replier, subject sans "re:"
      const normalized = (subject || "").toLowerCase().replace(/^re:\s*/g, "");
      const { data: fallback } = await supabase
        .from("email_logs")
        .select("id,user_id,subject,to_email")
        .eq("to_email", from_email)
        .ilike("subject", `%${normalized}%`)
        .order("created_at", { ascending: false })
        .limit(1);
      if (fallback && fallback[0]) emailLogId = fallback[0].id;
    }

    if (!emailLogId && !tokenLeadId) {
      // Store orphan reply for inspection
      const detection = await detectIntent(replyText || "");
      const { data: orphanReply } = await supabase.from("email_replies").insert([
        {
          email_log_id: null, // not ideal; or create a nullable FK with constraint dropped
          provider,
          provider_message_id,
          in_reply_to,
          from_email,
          to_email,
          subject,
          body_text,
          body_html,
          intent: detection.intent,
          confidence: detection.confidence,
        } as any,
      ]).select('id').single();

      // Trigger AI reply detection for orphan reply
      if (orphanReply?.id && (body_text || body_html)) {
        try {
          await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-reply-detect`, {
            method: "POST",
            headers: { 
              "Content-Type": "application/json",
              "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
            },
            body: JSON.stringify({ 
              emailId: orphanReply.id, 
              body: body_text || body_html || "" 
            }),
          });
        } catch (e) {
          console.error("Failed to trigger AI reply detection for orphan:", e);
        }
      }

      return NextResponse.json({ stored: "orphan", intent: detection.intent }, { status: 202 });
    }

    // 2) Detect intent
    const detection = await detectIntent(replyText || "");

    // 2.1) Rules-based v1 label (Hot/Warm/Dead) — no ML required
    const hwLabel = classifyReplyHotWarmDeadV1(replyText);

    // Map intent to thread format (hot_lead | warm_lead | question | not_interested)
    const mapIntentToThreadFormat = (intent: string | null | undefined): string | null => {
      if (!intent) return null;
      const lower = intent.toLowerCase();
      if (lower === "interested" || lower === "hot" || lower === "meeting_booked") {
        return "hot_lead";
      } else if (lower === "warm" || lower === "neutral" || lower === "referral") {
        return "warm_lead";
      } else if (lower === "question" || lower === "follow_up") {
        return "question";
      } else if (lower === "not_interested" || lower === "unsubscribe") {
        return "not_interested";
      }
      return null;
    };
    const threadIntent = mapIntentToThreadFormat(detection.intent);

    // 2.5) Get lead and user info for thread linking (legacy path only)
    const emailLogForThread = emailLogId
      ? (
          await supabase
            .from("email_logs")
            .select("lead_id, user_id, campaign_id")
            .eq("id", emailLogId)
            .maybeSingle()
        ).data
      : null;

    // If we can identify the lead via subject token, prefer it.
    const resolvedLeadId = tokenLeadId || emailLogForThread?.lead_id || null;

    let threadId: string | null = null;
    if (emailLogForThread?.lead_id && emailLogForThread?.user_id) {
      // Get lead email
      const { data: leadForThread } = await supabase
        .from("leads")
        .select("id, email, user_id")
        .eq("id", emailLogForThread.lead_id)
        .maybeSingle();

      if (leadForThread?.email) {
        const primaryEmail = leadForThread.email.toLowerCase();
        const userId = emailLogForThread.user_id;

        // Find or create thread
        let { data: thread, error: threadError } = await supabase
          .from("email_threads")
          .select("*")
          .eq("user_id", userId)
          .eq("primary_email", primaryEmail)
          .maybeSingle();

        if (threadError) {
          console.error("thread fetch error:", threadError);
        }

        if (!thread) {
          const { data: newThread, error: newThreadError } = await supabase
            .from("email_threads")
            .insert({
              user_id: userId,
              lead_id: emailLogForThread.lead_id,
              primary_email: primaryEmail,
              subject: subject ?? null,
              last_message_at: new Date().toISOString(),
              last_intent: threadIntent,
              unread_count: 1,
            })
            .select("*")
            .single();

          if (newThreadError) {
            console.error("thread create error:", newThreadError);
          } else {
            thread = newThread;
            threadId = thread?.id ?? null;
          }
        } else {
          // Update existing thread
          threadId = thread.id;
          await supabase
            .from("email_threads")
            .update({
              last_message_at: new Date().toISOString(),
              last_intent: threadIntent,
              unread_count: (thread.unread_count ?? 0) + 1,
              updated_at: new Date().toISOString(),
            })
            .eq("id", thread.id);
        }
      }
    }

    // 3) Write reply row (best-effort; some deployments enforce email_log_id NOT NULL)
    let insertedReply: { id: string } | null = null;
    if (emailLogId) {
      const { data: ins, error: insErr } = await supabase
        .from("email_replies")
        .insert([
          {
            email_log_id: emailLogId,
            provider,
            provider_message_id,
            in_reply_to,
            from_email,
            to_email,
            subject,
            body_text,
            body_html,
            intent: detection.intent,
            confidence: detection.confidence,
            thread_id: threadId,
          },
        ])
        .select("id")
        .single();
      if (insErr) throw insErr;
      insertedReply = ins ? { id: ins.id } : null;
    }

    // Block 150000: Insert into unified messages table
    try {
      if (emailLogId) {
        const { data: emailLog } = await supabase
          .from("email_logs")
          .select("lead_id")
          .eq("id", emailLogId)
          .maybeSingle();

        if (emailLog?.lead_id) {
          const companyId = await getCompanyIdFromLead(emailLog.lead_id);
          if (companyId) {
            const { data: lead } = await supabase
              .from("leads")
              .select("first_name, last_name, email")
              .eq("id", emailLog.lead_id)
              .maybeSingle();

            const senderName = lead?.first_name || lead?.last_name
              ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
              : lead?.email || from_email;

            await insertUnifiedMessage({
              company_id: companyId,
              lead_id: emailLog.lead_id,
              channel: "email",
              direction: "incoming",
              sender: senderName,
              sender_email: from_email,
              body: body_text || body_html || "",
              subject: subject || null,
              body_html: body_html || null,
              metadata: {
                provider,
                provider_message_id,
                in_reply_to,
                intent: detection.intent,
                confidence: detection.confidence,
              },
              external_id: provider_message_id || null,
              external_thread_id: threadId || null,
            });
          }
        }
      }
    } catch (unifiedError) {
      console.warn("Failed to insert unified message for email reply:", unifiedError);
      // Don't throw - unified message insertion failure shouldn't break reply processing
    }

    // Log reply activity
    try {
      // Get lead and workspace info
      const { data: emailLog } = await supabase
        .from("email_logs")
        .select("lead_id, user_id, campaign_id, workspace_id")
        .eq("id", emailLogId)
        .maybeSingle();

      if (emailLog?.lead_id) {
        const { data: lead } = await supabase
          .from("leads")
          .select("id, email, first_name, last_name, workspace_id")
          .eq("id", emailLog.lead_id)
          .maybeSingle();

        const workspaceId = emailLog.workspace_id || lead?.workspace_id;
        if (workspaceId) {
          await ActivityLogger.replyReceived({
            workspace_id: workspaceId,
            user_id: emailLog.user_id,
            campaign_id: emailLog.campaign_id || null,
            lead_id: emailLog.lead_id,
            from_email: from_email,
            from_name: lead?.first_name || lead?.last_name
              ? `${lead.first_name || ""} ${lead.last_name || ""}`.trim()
              : null,
            subject: subject || null,
            reply_preview: (body_text || body_html || "").slice(0, 200) || null,
          });
        }
      }
    } catch (logError) {
      console.warn("Failed to log reply activity:", logError);
    }

    // Block 93000: Auto-attribute lead from email reply
    if (emailLogId) {
      try {
        const { data: emailLogForAttribution } = await supabase
          .from("email_logs")
          .select("lead_id, campaign_id, workspace_id")
          .eq("id", emailLogId)
          .maybeSingle();

        if (emailLogForAttribution?.lead_id && emailLogForAttribution?.workspace_id) {
          const { attributeFromEmailReply } = await import("@/lib/attribution/attribution-helpers");
          await attributeFromEmailReply(
            supabase,
            emailLogForAttribution.workspace_id,
            emailLogForAttribution.lead_id,
            emailLogId,
            emailLogForAttribution.campaign_id || undefined
          );
        }
      } catch (attrError) {
        console.warn("Failed to attribute lead from email reply:", attrError);
        // Don't throw - attribution failures shouldn't break reply processing
      }
    }

    // Block 8850: Apply lead scoring for reply
    if (emailLogId) {
      try {
        // Get lead_id and workspace_id from email_log
        const { data: emailLog } = await supabase
          .from("email_logs")
          .select("lead_id, user_id")
          .eq("id", emailLogId)
          .maybeSingle();

        if (emailLog?.lead_id) {
          // Get workspace_id and owner_id
          const { data: lead } = await supabase
            .from("leads")
            .select("workspace_id")
            .eq("id", emailLog.lead_id)
            .maybeSingle();

          if (lead?.workspace_id) {
            // Get owner_id from workspace
            const { data: workspaceMember } = await supabase
              .from("workspace_members")
              .select("user_id")
              .eq("workspace_id", lead.workspace_id)
              .order("created_at", { ascending: true })
              .limit(1)
              .maybeSingle();

            const ownerId = workspaceMember?.user_id || emailLog.user_id;
            const replyText = (body_text || body_html || "").toLowerCase();

            if (ownerId) {
              // Base reply score
              await applyScoreEvent(supabase, {
                lead_id: emailLog.lead_id,
                owner_id: ownerId,
                event_type: "reply",
              });

              // Check for roofing keywords
              if (containsRoofingKeywords(replyText)) {
                await applyScoreEvent(supabase, {
                  lead_id: emailLog.lead_id,
                  owner_id: ownerId,
                  event_type: "reply_job_keywords",
                  metadata: { matched: true },
                });
              }

              // Check for booking intent
              if (containsBookingIntent(replyText)) {
                await applyScoreEvent(supabase, {
                  lead_id: emailLog.lead_id,
                  owner_id: ownerId,
                  event_type: "reply_booking_intent",
                });
              }

              // Check for phone number
              if (containsPhoneNumber(replyText)) {
                await applyScoreEvent(supabase, {
                  lead_id: emailLog.lead_id,
                  owner_id: ownerId,
                  event_type: "reply_phone",
                });
              }
            }
          }
        }
      } catch (err) {
        console.error("Error applying lead score for reply:", err);
        // Don't fail the request if scoring fails
      }
    }

    // Block 16000: Log reply to contact_activity timeline
    if (emailLogId) {
      try {
        // Get contact_id and workspace_id from email_log -> lead -> contact
        const { data: emailLog } = await supabase
          .from("email_logs")
          .select("lead_id, user_id")
          .eq("id", emailLogId)
          .maybeSingle();

        if (emailLog?.lead_id) {
          // Try to get contact_id from lead
          const { data: lead } = await supabase
            .from("leads")
            .select("id, workspace_id, email")
            .eq("id", emailLog.lead_id)
            .maybeSingle();

          if (lead?.workspace_id) {
            // Find contact by email
            const { data: contact } = await supabase
              .from("contacts")
              .select("id")
              .eq("workspace_id", lead.workspace_id)
              .eq("email", from_email.toLowerCase())
              .maybeSingle();

            if (contact?.id) {
              const { error: caErr } = await supabase.from("contact_activity").insert({
                workspace_id: lead.workspace_id,
                contact_id: contact.id,
                activity_type: "email_replied",
                title: "Reply received",
                body: (body_text || body_html || "").slice(0, 500),
                meta: {
                  message_id: provider_message_id,
                  intent: detection.intent,
                  confidence: detection.confidence,
                },
              });
              if (caErr) {
                console.error("Failed to log reply activity:", caErr);
              }
            }
          }
        }
      } catch (err) {
        console.error("Error logging reply activity:", err);
        // Don't fail the request if activity logging fails
      }
    }

    // Trigger AI reply detection (legacy)
    if (insertedReply?.id && (body_text || body_html)) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-reply-detect`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({ 
            emailId: insertedReply.id, 
            body: body_text || body_html || "" 
          }),
        });
      } catch (e) {
        console.error("Failed to trigger AI reply detection:", e);
        // Don't fail the request if AI detection fails
      }
    }

    // Block 300: Trigger Adaptive Reply Brain v2
    if (insertedReply?.id && (body_text || body_html)) {
      try {
        // Get workspace_id from email_log
        let workspaceId: string | null = null;
        if (emailLogId) {
          const { data: emailLog } = await supabase
            .from("email_logs")
            .select("user_id, org_id")
            .eq("id", emailLogId)
            .maybeSingle();
          
          if (emailLog?.user_id) {
            // Get workspace_id from user's workspace membership
            const { data: membership } = await supabase
              .from("workspace_members")
              .select("workspace_id")
              .eq("user_id", emailLog.user_id)
              .limit(1)
              .maybeSingle();
            workspaceId = membership?.workspace_id || null;
          }
        }

        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-reply-brain-v2`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({ 
            text: body_text || body_html || "",
            reply_id: insertedReply.id,
            workspace_id: workspaceId
          }),
        });
      } catch (e) {
        console.error("Failed to trigger Adaptive Reply Brain v2:", e);
        // Don't fail the request if AI brain fails
      }
    }

    // Trigger OOO extraction (Step 5 — Webhook → OOO function)
    if (insertedReply?.id) {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ooo-extract`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({ reply_id: insertedReply.id }),
        });
      } catch (e) {
        console.error("Failed to trigger OOO extraction:", e);
        // Don't fail the request if OOO extraction fails
      }
    }

    // v1: Update lead record with Hot/Warm/Dead and apply stop rules (best-effort).
    if (resolvedLeadId) {
      try {
        const updates: any = {
          reply_status: "replied",
          reply_intent: detection.intent,
          last_reply_at: nowIso,
          last_reply_snippet: replyText.slice(0, 300),
          replied_at: nowIso,
          // Block 268100: SmartSend-only system tag (irreplaceability sprint)
          smartsend_homeowner: true,
          // v1 label fields
          reply_label: hwLabel,
          outreach_status: hwLabel,
          updated_at: nowIso,
        };

        if (hwLabel === "dead") {
          updates.reason_dead = "stop_reply";
          updates.do_not_contact = true;
        } else {
          updates.reason_dead = null;
        }

        await supabase.from("leads").update(updates).eq("id", resolvedLeadId);

        // Block 268100: capture first-mark timestamp (do not overwrite if already set)
        await supabase
          .from("leads")
          .update({ smartsend_homeowner_at: nowIso } as any)
          .eq("id", resolvedLeadId)
          .is("smartsend_homeowner_at", null);

        // Block 268100: mirror tag onto matching contact (by workspace+email) so it appears everywhere in contact-based views.
        try {
          const { data: leadForTag } = await supabase
            .from("leads")
            .select("workspace_id,email")
            .eq("id", resolvedLeadId)
            .maybeSingle();

          const wsId = (leadForTag as any)?.workspace_id as string | undefined;
          const leadEmail = String((leadForTag as any)?.email || from_email || "").toLowerCase();

          if (wsId && leadEmail) {
            await supabase
              .from("contacts")
              .update({ smartsend_homeowner: true } as any)
              .eq("workspace_id", wsId)
              .eq("email", leadEmail);

            await supabase
              .from("contacts")
              .update({ smartsend_homeowner_at: nowIso } as any)
              .eq("workspace_id", wsId)
              .eq("email", leadEmail)
              .is("smartsend_homeowner_at", null);
          }
        } catch {
          // swallow (tagging should never break reply intake)
        }

        // Dead = instantly stopped (hard stop).
        if (hwLabel === "dead") {
          await supabase
            .from("sequence_enrollments")
            .update({ status: "stopped", next_run_at: null })
            .eq("lead_id", resolvedLeadId)
            .eq("status", "active");

          // Cancel queued sends in send_queue (best-effort across schema variants)
          await supabase
            .from("send_queue")
            .update({
              status: "skipped",
              error: "dead_reply_autostop",
              last_error: "dead_reply_autostop",
              updated_at: nowIso,
            } as any)
            .eq("lead_id", resolvedLeadId)
            .in("status", ["pending", "queued", "scheduled", "retrying", "sending"]);
        } else if (hwLabel === "warm" || hwLabel === "hot") {
          // Warm/Hot = stop the cold sequence and switch to a reply-followup track.
          // This prevents "still selling" after they replied, while continuing automation.
          const resolvedCampaignId = emailLogForThread?.campaign_id ?? null;
          await switchToReplyFollowupTrackV1({
            supabase,
            leadId: resolvedLeadId,
            campaignId: resolvedCampaignId,
            label: hwLabel,
            replyText,
            nowIso,
          });
        }
      } catch (e) {
        console.warn("Failed to apply v1 lead label/autostop:", e);
      }
    }

    // Block 302: Auto-mark as replied + stop sequences (legacy async; keep for compatibility)
    // IMPORTANT (Block 267500): We do NOT hard-stop on Warm/Hot; only Dead/Unsubscribe should fully stop.
    // The legacy function marks leads as "replied" and cancels future sends, which breaks Warm/Hot automation.
    if (insertedReply?.id && hwLabel === "dead") {
      try {
        await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/reply-auto-mark`, {
          method: "POST",
          headers: { 
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
          },
          body: JSON.stringify({ reply_id: insertedReply.id }),
        });
      } catch (e) {
        console.error("Failed to trigger reply-auto-mark:", e);
      }
    }

    // Also insert into channel_messages for ai-reply-handler integration (legacy path only)
    let emailLog: any = null;
    if (emailLogId) {
      const { data } = await supabase
        .from("email_logs")
        .select("lead_id, org_id, user_id, campaign_id, queue_id")
        .eq("id", emailLogId)
        .single();
      emailLog = data ?? null;
    }

    // Get campaign_id if not in email_logs (try from send_queue or smartsend_queue)
    let campaignId: string | null = emailLog?.campaign_id ?? null;
    if (!campaignId && emailLog?.queue_id) {
      // Try send_queue first
      const { data: queueRow } = await supabase
        .from("send_queue")
        .select("campaign_id")
        .eq("id", emailLog.queue_id)
        .maybeSingle();
      campaignId = queueRow?.campaign_id ?? null;
      
      // If not found, try smartsend_queue
      if (!campaignId) {
        const { data: smartsendQueueRow } = await supabase
          .from("smartsend_queue")
          .select("campaign_id")
          .eq("id", emailLog.queue_id)
          .maybeSingle();
        campaignId = smartsendQueueRow?.campaign_id ?? null;
      }
    }
    
    // Also try to get campaign_id from lead if available
    if (!campaignId && emailLog?.lead_id) {
      const { data: lead } = await supabase
        .from("leads")
        .select("campaign_id")
        .eq("id", emailLog.lead_id)
        .maybeSingle();
      campaignId = lead?.campaign_id ?? null;
    }

    // Block 9000: Store inbound message in smartsend_threads
    if (emailLog?.lead_id && campaignId) {
      try {
        // Find or create thread
        const { data: thread } = await supabase
          .from("smartsend_threads")
          .select("*")
          .eq("lead_id", emailLog.lead_id)
          .eq("campaign_id", campaignId)
          .maybeSingle();

        let threadId = thread?.id;

        if (!threadId) {
          const { data: created, error: createError } = await supabase
            .from("smartsend_threads")
            .insert({
              lead_id: emailLog.lead_id,
              campaign_id: campaignId,
              last_message_at: new Date().toISOString(),
            })
            .select()
            .single();

          if (createError) {
            console.error("Failed to create smartsend thread:", createError);
          } else {
            threadId = created.id;
          }
        }

        // Insert inbound message
        if (threadId) {
          const threadEmailText = body_text || body_html || "";
          const { error: msgErr } = await supabase.from("smartsend_thread_messages").insert({
            thread_id: threadId,
            direction: "inbound",
            subject: subject || null,
            body: threadEmailText,
            sent_at: new Date().toISOString(),
          });
          if (msgErr) {
            console.error("Failed to insert smartsend thread message:", msgErr);
          }

          // Update thread last message
          const { error: touchErr } = await supabase
            .from("smartsend_threads")
            .update({ last_message_at: new Date().toISOString() })
            .eq("id", threadId);
          if (touchErr) {
            console.error("Failed to update smartsend thread timestamp:", touchErr);
          }

          // Block 9000: Generate AI summary (async, don't wait)
          fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/thread-summary`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
            },
            body: JSON.stringify({ thread_id: threadId }),
          }).catch((e) => console.error("Failed to trigger thread summary:", e));

          // Block 9700: AI Reply Detection + Auto-Mark as Replied
          const emailText = body_text || body_html || "";
          if (emailText && emailLog?.lead_id && campaignId) {
            try {
              // Classify reply intent
              const intentRes = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/reply-intent-classifier`, {
                method: "POST",
                headers: {
                  "Content-Type": "application/json",
                  "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
                },
                body: JSON.stringify({ body: emailText }),
              });

              let intent = "other";
              let intentConfidence: number | null = null;
              if (intentRes.ok) {
                const intentData = await intentRes.json();
                intent = intentData.intent || "other";
                if (typeof intentData.confidence === "number") {
                  intentConfidence = intentData.confidence;
                } else if (typeof intentData.confidence === "string") {
                  const n = Number(intentData.confidence);
                  intentConfidence = Number.isFinite(n) ? n : null;
                }
              }

              const nowIso = new Date().toISOString();

              // ------------------------------------------------------------------
              // Block 292000: Outreach status mapping (v1 locked)
              // classification_v1: stop | positive | neutral
              // stop    -> outreach_status=dead, reason_dead=stop_reply (suppression already handled elsewhere)
              // positive -> outreach_status=hot,  last_reply_at=now()
              // neutral  -> outreach_status=warm, last_reply_at=now()
              // ------------------------------------------------------------------
              const normalize = (s: string) => (s || "").toLowerCase().trim();
              const intentLower = normalize(intent);
              const classificationV1 =
                intentLower === "unsubscribe" ||
                intentLower === "not_interested" ||
                intentLower === "spam" ||
                intentLower === "stop"
                  ? "stop"
                  : intentLower === "interested" ||
                    intentLower === "scheduling" ||
                    intentLower === "referral" ||
                    intentLower === "positive" ||
                    intentLower === "hot"
                  ? "positive"
                  : "neutral";

              const outreachUpdates: any =
                classificationV1 === "stop"
                  ? {
                      outreach_status: "dead",
                      reason_dead: "stop_reply",
                      last_reply_at: nowIso,
                    }
                  : classificationV1 === "positive"
                  ? {
                      outreach_status: "hot",
                      reason_dead: null,
                      last_reply_at: nowIso,
                    }
                  : {
                      outreach_status: "warm",
                      reason_dead: null,
                      last_reply_at: nowIso,
                    };

              // Check if this is first reply
              const { data: existingReplies } = await supabase
                .from("smartsend_reply_events")
                .select("id")
                .eq("lead_id", emailLog.lead_id);

              const isFirstReply = !existingReplies || existingReplies.length === 0;

              // Insert reply_event
              const { error: replyEventErr } = await supabase.from("smartsend_reply_events").insert({
                lead_id: emailLog.lead_id,
                campaign_id: campaignId,
                thread_id: threadId,
                raw_subject: subject || null,
                raw_body: emailText,
                intent,
                is_first_reply: isFirstReply,
              });
              if (replyEventErr) {
                console.error("Failed to insert reply event:", replyEventErr);
              }

              // Update lead
              const updates: any = {
                reply_status: "replied",
                reply_intent: intent,
                last_reply_at: nowIso,
                last_reply_snippet: emailText.slice(0, 300),
              };

              // unsubscribe / bounce → do_not_contact
              if (intent === "unsubscribe" || intent === "bounce") {
                updates.do_not_contact = true;
                
                // Block 9800: Add to suppression list
                try {
                  // Get lead email and campaign user_id
                  const { data: lead } = await supabase
                    .from("leads")
                    .select("email, user_id")
                    .eq("id", emailLog.lead_id)
                    .maybeSingle();
                  
                  const { data: campaign } = await supabase
                    .from("campaigns")
                    .select("user_id")
                    .eq("id", campaignId)
                    .maybeSingle();
                  
                  const user_id = lead?.user_id || campaign?.user_id;
                  const email = lead?.email?.toLowerCase();
                  const domain = email ? email.split("@")[1]?.toLowerCase() : null;
                  
                  if (email && user_id) {
                    const { error: supEmailErr } = await supabase
                      .from("smartsend_suppressions")
                      .upsert(
                        {
                          user_id,
                          email,
                          reason: intent,
                          source: "reply",
                        },
                        { onConflict: "user_id,email" }
                      );
                    if (supEmailErr) {
                      console.error("Failed to add email to suppressions:", supEmailErr);
                    }
                  }
                  
                  if (domain && user_id) {
                    const { error: supDomainErr } = await supabase
                      .from("smartsend_suppressions")
                      .upsert(
                        {
                          user_id,
                          domain,
                          reason: intent,
                          source: "reply",
                        },
                        { onConflict: "user_id,domain" }
                      );
                    if (supDomainErr) {
                      console.error("Failed to add domain to suppressions:", supDomainErr);
                    }
                  }
                } catch (suppressionErr) {
                  console.error("Error adding to suppression list:", suppressionErr);
                  // Don't fail the request if suppression fails
                }
              }

              // also stop any future sequence for this lead
              updates.status = "replied";

              const { error: updLeadErr } = await supabase
                .from("leads")
                .update(updates)
                .eq("id", emailLog.lead_id);
              if (updLeadErr) {
                console.error("Failed to update lead:", updLeadErr);
              }

              // Block 292000: also update outreach status fields (best-effort, do not block reply processing)
              const { error: updOutreachErr } = await supabase
                .from("leads")
                .update(outreachUpdates)
                .eq("id", emailLog.lead_id);
              if (updOutreachErr) {
                console.error("Failed to update lead outreach status:", updOutreachErr);
              }

              // Block 292000: insert outreach_events row (best-effort)
              const { error: outreachEventErr } = await supabase
                .from("outreach_events")
                .insert({
                  lead_id: emailLog.lead_id,
                  event_type: "replied",
                  metadata: {
                    classification: classificationV1,
                    confidence: intentConfidence,
                    intent,
                  },
                } as any);
              if (outreachEventErr) {
                console.error("Failed to insert outreach_events replied:", outreachEventErr);
              }

              // Update thread
              const { error: threadIntentErr } = await supabase
                .from("smartsend_threads")
                .update({
                  intent,
                  last_message_at: nowIso,
                })
                .eq("id", threadId);
              if (threadIntentErr) {
                console.error("Failed to update thread intent:", threadIntentErr);
              }

              // Increment stats "replies"
              const today = new Date().toISOString().slice(0, 10);
              const { error: statErr } = await supabase.rpc("smartsend_increment_stat", {
                p_campaign_id: campaignId,
                p_date: today,
                p_field: "replies",
              });
              if (statErr) {
                console.error("Could not update campaign stats for reply:", statErr);
              }
            } catch (block9700Err) {
              console.error("Error in Block 9700 reply detection:", block9700Err);
              // Don't fail the request if Block 9700 fails
            }
          }
        }
      } catch (threadErr) {
        console.error("Error storing inbound message in smartsend_threads:", threadErr);
        // Don't fail the request if thread logging fails
      }
    }

    // Block 184: Create or attach reply thread
    if (emailLog?.lead_id) {
      try {
        // Get lead info (account_id, company_id)
        const { data: lead } = await supabase
          .from("leads")
          .select("id, account_id, company_id")
          .eq("id", emailLog.lead_id)
          .maybeSingle();

        if (lead?.account_id) {
          // Find existing thread for this lead
          const { data: existingThread } = await supabase
            .from("reply_threads")
            .select("id")
            .eq("lead_id", emailLog.lead_id)
            .order("updated_at", { ascending: false })
            .limit(1)
            .maybeSingle();

          let threadId: string | null = null;

          if (existingThread?.id) {
            threadId = existingThread.id;
          } else {
            // Create new thread
            const { data: newThread, error: threadErr } = await supabase
              .from("reply_threads")
              .insert({
                account_id: lead.account_id,
                lead_id: emailLog.lead_id,
                company_id: lead.company_id ?? null,
                campaign_id: campaignId,
              })
              .select("id")
              .single();

            if (threadErr || !newThread?.id) {
              console.error("Failed to create reply thread:", threadErr);
            } else {
              threadId = newThread.id;
            }
          }

          // Insert the inbound message
          if (threadId) {
            const replyText = body_text || body_html || "";
            await supabase.from("reply_messages").insert({
              thread_id: threadId,
              direction: "inbound",
              body: replyText,
              raw: {
                provider,
                provider_message_id,
                in_reply_to,
                from_email,
                to_email,
                subject,
              },
            });

            // Update thread timestamp
            await supabase
              .from("reply_threads")
              .update({ 
                last_message_at: new Date().toISOString(),
                updated_at: new Date().toISOString(),
              })
              .eq("id", threadId);

            // Trigger AI categorization (async, don't wait)
            if (replyText) {
              fetch(`${process.env.NEXT_PUBLIC_BASE_URL || process.env.NEXT_PUBLIC_VERCEL_URL || 'http://localhost:3000'}/api/replies/categorize`, {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ thread_id: threadId, body: replyText }),
              }).catch((e) => console.error("Failed to trigger categorization:", e));
            }
          }
        }
      } catch (threadErr) {
        console.error("Error creating reply thread:", threadErr);
        // Don't fail the request if thread creation fails
      }
    }

    // Log activity if we have campaign_id
    if (campaignId) {
      try {
        await supabase.from("activity_logs").insert({
          campaign_id: campaignId,
          actor_id: null, // system
          lead_id: emailLog?.lead_id ?? null,
          event_type: "reply_detected",
          meta: { from: from_email, subject: subject || "" },
        });

        // Block 8400: Update stats when reply arrives
        const today = new Date().toISOString().slice(0, 10);
        const { error: statErr } = await supabase.rpc("smartsend_increment_stat", {
          p_campaign_id: campaignId,
          p_date: today,
          p_field: "replies"
        });
        if (statErr) {
          console.error("Could not update campaign stats for reply:", statErr);
        }

        // Auto-unpause lead if resume_on_reply is enabled and lead is paused
        if (emailLog?.lead_id) {
          const { data: camp } = await supabase
            .from("campaigns")
            .select("resume_on_reply")
            .eq("id", campaignId)
            .maybeSingle();
          
          const { data: lead } = await supabase
            .from("campaign_leads")
            .select("paused_at")
            .eq("lead_id", emailLog.lead_id)
            .eq("campaign_id", campaignId)
            .maybeSingle();

          if (camp?.resume_on_reply && lead?.paused_at) {
            await supabase
              .from("campaign_leads")
              .update({
                paused_at: null,
                paused_by: null,
                pause_reason: null,
              })
              .eq("lead_id", emailLog.lead_id)
              .eq("campaign_id", campaignId);

            await supabase.from("activity_logs").insert({
              campaign_id: campaignId,
              actor_id: null,
              lead_id: emailLog.lead_id,
              event_type: "lead_resumed",
              meta: { reason: "resume_on_reply" },
            });
          }
        }
      } catch (activityErr) {
        console.error("Failed to log reply activity:", activityErr);
        // Don't fail if activity logging fails
      }
    }

    if (emailLog?.lead_id && emailLog?.org_id) {
      const { data: channelMsg } = await supabase.from("channel_messages").insert({
        org_id: emailLog.org_id,
        lead_id: emailLog.lead_id,
        channel: "email",
        direction: "inbound",
        body: body_text || body_html || "",
        thread_id: in_reply_to,
        status: "delivered",
      }).select().single();

      // Trigger AI reply handler
      if (channelMsg) {
        try {
          await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL}/functions/v1/ai-reply-handler`, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`
            },
            body: JSON.stringify({ message_id: channelMsg.id }),
          });
        } catch (e) {
          console.error("Failed to trigger ai-reply-handler:", e);
        }
      }
    }

    // 4) Mark original as replied with summary (legacy path only)
    if (emailLogId) {
      const excerpt = (replyText || "").slice(0, 280);
      const { error: updErr } = await supabase
        .from("email_logs")
        .update({
          replied_at: new Date().toISOString(),
          reply_intent: detection.intent,
          reply_confidence: detection.confidence,
          reply_excerpt: excerpt,
        })
        .eq("id", emailLogId);
      if (updErr) throw updErr;
    }

    // Cancel queued follow-ups ONLY for Dead (hard stop).
    // Warm/Hot follow-ups are handled by reply-followup track logic above.
    if (resolvedLeadId && hwLabel === "dead") {
      const leadId = resolvedLeadId;
      
      // For Dead, we hard-stop future sends. We do NOT want to overwrite lead.status to "Replied"
      // because this is explicitly a "stop/do-not-contact" outcome.
      await supabase
        .from("leads")
        .update({ 
          replied_at: new Date().toISOString(),
          updated_at: new Date().toISOString(),
        })
        .eq("id", leadId);
      
      // Also cancel queued items directly (in case triggers don't fire)
      const { data: clLinks } = await supabase
        .from("campaign_leads")
        .select("campaign_id")
        .eq("lead_id", leadId);
      
      if (clLinks && clLinks.length > 0) {
        for (const clLink of clLinks) {
          // Best-effort: cancel future sends for this lead in this campaign.
          // Different deployments use different columns; keep it simple and safe.
          await supabase
            .from("send_queue")
            .update({ status: "skipped", error: "Lead replied; sequence paused" } as any)
            .eq("campaign_id", clLink.campaign_id)
            .eq("lead_id", leadId)
            .in("status", ["pending", "queued", "scheduled", "retrying", "sending"]);

          await supabase
            .from("campaign_leads")
            .update({ state: "Replied" } as any)
            .eq("campaign_id", clLink.campaign_id)
            .eq("lead_id", leadId);
        }
      }
    }

    // 5) Unsubscribe automation - auto-suppress emails (Block 445)
    if (detection.intent === "unsubscribe") {
      // Get workspace_id from email_log or lead
      let workspaceId: string | null = null;
      
      if (resolvedLeadId) {
        const { data: lead } = await supabase
          .from("leads")
          .select("workspace_id")
          .eq("id", resolvedLeadId)
          .maybeSingle();
        workspaceId = lead?.workspace_id ?? null;
      }
      
      // Fallback: get workspace_id from campaign
      if (!workspaceId && campaignId) {
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("workspace_id")
          .eq("id", campaignId)
          .maybeSingle();
        workspaceId = campaign?.workspace_id ?? null;
      }
      
      if (workspaceId) {
        // Block 12600: Use new suppression system
        const { suppressFromUnsubscribe } = await import("@/lib/suppression/autoSuppress");
        const result = await suppressFromUnsubscribe(
          workspaceId,
          from_email,
          emailLog?.lead_id ?? null
        );
        
        if (!result.success) {
          console.error(`Error suppressing ${from_email}:`, result.error);
        } else {
          console.log(`Auto-suppressed ${from_email} for workspace ${workspaceId} due to unsubscribe reply`);
        }
      }
    }

    await log.info('reply_detection', 'Successfully processed reply', {
      email_log_id: emailLogId,
      intent: detection.intent,
      confidence: detection.confidence,
    });

    return NextResponse.json({ ok: true, intent: detection.intent, confidence: detection.confidence });
  } catch (e: any) {
    await log.error('reply_detection', 'Error processing inbound reply', {
      error: e?.message || String(e),
    }, undefined, e);
    return NextResponse.json({ error: String(e?.message || e) }, { status: 500 });
  }
} 

function stripHtml(html?: string | null) {
  if (!html) return "";
  return String(html).replace(/<[^>]*>/g, " ").replace(/\s+/g, " ").trim();
}

function extractLeadIdFromSubject(subject: string): string | null {
  const m = subject.match(/\[SS\|([a-f0-9-]{36})\]/i);
  return m?.[1] ?? null;
}

async function switchToReplyFollowupTrackV1(args: {
  supabase: SupabaseClient;
  leadId: string;
  campaignId: string | null;
  label: ReplyFollowupLabel;
  replyText: string;
  nowIso: string;
}) {
  const { supabase, leadId, campaignId, label, replyText, nowIso } = args;

  // 1) Stop any active enrollments for this lead in this campaign (best-effort).
  try {
    let q = supabase
      .from("sequence_enrollments")
      .update({ status: "stopped", next_run_at: null } as any)
      .eq("lead_id", leadId)
      .eq("status", "active");
    if (campaignId) q = q.eq("campaign_id", campaignId);
    await q;
  } catch {
    // ignore (schema varies)
  }

  // 2) Cancel any queued cold-sequence sends for this lead (best-effort).
  // We do NOT cancel already-sent rows; we only skip future pending-ish statuses.
  try {
    let q = supabase
      .from("send_queue")
      .update({
        status: "skipped",
        last_error: "reply_received_switch_track",
        error: "reply_received_switch_track",
        updated_at: nowIso,
      } as any)
      .eq("lead_id", leadId)
      .in("status", ["pending", "queued", "scheduled", "retrying", "sending"]);
    if (campaignId) q = q.eq("campaign_id", campaignId);
    await q;
  } catch {
    // ignore (schema varies)
  }

  // 3) Enqueue a short, human-sounding follow-up that matches the signal.
  const warmSubject = "Quick question";
  const warmBody = [
    `<p>Thanks for the reply — totally makes sense.</p>`,
    `<p>Quick question so we can help fast: what’s the address (or cross street) and what are you seeing up there?</p>`,
    `<p>If you want, we can swing by for a quick free inspection and tell you what we’d do.</p>`,
  ].join("\n");

  const hotSubject = "Let’s get you on the schedule";
  const hotBody = [
    `<p>Perfect — let’s keep this simple and get you taken care of.</p>`,
    `<p>What day/time works best for a quick inspection or call? If you want, just reply with a couple windows and we’ll lock it in.</p>`,
  ].join("\n");

  const firstDelayMin = label === "hot" ? 5 : 10;
  const secondDelayHours = label === "hot" ? 24 : 48;

  const first = {
    subject: label === "hot" ? hotSubject : warmSubject,
    body_html: label === "hot" ? hotBody : warmBody,
    step_no: label === "hot" ? 95 : 90,
    scheduled_at: new Date(Date.now() + firstDelayMin * 60_000).toISOString(),
  };

  const second = {
    subject: label === "hot" ? "Still good to book this?" : "Just checking back",
    body_html:
      label === "hot"
        ? `<p>Just checking back — still want us to get you on the calendar this week?</p><p>Reply with a day/time and we’ll confirm.</p>`
        : `<p>Just checking back — happy to answer any questions or take a quick look if it helps.</p>`,
    step_no: label === "hot" ? 96 : 91,
    scheduled_at: new Date(Date.now() + secondDelayHours * 60 * 60_000).toISOString(),
  };

  const { data: lead } = await supabase
    .from("leads")
    .select("workspace_id")
    .eq("id", leadId)
    .maybeSingle();

  const workspaceId = (lead as any)?.workspace_id ?? null;
  if (!workspaceId) return;

  await enqueueSendQueueBestEffort(supabase, {
    workspace_id: workspaceId,
    campaign_id: campaignId,
    lead_id: leadId,
    subject: first.subject,
    body_html: first.body_html,
    scheduled_at: first.scheduled_at,
    step_no: first.step_no,
  });

  await enqueueSendQueueBestEffort(supabase, {
    workspace_id: workspaceId,
    campaign_id: campaignId,
    lead_id: leadId,
    subject: second.subject,
    body_html: second.body_html,
    scheduled_at: second.scheduled_at,
    step_no: second.step_no,
  });
}

async function enqueueSendQueueBestEffort(
  supabase: SupabaseClient,
  input: {
    workspace_id: string;
    campaign_id: string | null;
    lead_id: string;
    subject: string;
    body_html: string;
    scheduled_at: string;
    step_no: number;
  }
) {
  // Some deployments have `step_no`; some don't. Some use `body` instead of `body_html`.
  // We try a few shapes and silently fall back.
  const base: any = {
    workspace_id: input.workspace_id,
    lead_id: input.lead_id,
    scheduled_at: input.scheduled_at,
    status: "pending",
    subject: input.subject,
    body_html: input.body_html,
  };
  if (input.campaign_id) base.campaign_id = input.campaign_id;

  try {
    await supabase.from("send_queue").insert([{ ...base, step_no: input.step_no } as any]);
    return;
  } catch {}

  try {
    await supabase.from("send_queue").insert([{ ...base, body: input.body_html } as any]);
    return;
  } catch {}

  try {
    await supabase.from("send_queue").insert([{ ...base } as any]);
  } catch {
    // swallow
  }
}