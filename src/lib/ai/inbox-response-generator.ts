// Block 81000 — Auto-Response Generator
// Generates 3 perfect reply options in different tones for SmartSend Roofing

import OpenAI from 'openai';
import { IntentClassification, IntentCategory } from './inbox-intelligence-engine';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type ResponseTone = 'friendly' | 'professional' | 'contractor';

export interface GeneratedResponse {
  text: string;
  tone: ResponseTone;
  variant: 1 | 2 | 3;
  confidence: number;
}

export interface ResponseGenerationContext {
  messageBody: string;
  subject?: string | null;
  intent: IntentClassification;
  leadName?: string;
  leadEmail?: string;
  previousMessages?: Array<{ direction: 'inbound' | 'outbound'; body: string; sent_at: string }>;
  rooferName?: string;
  rooferCompany?: string;
}

/**
 * Generates 3 response variants in the specified tone
 */
export async function generateResponses(
  context: ResponseGenerationContext,
  tone: ResponseTone = 'friendly'
): Promise<GeneratedResponse[]> {
  const responses: GeneratedResponse[] = [];
  
  // Generate 3 variants
  for (let variant = 1; variant <= 3; variant++) {
    const response = await generateSingleResponse(context, tone, variant as 1 | 2 | 3);
    responses.push(response);
  }
  
  return responses;
}

/**
 * Generates a single response variant
 */
async function generateSingleResponse(
  context: ResponseGenerationContext,
  tone: ResponseTone,
  variant: 1 | 2 | 3
): Promise<GeneratedResponse> {
  const systemPrompt = buildSystemPrompt(tone, context.intent.intent);
  const userPrompt = buildUserPrompt(context, variant);

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: variant === 1 ? 0.7 : variant === 2 ? 0.8 : 0.9, // More variation for higher variants
      max_tokens: 300,
    });

    const text = completion.choices[0]?.message?.content?.trim() || '';
    
    return {
      text: cleanResponse(text),
      tone,
      variant,
      confidence: 0.85,
    };
  } catch (error) {
    console.error('Error generating response:', error);
    return {
      text: generateFallbackResponse(context, tone),
      tone,
      variant,
      confidence: 0.5,
    };
  }
}

/**
 * Builds system prompt based on tone and intent
 */
function buildSystemPrompt(tone: ResponseTone, intent: IntentCategory): string {
  const toneGuidance = {
    friendly: `You are a friendly, approachable roofing contractor assistant. Write in a warm, conversational tone. Use "Hey" or "Hi" to start. Be helpful and personable. Keep it casual but professional.`,
    professional: `You are a professional roofing contractor assistant. Write in a polished, business-like tone. Use "Hi" or "Hello" to start. Be courteous and efficient. Maintain professional standards.`,
    contractor: `You are a straightforward roofing contractor. Write in a direct, no-nonsense tone. Get to the point quickly. Be honest and practical. Use contractor language that homeowners trust.`,
  };

  const intentGuidance: Record<IntentCategory, string> = {
    'Hot Lead': 'This is a HOT LEAD. Respond quickly but calm and confident. Assume you are busy (no desperation). Offer next available inspection windows (not "ASAP"). Avoid rush language.',
    'Warm Lead': 'This is a WARM LEAD. Provide helpful information. Build trust. Offer to schedule an estimate.',
    'Cold Lead': 'This is a COLD LEAD. Keep it brief. Provide value. Don\'t be pushy.',
    'Not Interested': 'This person is NOT INTERESTED. Be respectful. Thank them. Offer to remove from list if needed.',
    'Price Question': 'They\'re asking about PRICE. Provide helpful context. Offer to schedule an estimate for accurate pricing.',
    'Schedule Request': 'They want to SCHEDULE. Confirm their availability. Offer specific times. Make it easy.',
    'Insurance Inquiry': 'They have INSURANCE questions. Offer to help with claims. Explain your insurance expertise.',
    'Storm Damage': 'This is STORM DAMAGE and may be time-sensitive. Be direct and prioritize safety. If there is active leaking, offer same-day/next-day. Still avoid needy language.',
    'Objection': 'They have OBJECTIONS. Address concerns directly. Provide value. Build trust.',
    'Referral': 'This is a REFERRAL. Thank them warmly. Ask for contact info. Show appreciation.',
    'General Question': 'They have a GENERAL QUESTION. Answer helpfully. Provide value. Be informative.',
  };

  return `${toneGuidance[tone]}

${intentGuidance[intent]}

IMPORTANT RULES:
- Keep responses 2-4 sentences maximum
- Be specific and actionable
- Include a clear call-to-action
- Don't use markdown formatting
- Don't include email signatures
- Write as if you're the roofer responding directly
 - Make it sound natural and human
 - Do NOT offer discounts or price cuts
 - Avoid rush language like "ASAP", "right away", "immediately" unless there is active leaking`;
}

