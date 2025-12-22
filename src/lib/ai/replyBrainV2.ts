import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// ============================================================================
// TYPES
// ============================================================================

export type ReplyCategoryV2 =
  // 🔥 HOT LEADS
  | "yes_wants_estimate"
  | "yes_come_inspect"
  | "booking_link_clicked"
  | "insurance_claim_active"
  | "adjuster_coming_soon"
  // 🟡 WARM LEADS
  | "has_question"
  | "wants_pricing"
  | "wants_availability"
  | "wants_more_info"
  | "needs_photos"
  | "considering_not_sure"
  // 🔵 COLD LEADS
  | "not_now_maybe_later"
  | "checking_around"
  | "already_got_quotes"
  // 🔴 HARD NO
  | "not_interested"
  | "wrong_person"
  | "stop_messaging"
  // ⚠ SPECIAL FLAGS
  | "urgent_roof_damage";

export type EmotionalTone =
  | "neutral"
  | "curious"
  | "confused"
  | "annoyed"
  | "interested"
  | "excited"
  | "urgent"
  | "frustrated"
  | "skeptical"
  | "demanding";

export type QuestionType =
  | "availability"
  | "pricing"
  | "inspection"
  | "insurance"
  | "process"
  | "timeline"
  | "warranty"
  | "materials"
  | "other";

export type ObjectionType =
  | "price_too_high"
  | "getting_other_quotes"
  | "not_needed"
  | "wrong_person"
  | "timing"
  | "competitor"
  | "other";

export interface ExtractedQuestion {
  question: string;
  type: QuestionType;
  confidence: number;
}

export interface SuggestedAction {
  action: string;
  priority: number; // 1-10, higher = more important
  reasoning: string;
}

export interface ReplyIntelligenceResult {
  // Core Classification
  category: ReplyCategoryV2;
  confidence: number;
  
  // Emotional Tone Detection
  emotionalTone: EmotionalTone;
  toneConfidence: number;
  
  // Question Extraction
  extractedQuestions: ExtractedQuestion[];
  
  // Insurance Intent Recognition
  hasInsuranceIntent: boolean;
  insuranceKeywords: string[];
  insuranceConfidence: number;
  
  // Booking Intent Detection
  hasBookingIntent: boolean;
  bookingConfidence: number;
  
  // Objection Detection
  hasObjection: boolean;
  objectionType?: ObjectionType;
  objectionText?: string;
  
  // Urgent Roof Damage Detection
  hasUrgentDamage: boolean;
  damageKeywords: string[];
  urgencyScore: number;
  
  // Auto-Suggestions
  suggestedActions: SuggestedAction[];
  suggestedReplyTemplates: string[];
  
  // Pipeline Movement
  suggestedPipelineStage: "HOT" | "WARM" | "COLD" | "NOT_INTERESTED";
  
  // Tags to add
  suggestedTags: string[];
  
  // Raw AI Response
  rawAiResponse: any;
  
  // Reasoning
  reasoning: string;
}

// ============================================================================
// MAIN CLASSIFICATION FUNCTION
// ============================================================================

/**
 * SmartSend AI Reply Brain v2
 * 
 * Comprehensive analysis of homeowner replies including:
 * - 18-category classification
 * - Emotional tone detection
 * - Question extraction
 * - Insurance intent recognition
 * - Booking intent detection
 * - Objection detection
 * - Auto-suggestions for next steps
 */
