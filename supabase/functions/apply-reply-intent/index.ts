// supabase/functions/apply-reply-intent/index.ts
// Block 8350 — Reply-Driven Campaign State Updates

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.48.0";

type ReplyIntent =
  | "positive"
  | "neutral"
  | "negative"
  | "out_of_office"
  | "unsubscribe"
  | "spam"
  | "bounce"
  | "wrong_person"
  | "referral"
  | "not_sure"
  | "none"
  | "question"
  | "meeting_interest";

const supabaseUrl = Deno.env.get("SUPABASE_URL") ?? "";
const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";

if (!supabaseUrl || !serviceRoleKey) {
  console.error("Missing Supabase env vars");
}

const supabase = createClient(supabaseUrl, serviceRoleKey);

serve(async (req: Request) => {
  try {
    if (req.method !== "POST") {
      return new Response("Method Not Allowed", { status: 405 });
    }

    const body = await req.json().catch(() => null);
    const replyId = body?.reply_id as string | undefined;

    if (!replyId) {
      return new Response("Missing reply_id", { status: 400 });
    }

    // 1. Load reply with classification + link to campaign_leads
    const { data: reply, error: replyError } = await supabase
      .from("campaign_replies")
      .select(
        `
        id,
        campaign_id,
        lead_id,
        from_email,
        to_email,
        intent,
        intent_confidence,
        classified_at
      `
      )
      .eq("id", replyId)
      .single();

    if (replyError || !reply) {
      console.error("Failed to load reply:", replyError);
      return new Response("Reply not found", { status: 404 });
    }

    if (!reply.intent) {
      return new Response("Reply not classified yet", { status: 422 });
    }

    const intent = reply.intent as ReplyIntent;
    const confidence = Number(reply.intent_confidence ?? 0);

    // 2. Find campaign_leads row
    const { data: cl, error: clError } = await supabase
      .from("campaign_leads")
      .select("id, status_enum")
      .eq("campaign_id", reply.campaign_id)
      .eq("lead_id", reply.lead_id)
      .single();

    if (clError || !cl) {
      console.error("No campaign_leads row found for reply:", clError);
      // Not fatal; just log
    }

    const now = reply.classified_at || new Date().toISOString();

    // 3. Derive new status + suppression behavior
    let newStatus:
      | "active"
      | "completed"
      | "replied"
      | "unsubscribed"
      | "bounced"
      | "error"
      | null = null;

    let shouldSuppress = false;
    let suppressReason: string | null = null;

    switch (intent) {
      case "positive":
      case "referral":
      case "meeting_interest":
        newStatus = "replied";
        break;

      case "negative":
        // They replied but are not interested → mark as replied so we don't keep pestering
        newStatus = "replied";
        break;

      case "unsubscribe":
        newStatus = "unsubscribed";
        shouldSuppress = true;
        suppressReason = "unsubscribe";
        break;

      case "spam":
        newStatus = "unsubscribed";
        shouldSuppress = true;
        suppressReason = "spam";
        break;

      case "bounce":
        newStatus = "bounced";
        shouldSuppress = true;
        suppressReason = "bounce";
        break;

      case "wrong_person":
        // Treat as replied so we don't keep emailing this contact under this campaign
        newStatus = "replied";
        break;

      case "out_of_office":
      case "neutral":
      case "question":
      case "not_sure":
      case "none":
      default:
        // For low-confidence or OOO, we can keep status 'active' for now
        // but still store last_reply_intent on the campaign_leads row
        newStatus = null;
        break;
    }

    // 4. Update campaign_leads if present
    if (cl) {
      const updatePayload: Record<string, unknown> = {
        last_reply_intent: intent,
      };

      if (newStatus) {
        updatePayload.status_enum = newStatus;
        if (newStatus === "replied" || newStatus === "unsubscribed") {
          updatePayload.replied_at = now;
        }
      }

      const { error: updateError } = await supabase
        .from("campaign_leads")
        .update(updatePayload)
        .eq("id", cl.id);

      if (updateError) {
        console.error("Failed to update campaign_leads:", updateError);
      }
    }

    // 5. Add to global_suppressions for unsubscribe / spam / bounce
    // Note: global_suppressions uses workspace_id, so we need to get it from campaign
    if (shouldSuppress && reply.from_email) {
      const email = (reply.from_email as string).toLowerCase().trim();

      // Get workspace_id from campaign
      const { data: campaign } = await supabase
        .from("campaigns")
        .select("workspace_id, user_id")
        .eq("id", reply.campaign_id)
        .single();

      // Try to get workspace_id from campaign, or derive from user_id/lead
      let workspaceId: string | null = null;

      if (campaign?.workspace_id) {
        workspaceId = campaign.workspace_id;
      } else if (campaign?.user_id) {
        // Try to get workspace from user
        const { data: workspaceMember } = await supabase
          .from("workspace_members")
          .select("workspace_id")
          .eq("user_id", campaign.user_id)
          .limit(1)
          .single();

        if (workspaceMember?.workspace_id) {
          workspaceId = workspaceMember.workspace_id;
        }
      }

      // If we still don't have workspace_id, try getting it from lead
      if (!workspaceId) {
        const { data: lead } = await supabase
          .from("leads")
          .select("workspace_id, user_id")
          .eq("id", reply.lead_id)
          .single();

        if (lead?.workspace_id) {
          workspaceId = lead.workspace_id;
        } else if (lead?.user_id) {
          const { data: workspaceMember } = await supabase
            .from("workspace_members")
            .select("workspace_id")
            .eq("user_id", lead.user_id)
            .limit(1)
            .single();

          if (workspaceMember?.workspace_id) {
            workspaceId = workspaceMember.workspace_id;
          }
        }
      }

      if (workspaceId) {
        const metadata = {
          source: "auto_intent",
          reply_id: reply.id,
          campaign_id: reply.campaign_id,
          intent,
          confidence,
        };

        // Insert or update global_suppressions
        // First try to insert, if it fails due to unique constraint, update instead
        const { error: insertError } = await supabase
          .from("global_suppressions")
          .insert({
            workspace_id: workspaceId,
            email,
            reason: suppressReason,
            source: "api", // Using 'api' since it's auto-generated from intent
            metadata,
          });

        if (insertError) {
          // If insert failed due to unique constraint (23505), try update
          if (insertError.code === "23505") {
            const { error: updateError } = await supabase
              .from("global_suppressions")
              .update({
                reason: suppressReason,
                source: "api",
                metadata,
              })
              .eq("workspace_id", workspaceId)
              .eq("email", email);

            if (updateError) {
              console.error("Failed to update global_suppressions:", updateError);
            }
          } else {
            console.error("Failed to insert global_suppressions:", insertError);
          }
        }
      } else {
        console.warn(
          "Could not determine workspace_id for suppression, skipping global suppression"
        );
      }
    }

    // 6. Trigger hot lead notification for high-intent replies
    try {
      const highIntentIntents: ReplyIntent[] = ["positive", "referral"];

      if (highIntentIntents.includes(intent)) {
        const notifyUrl =
          `${Deno.env.get("SUPABASE_URL")}/functions/v1/notify-hot-lead`;

        await fetch(notifyUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${serviceRoleKey}`,
          },
          body: JSON.stringify({
            campaign_id: reply.campaign_id,
            lead_id: reply.lead_id,
            source: "reply_intent",
          }),
        }).catch((err) => {
          console.error("Failed to invoke notify-hot-lead:", err);
          // Don't throw - this is fire-and-forget
        });
      }
    } catch (err) {
      console.error("Error calling notify-hot-lead:", err);
      // Continue - don't fail the apply-reply-intent if notification fails
    }

    // 7. Trigger summarize-lead-thread (Block 8370) to update thread summary
    // Fire-and-forget: don't block the response if this fails
    try {
      const summarizeUrl =
        `${Deno.env.get("SUPABASE_URL")}/functions/v1/summarize-lead-thread`;

      await fetch(summarizeUrl, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${serviceRoleKey}`,
        },
        body: JSON.stringify({
          campaign_id: reply.campaign_id,
          lead_id: reply.lead_id,
        }),
      }).catch((err) => {
        console.error("Failed to invoke summarize-lead-thread:", err);
        // Don't throw - this is fire-and-forget
      });
    } catch (err) {
      console.error("Error calling summarize-lead-thread:", err);
      // Continue - don't fail the apply-reply-intent if summarize fails
    }

    return Response.json({
      status: "ok",
      reply_id: reply.id,
      applied_intent: intent,
      new_status: newStatus,
      suppressed: shouldSuppress,
      suppress_reason: suppressReason,
    });
  } catch (err) {
    console.error("Unhandled error in apply-reply-intent:", err);
    return new Response("Internal Server Error", { status: 500 });
  }
});

