import OpenAI from "openai";
import { analyzeReplyIntelligence, ReplyIntelligenceResult } from "./replyBrainV2";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

// ============================================================================
// TYPES
// ============================================================================

export interface DraftVariant {
  tone: "direct" | "friendly" | "professional";
  text: string;
  subject?: string;
}

export interface AutoDraftResult {
  replyText: string;
  replySubject?: string;
  confidence: number;
  reason: string;
  category: string;
  tone: "direct" | "friendly" | "professional";
  variants: DraftVariant[];
}

export type QuickReplyType =
  | "yes"
  | "schedule"
  | "pricing"
  | "address"
  | "call"
  | "photos";

// ============================================================================
// PART 1: GENERATE AUTO-DRAFT REPLY
// ============================================================================

export async function generateAutoDraft(
  messageText: string,
  messageSubject: string | null,
  intelligence: ReplyIntelligenceResult,
  userSettings: {
    tone?: "direct" | "friendly" | "professional";
    industryVariant?: string;
  } = {}
): Promise<AutoDraftResult> {
  const tone = userSettings.tone || "professional";
  const category = intelligence.category;
  const urgencyScore = intelligence.urgencyScore || 0;

  // Build context for AI
  const contextPrompt = buildContextPrompt(intelligence, messageText, messageSubject);

  // Generate main draft
  const systemPrompt = `You are SmartSend AI Auto-Responder for roofing companies.

Your job: Generate a professional, helpful reply draft that homeowners can review and send.

CRITICAL RULES:
- Keep it SHORT (2-4 sentences max for direct tone, 3-5 for friendly/professional)
- NO commitments, promises, or scheduling details unless explicitly requested
- NO pricing unless they specifically asked
- Be helpful and friendly
- Address their specific question or concern
- End with a clear next step or question
- Use roofing industry language naturally
- Never use placeholders - write complete sentences

Tone: ${tone}
Category: ${category}
Urgency: ${urgencyScore > 0.7 ? "HIGH - urgent damage detected" : "Normal"}

${getCategorySpecificGuidance(category, urgencyScore)}`;

  const userPrompt = `Homeowner's message:
Subject: ${messageSubject || "(no subject)"}
Body: ${messageText}

Generate a ${tone} reply draft.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    max_tokens: 300,
  });

  const replyText = completion.choices[0]?.message?.content?.trim() || "";
  const replySubject = messageSubject ? `Re: ${messageSubject.replace(/^Re:\s*/i, "")}` : undefined;

  // Generate variants
  const variants = await generateDraftVariants(replyText, replySubject, intelligence, userSettings);

  // Calculate confidence
  const confidence = calculateDraftConfidence(intelligence, replyText);

  return {
    replyText,
    replySubject,
    confidence,
    reason: getReasonFromCategory(category, intelligence),
    category,
    tone,
    variants,
  };
}

// ============================================================================
// PART 2: GENERATE MULTI-DRAFT VARIANTS (3 TONES)
// ============================================================================

async function generateDraftVariants(
  baseText: string,
  baseSubject: string | undefined,
  intelligence: ReplyIntelligenceResult,
  userSettings: {
    tone?: "direct" | "friendly" | "professional";
  }
): Promise<DraftVariant[]> {
  const tones: Array<"direct" | "friendly" | "professional"> = ["direct", "friendly", "professional"];

  // If user already has a preferred tone, still generate all 3 but mark the default
  const variants: DraftVariant[] = [];

  for (const tone of tones) {
    if (tone === userSettings.tone) {
      // Use the base text for the user's preferred tone
      variants.push({
        tone,
        text: baseText,
        subject: baseSubject,
      });
    } else {
      // Generate variant for other tones
      const variant = await generateToneVariant(baseText, tone, intelligence);
      variants.push({
        tone,
        text: variant.text,
        subject: variant.subject || baseSubject,
      });
    }
  }

  return variants;
}

async function generateToneVariant(
  baseText: string,
  targetTone: "direct" | "friendly" | "professional",
  intelligence: ReplyIntelligenceResult
): Promise<{ text: string; subject?: string }> {
  const toneInstructions = {
    direct: "Rewrite this message to be MORE DIRECT and concise. Get straight to the point. 2-3 sentences max.",
    friendly: "Rewrite this message to be MORE FRIENDLY and conversational. Add warmth while keeping it professional.",
    professional: "Rewrite this message to be MORE PROFESSIONAL and formal. Use business-appropriate language.",
  };

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.7,
    messages: [
      {
        role: "system",
        content: `You are SmartSend AI. Rewrite email replies in different tones while keeping the same core message and intent.`,
      },
      {
        role: "user",
        content: `${toneInstructions[targetTone]}\n\nOriginal message:\n${baseText}`,
      },
    ],
    max_tokens: 250,
  });

  return {
    text: completion.choices[0]?.message?.content?.trim() || baseText,
  };
}

// ============================================================================
// PART 3: GENERATE QUICK REPLY BUTTONS
// ============================================================================

export async function generateQuickReply(
  quickReplyType: QuickReplyType,
  messageText: string,
  intelligence: ReplyIntelligenceResult,
  leadName?: string
): Promise<string> {
  const quickReplyTemplates: Record<QuickReplyType, string> = {
    yes: `Great! ${leadName ? `Thanks ${leadName.split(" ")[0]},` : "Thanks,"} we'd love to help. When would be a good time for us to come out and take a look?`,
    schedule: `Perfect! What day works best for you? We have availability this week and can work around your schedule.`,
    pricing: `I'd be happy to provide pricing information. To give you an accurate estimate, I'll need to see the roof. Can we schedule a time for me to come out?`,
    address: `Thanks for reaching out! To schedule an inspection, I'll need your address. Can you share that with me?`,
    call: `I'd love to chat! What's the best number to reach you at? I can call you today if that works.`,
    photos: `Photos would be really helpful! Can you send a few pictures of the area you're concerned about? That will help me give you a better assessment.`,
  };

  // Use template as base, but let AI personalize it
  const baseTemplate = quickReplyTemplates[quickReplyType];

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    temperature: 0.5,
    messages: [
      {
        role: "system",
        content: `You are SmartSend AI. Generate short, friendly quick replies for roofing companies. Keep it under 2 sentences.`,
      },
      {
        role: "user",
        content: `Generate a quick reply for: ${quickReplyType}\n\nBase template: ${baseTemplate}\n\nHomeowner's message: ${messageText}\n\nMake it natural and personalized.`,
      },
    ],
    max_tokens: 150,
  });

  return completion.choices[0]?.message?.content?.trim() || baseTemplate;
}

