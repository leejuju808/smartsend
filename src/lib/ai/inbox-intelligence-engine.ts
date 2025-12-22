// Block 81000 — Homeowner Inbox Intelligence + Reply Understanding Engine
// AI Intent Classification Engine for SmartSend Roofing

import OpenAI from 'openai';

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export type IntentCategory = 
  | 'Hot Lead'
  | 'Warm Lead'
  | 'Cold Lead'
  | 'Not Interested'
  | 'Price Question'
  | 'Schedule Request'
  | 'Insurance Inquiry'
  | 'Storm Damage'
  | 'Objection'
  | 'Referral'
  | 'General Question';

export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

export interface IntentClassification {
  intent: IntentCategory;
  confidence: number;
  urgency: UrgencyLevel;
  recommendedAction: string;
  aiSummary: string;
  keywords: string[];
  reasoning?: string;
}

export interface RecommendedAction {
  action: string;
  priority: 'low' | 'medium' | 'high' | 'critical';
  reasoning: string;
  pipelineStage?: string;
}

/**
 * Classifies a homeowner message to understand intent, urgency, and recommended action
 */
export async function classifyMessageIntent(
  messageBody: string,
  subject?: string | null,
  context?: {
    leadName?: string;
    previousMessages?: string[];
    leadStatus?: string;
  }
): Promise<IntentClassification> {
  const systemPrompt = `You are SmartSend's Homeowner Inbox Intelligence Engine for roofing contractors.

Your job is to classify homeowner replies into EXACT categories and understand what they really mean.

INTENT CATEGORIES:
1. "Hot Lead" - Strong buying signals:
   - "Can you come out tomorrow?"
   - "We're ready to get a quote."
   - "When's your next opening?"
   - "The storm damaged our roof."
   - "We need this done ASAP."

2. "Warm Lead" - Some interest, needs nurturing:
   - "What's your price?"
   - "I have a question about..."
   - "We might be interested."
   - "Can you tell me more?"

3. "Cold Lead" - Low interest:
   - Generic responses
   - "Thanks for reaching out"
   - No clear buying signal

4. "Not Interested" - Explicit rejection:
   - "Not interested."
   - "We already hired someone."
   - "Please remove me from your list."

5. "Price Question" - Asking about costs:
   - "How much would it cost to..."
   - "Can you give me a ballpark?"
   - "What's your price range?"

6. "Schedule Request" - Wants to schedule:
   - "Thursday morning works."
   - "Can you stop by today?"
   - "When can you come out?"

7. "Insurance Inquiry" - Insurance-related:
   - "Do you work with State Farm?"
   - "Can you help with a claim?"
   - "Will insurance cover this?"

8. "Storm Damage" - Storm-related urgency:
   - "Wind blew shingles off."
   - "Tree fell on the roof."
   - "We had a storm last night..."

9. "Objection" - Has concerns:
   - "That seems expensive."
   - "Let me think about it."
   - "I need to check with my spouse."

10. "Referral" - Referring someone else:
    - "My neighbor needs help..."
    - "Can you contact my friend?"

11. "General Question" - General inquiry

URGENCY LEVELS:
- "critical" - Immediate action needed (storm damage, urgent repairs)
- "high" - Hot lead, scheduling requests
- "medium" - Warm leads, questions
- "low" - Cold leads, not interested

Return JSON with:
{
  "intent": "category name",
  "confidence": 0.0-1.0,
  "urgency": "low|medium|high|critical",
  "recommendedAction": "Clear action like 'Move to Estimate Needed' or 'Send quick price range'",
  "aiSummary": "One sentence summary of what homeowner wants",
  "keywords": ["keyword1", "keyword2"],
  "reasoning": "Brief explanation of classification"
}`;

  const userPrompt = `Classify this homeowner message:

Subject: ${subject || '(no subject)'}

Message:
${messageBody}

${context?.previousMessages?.length ? `Previous conversation context:\n${context.previousMessages.slice(-3).join('\n\n')}` : ''}

Classify the intent, urgency, and recommend the exact action the roofer should take.`;

  try {
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt },
      ],
      temperature: 0.3,
      response_format: { type: 'json_object' },
      max_tokens: 500,
    });

    const result = JSON.parse(completion.choices[0]?.message?.content || '{}');
    
    return {
      intent: result.intent || 'General Question',
      confidence: Math.min(1.0, Math.max(0.0, result.confidence || 0.5)),
      urgency: result.urgency || 'medium',
      recommendedAction: result.recommendedAction || 'Review message',
      aiSummary: result.aiSummary || messageBody.substring(0, 200),
      keywords: result.keywords || [],
      reasoning: result.reasoning,
    };
  } catch (error) {
    console.error('Error classifying message intent:', error);
    
    // Fallback classification using keyword matching
    return fallbackClassification(messageBody, subject);
  }
}

/**
 * Fallback classification using keyword matching when AI fails
 */
