// Block 302 — Auto-Mark as Replied
// Edge Function to auto-mark leads as replied and stop sequences

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    try {
      const { reply_id } = await req.json();

      if (!reply_id) {
        return new Response(
          JSON.stringify({ error: "reply_id is required" }),
          { status: 400 }
        );
      }

      // 1) Load reply from email_replies
      const { data: reply, error: replyErr } = await supabase
        .from("email_replies")
        .select("*")
        .eq("id", reply_id)
        .single();

      if (replyErr || !reply) {
        console.error("Reply not found:", replyErr);
        return new Response(
          JSON.stringify({ error: "reply_not_found" }),
          { status: 400 }
        );
      }

      // Get workspace_id if not already set
      let workspaceId = reply.workspace_id;
      if (!workspaceId && reply.email_log_id) {
        // Get workspace_id from email_logs -> user_id -> workspace_members
        const { data: emailLog } = await supabase
          .from("email_logs")
          .select("user_id")
          .eq("id", reply.email_log_id)
          .maybeSingle();

        if (emailLog?.user_id) {
          const { data: membership } = await supabase
            .from("workspace_members")
            .select("workspace_id")
            .eq("user_id", emailLog.user_id)
            .limit(1)
            .maybeSingle();
          workspaceId = membership?.workspace_id || null;
        }
      }

      // Get lead_id if not already set
      let leadId = reply.lead_id;
      if (!leadId && reply.email_log_id) {
        const { data: emailLog } = await supabase
          .from("email_logs")
          .select("lead_id")
          .eq("id", reply.email_log_id)
          .maybeSingle();
        leadId = emailLog?.lead_id || null;
      }

      // Get campaign_id if not already set
      let campaignId = reply.campaign_id;
      if (!campaignId && reply.email_log_id) {
        const { data: emailLog } = await supabase
          .from("email_logs")
          .select("campaign_id")
          .eq("id", reply.email_log_id)
          .maybeSingle();
        campaignId = emailLog?.campaign_id || null;
      }

      // 2) Load intent record (from adaptive brain v2 - Block 300)
      const { data: intent } = await supabase
        .from("reply_intent")
        .select("*")
        .eq("reply_id", reply_id)
        .single();

      const category = intent?.category || "neutral";

      // Treat these as "not a human reply" (don't stop sequences)
      const nonHuman = [
        "bounce",
        "spam",
        "out_of_office"
      ];

      const isUnsubscribe = category === "unsubscribe";
      const isHumanReply = !nonHuman.includes(category);

      // 3) Update lead core fields if human reply
      if (isHumanReply && leadId) {
        const receivedAt = reply.received_at || reply.created_at || new Date().toISOString();
        
        await supabase
          .from("leads")
          .update({
            replied: true,
            last_replied_at: receivedAt,
            status: isUnsubscribe ? "unsubscribed" : "replied",
          })
          .eq("id", leadId);
      }

      // 4) Update campaign_leads status
      if (campaignId && leadId && isHumanReply) {
        await supabase
          .from("campaign_leads")
          .update({
            status: isUnsubscribe ? "unsubscribed" : "replied",
          })
          .eq("lead_id", leadId)
          .eq("campaign_id", campaignId);
      }

      // 5) Stop sequences for this lead
      if (leadId && isHumanReply) {
        // Stop specific sequence if sequence_id is available
        if (reply.sequence_id) {
          await supabase
            .from("sequence_enrollments")
            .update({
              status: isUnsubscribe
                ? "stopped_due_to_unsubscribe"
                : "stopped_due_to_reply",
            })
            .eq("lead_id", leadId)
            .eq("sequence_id", reply.sequence_id);
        }

        // Also stop any *other* active sequences for this lead inside same campaign
        if (campaignId) {
          await supabase
            .from("sequence_enrollments")
            .update({
              status: isUnsubscribe
                ? "stopped_due_to_unsubscribe"
                : "stopped_due_to_reply",
            })
            .eq("lead_id", leadId)
            .eq("campaign_id", campaignId)
            .eq("status", "active");
        }
      }

      // 6) Optional: log a billing event / analytics event
      if (workspaceId) {
        await supabase.from("billing_events").insert({
          workspace_id: workspaceId,
          type: "auto_mark_replied",
          detail: `Lead ${leadId} marked replied due to reply ${reply_id} (category=${category})`,
        });
      }

      // Log to workspace_activity
      if (workspaceId && isHumanReply) {
        await supabase.from("workspace_activity").insert({
          workspace_id: workspaceId,
          actor_id: null, // System action
          event_type: "reply_received",
          description: "Reply received from lead",
          lead_id: leadId,
          campaign_id: campaignId,
          metadata: { reply_id: reply_id, category },
        }).catch((err) => {
          console.error("Failed to log reply activity:", err);
        });
      }

      // Create notification for workspace owner
      if (workspaceId && isHumanReply) {
        try {
          // Find workspace owner (first team member by created_at)
          const { data: owner } = await supabase
            .from("team_members")
            .select("user_id")
            .eq("workspace_id", workspaceId)
            .order("created_at", { ascending: true })
            .limit(1)
            .single();

          if (owner) {
            await supabase.from("notifications").insert({
              workspace_id: workspaceId,
              user_id: owner.user_id,
              type: "reply",
              title: "New reply received",
              body: `Lead replied in campaign ${campaignId || ""}`,
              data: {
                lead_id: leadId,
                reply_id: reply_id,
                campaign_id: campaignId,
              },
            });
          }
        } catch (err) {
          console.error("Failed to create notification:", err);
          // Don't fail the request if notification fails
        }
      }

      return new Response(
        JSON.stringify({ 
          ok: true, 
          lead_id: leadId,
          campaign_id: campaignId,
          category,
          is_human_reply: isHumanReply
        }), 
        { 
          status: 200,
          headers: { "Content-Type": "application/json" }
        }
      );
    } catch (error) {
      console.error("Error in reply-auto-mark:", error);
      return new Response(
        JSON.stringify({ error: error.message || "Internal server error" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }
});
