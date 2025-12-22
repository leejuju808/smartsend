// Block 24900 — Follow-Up Brain v2: NLP Reply Detection
// Detects 5 types of homeowner replies: Hot Lead, Warm Lead, Not Ready, Objection, Not Interested

import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export type DetectionType = 
  | 'hot_lead'
  | 'warm_lead'
  | 'not_ready'
  | 'objection'
  | 'not_interested';

export type HomeownerTone = 
  | 'decisive'
  | 'nervous'
  | 'logical'
  | 'curious'
  | 'frustrated'
  | 'neutral';

export interface NLPDetectionResult {
  detection_type: DetectionType;
  confidence_score: number;
  detected_phrases: string[];
  detected_intent: string;
  homeowner_tone: HomeownerTone;
  urgency_level: number;
  extracted_info: Record<string, any>;
}

// Hot Lead Intent Phrases
const HOT_LEAD_PHRASES = [
  /how soon can you come/i,
  /what's your availability/i,
  /can you take a look tomorrow/i,
  /we have a leak/i,
  /we need someone asap/i,
  /urgent/i,
  /emergency/i,
  /as soon as possible/i,
  /today or tomorrow/i,
  /when can you come/i,
  /need help now/i,
  /water coming in/i,
  /roof leaking/i,
];

// Warm Lead Phrases
const WARM_LEAD_PHRASES = [
  /can you send options/i,
  /i'm comparing quotes/i,
  /what's the price range/i,
  /tell me more/i,
  /interested/i,
  /sounds good/i,
  /let's talk/i,
  /how much/i,
  /what do you charge/i,
  /get a quote/i,
  /estimate/i,
];

// Not Ready Phrases
const NOT_READY_PHRASES = [
  /maybe next month/i,
  /we're waiting for insurance/i,
  /we're not sure yet/i,
  /not right now/i,
  /later/i,
  /waiting for/i,
  /insurance adjuster/i,
  /still deciding/i,
];

// Objection Phrases
const OBJECTION_PHRASES = [
  /too expensive/i,
  /we already have someone/i,
  /not right now/i,
  /can't afford/i,
  /out of budget/i,
  /got another quote/i,
  /already hired/i,
];

// Not Interested Phrases
const NOT_INTERESTED_PHRASES = [
  /stop emailing/i,
  /no thanks/i,
  /not interested/i,
  /remove me/i,
  /unsubscribe/i,
  /don't contact/i,
];

/**
 * Detects the type of homeowner reply using NLP
 */
export async function detectReplyType(
  replyText: string,
  subject?: string
): Promise<NLPDetectionResult> {
  const fullText = `${subject || ''} ${replyText}`.trim().toLowerCase();

  // Quick rule-based detection for high-confidence cases
  const quickDetection = quickDetect(fullText);
  if (quickDetection) {
    return quickDetection;
  }

  // Use AI for more nuanced detection
  return await aiDetect(replyText, subject);
}

/**
 * Quick rule-based detection for obvious cases
 */
function quickDetect(text: string): NLPDetectionResult | null {
  // Check for hot leads (highest priority)
  for (const phrase of HOT_LEAD_PHRASES) {
    if (phrase.test(text)) {
      return {
        detection_type: 'hot_lead',
        confidence_score: 0.95,
        detected_phrases: [text.match(phrase)?.[0] || ''],
        detected_intent: 'urgent_request',
        homeowner_tone: 'decisive',
        urgency_level: 9,
        extracted_info: {},
      };
    }
  }

  // Check for not interested (stop processing)
  for (const phrase of NOT_INTERESTED_PHRASES) {
    if (phrase.test(text)) {
      return {
        detection_type: 'not_interested',
        confidence_score: 0.98,
        detected_phrases: [text.match(phrase)?.[0] || ''],
        detected_intent: 'unsubscribe',
        homeowner_tone: 'frustrated',
        urgency_level: 1,
        extracted_info: {},
      };
    }
  }

  return null;
}

/**
 * AI-powered detection for nuanced cases
 */
async function aiDetect(
  replyText: string,
  subject?: string
): Promise<NLPDetectionResult> {
  const prompt = `You are SmartSend's Follow-Up Brain v2 NLP Detection Engine.

Analyze this homeowner email reply and classify it into ONE of these 5 types:

1. hot_lead - Urgent requests, immediate needs, "come today/tomorrow", leaks, emergencies
2. warm_lead - Interested, asking questions, comparing quotes, wants info
3. not_ready - Waiting for insurance, "maybe later", "not sure yet", timing issues
4. objection - Price concerns, already has contractor, budget issues
5. not_interested - Explicit rejection, unsubscribe requests, "stop emailing"

Also detect:
- homeowner_tone: decisive, nervous, logical, curious, frustrated, neutral
- urgency_level: 1-10 (10 = most urgent)
- detected_intent: specific intent (e.g., "urgent_leak", "price_question", "insurance_wait")

Return STRICT JSON only:
{
  "detection_type": "hot_lead" | "warm_lead" | "not_ready" | "objection" | "not_interested",
  "confidence_score": 0.0-1.0,
  "detected_phrases": ["array", "of", "key", "phrases"],
  "detected_intent": "specific intent string",
  "homeowner_tone": "decisive" | "nervous" | "logical" | "curious" | "frustrated" | "neutral",
  "urgency_level": 1-10,
  "extracted_info": {
    "dates": [],
    "prices": [],
    "other": {}
  }
}

Email to analyze:
Subject: ${subject || '(none)'}
Body: ${replyText.slice(0, 2000)}`;

  try {
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.3,
      response_format: { type: "json_object" },
    });

    const raw = completion.choices[0].message.content || "{}";
    const parsed = JSON.parse(raw);

    return {
      detection_type: parsed.detection_type || 'warm_lead',
      confidence_score: Math.max(0, Math.min(1, parsed.confidence_score || 0.7)),
      detected_phrases: parsed.detected_phrases || [],
      detected_intent: parsed.detected_intent || 'unknown',
      homeowner_tone: parsed.homeowner_tone || 'neutral',
      urgency_level: Math.max(1, Math.min(10, parsed.urgency_level || 5)),
      extracted_info: parsed.extracted_info || {},
    };
  } catch (error) {
    console.error('Error in AI detection:', error);
    // Fallback to warm_lead if AI fails
    return {
      detection_type: 'warm_lead',
      confidence_score: 0.5,
      detected_phrases: [],
      detected_intent: 'unknown',
      homeowner_tone: 'neutral',
      urgency_level: 5,
      extracted_info: {},
    };
  }
}

/**
 * Determines the appropriate follow-up mode based on detection and tone
 */
export function determineFollowUpMode(
  detection: NLPDetectionResult
): 'direct' | 'reassurance' | 'authority' | 'revival' {
  // Hot leads → Direct mode
  if (detection.detection_type === 'hot_lead') {
    return 'direct';
  }

  // Nervous tone → Reassurance mode
  if (detection.homeowner_tone === 'nervous') {
    return 'reassurance';
  }

  // Logical tone → Authority mode
  if (detection.homeowner_tone === 'logical') {
    return 'authority';
  }

  // Not ready or dormant → Revival mode
  if (detection.detection_type === 'not_ready' || detection.detection_type === 'not_interested') {
    return 'revival';
  }

  // Default: Direct mode for warm leads
  return 'direct';
}






