// ============================================================================
// PART 4: HELPER FUNCTIONS
// ============================================================================

function buildContextPrompt(
  intelligence: ReplyIntelligenceResult,
  messageText: string,
  messageSubject: string | null
): string {
  let context = `Message Analysis:
- Category: ${intelligence.category}
- Confidence: ${intelligence.confidence}
- Emotional Tone: ${intelligence.emotionalTone}
- Urgency Score: ${intelligence.urgencyScore || 0}`;

  if (intelligence.hasUrgentDamage) {
    context += `\n- URGENT: Damage detected (${intelligence.damageKeywords.join(", ")})`;
  }

  if (intelligence.hasBookingIntent) {
    context += `\n- Booking Intent: HIGH (${intelligence.bookingConfidence})`;
  }

  if (intelligence.hasInsuranceIntent) {
    context += `\n- Insurance Intent: YES (${intelligence.insuranceKeywords.join(", ")})`;
  }

  if (intelligence.extractedQuestions.length > 0) {
    context += `\n- Questions Asked: ${intelligence.extractedQuestions.map((q) => q.question).join("; ")}`;
  }

  return context;
}

function getCategorySpecificGuidance(category: string, urgencyScore: number): string {
  if (urgencyScore > 0.7) {
    return `URGENT DAMAGE DETECTED:
- Acknowledge the urgency immediately
- Offer immediate help
- Ask if they need emergency service
- Be empathetic and responsive`;
  }

  const guidance: Record<string, string> = {
    yes_wants_estimate: "They want an estimate. Offer to schedule an inspection.",
    yes_come_inspect: "They want an inspection. Provide availability and ask when works best.",
    insurance_claim_active: "They have an active insurance claim. Offer to help with the process.",
    adjuster_coming_soon: "Adjuster is coming. Offer to be present or provide documentation.",
    has_question: "They have questions. Answer directly and helpfully.",
    wants_pricing: "They want pricing. Explain you need to see the roof first, then offer inspection.",
    wants_availability: "They want to know availability. Provide specific times and ask what works.",
    urgent_roof_damage: "URGENT damage. Respond immediately with help and urgency.",
  };

  return guidance[category] || "Respond helpfully and professionally.";
}

function getReasonFromCategory(category: string, intelligence: ReplyIntelligenceResult): string {
  if (intelligence.hasUrgentDamage) {
    return "Urgent roof damage detected";
  }

  const reasons: Record<string, string> = {
    yes_wants_estimate: "Schedule inquiry",
    yes_come_inspect: "Inspection request",
    insurance_claim_active: "Insurance claim inquiry",
    adjuster_coming_soon: "Adjuster meeting",
    has_question: "Question asked",
    wants_pricing: "Pricing inquiry",
    wants_availability: "Availability inquiry",
    urgent_roof_damage: "Emergency repair needed",
  };

  return reasons[category] || "General inquiry";
}

function calculateDraftConfidence(intelligence: ReplyIntelligenceResult, replyText: string): number {
  let confidence = intelligence.confidence;

  // Boost confidence if reply is well-formed
  if (replyText.length > 50 && replyText.length < 400) {
    confidence += 0.1;
  }

  // Boost for urgent damage (we're more confident in these)
  if (intelligence.hasUrgentDamage) {
    confidence += 0.1;
  }

  // Reduce if reply is too short or too long
  if (replyText.length < 30) {
    confidence -= 0.2;
  }
  if (replyText.length > 500) {
    confidence -= 0.1;
  }

  return Math.max(0.5, Math.min(0.95, confidence));
}

// ============================================================================
// PART 5: GENERATE AFTER-HOURS SAFE REPLY
// ============================================================================

export function generateAfterHoursReply(isUrgent: boolean = false): string {
  if (isUrgent) {
    return `Thanks for reaching out! We'll take care of you first thing in the morning. If this is urgent (leak/storm damage), reply 'URGENT' and we'll prioritize you ASAP.`;
  }
  return `Thanks for reaching out! We'll take care of you first thing in the morning.`;
}

// ============================================================================
// PART 6: GENERATE HOT LEAD ESCALATION REPLY
// ============================================================================

export function generateHotLeadEscalation(): string {
  return `We're ready right away! When would be a good time for us to come out and take a look?`;
}



















































