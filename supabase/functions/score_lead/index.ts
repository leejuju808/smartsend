// Block 26540 — SmartSend Roofing Lead Score & Heat Ranking v1
// Edge Function: Scores leads with AI-backed sentiment analysis
// This function triggers when a lead replies, is created, or gets detected from SmartSend outreach

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

Deno.serve(async (req) => {
  try {
    const {
      lead_id,
      message,
      reply_time_minutes,
      lead_source,
      address,
    } = await req.json();

    if (!lead_id) {
      return new Response(
        JSON.stringify({ error: "Missing lead_id" }),
        { status: 400, headers: { "Content-Type": "application/json" } }
      );
    }

    // Fetch lead data
    const { data: lead, error: leadError } = await supabase
      .from("leads")
      .select("id, workspace_id, email, address, source, created_at, last_reply_at")
      .eq("id", lead_id)
      .single();

    if (leadError || !lead) {
      return new Response(
        JSON.stringify({ error: "Lead not found" }),
        { status: 404, headers: { "Content-Type": "application/json" } }
      );
    }

    // Use provided values or fetch from lead
    const messageText = message || "";
    const leadSource = lead_source || lead.source || "";
    const leadAddress = address || lead.address || "";

    // ============================================================================
    // 1. INTENT KEYWORD SCORING
    // ============================================================================
    const keywords = [
      "urgent",
      "leak",
      "leaking",
      "quote",
      "estimate",
      "insurance",
      "claim",
      "claim number",
      "damage",
      "storm",
      "hail",
      "wind",
      "replace",
      "replacement",
      "repair",
      "asap",
      "immediately",
      "emergency",
      "water",
      "roof",
    ];

    let intentScore = 0;
    const lowerMessage = messageText.toLowerCase();

    for (const keyword of keywords) {
      if (lowerMessage.includes(keyword)) {
        // High-value keywords get more points
        if (["urgent", "leak", "leaking", "emergency", "asap", "immediately"].includes(keyword)) {
          intentScore += 15;
        } else if (["insurance", "claim", "claim number"].includes(keyword)) {
          intentScore += 20;
        } else {
          intentScore += 10;
        }
      }
    }

    // Cap intent score at 100
    intentScore = Math.min(intentScore, 100);

    // ============================================================================
    // 2. REPLY SPEED SCORING
    // ============================================================================
    let replySpeedScore = 0;
    let actualReplyTimeMinutes = reply_time_minutes;

    // If reply_time_minutes not provided, calculate from lead data
    if (!actualReplyTimeMinutes && lead.last_reply_at && lead.created_at) {
      const createdTime = new Date(lead.created_at).getTime();
      const replyTime = new Date(lead.last_reply_at).getTime();
      actualReplyTimeMinutes = Math.floor((replyTime - createdTime) / (1000 * 60));
    }

    if (actualReplyTimeMinutes !== null && actualReplyTimeMinutes !== undefined) {
      if (actualReplyTimeMinutes < 10) {
        replySpeedScore = 20; // Very fast reply
      } else if (actualReplyTimeMinutes < 60) {
        replySpeedScore = 15; // Fast reply (within hour)
      } else if (actualReplyTimeMinutes < 1440) {
        replySpeedScore = 10; // Same day reply
      } else if (actualReplyTimeMinutes < 4320) {
        replySpeedScore = 5; // Within 3 days
      }
    }

    // ============================================================================
    // 3. SENTIMENT SCORING (AI)
    // ============================================================================
    let sentimentScore = 0;

    if (messageText && messageText.trim().length > 0) {
      const openaiApiKey = Deno.env.get("OPENAI_API_KEY");
      
      if (openaiApiKey) {
        try {
          const sentimentResponse = await fetch("https://api.openai.com/v1/chat/completions", {
            method: "POST",
            headers: {
              Authorization: `Bearer ${openaiApiKey}`,
              "Content-Type": "application/json",
            },
            body: JSON.stringify({
              model: "gpt-4o-mini",
              messages: [
                {
                  role: "system",
                  content: `You are analyzing homeowner messages for a roofing company. 
Score the sentiment from -10 (very negative/uninterested) to +10 (very positive/urgent).
Respond with ONLY a single integer between -10 and 10.`,
                },
                {
                  role: "user",
                  content: messageText.substring(0, 2000), // Limit to avoid token limits
                },
              ],
              temperature: 0.3,
              max_tokens: 10,
            }),
          });

          if (sentimentResponse.ok) {
            const sentimentData = await sentimentResponse.json();
            const sentimentText = sentimentData.choices?.[0]?.message?.content?.trim() || "0";
            const parsedSentiment = parseInt(sentimentText, 10);
            
            if (!isNaN(parsedSentiment)) {
              sentimentScore = Math.max(-10, Math.min(10, parsedSentiment));
            }
          }
        } catch (error) {
          console.error("Error calling OpenAI for sentiment:", error);
          // Fallback: basic keyword-based sentiment
          const positiveWords = ["yes", "interested", "urgent", "please", "thank", "great", "perfect"];
          const negativeWords = ["no", "not interested", "stop", "unsubscribe", "remove"];
          
          const lowerMsg = messageText.toLowerCase();
          if (positiveWords.some(w => lowerMsg.includes(w))) {
            sentimentScore = 5;
          } else if (negativeWords.some(w => lowerMsg.includes(w))) {
            sentimentScore = -5;
          }
        }
      } else {
        // No OpenAI key, use keyword fallback
        const positiveWords = ["yes", "interested", "urgent", "please", "thank"];
        const lowerMsg = messageText.toLowerCase();
        if (positiveWords.some(w => lowerMsg.includes(w))) {
          sentimentScore = 3;
        }
      }
    }

    // ============================================================================
    // 4. LEAD SOURCE SCORING
    // ============================================================================
    let sourceScore = 0;
    const lowerSource = leadSource.toLowerCase();

    if (lowerSource.includes("smartsend") || lowerSource.includes("cold email")) {
      sourceScore = 10;
    } else if (lowerSource.includes("referral") || lowerSource.includes("refer")) {
      sourceScore = 20; // Referrals are high quality
    } else if (lowerSource.includes("google ads") || lowerSource.includes("adwords")) {
      sourceScore = 5;
    } else if (lowerSource.includes("website") || lowerSource.includes("form")) {
      sourceScore = 15; // Website forms are good
    } else if (lowerSource.includes("insurance") || lowerSource.includes("claim")) {
      sourceScore = 18; // Insurance leads are very valuable
    } else if (lowerSource.includes("purchased") || lowerSource.includes("list")) {
      sourceScore = 2; // Purchased lists are lower quality
    }

    // ============================================================================
    // 5. LOCATION SCORING (Storm areas boost)
    // ============================================================================
    let locationScore = 0;
    const lowerAddress = leadAddress.toLowerCase();

    // Check for storm-related keywords
    if (
      lowerAddress.includes("wind") ||
      lowerAddress.includes("hail") ||
      lowerAddress.includes("storm") ||
      lowerAddress.includes("damage")
    ) {
      locationScore = 20;
    } else if (
      lowerAddress.includes("hurricane") ||
      lowerAddress.includes("tornado") ||
      lowerAddress.includes("flood")
    ) {
      locationScore = 25; // Even higher for severe weather
    }

    // ============================================================================
    // 6. CALCULATE TOTAL SCORE AND HEAT LEVEL
    // ============================================================================
    // Note: sentiment_score is -10 to +10, database function will normalize it to 0-20
    // For display purposes, we calculate total here (database will recalculate correctly)
    const normalizedSentiment = sentimentScore + 10; // Normalize to 0-20 for calculation
    const total =
      replySpeedScore +
      intentScore +
      normalizedSentiment +
      sourceScore +
      locationScore;

    // Clamp total to 0-100
    const clampedTotal = Math.max(0, Math.min(100, total));

    // Determine heat level
    let heat = "noise";
    if (clampedTotal >= 80) {
      heat = "hot";
    } else if (clampedTotal >= 50) {
      heat = "warm";
    } else if (clampedTotal >= 20) {
      heat = "cold";
    }

    // ============================================================================
    // 7. UPSERT SCORE TO DATABASE
    // ============================================================================
    const { error: upsertError } = await supabase.rpc("upsert_lead_score", {
      p_lead_id: lead_id,
      p_reply_speed_score: replySpeedScore,
      p_intent_keyword_score: intentScore,
      p_sentiment_score: sentimentScore, // Store original -10 to +10
      p_source_score: sourceScore,
      p_location_score: locationScore,
      p_last_message_text: messageText.substring(0, 1000),
      p_reply_time_minutes: actualReplyTimeMinutes,
      p_lead_source: leadSource,
      p_address: leadAddress,
    });

    if (upsertError) {
      console.error("Error upserting lead score:", upsertError);
      return new Response(
        JSON.stringify({ error: upsertError.message }),
        { status: 500, headers: { "Content-Type": "application/json" } }
      );
    }

    // ============================================================================
    // 8. RETURN RESULT
    // ============================================================================
    return new Response(
      JSON.stringify({
        ok: true,
        lead_id,
        total_score: clampedTotal,
        heat_level: heat,
        components: {
          reply_speed_score: replySpeedScore,
          intent_keyword_score: intentScore,
          sentiment_score: sentimentScore,
          source_score: sourceScore,
          location_score: locationScore,
        },
      }),
      { headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("Error in score_lead:", error);
    return new Response(
      JSON.stringify({ error: String(error) }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});