/**
 * Builds user prompt with context
 */
function buildUserPrompt(context: ResponseGenerationContext, variant: number): string {
  const { messageBody, subject, intent, leadName, previousMessages, rooferName, rooferCompany } = context;
  
  let prompt = `Generate response variant ${variant} (${variant === 1 ? 'standard' : variant === 2 ? 'alternative phrasing' : 'different approach'}) to this homeowner message:

Subject: ${subject || '(no subject)'}

Message:
${messageBody}

Intent: ${intent.intent}
Summary: ${intent.aiSummary}
Recommended Action: ${intent.recommendedAction}

Homeowner: ${leadName || 'Homeowner'}
Your name: ${rooferName || 'Your team'}
Company: ${rooferCompany || 'Your roofing company'}`;

  if (previousMessages && previousMessages.length > 0) {
    prompt += `\n\nPrevious conversation:\n${previousMessages.slice(-2).map(m => 
      `${m.direction === 'inbound' ? 'Homeowner' : 'You'}: ${m.body}`
    ).join('\n\n')}`;
  }

  prompt += `\n\nGenerate a natural, helpful response that addresses their message and moves the conversation forward.`;

  return prompt;
}

/**
 * Cleans up the generated response
 */
function cleanResponse(text: string): string {
  // Remove markdown
  text = text.replace(/\*\*(.*?)\*\*/g, '$1');
  text = text.replace(/\*(.*?)\*/g, '$1');
  text = text.replace(/`(.*?)`/g, '$1');
  
  // Remove email signatures
  text = text.split('--')[0].trim();
  text = text.split('Best regards')[0].trim();
  text = text.split('Sincerely')[0].trim();
  
  // Remove extra whitespace
  text = text.replace(/\n{3,}/g, '\n\n');
  
  return text.trim();
}

/**
 * Generates fallback response when AI fails
 */
