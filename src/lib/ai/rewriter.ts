import OpenAI from 'openai';

const openai = new OpenAI({ 
  apiKey: process.env.OPENAI_API_KEY 
});

export type Tone = 'professional' | 'friendly' | 'neutral' | 'bold' | 'concise' | 'warm';
export type Length = 'short' | 'medium' | 'long';
export type Goal = 'get_reply' | 'book_demo' | 'qualify' | 'introduce' | 'follow_up';

export interface RewriteRequest {
  subject: string;
  body: string;
  tone?: Tone;
  length?: Length;
  goal?: Goal;
  niche?: string;
  count?: number;
  lead?: {
    first_name?: string;
    last_name?: string;
    company?: string;
    title?: string;
    website?: string;
    city?: string;
    state?: string;
    recent_signal?: string;
    pain_point?: string;
  };
}

export interface RewriteVariant {
  subject: string;
  body: string;
}

export interface RewriteResponse {
  variants: RewriteVariant[];
}

/**
 * Rewrite email template with AI personalization
 * Returns multiple variants based on tone, length, goal, and niche
 */
export async function rewriteTemplate(request: RewriteRequest): Promise<RewriteResponse> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const model = process.env.AI_MODEL || 'gpt-4o-mini';
  const count = Math.min(Math.max(request.count || 1, 1), 5); // 1-5 variants
  const tone = request.tone || 'professional';
  const length = request.length || 'medium';
  const goal = request.goal || 'get_reply';
  const niche = request.niche || '';

  // Build context from lead data
  const leadContext = request.lead ? [
    request.lead.first_name && `First name: ${request.lead.first_name}`,
    request.lead.last_name && `Last name: ${request.lead.last_name}`,
    request.lead.company && `Company: ${request.lead.company}`,
    request.lead.title && `Title: ${request.lead.title}`,
    request.lead.website && `Website: ${request.lead.website}`,
    request.lead.city && `City: ${request.lead.city}`,
    request.lead.state && `State: ${request.lead.state}`,
    request.lead.recent_signal && `Recent signal: ${request.lead.recent_signal}`,
    request.lead.pain_point && `Pain point: ${request.lead.pain_point}`,
  ].filter(Boolean).join('\n') : '';

  // Build system prompt
  const systemPrompt = `You are an expert email copywriter specializing in cold outreach and personalized sales emails.

Your task is to rewrite email templates while:
1. Preserving placeholders like {{first_name}}, {{company}}, {{contact.first_name}}, etc. - DO NOT fabricate values if missing
2. Ensuring subjects are <= 6 words (reduce spam risk)
3. Adapting tone to match: ${tone}
4. Matching length: ${length === 'short' ? '50-80 words' : length === 'medium' ? '80-120 words' : '120-180 words'}
5. Optimizing for goal: ${goal}
${niche ? `6. Tailoring for niche/industry: ${niche}` : ''}
${leadContext ? `\n7. Using this lead context for personalization:\n${leadContext}` : ''}

Rules:
- Keep placeholders intact if values are missing (e.g., if first_name is missing, keep {{first_name}})
- Subject must be concise (max 6 words) and compelling
- Body should be conversational, avoid spam triggers
- Include a clear CTA based on the goal
- Use natural language that feels authentic
${niche ? `- Use industry-specific terminology relevant to ${niche}` : ''}

You must return a JSON object with this exact structure:
{
  "variants": [
    {"subject": "...", "body": "..."},
    ...
  ]
}
Generate exactly ${count} variant(s). Each variant must have:
- subject: string (max 6 words)
- body: string (plain text, preserve placeholders)`;

  const userPrompt = `Original subject: ${request.subject}\n\nOriginal body:\n${request.body}\n\nGenerate ${count} variant(s) that improve upon the original while following all rules above.`;

  try {
    const completion = await openai.chat.completions.create({
      model,
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: userPrompt }
      ],
      temperature: 0.7,
      response_format: { type: 'json_object' },
    });

    const content = completion.choices[0]?.message?.content;
    if (!content) {
      throw new Error('No response from OpenAI');
    }

    // Parse JSON response
    let parsed: { variants?: RewriteVariant[] };
    try {
      parsed = JSON.parse(content);
    } catch (e) {
      // Sometimes OpenAI returns JSON wrapped in text or code fences
      const jsonMatch = content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsed = JSON.parse(jsonMatch[0]);
      } else {
        throw new Error('Invalid JSON response from OpenAI');
      }
    }

    // Ensure we have variants array
    let variants = parsed.variants || [];
    
    // Fallback: if variants not in expected structure, try to extract
    if (!variants.length && Array.isArray(parsed)) {
      variants = parsed as RewriteVariant[];
    }

    // If still no variants, create a fallback variant
    if (!variants.length) {
      variants = [{
        subject: request.subject,
        body: request.body
      }];
    }

    // Validate and normalize variants
    variants = variants
      .slice(0, count)
      .map((v: any) => ({
        subject: (v.subject || request.subject || '').trim(),
        body: (v.body || request.body || '').trim()
      }))
      .filter((v: RewriteVariant) => v.subject && v.body);

    if (!variants.length) {
      throw new Error('No valid variants generated');
    }

    return { variants };
  } catch (error) {
    console.error('[Rewriter] OpenAI error:', error);
    throw error instanceof Error ? error : new Error('Failed to rewrite template');
  }
}