function fallbackClassification(
  messageBody: string,
  subject?: string | null
): IntentClassification {
  const text = `${subject || ''} ${messageBody}`.toLowerCase();
  
  // Hot lead signals
  if (
    text.match(/\b(tomorrow|asap|urgent|emergency|storm|damage|leak|water)\b/i) ||
    text.match(/\b(can you come|when can you|ready to|need this done)\b/i)
  ) {
    return {
      intent: 'Hot Lead',
      confidence: 0.7,
      urgency: 'high',
      recommendedAction: 'Move to Estimate Needed - Schedule inspection ASAP',
      aiSummary: 'Homeowner shows strong interest and urgency. Schedule inspection immediately.',
      keywords: ['urgent', 'tomorrow', 'asap'],
    };
  }
  
  // Schedule request
  if (text.match(/\b(thursday|friday|monday|tuesday|wednesday|saturday|sunday|morning|afternoon|evening|schedule|appointment|come by|stop by)\b/i)) {
    return {
      intent: 'Schedule Request',
      confidence: 0.75,
      urgency: 'high',
      recommendedAction: 'Schedule inspection for requested time',
      aiSummary: 'Homeowner wants to schedule an appointment.',
      keywords: ['schedule', 'appointment'],
    };
  }
  
  // Price question
  if (text.match(/\b(how much|price|cost|ballpark|quote|estimate|pricing)\b/i)) {
    return {
      intent: 'Price Question',
      confidence: 0.8,
      urgency: 'medium',
      recommendedAction: 'Send quick price range or schedule estimate',
      aiSummary: 'Homeowner is asking about pricing.',
      keywords: ['price', 'cost'],
    };
  }
  
  // Insurance
  if (text.match(/\b(insurance|state farm|allstate|farmers|claim|adjuster|coverage)\b/i)) {
    return {
      intent: 'Insurance Inquiry',
      confidence: 0.75,
      urgency: 'medium',
      recommendedAction: 'Offer insurance help and schedule inspection',
      aiSummary: 'Homeowner has insurance-related questions.',
      keywords: ['insurance', 'claim'],
    };
  }
  
  // Not interested
  if (text.match(/\b(not interested|already hired|remove|unsubscribe|no thanks)\b/i)) {
    return {
      intent: 'Not Interested',
      confidence: 0.9,
      urgency: 'low',
      recommendedAction: 'Stop outreach - mark as not interested',
      aiSummary: 'Homeowner is not interested.',
      keywords: ['not interested'],
    };
  }
  
  // Warm lead
  if (text.match(/\b(might be|interested|tell me more|question|curious)\b/i)) {
    return {
      intent: 'Warm Lead',
      confidence: 0.6,
      urgency: 'medium',
      recommendedAction: 'Send more information and nurture',
      aiSummary: 'Homeowner shows some interest but needs more information.',
      keywords: ['interested', 'question'],
    };
  }
  
  // Default
  return {
    intent: 'General Question',
    confidence: 0.5,
    urgency: 'medium',
    recommendedAction: 'Review message and respond',
    aiSummary: messageBody.substring(0, 200),
    keywords: [],
  };
}

/**
 * Gets recommended action based on intent classification
 */
export function getRecommendedAction(
  classification: IntentClassification
): RecommendedAction {
  const { intent, urgency } = classification;
  
  const actionMap: Record<IntentCategory, RecommendedAction> = {
    'Hot Lead': {
      action: 'Move to Estimate Needed',
      priority: 'critical',
      reasoning: 'Hot lead - schedule inspection immediately',
      pipelineStage: 'estimate_scheduled',
    },
    'Warm Lead': {
      action: 'Send quick price range and schedule estimate',
      priority: 'high',
      reasoning: 'Warm lead - needs nurturing',
      pipelineStage: 'interested',
    },
    'Cold Lead': {
      action: 'Continue follow-up sequence',
      priority: 'low',
      reasoning: 'Low interest - continue nurturing',
      pipelineStage: 'contacted',
    },
    'Not Interested': {
      action: 'Stop outreach — mark as not interested',
      priority: 'low',
      reasoning: 'Explicitly not interested',
      pipelineStage: 'lost',
    },
    'Price Question': {
      action: 'Send quick price range or schedule estimate',
      priority: 'high',
      reasoning: 'Price-sensitive - provide pricing info',
      pipelineStage: 'estimate_completed',
    },
    'Schedule Request': {
      action: 'Schedule inspection for requested time',
      priority: 'critical',
      reasoning: 'Ready to schedule - book immediately',
      pipelineStage: 'estimate_scheduled',
    },
    'Insurance Inquiry': {
      action: 'Offer insurance help and schedule inspection',
      priority: 'high',
      reasoning: 'Insurance claim opportunity',
      pipelineStage: 'interested',
    },
    'Storm Damage': {
      action: 'Schedule inspection ASAP - storm damage',
      priority: 'critical',
      reasoning: 'Urgent storm damage - high priority',
      pipelineStage: 'estimate_scheduled',
    },
    'Objection': {
      action: 'Address objection and provide value',
      priority: 'medium',
      reasoning: 'Has concerns - address them',
      pipelineStage: 'replied',
    },
    'Referral': {
      action: 'Thank for referral and contact referred person',
      priority: 'medium',
      reasoning: 'Referral opportunity',
      pipelineStage: 'replied',
    },
    'General Question': {
      action: 'Answer question and provide helpful information',
      priority: 'medium',
      reasoning: 'General inquiry',
      pipelineStage: 'replied',
    },
  };
  
  return actionMap[intent] || {
    action: 'Review message',
    priority: 'medium',
    reasoning: 'Unknown intent',
  };
}



























