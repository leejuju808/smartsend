import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/utils/supabase/server";
import OpenAI from "openai";

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * POST /api/campaign-templates/rewrite
 * Rewrite email content using a specific AI persona
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { 
      subject, 
      body: emailBody, 
      personaId, 
      personalizationData,
      rewriteMode // 'shorter', 'longer', 'friendlier', 'more_direct'
    } = body;

    if (!subject || !emailBody) {
      return NextResponse.json(
        { error: "Subject and body are required" },
        { status: 400 }
      );
    }

    // Fetch persona if provided
    let persona = null;
    if (personaId) {
      const { data: personaData, error: personaError } = await supabase
        .from("ai_personas")
        .select("*")
        .eq("id", personaId)
        .single();

      if (!personaError && personaData) {
        persona = personaData;
      }
    }

    // Build persona instructions
    let personaInstructions = "";
    if (persona) {
      personaInstructions = `
Persona: ${persona.name}
${persona.description ? `Description: ${persona.description}` : ''}

Voice Guidelines:
${persona.voice_guidelines}

${persona.example_phrases ? `Example phrases: ${persona.example_phrases}` : ''}
`;
    }

    // Build personalization context
    const personalizationContext = personalizationData ? `
Personalization Data:
- First Name: ${personalizationData.first_name || '{{first_name}}'}
- Neighborhood: ${personalizationData.neighborhood || '{{neighborhood}}'}
- City: ${personalizationData.city || '{{city}}'}
- Street: ${personalizationData.street || '{{street}}'}
- Roof Type: ${personalizationData.roof_type || '{{roof_type}}'}
- Weather: ${personalizationData.weather || '{{weather}}'}
- Storm History: ${personalizationData.storm_history || ''}
- Local Landmarks: ${personalizationData.local_landmarks || ''}
` : "";

    // Build rewrite mode instructions
    const modeInstructions: Record<string, string> = {
      shorter: "Make this email significantly shorter (50-80 words). Keep the core message but be more concise.",
      longer: "Expand this email (120-180 words). Add more context, value, and helpful information.",
      friendlier: "Make this email warmer and more friendly. Use more conversational language, add warmth.",
      more_direct: "Make this email more direct and straightforward. Get to the point faster, remove fluff.",
      default: "Improve this email while maintaining its core message and tone."
    };

    const rewriteInstruction = modeInstructions[rewriteMode || 'default'] || modeInstructions.default;

    // Build AI prompt
    const systemPrompt = `You are an expert email copywriter specializing in roofing outreach emails.

Your task is to rewrite this email following these guidelines:

${personaInstructions}

${personalizationContext}

Rewrite Mode: ${rewriteInstruction}

CRITICAL RULES:
1. Preserve ALL {{variables}} exactly as they appear (e.g., {{first_name}}, {{neighborhood}}, {{city}})
2. Do NOT replace or remove {{variables}} - they will be filled in later
3. Make the email sound natural and human
4. Avoid spam triggers: "free", "act now", "limited time", excessive exclamation marks
5. Keep subject lines under 6 words
6. Use conversational, authentic language
7. Include a clear but non-pushy call-to-action
8. For roofing emails, reference local areas naturally when possible
9. Show empathy and understanding of homeowner concerns

Return ONLY the rewritten email as JSON:
{
  "subject": "...",
  "body": "..."
}`;

    const userPrompt = `Original Subject: ${subject}

Original Body:
${emailBody}

Rewrite this email following all the guidelines above.`;

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: process.env.AI_MODEL || "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const responseText = completion.choices[0]?.message?.content;
    if (!responseText) {
      return NextResponse.json(
        { error: "No response from AI" },
        { status: 500 }
      );
    }

    const rewritten = JSON.parse(responseText);

    // Check spam score
    const spamScore = await checkSpamScore(rewritten.subject, rewritten.body);
    
    // Auto-fix if spam score is high
    if (spamScore.score > 0.6) {
      const fixed = await autoFixSpam(rewritten.subject, rewritten.body);
      rewritten.subject = fixed.subject;
      rewritten.body = fixed.body;
      rewritten.spam_fixed = true;
      rewritten.original_spam_score = spamScore.score;
    }

    rewritten.spam_score = spamScore.score;
    rewritten.spam_issues = spamScore.issues;

    return NextResponse.json({
      success: true,
      rewritten,
      persona_used: persona?.name || null
    });

  } catch (error: any) {
    console.error("Rewrite error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to rewrite email" },
      { status: 500 }
    );
  }
}

/**
 * Check spam score for email content
 */
async function checkSpamScore(subject: string, body: string): Promise<{
  score: number;
  issues: string[];
}> {
  const issues: string[] = [];
  let score = 0;

  // Check for spam words
  const spamWords = [
    "free", "act now", "limited time", "guaranteed", "click here",
    "buy now", "don't miss", "urgent", "exclusive deal", "special offer"
  ];

  const lowerSubject = subject.toLowerCase();
  const lowerBody = body.toLowerCase();

  spamWords.forEach(word => {
    if (lowerSubject.includes(word) || lowerBody.includes(word)) {
      issues.push(`Contains spam word: "${word}"`);
      score += 0.1;
    }
  });

  // Check for excessive capitalization
  const capsRatio = (subject.match(/[A-Z]/g) || []).length / subject.length;
  if (capsRatio > 0.5) {
    issues.push("Excessive capitalization in subject");
    score += 0.15;
  }

  // Check for multiple exclamation marks
  const exclamationCount = (subject.match(/!/g) || []).length;
  if (exclamationCount > 1) {
    issues.push("Multiple exclamation marks in subject");
    score += 0.1;
  }

  // Check for too many links
  const linkCount = (body.match(/https?:\/\//g) || []).length;
  if (linkCount > 3) {
    issues.push("Too many links");
    score += 0.1;
  }

  // Check subject length
  if (subject.split(/\s+/).length > 10) {
    issues.push("Subject line too long");
    score += 0.05;
  }

  return {
    score: Math.min(score, 1.0),
    issues
  };
}

/**
 * Auto-fix spam issues in email content
 */
async function autoFixSpam(subject: string, body: string): Promise<{
  subject: string;
  body: string;
}> {
  // Remove excessive exclamation marks
  subject = subject.replace(/!{2,}/g, "!");
  
  // Fix excessive capitalization
  subject = subject.split(" ").map((word, i) => {
    if (i === 0) {
      return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
    }
    return word.toLowerCase();
  }).join(" ");

  // Replace spam words with alternatives
  const spamReplacements: Record<string, string> = {
    "free": "complimentary",
    "act now": "get started",
    "limited time": "available",
    "guaranteed": "assured",
    "click here": "learn more",
    "buy now": "get started",
    "don't miss": "consider",
    "urgent": "important",
    "exclusive deal": "special opportunity",
    "special offer": "opportunity"
  };

  let fixedBody = body;
  Object.entries(spamReplacements).forEach(([spam, replacement]) => {
    const regex = new RegExp(spam, "gi");
    fixedBody = fixedBody.replace(regex, replacement);
  });

  return { subject, body: fixedBody };
}



