export async function analyzeReplyIntelligence(
  text: string,
  subject?: string
): Promise<ReplyIntelligenceResult> {
  const fullText = [subject, text].filter(Boolean).join("\n\n");
  const trimmed = fullText.trim().slice(0, 4000);

  if (!trimmed) {
    return getDefaultResult("has_question", "neutral", "Empty message");
  }

  // Quick rule-based checks for high-confidence cases
  const lowerText = trimmed.toLowerCase();
  
  // Check for urgent roof damage first (highest priority)
  const urgentDamagePatterns = [
    /\b(?:leak|leaking|water|hole|shingles?\s+blown|damage|emergency|urgent|asap)\b/i,
  ];
  const hasUrgentDamage = urgentDamagePatterns.some(p => p.test(lowerText));
  
  // Check for insurance keywords
  const insurancePatterns = [
    /\b(?:adjuster|claim|insurance|deductible|acv|rcv|coverage|carrier|filed\s+a\s+claim)\b/i,
  ];
  const hasInsuranceKeywords = insurancePatterns.some(p => p.test(lowerText));
  
  // Check for booking intent
  const bookingPatterns = [
    /\b(?:can\s+you\s+come|when\s+can\s+you|stop\s+by|check\s+it|inspect|tomorrow\s+works|book|schedule|appointment)\b/i,
  ];
  const hasBookingKeywords = bookingPatterns.some(p => p.test(lowerText));

  // Use AI for comprehensive analysis
  try {
    const systemPrompt = `You are SmartSend AI Reply Brain v2 - a comprehensive roofing communication intelligence system.

Analyze homeowner replies and extract EVERYTHING:

1. CLASSIFY into ONE of 18 categories:
   🔥 HOT LEADS:
   - yes_wants_estimate: "I want an estimate" / "Can you quote?"
   - yes_come_inspect: "Come inspect" / "Can you come look?"
   - booking_link_clicked: They clicked a booking link
   - insurance_claim_active: "I filed a claim" / "Insurance said..."
   - adjuster_coming_soon: "Adjuster is coming" / "Meeting with adjuster"
   
   🟡 WARM LEADS:
   - has_question: Asking questions (but not ready to book)
   - wants_pricing: "How much?" / "What do you charge?"
   - wants_availability: "When are you available?"
   - wants_more_info: "Tell me more" / "Send info"
   - needs_photos: "Can you send photos?" / "Show me examples"
   - considering_not_sure: "Thinking about it" / "Not sure yet"
   
   🔵 COLD LEADS:
   - not_now_maybe_later: "Not now, maybe later"
   - checking_around: "Checking around" / "Getting quotes"
   - already_got_quotes: "Already got quotes" / "Already have someone"
   
   🔴 HARD NO:
   - not_interested: "Not interested" / "No thanks"
   - wrong_person: "Wrong person" / "Don't own this"
   - stop_messaging: "Stop emailing" / "Remove me"
   
   ⚠ SPECIAL FLAGS:
   - urgent_roof_damage: Mentions leaking, water, hole, shingles blown off, etc.

2. DETECT EMOTIONAL TONE (one of):
   neutral, curious, confused, annoyed, interested, excited, urgent, frustrated, skeptical, demanding

3. EXTRACT ALL QUESTIONS:
   - Find every question mark and question phrase
   - Categorize each: availability, pricing, inspection, insurance, process, timeline, warranty, materials, other
   - Include the exact question text

4. DETECT INSURANCE INTENT:
   - Look for: adjuster, claim, insurance, deductible, ACV, RCV, coverage, carrier, "filed a claim"
   - Return keywords found and confidence

5. DETECT BOOKING INTENT:
   - Look for: "can you come", "when can you", "stop by", "check it", "inspect", "tomorrow works", "book", "schedule"
   - Return confidence

6. DETECT OBJECTIONS:
   - price_too_high: "Too expensive" / "That's a lot"
   - financing_needed: "Can't afford it" / "Too expensive" / "Do you have payments?" / "We can't afford it" / "Need financing" / "Payment plans?"
   - getting_other_quotes: "Getting other quotes" / "Checking around"
   - not_needed: "Don't need a new roof" / "Roof is fine"
   - wrong_person: "Wrong person" / "My husband handles this"
   - timing: "Not now" / "Maybe later"
   - competitor: Mentions another company
   - other: Other objections

7. DETECT URGENT ROOF DAMAGE:
   - Keywords: leaking, water, hole, shingles blown off, emergency, urgent
   - Return keywords and urgency score

8. GENERATE AUTO-SUGGESTIONS:
   - Suggest 3-5 next actions (e.g., "Offer inspection availability tomorrow", "Send booking link", "Answer pricing question")
   - Priority 1-10 (higher = more important)
   - Include reasoning

9. SUGGEST PIPELINE STAGE:
   - HOT: Booking intent, insurance intent, urgent damage, yes to inspection
   - WARM: Questions, wants info, considering
   - COLD: Not now, checking around, already got quotes
   - NOT_INTERESTED: Hard no, wrong person, stop messaging

10. SUGGEST TAGS:
    - insurance-opportunity (if insurance intent)
    - ready-to-book (if booking intent)
    - urgent-damage (if urgent damage)
    - Add other relevant tags

Return JSON with this structure:
{
  "category": "yes_come_inspect",
  "confidence": 0.95,
  "emotionalTone": "urgent",
  "toneConfidence": 0.92,
  "extractedQuestions": [
    {"question": "When are you available?", "type": "availability", "confidence": 0.98}
  ],
  "hasInsuranceIntent": false,
  "insuranceKeywords": [],
  "insuranceConfidence": 0.0,
  "hasBookingIntent": true,
  "bookingConfidence": 0.95,
  "hasObjection": false,
  "objectionType": null,
  "objectionText": null,
  "needsFinancingOffer": false,
  "hasUrgentDamage": true,
  "damageKeywords": ["leaking", "water"],
  "urgencyScore": 0.97,
  "suggestedActions": [
    {"action": "Offer inspection availability tomorrow", "priority": 10, "reasoning": "Urgent damage + booking intent"}
  ],
  "suggestedReplyTemplates": ["urgent-inspection-offer"],
  "suggestedPipelineStage": "HOT",
  "suggestedTags": ["urgent-damage", "ready-to-book"],
  "reasoning": "Homeowner has urgent roof damage and wants inspection immediately"
}`;

    const userPrompt = `Analyze this homeowner reply for a roofing company:

Subject: ${subject || "(no subject)"}

Message:
${trimmed}

Provide comprehensive intelligence analysis.`;

    const startTime = Date.now();
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: 0,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      response_format: { type: "json_object" }
    });

    const processingTime = Date.now() - startTime;
    const content = response.choices[0]?.message?.content;
    
    if (!content) {
      throw new Error("No response from OpenAI");
    }

    const parsed = JSON.parse(content);
    
    // Validate and normalize the response
    const result: ReplyIntelligenceResult = {
      category: validateCategory(parsed.category) || "has_question",
      confidence: Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.7))),
      
      emotionalTone: validateTone(parsed.emotionalTone) || "neutral",
      toneConfidence: Math.max(0, Math.min(1, Number(parsed.toneConfidence ?? 0.7))),
      
      extractedQuestions: Array.isArray(parsed.extractedQuestions) 
        ? parsed.extractedQuestions.map((q: any) => ({
            question: String(q.question || ""),
            type: validateQuestionType(q.type) || "other",
            confidence: Math.max(0, Math.min(1, Number(q.confidence ?? 0.7)))
          }))
        : [],
      
      hasInsuranceIntent: Boolean(parsed.hasInsuranceIntent || hasInsuranceKeywords),
      insuranceKeywords: Array.isArray(parsed.insuranceKeywords) 
        ? parsed.insuranceKeywords 
        : hasInsuranceKeywords 
          ? extractInsuranceKeywords(lowerText)
          : [],
      insuranceConfidence: Math.max(0, Math.min(1, Number(parsed.insuranceConfidence ?? (hasInsuranceKeywords ? 0.8 : 0.0)))),
      
      hasBookingIntent: Boolean(parsed.hasBookingIntent || hasBookingKeywords),
      bookingConfidence: Math.max(0, Math.min(1, Number(parsed.bookingConfidence ?? (hasBookingKeywords ? 0.8 : 0.0)))),
      
      hasObjection: Boolean(parsed.hasObjection),
      objectionType: parsed.objectionType ? validateObjectionType(parsed.objectionType) : undefined,
      objectionText: parsed.objectionText || undefined,
      
      hasUrgentDamage: Boolean(parsed.hasUrgentDamage || hasUrgentDamage),
      damageKeywords: Array.isArray(parsed.damageKeywords) 
        ? parsed.damageKeywords 
        : hasUrgentDamage 
          ? extractDamageKeywords(lowerText)
          : [],
      urgencyScore: Math.max(0, Math.min(1, Number(parsed.urgencyScore ?? (hasUrgentDamage ? 0.9 : 0.0)))),
      
      suggestedActions: Array.isArray(parsed.suggestedActions)
        ? parsed.suggestedActions.map((a: any) => ({
            action: String(a.action || ""),
            priority: Math.max(1, Math.min(10, Number(a.priority ?? 5))),
            reasoning: String(a.reasoning || "")
          }))
        : [],
      
      suggestedReplyTemplates: Array.isArray(parsed.suggestedReplyTemplates)
        ? parsed.suggestedReplyTemplates
        : [],
      
      suggestedPipelineStage: validatePipelineStage(parsed.suggestedPipelineStage) || "WARM",
      
      suggestedTags: Array.isArray(parsed.suggestedTags) ? parsed.suggestedTags : [],
      
      rawAiResponse: parsed,
      
      reasoning: String(parsed.reasoning || "AI classification")
    };

    // Override category if urgent damage detected
    if (result.hasUrgentDamage && result.category !== "urgent_roof_damage") {
      result.category = "urgent_roof_damage";
      result.confidence = Math.max(result.confidence, 0.9);
    }

    return result;

  } catch (error) {
    console.error("Error analyzing reply intelligence:", error);
    // Fallback to rule-based classification
    return getFallbackResult(trimmed, lowerText);
  }
}

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

