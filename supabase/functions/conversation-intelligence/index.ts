import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL");
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
const openaiKey = Deno.env.get("OPENAI_API_KEY");

if (!supabaseUrl || !supabaseKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

if (!openaiKey) {
  throw new Error("OPENAI_API_KEY is required for conversation intelligence");
}

interface IntelligenceResult {
  summary: string;
  action_items: string[];
  tone: "positive" | "neutral" | "negative";
  objections: string[];
  buyer_role: "decision_maker" | "influencer" | "assistant" | "unknown";
  opportunity_score: number;
}

Deno.serve(async (req) => {
  try {
    const { thread_id, message_id } = await req.json();
    
    if (!thread_id && !message_id) {
      return new Response(
        JSON.stringify({ ok: false, error: "thread_id or message_id required" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    const supabase = createClient(supabaseUrl!, supabaseKey!);

    // Get thread and messages
    let threadId = thread_id;
    let accountId: string | null = null;
    let leadId: string | null = null;
    let campaignId: string | null = null;
    let companyId: string | null = null;
    let replyText = "";

    if (message_id) {
      // Load message and get thread_id from it
      const { data: msg, error: msgError } = await supabase
        .from("messages")
        .select("id, thread_id, account_id, lead_id, body_text, body_html, subject")
        .eq("id", message_id)
        .maybeSingle();

      if (msgError || !msg) {
        return new Response(
          JSON.stringify({ ok: false, error: "Message not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      threadId = msg.thread_id;
      accountId = msg.account_id;
      leadId = msg.lead_id;
      replyText = normalizeText(msg.body_text, msg.body_html);
    }

    if (!threadId) {
      return new Response(
        JSON.stringify({ ok: false, error: "Could not determine thread_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Load thread details if not already loaded
    if (!accountId || !leadId) {
      const { data: thread, error: threadError } = await supabase
        .from("reply_threads")
        .select("id, account_id, lead_id, campaign_id")
        .eq("id", threadId)
        .maybeSingle();

      if (threadError || !thread) {
        return new Response(
          JSON.stringify({ ok: false, error: "Thread not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }

      accountId = thread.account_id;
      leadId = thread.lead_id;
      campaignId = thread.campaign_id;
    }

    // Get company_id from lead and ensure we have campaign_id
    if (leadId) {
      const { data: lead } = await supabase
        .from("leads")
        .select("company_id")
        .eq("id", leadId)
        .maybeSingle();
      
      companyId = lead?.company_id || null;
      
      // If we don't have campaign_id yet, try to get it from thread
      if (!campaignId && threadId) {
        const { data: thread } = await supabase
          .from("reply_threads")
          .select("campaign_id")
          .eq("id", threadId)
          .maybeSingle();
        
        campaignId = thread?.campaign_id || null;
      }
    }

    // Get all messages in thread for context
    if (!replyText) {
      // Try reply_messages table first
      const { data: replyMessages } = await supabase
        .from("reply_messages")
        .select("body, direction")
        .eq("thread_id", threadId)
        .order("created_at", { ascending: true });

      if (replyMessages && replyMessages.length > 0) {
        // Get the latest inbound message
        const inboundMessages = replyMessages.filter((m: any) => m.direction === "inbound" || m.direction === "in");
        if (inboundMessages.length > 0) {
          const latest = inboundMessages[inboundMessages.length - 1];
          replyText = latest.body || "";
        }
      }

      // Fallback to messages table if reply_messages didn't have it
      if (!replyText) {
        const { data: messages } = await supabase
          .from("messages")
          .select("body_text, body_html, direction")
          .eq("thread_id", threadId)
          .order("received_at", { ascending: true });

        if (messages && messages.length > 0) {
          // Get the latest inbound message
          const inboundMessages = messages.filter((m: any) => m.direction === "inbound" || m.direction === "in");
          if (inboundMessages.length > 0) {
            const latest = inboundMessages[inboundMessages.length - 1];
            replyText = normalizeText(latest.body_text, latest.body_html);
          }
        }
      }
    }

    if (!replyText || replyText.trim().length < 10) {
      return new Response(
        JSON.stringify({ ok: false, error: "No reply text found" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Call OpenAI for intelligence extraction
    const intelligence = await extractIntelligence(replyText);

    // Update reply_threads with intelligence
    const { error: updateError } = await supabase
      .from("reply_threads")
      .update({
        ai_summary: intelligence.summary,
        ai_action_items: intelligence.action_items,
        ai_tone: intelligence.tone,
        ai_objections: intelligence.objections,
        ai_buyer_role: intelligence.buyer_role,
        ai_opportunity_score: intelligence.opportunity_score,
        updated_at: new Date().toISOString(),
      })
      .eq("id", threadId);

    if (updateError) {
      console.error("Failed to update thread intelligence:", updateError);
      return new Response(
        JSON.stringify({ ok: false, error: "Failed to update thread" }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // Boost intent scores based on intelligence
    if (accountId && companyId && leadId) {
      // High opportunity score
      if (intelligence.opportunity_score >= 7) {
        await supabase.from("intent_signals").insert({
          account_id: accountId,
          company_id: companyId,
          lead_id: leadId,
          signal_type: "reply",
          weight: 5,
        }).catch((err) => console.error("Failed to insert intent signal:", err));
      }

      // Positive tone
      if (intelligence.tone === "positive") {
        await supabase.from("intent_signals").insert({
          account_id: accountId,
          company_id: companyId,
          lead_id: leadId,
          signal_type: "reply",
          weight: 1,
        }).catch((err) => console.error("Failed to insert intent signal:", err));
      }
    }

    // Log to activity_log
    if (accountId && campaignId && leadId) {
      await supabase.from("activity_log").insert({
        account_id: accountId,
        campaign_id: campaignId,
        company_id: companyId,
        lead_id: leadId,
        event_type: "email_reply",
        meta: {
          summary: intelligence.summary,
          tone: intelligence.tone,
          objections: intelligence.objections,
          opportunity: intelligence.opportunity_score,
          buyer_role: intelligence.buyer_role,
          action_items: intelligence.action_items,
        },
      }).catch((err) => console.error("Failed to log activity:", err));
    }

    // Check if handoff should be triggered (async, don't wait)
    if (threadId && (intelligence.opportunity_score >= 7 || intelligence.tone === "positive")) {
      // Check if campaign has auto handoff enabled
      if (campaignId) {
        const { data: campaign } = await supabase
          .from("campaigns")
          .select("handoff_mode, handoff_destination")
          .eq("id", campaignId)
          .maybeSingle();

        if (campaign?.handoff_mode === "auto" && campaign?.handoff_destination && campaign.handoff_destination !== "none") {
          // Trigger handoff directly using service role (non-blocking)
          triggerHandoffDirectly(threadId, supabase).catch((err) => 
            console.error("Failed to trigger handoff:", err)
          );
        }
      }
    }

    return new Response(
      JSON.stringify({ ok: true, intelligence }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Conversation intelligence error:", error);
    return new Response(
      JSON.stringify({ ok: false, error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

async function extractIntelligence(replyText: string): Promise<IntelligenceResult> {
  const prompt = `You are SmartSend's Conversation Intelligence Engine.

Analyze this email reply and extract conversation intelligence. Return JSON only:

{
  "summary": "Brief 1-2 sentence summary of the conversation",
  "action_items": ["action item 1", "action item 2"],
  "tone": "positive|neutral|negative",
  "objections": ["objection 1", "objection 2"],
  "buyer_role": "decision_maker|influencer|assistant|unknown",
  "opportunity_score": 0-10
}

Guidelines:
- summary: Concise overview of what the lead said
- action_items: Specific next steps or tasks mentioned (empty array if none)
- tone: positive (interested/enthusiastic), neutral (informational), negative (rejecting/uninterested)
- objections: Any concerns, hesitations, or reasons not to proceed (empty array if none)
- buyer_role: decision_maker (can make purchase decisions), influencer (recommends/influences), assistant (gatekeeper/EA), unknown
- opportunity_score: 0-10 where 10 = hot lead ready to buy, 0 = not interested

Reply text:
${replyText.slice(0, 4000)}`;

  try {
    const response = await fetch("https://api.openai.com/v1/chat/completions", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${openaiKey}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        model: "gpt-4o-mini",
        temperature: 0.3,
        messages: [
          {
            role: "system",
            content: "You are a conversation intelligence engine. Return only valid JSON, no markdown, no code blocks.",
          },
          {
            role: "user",
            content: prompt,
          },
        ],
        response_format: { type: "json_object" },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error("OpenAI API error:", errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const json = await response.json();
    const content = json.choices?.[0]?.message?.content;
    if (!content) {
      throw new Error("No content in OpenAI response");
    }

    const parsed = JSON.parse(content);

    // Validate and normalize
    return {
      summary: String(parsed.summary || "").slice(0, 500),
      action_items: Array.isArray(parsed.action_items) ? parsed.action_items.slice(0, 10) : [],
      tone: ["positive", "neutral", "negative"].includes(parsed.tone) ? parsed.tone : "neutral",
      objections: Array.isArray(parsed.objections) ? parsed.objections.slice(0, 10) : [],
      buyer_role: ["decision_maker", "influencer", "assistant", "unknown"].includes(parsed.buyer_role)
        ? parsed.buyer_role
        : "unknown",
      opportunity_score: Math.max(0, Math.min(10, Number(parsed.opportunity_score) || 0)),
    };
  } catch (error) {
    console.error("Intelligence extraction failed:", error);
    // Return default values on error
    return {
      summary: "Unable to analyze conversation",
      action_items: [],
      tone: "neutral",
      objections: [],
      buyer_role: "unknown",
      opportunity_score: 0,
    };
  }
}

async function triggerHandoffDirectly(threadId: string, supabase: any): Promise<void> {
  try {
    // Fetch thread with related data
    const { data: thread } = await supabase
      .from("reply_threads")
      .select(`
        *,
        leads:lead_id (
          id,
          name,
          email
        ),
        companies:company_id (
          id,
          name
        ),
        campaigns:campaign_id (
          id,
          handoff_mode,
          handoff_destination,
          account_id
        )
      `)
      .eq("id", threadId)
      .single();

    if (!thread) return;

    const campaign = thread.campaigns as any;
    if (!campaign || campaign.handoff_destination === "none") return;

    const lead = thread.leads as any;
    const company = thread.companies as any;

    // Build payload
    const payload = {
      lead_name: lead?.name || "Unknown",
      lead_email: lead?.email || "",
      company: company?.name,
      summary: thread.ai_summary,
      tone: thread.ai_tone,
      opportunity: thread.ai_opportunity_score,
      objections: thread.ai_objections,
      buyer_role: thread.ai_buyer_role,
      campaign_id: thread.campaign_id,
      lead_id: thread.lead_id,
      company_id: thread.company_id,
    };

    // Call handoff engine (simplified - would need to import or inline)
    // For now, we'll call the handoff API endpoint with service role auth
    const baseUrl = Deno.env.get("NEXT_PUBLIC_BASE_URL") || Deno.env.get("NEXT_PUBLIC_VERCEL_URL") || "http://localhost:3000";
    const internalKey = Deno.env.get("INTERNAL_API_KEY");
    
    if (internalKey) {
      await fetch(`${baseUrl}/api/handoff/internal`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "X-Internal-Key": internalKey,
        },
        body: JSON.stringify({ threadId }),
      }).catch((err) => console.error("Handoff API call failed:", err));
    } else {
      // Fallback: log handoff attempt directly
      await supabase.rpc("log_handoff_attempt", {
        p_account_id: campaign.account_id || thread.account_id,
        p_lead_id: thread.lead_id,
        p_company_id: thread.company_id || null,
        p_campaign_id: thread.campaign_id || null,
        p_method: campaign.handoff_destination,
        p_status: "pending",
        p_meta: { payload, note: "Handoff triggered, processing..." },
      }).catch((err) => console.error("Failed to log handoff:", err));
    }
  } catch (error) {
    console.error("Error triggering handoff:", error);
  }
}

function normalizeText(plain?: string | null, html?: string | null): string {
  if (plain && plain.trim().length > 40) {
    return plain.trim();
  }
  if (html) {
    const text = html
      .replace(/<style[\s\S]*?<\/style>/gi, "")
      .replace(/<script[\s\S]*?<\/script>/gi, "")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    return text.slice(0, 8000);
  }
  return plain || "";
}

