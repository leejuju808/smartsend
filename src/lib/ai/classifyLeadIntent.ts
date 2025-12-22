import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! });

export type LeadIntentClassification = 
  | "HOT" 
  | "WARM" 
  | "NOT_INTERESTED" 
  | "FOLLOW_UP" 
  | "OUT_OF_SCOPE";

export interface LeadIntentResult {
  classification: LeadIntentClassification;
  confidence: number;
  reasoning?: string;
}

/**
 * Classifies a homeowner reply into one of 5 roofing lead categories:
 * - HOT: Wants estimate, appointment, inspection, repair, leak fix
 * - WARM: Interested but not urgent (pricing questions, considering)
 * - NOT_INTERESTED: Declined, not right now, already handled
 * - FOLLOW_UP: Needs manual response (questions, unclear intent)
 * - OUT_OF_SCOPE: Not a homeowner roofing job (tenant, commercial, wrong service)
 */
export async function classifyLeadIntent(
  text: string,
  subject?: string
): Promise<LeadIntentResult> {
  const fullText = [subject, text].filter(Boolean).join("\n\n");
  const trimmed = fullText.trim().slice(0, 4000);

  if (!trimmed) {
    return {
      classification: "FOLLOW_UP",
      confidence: 0.5,
      reasoning: "Empty message"
    };
  }

  // Quick rule-based checks for high-confidence cases
  const lowerText = trimmed.toLowerCase();

  // HOT LEAD indicators
  const hotPatterns = [
    /(?:want|need|looking for|can you come|come out|come look|inspect|inspection)/i,
    /(?:estimate|quote|appointment|schedule|book|meeting)/i,
    /(?:repair|fix|leak|leaking|damage|problem|issue)/i,
    /(?:asap|urgent|soon|today|tomorrow|this week)/i,
  ];
  
  const hotMatches = hotPatterns.filter(p => p.test(lowerText));
  if (hotMatches.length >= 2) {
    return {
      classification: "HOT",
      confidence: 0.9,
      reasoning: `Matched ${hotMatches.length} HOT indicators`
    };
  }

  // NOT INTERESTED indicators
  const notInterestedPatterns = [
    /(?:not interested|not right now|we're good|already handled|already fixed)/i,
    /(?:please remove|unsubscribe|stop emailing|don't contact)/i,
    /(?:no thanks|no thank you|not at this time)/i,
  ];
  
  if (notInterestedPatterns.some(p => p.test(lowerText))) {
    return {
      classification: "NOT_INTERESTED",
      confidence: 0.95,
      reasoning: "Matched NOT_INTERESTED pattern"
    };
  }

  // OUT OF SCOPE indicators
  const outOfScopePatterns = [
    /(?:tenant|renting|landlord|property manager)/i,
    /(?:commercial|business|office building|warehouse)/i,
    /(?:wrong address|not my house|don't own)/i,
    /(?:gutters|siding|windows|doors)(?!.*roof)/i, // gutters/siding/etc without roof mention
  ];
  
  if (outOfScopePatterns.some(p => p.test(lowerText))) {
    return {
      classification: "OUT_OF_SCOPE",
      confidence: 0.9,
      reasoning: "Matched OUT_OF_SCOPE pattern"
    };
  }

  // WARM LEAD indicators (pricing questions, considering)
  const warmPatterns = [
    /(?:how much|what.*cost|what.*charge|pricing|price|cost)/i,
    /(?:thinking about|considering|maybe|possibly)/i,
    /(?:next week|next month|later|sometime)/i,
  ];
  
  if (warmPatterns.some(p => p.test(lowerText)) && !hotPatterns.some(p => p.test(lowerText))) {
    return {
      classification: "WARM",
      confidence: 0.85,
      reasoning: "Matched WARM pattern (pricing/considering)"
    };
  }

  // AI classification for ambiguous cases
  try {
    const systemPrompt = `You are classifying homeowner email replies for a roofing company. 
Classify the message into ONE of these categories:

HOT - Homeowner wants:
- estimate, quote, pricing
- someone to come out, inspection, appointment
- repair, leak fix, immediate work
- "can you come look at it"
These are money-in-hand leads ready to book.

WARM - Homeowner is interested but not urgent:
- "How much does it cost?" (just pricing question)
- "What do you charge?"
- "Thinking about repairs"
- "Maybe next week"
- "We're considering roof work"
Good leads but not immediate.

NOT_INTERESTED - Homeowner declined:
- "Not right now"
- "We're good"
- "Already handled"
- "Please remove me"
Sequence should stop immediately.

FOLLOW_UP - Needs manual response:
- "Can you explain?"
- "Who is this?"
- "What company are you with?"
- "Tell me more"
- Unclear intent, questions that need answers

OUT_OF_SCOPE - Not a homeowner roofing job:
- Tenant/rental property
- Commercial building
- Wrong address
- Random spam
- "I need gutters cleaned" (unless roofer does gutters)
Not a valid roofing lead.

Return ONLY valid JSON: {"classification": "HOT|WARM|NOT_INTERESTED|FOLLOW_UP|OUT_OF_SCOPE", "confidence": 0.0-1.0, "reasoning": "brief explanation"}`;

    const userPrompt = `Classify this homeowner reply for a roofing company:

Subject: ${subject || "(no subject)"}

Message:
${trimmed}`;

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
    const classification = (parsed.classification || "FOLLOW_UP").toUpperCase() as LeadIntentClassification;
    
    // Validate classification
    const validClassifications: LeadIntentClassification[] = [
      "HOT", "WARM", "NOT_INTERESTED", "FOLLOW_UP", "OUT_OF_SCOPE"
    ];
    
    const finalClassification = validClassifications.includes(classification) 
      ? classification 
      : "FOLLOW_UP";

    const confidence = Math.max(0, Math.min(1, Number(parsed.confidence ?? 0.7)));
    const reasoning = parsed.reasoning || "AI classification";

    return {
      classification: finalClassification,
      confidence,
      reasoning
    };

  } catch (error) {
    console.error("Error classifying lead intent:", error);
    // Fallback to FOLLOW_UP if AI fails
    return {
      classification: "FOLLOW_UP",
      confidence: 0.5,
      reasoning: `Classification error: ${error instanceof Error ? error.message : "Unknown error"}`
    };
  }
}























































