/**
 * Block 24180 — SmartSend Roofing Inbox AI v2
 * AI Reply Generation Engine
 * 
 * Generates personalized replies that match roofer's writing style:
 * - Casual, Professional, Direct, or Soft tone
 * - Learns from past roofer messages
 * - Generates intent-specific replies
 * - Multiple variants for each intent
 */

import OpenAI from "openai";
import type { InboxIntentLabel } from "./classifyIntent";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export interface RooferStyleProfile {
  tone: "casual" | "professional" | "direct" | "soft";
  signature?: string;
  commonPhrases?: string[];
  vocabularyStyle?: "formal" | "conversational" | "technical" | "simple";
  sampleMessages?: Array<{ body: string; sent_at: string }>;
}

export interface ReplyGenerationOptions {
  intentLabel: InboxIntentLabel;
  messageText: string;
  subject?: string | null;
  homeownerName?: string;
  homeownerAddress?: string;
  rooferStyle?: RooferStyleProfile;
  previousMessages?: Array<{ direction: "in" | "out"; body: string; sent_at: string }>;
  variant?: number; // 1, 2, or 3 for multiple options
}

export interface GeneratedReply {
  subject: string;
  body: string;
  tone: string;
  variant: number;
  confidence: number;
}

/**
 * Generates an AI reply draft based on intent and roofer style
 */
