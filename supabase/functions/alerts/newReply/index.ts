import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

interface ReplyAlertPayload {
  workspace_id: string;
  contact_id: string;
  message_id: string;
  reply_text: string;
  intent?: string; // 'hot_lead', 'warm_lead', etc.
  campaign_id?: string;
}

Deno.serve(async (req) => {
  try {
    const payload: ReplyAlertPayload = await req.json();

    if (!payload.workspace_id || !payload.contact_id || !payload.reply_text) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Get contact info
    const { data: contact } = await supabase
      .from("contacts")
      .select("email, first_name, last_name")
      .eq("id", payload.contact_id)
      .single();

    if (!contact) {
      return new Response(
        JSON.stringify({ error: "Contact not found" }),
        { status: 404 }
      );
    }

    const contactName = contact.first_name || contact.email.split("@")[0];

    // Detect hot lead keywords
    const hotKeywords = ["yes", "interested", "come by", "schedule", "inspection", "quote", "estimate", "when can you"];
    const replyLower = payload.reply_text.toLowerCase();
    const isHotLead = hotKeywords.some(keyword => replyLower.includes(keyword));

    // Determine alert type
    let alertType: "hot_lead" | "performance_insights" = "performance_insights";
    let title = "";
    let message = "";

    if (isHotLead || payload.intent === "hot_lead") {
      alertType = "hot_lead";
      title = `🔥 HOT Lead: ${contactName} just replied`;
      message = `"${payload.reply_text.substring(0, 100)}${payload.reply_text.length > 100 ? "..." : ""}"`;
    } else {
      title = `💬 New Reply from ${contactName}`;
      message = `"${payload.reply_text.substring(0, 100)}${payload.reply_text.length > 100 ? "..." : ""}"`;
    }

    // Get workspace members to notify
    const { data: members } = await supabase
      .from("workspace_members")
      .select("user_id")
      .eq("workspace_id", payload.workspace_id);

    if (!members || members.length === 0) {
      return new Response(
        JSON.stringify({ error: "No workspace members found" }),
        { status: 404 }
      );
    }

    // Create alerts for each member
    const alertPromises = members.map(member =>
      supabase.rpc("create_alert", {
        p_workspace_id: payload.workspace_id,
        p_user_id: member.user_id,
        p_type: alertType,
        p_title: title,
        p_message: message,
        p_contact_id: payload.contact_id,
        p_campaign_id: payload.campaign_id || null,
        p_metadata: {
          reply_text: payload.reply_text,
          intent: payload.intent,
          message_id: payload.message_id,
        },
        p_source: "reply_detection",
      })
    );

    await Promise.all(alertPromises);

    return new Response(
      JSON.stringify({ ok: true, alerts_created: members.length }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in alerts/newReply:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});





















