function generateFallbackResponse(
  context: ResponseGenerationContext,
  tone: ResponseTone
): string {
  const { intent, leadName } = context;
  const name = leadName || 'there';
  
  const fallbacks: Record<IntentCategory, Record<ResponseTone, string>> = {
    'Hot Lead': {
      friendly: `Hey ${name}, thanks for reaching out. Our next openings for a quick inspection are tomorrow afternoon or Thursday morning. Which one works better for you?`,
      professional: `Hi ${name}, thank you for reaching out. Our next openings for an inspection are tomorrow afternoon or Thursday morning. Which time works best for you?`,
      contractor: `${name}, I can get you on the schedule. Next openings are tomorrow afternoon or Thursday morning. What works?`,
    },
    'Schedule Request': {
      friendly: `Absolutely. Can you confirm your address and the best number to reach you? Then I will send over our next available inspection windows.`,
      professional: `Thank you for your interest. Please confirm your address and best contact number, and we will provide the next available inspection windows.`,
      contractor: `Got it. What is your address and phone number? I will get you into the next opening.`,
    },
    'Price Question': {
      friendly: `Hey ${name}, pricing depends on the size and scope of the work. The fastest way to get an accurate number is a free inspection and estimate. What day works best for you?`,
      professional: `Hi ${name}, pricing varies based on the specifics of the project. We can provide a detailed estimate after a free inspection. When would be convenient for you?`,
      contractor: `${name}, I need to see the roof to give you accurate pricing. Free estimate. When can we come out?`,
    },
    'Insurance Inquiry': {
      friendly: `Hey ${name}, yes, we work with all major insurance companies and can help with documentation for your claim. Want me to get you on the schedule for an inspection?`,
      professional: `Hi ${name}, we work with all major carriers and can assist with inspection and documentation for the claim process. Shall we schedule an inspection?`,
      contractor: `${name}, we handle insurance claims. I can inspect and document the damage for your claim. When works?`,
    },
    'Storm Damage': {
      friendly: `Hey ${name}, thanks for the details. If there is active leaking, we will prioritize getting you protected. Otherwise, we can schedule the next available inspection window (today or tomorrow). What is the best number to reach you?`,
      professional: `Hi ${name}, thank you for the details. If there is active leaking we will prioritize immediate protection; otherwise we can schedule the next available inspection window (today or tomorrow). What is the best number to reach you?`,
      contractor: `${name}, if it is actively leaking we will move fast. If not, I can get you into the next opening (today or tomorrow). What is your number?`,
    },
    'Warm Lead': {
      friendly: `Hey ${name}, happy to help. Tell me a bit about what is going on and we can get you scheduled for a free inspection and estimate. What questions do you have?`,
      professional: `Hi ${name}, I would be happy to answer your questions and schedule a complimentary inspection and estimate. What would you like to know?`,
      contractor: `${name}, I can answer your questions and get you a free estimate. What do you need to know?`,
    },
    'Not Interested': {
      friendly: `No problem, ${name}. Thanks for letting me know. If anything changes, feel free to reach out. Have a great day.`,
      professional: `Thank you for letting us know, ${name}. We will remove you from our list. If your needs change, please feel free to contact us.`,
      contractor: `Understood, ${name}. We will close this out. Reach out if you need anything.`,
    },
    'Objection': {
      friendly: `Hey ${name}, I understand the concern. Here is the straightforward answer: [address objection]. Want to set up a quick inspection so we can give you a clear plan and number?`,
      professional: `Hi ${name}, I appreciate you sharing that concern. Here is some context that may help: [address objection]. Would you like to schedule an inspection so we can provide a clear estimate?`,
      contractor: `${name}, I hear you. Here is the deal: [address objection]. Want to get an inspection scheduled?`,
    },
    'Referral': {
      friendly: `Hey ${name}, thank you for the referral. Can you share their contact info and address? We will reach out and take good care of them.`,
      professional: `Hi ${name}, we appreciate the referral. Could you share their contact information? We will reach out promptly.`,
      contractor: `${name}, thanks for the referral. What is their name and number? I will call them today.`,
    },
    'Cold Lead': {
      friendly: `Hey ${name}, thanks for getting back to me. If you have any questions or want a quick roof check, we can set up a free inspection. What is a good day for you?`,
      professional: `Hi ${name}, thank you for your response. If you would like, we can schedule a complimentary inspection and estimate. When would be convenient?`,
      contractor: `${name}, thanks. If you want a free inspection, tell me what day works.`,
    },
    'General Question': {
      friendly: `Hey ${name}, great question. [Answer their question]. If you want, we can also schedule a free inspection and estimate to make this easy.`,
      professional: `Hi ${name}, thank you for your question. [Provide answer]. Please let us know if you would like to schedule an inspection and estimate.`,
      contractor: `${name}, [direct answer]. If you want, I can come take a look and give you a free estimate.`,
    },
  };
  
  return fallbacks[intent.intent]?.[tone] || `Hi ${name}, thanks for reaching out. How can I help you today?`;
}

/**
 * Generates all 3 tone variants for a message
 */
export async function generateAllToneVariants(
  context: ResponseGenerationContext
): Promise<{
  friendly: GeneratedResponse[];
  professional: GeneratedResponse[];
  contractor: GeneratedResponse[];
}> {
  const [friendly, professional, contractor] = await Promise.all([
    generateResponses(context, 'friendly'),
    generateResponses(context, 'professional'),
    generateResponses(context, 'contractor'),
  ]);
  
  return {
    friendly,
    professional,
    contractor,
  };
}



