export async function generateInboxReply(
  options: ReplyGenerationOptions
): Promise<GeneratedReply> {
  const {
    intentLabel,
    messageText,
    subject,
    homeownerName,
    homeownerAddress,
    rooferStyle,
    previousMessages,
    variant = 1
  } = options;

  const tone = rooferStyle?.tone || "professional";
  const signature = rooferStyle?.signature || "";

  // Build context from previous messages
  const conversationHistory = previousMessages
    ? previousMessages.slice(-5).map(m => 
        `${m.direction === 'in' ? 'Homeowner' : 'Roofer'}: ${m.body.slice(0, 300)}`
      ).join('\n\n')
    : '';

  // Build style guidance
  const styleGuidance = buildStyleGuidance(tone, rooferStyle);

  // Build intent-specific prompt
  const intentPrompt = buildIntentPrompt(intentLabel, variant);

  const systemPrompt = `You are SmartSend AI Reply Generator for roofing companies.

Your job: Write a ${tone} email reply that sounds EXACTLY like the roofer wrote it personally.

CRITICAL RULES:
- Match the roofer's writing style perfectly
- Keep it SHORT (2-4 sentences for direct/casual, 3-5 for professional/soft)
- Be helpful and move toward booking an inspection
- NO placeholders - write complete sentences
- NO emojis unless roofer uses them
- Address the homeowner by name if provided
- End with a clear next step

${styleGuidance}

${intentPrompt}`;

  const userPrompt = `Generate a ${tone} reply to this homeowner message:

Homeowner Name: ${homeownerName || "there"}
Property: ${homeownerAddress || "their property"}

Subject: ${subject || "(no subject)"}

Message:
${messageText}

${conversationHistory ? `\n\nPrevious conversation:\n${conversationHistory}` : ''}

${signature ? `\n\nRoofer's signature: ${signature}` : ''}

Write ONLY the email body. Start with "Hi ${homeownerName || "there"}" or similar greeting.`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      temperature: variant === 1 ? 0.7 : variant === 2 ? 0.8 : 0.9, // More variation for higher variants
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      max_tokens: 300
    });

    const body = response.choices[0]?.message?.content?.trim() || "";
    const replySubject = subject 
      ? `Re: ${subject.replace(/^Re:\s*/i, "")}`
      : "Re: Your roofing inquiry";

    return {
      subject: replySubject,
      body,
      tone,
      variant,
      confidence: 0.85
    };

  } catch (error) {
    console.error("Error generating reply:", error);
    // Fallback reply
    return {
      subject: subject ? `Re: ${subject}` : "Re: Your roofing inquiry",
      body: generateFallbackReply(intentLabel, homeownerName, tone),
      tone,
      variant,
      confidence: 0.5
    };
  }
}

/**
 * Builds style-specific guidance for the AI
 */
function buildStyleGuidance(
  tone: string,
  rooferStyle?: RooferStyleProfile
): string {
  const baseGuidance = {
    casual: `Tone: Casual and friendly
- Use "Hey" or "Hi" instead of "Hello"
- Use contractions (we're, I'll, can't)
- Keep it conversational like texting a friend
- Use phrases like "swing by", "take a look", "get you on the schedule"
- No formal language`,
    
    professional: `Tone: Professional and courteous
- Use "Hi" or "Hello" 
- More formal but still friendly
- Use complete sentences
- Professional roofing terminology
- Polite and respectful`,
    
    direct: `Tone: Direct and to the point
- Short sentences
- No fluff
- Get straight to the point
- Ask direct questions
- Clear next steps`,
    
    soft: `Tone: Gentle and accommodating
- Very friendly and warm
- Use phrases like "Let me know", "We're flexible", "Whatever works for you"
- Softer language
- More accommodating tone`
  };

  let guidance = baseGuidance[tone as keyof typeof baseGuidance] || baseGuidance.professional;

  // Add roofer-specific phrases if available
  if (rooferStyle?.commonPhrases && rooferStyle.commonPhrases.length > 0) {
    guidance += `\n\nUse these phrases the roofer commonly uses:\n${rooferStyle.commonPhrases.slice(0, 5).join(', ')}`;
  }

  // Add vocabulary style
  if (rooferStyle?.vocabularyStyle) {
    const vocabGuidance = {
      formal: "Use formal vocabulary and complete sentences.",
      conversational: "Use everyday language, like talking to a neighbor.",
      technical: "Use roofing terminology naturally (shingles, flashing, underlayment).",
      simple: "Use simple words anyone can understand."
    };
    guidance += `\n\n${vocabGuidance[rooferStyle.vocabularyStyle]}`;
  }

  return guidance;
}

/**
 * Builds intent-specific prompt guidance
 */
function buildIntentPrompt(intentLabel: InboxIntentLabel, variant: number): string {
  const prompts = {
    hot_lead: `Intent: HOT LEAD 🔥
- Homeowner wants to book NOW
- Offer immediate availability (today/tomorrow)
- Be enthusiastic and ready to help
- Suggest specific times if possible
- Move toward booking inspection`,
    
    warm_lead: `Intent: WARM LEAD 🟧
- Homeowner is interested but not urgent
- Nurture the relationship
- Provide helpful information
- Suggest checking back later
- Keep door open for future`,
    
    cold_reply: `Intent: COLD REPLY ❄️
- Homeowner doesn't understand context
- Explain who you are and why you're reaching out
- Be friendly and helpful
- Turn cold into warm by providing value`,
    
    quote_request: `Intent: QUOTE REQUEST 💵
- Homeowner wants pricing
- Explain: "Inspection first → price after"
- Offer free inspection
- Don't give numbers without seeing the roof
- Move toward scheduling inspection`,
    
    inspection_scheduling: `Intent: INSPECTION SCHEDULING 📅
- Homeowner wants to schedule
- Offer 2-3 specific time slots
- Be flexible and accommodating
- Make it easy to book
- Confirm next steps`,
    
    not_interested: `Intent: NOT INTERESTED 🚫
- Homeowner declined
- Be respectful and polite
- Leave door open: "If anything changes, just reply"
- End conversation gracefully
- Keep it SHORT (2-3 sentences max)`,
    
    appointment_confirmed: `Intent: APPOINTMENT CONFIRMED ✔️
- Homeowner confirmed appointment
- Acknowledge confirmation
- Provide any final details (address, what to expect)
- Express looking forward to meeting
- Keep it brief and professional`
  };

  const basePrompt = prompts[intentLabel];
  
  if (variant > 1) {
    return `${basePrompt}\n\nVariant ${variant}: Write a slightly different version - same intent but different wording/phrasing.`;
  }

  return basePrompt;
}

/**
 * Generates a fallback reply if AI fails
 */
function generateFallbackReply(
  intentLabel: InboxIntentLabel,
  homeownerName?: string,
  tone: string = "professional"
): string {
  const greeting = tone === "casual" 
    ? `Hey ${homeownerName || "there"}`
    : `Hi ${homeownerName || "there"}`;

  const replies = {
    hot_lead: `${greeting},\n\nThanks for reaching out! We can definitely help with that.\n\nI can get someone out today or tomorrow to take a look and get you a quote. What time works best for you?\n\nBest,`,
    
    warm_lead: `${greeting},\n\nThanks for your interest! I'd be happy to help whenever you're ready.\n\nIf you'd like, I can send over some more information or we can schedule a free inspection when it works for you.\n\nLet me know!\n\nBest,`,
    
    cold_reply: `${greeting},\n\nThanks for getting back to me! I'm reaching out about your roof - we're a local roofing company and I wanted to see if you need any help.\n\nIf you'd like, I can take a look and give you a free estimate. Just let me know!\n\nBest,`,
    
    quote_request: `${greeting},\n\nThanks for asking about pricing!\n\nWe do free inspections first so we can see exactly what's needed before giving you a price. Want me to come out and take a look this week?\n\nBest,`,
    
    inspection_scheduling: `${greeting},\n\nGreat! I'd be happy to come out for an inspection.\n\nI'm available tomorrow afternoon or Thursday morning. What works better for you?\n\nBest,`,
    
    not_interested: `${greeting},\n\nNo worries at all - thanks for letting me know.\n\nIf anything changes or a leak pops up, just reply here. We're always around.\n\nBest,`,
    
    appointment_confirmed: `${greeting},\n\nPerfect! Looking forward to meeting you.\n\nI'll see you then. If anything comes up, just let me know.\n\nBest,`
  };

  return replies[intentLabel] || replies.warm_lead;
}

/**
 * Generates multiple reply variants (for user to choose from)
 */
export async function generateReplyVariants(
  options: ReplyGenerationOptions
): Promise<GeneratedReply[]> {
  const variants: GeneratedReply[] = [];
  
  for (let i = 1; i <= 3; i++) {
    const variant = await generateInboxReply({ ...options, variant: i });
    variants.push(variant);
  }
  
  return variants;
}






































