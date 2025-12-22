// Unified inbound reply handler
// Maps provider-specific payloads to inbox_messages table
// Idempotent: handles duplicate provider messages gracefully

import { createClient } from "@supabase/supabase-js";

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

export type InboundReplyPayload = {
  campaign_id: string;
  lead_id: string;
  from_email: string;
  subject: string;
  body_html?: string;
  body_text?: string;
  provider: 'gmail' | 'outlook';
  provider_message_id: string;
  provider_thread_id?: string | null;
  received_at?: string;
};

export async function handleInboundReply(payload: InboundReplyPayload) {
  // 1) Ensure thread
  const { data: threadId } = await supabaseAdmin.rpc("ensure_thread", {
    p_campaign: payload.campaign_id,
    p_lead: payload.lead_id,
  });

  if (!threadId) {
    throw new Error("Failed to ensure thread");
  }

  // 2) Idempotent insert (ignore duplicates by provider+provider_message_id)
  const insertRes = await supabaseAdmin
    .from("inbox_messages")
    .insert({
      thread_id: threadId as string,
      direction: "in",
      from_email: payload.from_email,
      subject: payload.subject || "",
      body_html: payload.body_html || null,
      body_text: payload.body_text || null,
      provider: payload.provider,
      provider_message_id: payload.provider_message_id,
      provider_thread_id: payload.provider_thread_id || null,
      created_at: payload.received_at || new Date().toISOString(),
    } as any)
    .select("id")
    .single();

  // If duplicate, swallow unique violation
  if (insertRes.error && !/duplicate key value|uq_inbox|uq_inbox_messages_in_provider_mid/i.test(insertRes.error.message)) {
    throw insertRes.error;
  }

  // 3) Mark replied + cancel queue + link to last outbound
  await supabaseAdmin.rpc("mark_thread_replied_and_link", { 
    p_thread: threadId as string 
  }).catch(() => {});

  // 3c) Block 20270: Increment reply_count and update engagement for inbox_threads
  // Find inbox_threads record by thread_id (might be same as reply_threads id or linked)
  try {
    const { data: inboxThread } = await supabaseAdmin
      .from("inbox_threads")
      .select("id, reply_count")
      .eq("id", threadId)
      .maybeSingle();

    if (inboxThread) {
      const newReplyCount = (inboxThread.reply_count || 0) + 1;
      const nowIso = payload.received_at || new Date().toISOString();

      await supabaseAdmin
        .from("inbox_threads")
        .update({
          reply_count: newReplyCount,
          last_contact_method: "email",
          last_contact_at: nowIso,
        })
        .eq("id", threadId);

      // Trigger engagement scoring
      await supabaseAdmin.rpc("fn_update_conversation_engagement", {
        p_conversation_id: threadId,
      }).catch((err) => {
        console.error("Failed to update engagement score:", err);
      });
    }
  } catch (err) {
    console.error("Error updating reply_count and engagement:", err);
    // Don't fail the request if this fails
  }

  // 3b) Block 444: Auto-mark as replied (campaign_leads level)
  // This ensures campaign_leads.replied is set, future sends are canceled,
  // lead_engagement is updated, activity is logged, and owner is notified
  await supabaseAdmin.rpc("auto_mark_as_replied", {
    p_lead_id: payload.lead_id,
    p_campaign_id: payload.campaign_id,
    p_reply_event_id: insertRes.data?.id || null,
    p_replied_at: payload.received_at || new Date().toISOString(),
  }).catch((err) => {
    console.error("Failed to auto-mark as replied:", err);
    // Don't fail the request if auto-mark fails - it's a best-effort operation
  });

  // 4) Log timeline event for email reply
  await supabaseAdmin.from("lead_timeline_events").insert({
    lead_id: payload.lead_id,
    event_type: "email_reply",
    metadata: {
      thread_id: threadId as string,
      message_id: insertRes.data?.id || null,
      campaign_id: payload.campaign_id
    }
  }).catch((err) => {
    console.error("Failed to log timeline event:", err);
  });

  // 5) Notify thread owner about new reply
  let thread: { owner_id: string | null; campaign_id: string | null; lead_id: string | null } | null = null;
  try {
    const { data: threadData } = await supabaseAdmin
      .from("reply_threads")
      .select("owner_id, campaign_id, lead_id")
      .eq("id", threadId)
      .maybeSingle();
    thread = threadData;

    // Get workspace_id from campaign or lead
    let workspaceId: string | null = null;
    if (thread?.campaign_id) {
      const { data: campaign } = await supabaseAdmin
        .from("campaigns")
        .select("workspace_id")
        .eq("id", thread.campaign_id)
        .maybeSingle();
      workspaceId = campaign?.workspace_id || null;
    }
    if (!workspaceId && thread?.lead_id) {
      const { data: lead } = await supabaseAdmin
        .from("leads")
        .select("workspace_id")
        .eq("id", thread.lead_id)
        .maybeSingle();
      workspaceId = lead?.workspace_id || null;
    }

    if (thread?.owner_id && workspaceId) {
      // Get lead info for notification
      let leadEmail = "";
      let leadFirstName = "";
      if (thread.lead_id) {
        const { data: lead } = await supabaseAdmin
          .from("leads")
          .select("email, first_name")
          .eq("id", thread.lead_id)
          .maybeSingle();
        leadEmail = lead?.email || "";
        leadFirstName = lead?.first_name || "";
      }

      await fetch(`${process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"}/api/notifications/create`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          user_id: thread.owner_id,
          workspace_id: workspaceId,
          type: "reply",
          title: "New Reply",
          body: `${leadFirstName || leadEmail || "Someone"} replied`,
          link: `/replies/${threadId}`,
        }),
      }).catch((err) => {
        console.error("Failed to send reply notification:", err);
      });
    }
  } catch (err) {
    console.error("Error sending reply notification:", err);
  }

  // 6) Block 486: Insert into lead_replies and trigger meeting-intent-extractor
  try {
    // Insert into lead_replies table
    const { data: insertedReply, error: insertError } = await supabaseAdmin
      .from("lead_replies")
      .insert({
        lead_id: payload.lead_id,
        subject: payload.subject,
        body_text: payload.body_text || null,
        body_html: payload.body_html || null,
      })
      .select("id")
      .single();

    if (!insertError && insertedReply) {
      // Fire and forget (no await needed if you don't care about result)
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (supabaseUrl) {
        // Call meeting-intent-extractor first
        fetch(`${supabaseUrl}/functions/v1/meeting-intent-extractor`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({ reply_id: insertedReply.id }),
        })
          .then(() => {
            // After meeting-intent-extractor completes, call intent-score-update if needed
            // (intent-score-update can be called separately if it's triggered elsewhere)
            // Then call ai-sdr-autopilot
            return fetch(`${supabaseUrl}/functions/v1/ai-sdr-autopilot`, {
              method: "POST",
              headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
              },
              body: JSON.stringify({ reply_id: insertedReply.id }),
            });
          })
          .catch((e) => console.error("Failed to trigger meeting-intent-extractor or ai-sdr-autopilot", e));
      }
    }
  } catch (err) {
    console.error("Error inserting lead_reply or calling meeting-intent-extractor:", err);
    // Don't fail the request if this fails
  }

  // Block 8400: Update stats when reply arrives
  try {
    const today = new Date().toISOString().slice(0, 10);
    await supabaseAdmin.rpc("smartsend_increment_stat", {
      p_campaign_id: payload.campaign_id,
      p_date: today,
      p_field: "replies"
    }).catch((err) => {
      console.error("Could not update campaign stats for reply:", err);
    });
  } catch (err) {
    console.error("Error updating campaign stats for reply:", err);
    // Don't fail the request if stats update fails
  }

  // Block 19850: Trigger auto-draft generation for inbound messages
  try {
    if (insertRes.data?.id && threadId) {
      const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
      if (supabaseUrl) {
        // Call inbox-auto-responder edge function to generate draft
        fetch(`${supabaseUrl}/functions/v1/inbox-auto-responder`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${process.env.SUPABASE_SERVICE_ROLE_KEY}`,
          },
          body: JSON.stringify({
            action: "process_inbound",
            thread_id: threadId,
            message_id: insertRes.data.id,
          }),
        }).catch((e) => {
          console.error("Failed to trigger auto-draft generation:", e);
          // Don't fail the request if auto-draft generation fails
        });
      }
    }
  } catch (err) {
    console.error("Error triggering auto-draft generation:", err);
    // Don't fail the request if auto-draft generation fails
  }

  return { ok: true, message_id: insertRes.data?.id, thread_id: threadId };
}
