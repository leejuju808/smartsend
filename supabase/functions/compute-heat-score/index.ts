// Block 21779 — SmartSend Roofing Lead Heat Score v1
// 🔥 The Homeowner Intent Engine
// Edge Function: Computes heat score (0-100) based on buying intent signals

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const { lead_id } = await req.json();

    if (!lead_id) {
      return new Response(
        JSON.stringify({ error: "Missing lead_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch lead data
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("*")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    let score = 0;

    // 1. RESPONSE SPEED SCORING
    // Check reply_threads for reply timing
    const { data: threads } = await supabase
      .from("reply_threads")
      .select("last_message_at, created_at")
      .eq("lead_id", lead_id)
      .order("last_message_at", { ascending: false })
      .limit(1);

    if (threads && threads.length > 0) {
      const thread = threads[0];
      if (thread.last_message_at && thread.created_at) {
        const sentAt = new Date(thread.created_at).getTime();
        const repliedAt = new Date(thread.last_message_at).getTime();
        const responseTimeSeconds = (repliedAt - sentAt) / 1000;

        if (responseTimeSeconds <= 300) {
          // 5 minutes or less
          score += 40;
        } else if (responseTimeSeconds <= 1800) {
          // 5-30 minutes
          score += 25;
        } else if (responseTimeSeconds > 0) {
          // Any reply
          score += 10;
        }
      } else {
        // No reply detected
        score -= 10;
      }
    } else {
      // No threads/replies
      score -= 10;
    }

    // 2. MESSAGE INTENT KEYWORDS SCORING
    // Check inbound_messages or reply_messages for message content
    let messageText = "";

    // Try inbound_messages first
    const { data: inboundMessages } = await supabase
      .from("inbound_messages")
      .select("body_text, body_html, snippet")
      .eq("lead_id", lead_id)
      .order("created_at", { ascending: false })
      .limit(5);

    if (inboundMessages && inboundMessages.length > 0) {
      messageText = (
        inboundMessages[0].body_text ||
        inboundMessages[0].body_html ||
        inboundMessages[0].snippet ||
        ""
      ).toLowerCase();
    } else {
      // Try reply_messages
      const { data: replyMessages } = await supabase
        .from("reply_messages")
        .select("body, snippet")
        .eq("thread_id", threads?.[0]?.id || "")
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(5);

      if (replyMessages && replyMessages.length > 0) {
        messageText = (
          replyMessages[0].body ||
          replyMessages[0].snippet ||
          ""
        ).toLowerCase();
      }
    }

    // Keyword intent scoring
    if (messageText) {
      // High intent keywords
      if (
        messageText.includes("when can you come") ||
        messageText.includes("when can you come out") ||
        messageText.includes("schedule") ||
        messageText.includes("available")
      ) {
        score += 30;
      }

      if (
        messageText.includes("asap") ||
        messageText.includes("as soon as possible") ||
        messageText.includes("urgent")
      ) {
        score += 25;
      }

      if (
        messageText.includes("leak") ||
        messageText.includes("storm") ||
        messageText.includes("damage") ||
        messageText.includes("urgent")
      ) {
        score += 40;
      }

      // Low intent keywords
      if (
        messageText.includes("just looking") ||
        messageText.includes("just curious") ||
        messageText.includes("shopping around") ||
        messageText.includes("comparing")
      ) {
        score -= 20;
      }

      if (
        messageText.includes("not sure") ||
        messageText.includes("maybe later") ||
        messageText.includes("not ready")
      ) {
        score -= 10;
      }
    }

    // 3. NUMBER OF REPLIES SCORING
    const replyCount = inboundMessages?.length || 0;
    if (replyCount >= 2) {
      score += 20;
    } else if (replyCount === 1) {
      score += 10;
    } else {
      score -= 10;
    }

    // 4. LEAD SOURCE SCORING
    const source = (lead.source || "").toLowerCase();
    if (source === "website" || source === "website_form") {
      score += 10;
    } else if (source === "referral" || source === "homeowner_referral") {
      score += 20;
    } else if (source === "purchased_list" || source === "list") {
      score -= 10;
    } else if (source === "cold_outbound" || source === "outbound") {
      score += 0; // Neutral
    }

    // 5. JOB TYPE SCORING
    const jobType = (lead.job_type || "").toLowerCase();
    if (jobType === "emergency" || jobType === "leak") {
      score += 40;
    } else if (jobType === "insurance" || jobType === "insurance_claim") {
      score += 25;
    } else if (
      jobType === "replacement" ||
      jobType === "full_replacement" ||
      jobType === "full_roof"
    ) {
      score += 20;
    } else if (jobType === "repair" || jobType === "small_repair") {
      score += 10;
    }

    // Clamp score to valid range
    if (score > 100) score = 100;
    if (score < -50) score = -50;

    // Get automation settings for thresholds
    const { data: settings } = await supabase
      .from("automation_settings")
      .select("hot_lead_threshold, warm_lead_threshold")
      .eq("workspace_id", lead.workspace_id)
      .single();

    const hotThreshold = settings?.hot_lead_threshold ?? 80;
    const warmThreshold = settings?.warm_lead_threshold ?? 50;

    // Determine category using workspace-specific thresholds
    const category =
      score >= hotThreshold ? "hot" : score >= warmThreshold ? "warm" : score >= 0 ? "cold" : "dead";

    // Update lead with heat score and category
    const { error: updateError } = await supabase
      .from("leads")
      .update({
        heat_score: score,
        heat_category: category,
      })
      .eq("id", lead_id);

    if (updateError) {
      console.error("Error updating lead heat score:", updateError);
      return new Response(
        JSON.stringify({ error: updateError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    return new Response(
      JSON.stringify({
        ok: true,
        heat_score: score,
        heat_category: category,
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in compute-heat-score:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