function validateCategory(category: any): ReplyCategoryV2 | null {
  const validCategories: ReplyCategoryV2[] = [
    "yes_wants_estimate",
    "yes_come_inspect",
    "booking_link_clicked",
    "insurance_claim_active",
    "adjuster_coming_soon",
    "has_question",
    "wants_pricing",
    "wants_availability",
    "wants_more_info",
    "needs_photos",
    "considering_not_sure",
    "not_now_maybe_later",
    "checking_around",
    "already_got_quotes",
    "not_interested",
    "wrong_person",
    "stop_messaging",
    "urgent_roof_damage"
  ];
  return validCategories.includes(category) ? category : null;
}

function validateTone(tone: any): EmotionalTone | null {
  const validTones: EmotionalTone[] = [
    "neutral", "curious", "confused", "annoyed", "interested",
    "excited", "urgent", "frustrated", "skeptical", "demanding"
  ];
  return validTones.includes(tone) ? tone : null;
}

function validateQuestionType(type: any): QuestionType | null {
  const validTypes: QuestionType[] = [
    "availability", "pricing", "inspection", "insurance", "process",
    "timeline", "warranty", "materials", "other"
  ];
  return validTypes.includes(type) ? type : null;
}

function validateObjectionType(type: any): ObjectionType | null {
  const validTypes: ObjectionType[] = [
    "price_too_high", "getting_other_quotes", "not_needed",
    "wrong_person", "timing", "competitor", "other"
  ];
  return validTypes.includes(type) ? type : null;
}

