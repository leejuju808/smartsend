/**
 * Block 24180 — SmartSend Roofing Inbox AI v2
 * Intent Classification Engine
 * 
 * Classifies homeowner messages into 7 actionable intent labels:
 * - HOT LEAD 🔥
 * - WARM LEAD 🟧
 * - COLD REPLY ❄️
 * - QUOTE REQUEST 💵
 * - INSPECTION SCHEDULING 📅
 * - NOT INTERESTED 🚫
 * - APPOINTMENT CONFIRMED ✔️
 */

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export type InboxIntentLabel =
  | "hot_lead"
  | "warm_lead"
  | "cold_reply"
  | "quote_request"
  | "inspection_scheduling"
  | "not_interested"
  | "appointment_confirmed";

export interface IntentClassificationResult {
  label: InboxIntentLabel;
  confidence: number; // 0.0 - 1.0
  reasoning: string;
  emotionalTone?: "neutral" | "curious" | "urgent" | "annoyed" | "interested" | "frustrated";
  urgencyScore?: number; // 0.0 - 1.0
  actionRecommendation?: "call_now" | "reply_immediately" | "reply_today" | "nurture" | "close_out";
}

/**
 * Classifies a homeowner message into one of 7 intent labels
 */
export async function classifyInboxIntent(
  messageText: string,
  subject?: string | null,
  context?: {
    previousMessages?: Array<{ direction: "in" | "out"; body: string; sent_at: string }>;
    leadStage?: string;
    hasInsuranceClaim?: boolean;
  }
): Promise<IntentClassificationResult> {
  const fullText = [subject, messageText].filter(Boolean).join("\n\n");
  const trimmed = fullText.trim().slice(0, 4000);

  if (!trimmed) {
    return {
      label: "cold_reply",
      confidence: 0.5,
      reasoning: "Empty message",
      actionRecommendation: "reply_today"
    };
  }

  const lowerText = trimmed.toLowerCase();

  // ============================================================================
  // RULE-BASED CHECKS (Fast path for high-confidence cases)
  // ============================================================================

  // HOT LEAD 🔥 - Clear intent to book/inspect
  const hotPatterns = [
    /\b(?:yes|yeah|sure|ok|okay|absolutely|definitely)\b/i,
    /\b(?:can you come|come out|come look|come by|stop by|visit|inspect|inspection)\b/i,
    /\b(?:tomorrow|today|asap|as soon as|urgent|immediately|right away)\b/i,
    /\b(?:what.*price|how much|cost|quote|estimate)\b/i,
    /\b(?:we need|we want|we're looking|looking for)\b/i,
    /\b(?:leak|leaking|water|damage|problem|issue|emergency)\b/i,
  ];

  const hotMatches = hotPatterns.filter(p => p.test(lowerText));
  if (hotMatches.length >= 2) {
    const hasUrgency = /\b(?:urgent|asap|emergency|leak|leaking|today|tomorrow)\b/i.test(lowerText);
    return {
      label: "hot_lead",
      confidence: Math.min(0.95, 0.7 + (hotMatches.length * 0.05)),
      reasoning: `Matched ${hotMatches.length} HOT LEAD indicators`,
      emotionalTone: hasUrgency ? "urgent" : "interested",
      urgencyScore: hasUrgency ? 0.9 : 0.7,
      actionRecommendation: hasUrgency ? "call_now" : "reply_immediately"
    };
  }

  // APPOINTMENT CONFIRMED ✔️
  const confirmedPatterns = [
    /\b(?:confirmed|confirms|that works|sounds good|perfect|see you|looking forward)\b/i,
    /\b(?:i'll be there|i'll see you|i'll be home|i'll be available)\b/i,
    /\b(?:yes.*time|yes.*appointment|yes.*meeting|yes.*inspection)\b/i,
  ];

  if (confirmedPatterns.some(p => p.test(lowerText)) && 
      (/\b(?:tomorrow|wednesday|thursday|friday|monday|tuesday|next week|at \d)/i.test(lowerText))) {
    return {
      label: "appointment_confirmed",
      confidence: 0.9,
      reasoning: "Appointment confirmation detected",
      emotionalTone: "interested",
      urgencyScore: 0.5,
      actionRecommendation: "reply_today"
    };
  }

  // INSPECTION SCHEDULING 📅
  const schedulingPatterns = [
    /\b(?:when can you|when are you|what time|what day|are you available|do you have time)\b/i,
    /\b(?:schedule|book|appointment|meeting|inspection|come out)\b/i,
    /\b(?:wednesday|thursday|friday|monday|tuesday|this week|next week)\b/i,
  ];

  if (schedulingPatterns.filter(p => p.test(lowerText)).length >= 2) {
    return {
      label: "inspection_scheduling",
      confidence: 0.85,
      reasoning: "Scheduling intent detected",
      emotionalTone: "interested",
      urgencyScore: 0.6,
      actionRecommendation: "reply_immediately"
    };
  }

  // QUOTE REQUEST 💵
  const quotePatterns = [
    /\b(?:how much|what.*cost|what.*price|pricing|quote|estimate|ballpark)\b/i,
    /\b(?:what do you charge|what.*rate|what.*fee)\b/i,
  ];

  if (quotePatterns.some(p => p.test(lowerText)) && 
      !hotPatterns.some(p => p.test(lowerText))) {
    return {
      label: "quote_request",
      confidence: 0.8,
      reasoning: "Pricing question detected",
      emotionalTone: "curious",
      urgencyScore: 0.5,
      actionRecommendation: "reply_today"
    };
  }

  // NOT INTERESTED 🚫
  const notInterestedPatterns = [
    /\b(?:not interested|not right now|we're good|already handled|already fixed|no thanks|no thank you)\b/i,
    /\b(?:please remove|unsubscribe|stop emailing|don't contact|remove me)\b/i,
    /\b(?:not at this time|maybe later|not now)\b/i,
  ];

  if (notInterestedPatterns.some(p => p.test(lowerText))) {
    return {
      label: "not_interested",
      confidence: 0.95,
      reasoning: "Not interested pattern detected",
      emotionalTone: "annoyed",
      urgencyScore: 0.1,
      actionRecommendation: "close_out"
    };
  }

  // COLD REPLY ❄️ - Answered but not about roofing
  const coldPatterns = [
    /\b(?:who is this|who are you|what.*this about|what company|what.*email)\b/i,
    /\b(?:wrong person|don't own|not my house|wrong address)\b/i,
  ];

  if (coldPatterns.some(p => p.test(lowerText))) {
    return {
      label: "cold_reply",
      confidence: 0.85,
      reasoning: "Cold reply - needs context",
      emotionalTone: "curious",
      urgencyScore: 0.3,
      actionRecommendation: "reply_today"
    };
  }

  // WARM LEAD 🟧 - Interest but not urgent
  const warmPatterns = [
    /\b(?:maybe|possibly|thinking about|considering|we'll see|might)\b/i,
    /\b(?:next week|next month|later|sometime|eventually)\b/i,
    /\b(?:tell me more|send info|more information|details)\b/i,
  ];

  if (warmPatterns.some(p => p.test(lowerText)) && 
      !hotPatterns.some(p => p.test(lowerText))) {
    return {
      label: "warm_lead",
      confidence: 0.75,
      reasoning: "Warm interest detected",
      emotionalTone: "curious",
      urgencyScore: 0.4,
      actionRecommendation: "nurture"
    };
  }

  // ============================================================================
  // AI CLASSIFICATION (For ambiguous cases)
  // ============================================================================

  try {
    const systemPrompt = `You are SmartSend Inbox AI v2 - an expert at classifying homeowner messages for roofing companies.

Classify the message into ONE of these 7 categories:

🔥 HOT LEAD - Homeowner expresses clear intent:
- "Yes," "Can you come tomorrow?", "What's the price?", "We need someone ASAP"
- Wants estimate, inspection, or immediate work
- These are money-in-hand leads ready to book NOW

🟧 WARM LEAD - Homeowner shows interest but not urgent:
- "Maybe next week", "Can you send details?", "Still deciding"
- Interested but not ready to commit immediately
- Good leads that need nurturing

❄️ COLD REPLY - Homeowner answered but not about roofing:
- "Who is this?", "What's this about?", "Wrong person"
- Needs context/explanation to turn into warm lead

💵 QUOTE REQUEST - Homeowner wants pricing:
- "How much?", "What do you charge?", "What's the cost?"
- Pricing questions (but not urgent booking intent)

📅 INSPECTION SCHEDULING - Homeowner wants to schedule:
- "When can you come?", "Are you available Wednesday?", "What times work?"
- Ready to book but asking about availability

🚫 NOT INTERESTED - Homeowner declines:
- "Not interested", "No thanks", "We're good", "Already handled"
- Should end conversation politely

✔️ APPOINTMENT CONFIRMED - Homeowner confirms a time:
- "That works", "See you tomorrow", "Confirmed", "Perfect"
- Appointment already set, just confirming

Return JSON:
{
  "label": "hot_lead|warm_lead|cold_reply|quote_request|inspection_scheduling|not_interested|appointment_confirmed",
  "confidence": 0.0-1.0,
  "reasoning": "brief explanation",
  "emotionalTone": "neutral|curious|urgent|annoyed|interested|frustrated",
  "urgencyScore": 0.0-1.0,
  "actionRecommendation": "call_now|reply_immediately|reply_today|nurture|close_out"
}`;

    const contextInfo = context?.previousMessages 
      ? `\n\nPrevious conversation context:\n${context.previousMessages.slice(-3).map(m => 
          `${m.direction === 'in' ? 'Homeowner' : 'Roofer'}: ${m.body.slice(0, 200)}`
        ).join('\n')}`
      : '';

    const userPrompt = `Classify this homeowner message for a roofing company:

Subject: ${subject || "(no subject)"}

Message:
${trimmed}${contextInfo}`;

    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" }
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const parsed = JSON.parse(content);
    const label = validateLabel(parsed.label) || "warm_lead";
    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.7)));
    const reasoning = parsed.reasoning || "AI classification";
    const emotionalTone = parsed.emotionalTone || "neutral";
    const urgencyScore = Math.max(0, Math.min(1, Number(parsed.urgencyScore ?? 0.5)));
    const actionRecommendation = parsed.actionRecommendation || "reply_today";

    return {
      label,
      confidence,
      reasoning,
      emotionalTone: emotionalTone as any,
      urgencyScore,
      actionRecommendation: actionRecommendation as any
    };

  } catch (error) {
    console.error("Error classifying inbox intent:", error);
    // Fallback to warm_lead if AI fails
    return {
      label: "warm_lead",
      confidence: 0.5,
      reasoning: `Classification error: ${error instanceof Error ? error.message : "Unknown error"}`,
      emotionalTone: "neutral",
      urgencyScore: 0.4,
      actionRecommendation: "reply_today"
    };
  }
}

function validateLabel(label: any): InboxIntentLabel | null {
  const validLabels: InboxIntentLabel[] = [
    "hot_lead",
    "warm_lead",
    "cold_reply",
    "quote_request",
    "inspection_scheduling",
    "not_interested",
    "appointment_confirmed"
  ];
  return validLabels.includes(label) ? label : null;
}






