function validatePipelineStage(stage: any): "HOT" | "WARM" | "COLD" | "NOT_INTERESTED" | null {
  const validStages = ["HOT", "WARM", "COLD", "NOT_INTERESTED"];
  return validStages.includes(stage) ? stage : null;
}

function extractInsuranceKeywords(text: string): string[] {
  const keywords: string[] = [];
  const patterns = [
    { pattern: /\badjuster\b/i, keyword: "adjuster" },
    { pattern: /\bclaim\b/i, keyword: "claim" },
    { pattern: /\binsurance\b/i, keyword: "insurance" },
    { pattern: /\bdeductible\b/i, keyword: "deductible" },
    { pattern: /\bacv\b/i, keyword: "ACV" },
    { pattern: /\brcv\b/i, keyword: "RCV" },
    { pattern: /\bcoverage\b/i, keyword: "coverage" },
    { pattern: /\bcarrier\b/i, keyword: "carrier" },
  ];
  
  patterns.forEach(({ pattern, keyword }) => {
    if (pattern.test(text) && !keywords.includes(keyword)) {
      keywords.push(keyword);
    }
  });
  
  return keywords;
}

function extractDamageKeywords(text: string): string[] {
  const keywords: string[] = [];
  const patterns = [
    { pattern: /\bleak|leaking\b/i, keyword: "leaking" },
    { pattern: /\bwater\b/i, keyword: "water" },
    { pattern: /\bhole\b/i, keyword: "hole" },
    { pattern: /\bshingles?\s+blown\b/i, keyword: "shingles blown off" },
    { pattern: /\bdamage\b/i, keyword: "damage" },
    { pattern: /\bemergency\b/i, keyword: "emergency" },
    { pattern: /\burgent\b/i, keyword: "urgent" },
  ];
  
  patterns.forEach(({ pattern, keyword }) => {
    if (pattern.test(text) && !keywords.includes(keyword)) {
      keywords.push(keyword);
    }
  });
  
  return keywords;
}

function getDefaultResult(
  category: ReplyCategoryV2,
  tone: EmotionalTone,
  reasoning: string
): ReplyIntelligenceResult {
  return {
    category,
    confidence: 0.5,
    emotionalTone: tone,
    toneConfidence: 0.5,
    extractedQuestions: [],
    hasInsuranceIntent: false,
    insuranceKeywords: [],
    insuranceConfidence: 0.0,
    hasBookingIntent: false,
    bookingConfidence: 0.0,
    hasObjection: false,
    hasUrgentDamage: false,
    damageKeywords: [],
    urgencyScore: 0.0,
    suggestedActions: [],
    suggestedReplyTemplates: [],
    suggestedPipelineStage: "WARM",
    suggestedTags: [],
    rawAiResponse: {},
    reasoning
  };
}

function getFallbackResult(text: string, lowerText: string): ReplyIntelligenceResult {
  // Rule-based fallback classification
  let category: ReplyCategoryV2 = "has_question";
  let tone: EmotionalTone = "neutral";
  let pipelineStage: "HOT" | "WARM" | "COLD" | "NOT_INTERESTED" = "WARM";
  
  // Check for urgent damage
  if (/\b(?:leak|leaking|water|hole|emergency|urgent)\b/i.test(lowerText)) {
    category = "urgent_roof_damage";
    tone = "urgent";
    pipelineStage = "HOT";
  }
  // Check for booking intent
  else if (/\b(?:can\s+you\s+come|when\s+can\s+you|inspect|appointment)\b/i.test(lowerText)) {
    category = "yes_come_inspect";
    tone = "interested";
    pipelineStage = "HOT";
  }
  // Check for not interested
  else if (/\b(?:not\s+interested|no\s+thanks|stop\s+emailing)\b/i.test(lowerText)) {
    category = "not_interested";
    tone = "annoyed";
    pipelineStage = "NOT_INTERESTED";
  }
  // Check for pricing question
  else if (/\b(?:how\s+much|what.*cost|price|pricing)\b/i.test(lowerText)) {
    category = "wants_pricing";
    tone = "curious";
    pipelineStage = "WARM";
  }
  
  return {
    ...getDefaultResult(category, tone, "Rule-based fallback classification"),
    suggestedPipelineStage: pipelineStage
  };
}




















