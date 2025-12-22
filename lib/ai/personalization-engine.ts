/**
 * Block 9400 — AI Personalization Engine v1
 * 
 * Core pipeline for every outbound email:
 * 1. Token Replacement Layer
 * 2. Dynamic Data Layer
 * 3. Local Context Layer
 * 4. Human Rewrite Layer
 * 5. Tone Control Layer
 * 6. Safety + Spam Reduction Layer
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : null;

export interface PersonalizationRequest {
  template_body: string;
  template_subject: string;
  contact_id: string;
  campaign_id: string;
}

export interface PersonalizationResult {
  subject: string;
  body: string;
  metadata: {
    tokens_used?: {
      input?: number;
      output?: number;
    };
    readability_score?: number;
    spam_score?: number;
    local_features?: string[];
    roofing_context_injected?: boolean;
  };
}

interface TokenMap {
  [key: string]: string;
}

interface ContactData {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  city?: string | null;
  state?: string | null;
  zip?: string | null;
  roof_type_guess?: string | null;
  roof_issue?: string | null;
  custom_fields?: Record<string, any>;
}

interface AccountProfile {
  owner_name?: string | null;
  company_name?: string | null;
  service_area?: string | null;
}

/**
 * A. Token Replacement Layer
 * Replaces tokens with values from contact data, account profile, templates, and snippets
 */
function replaceTokens(
  template: string,
  tokenMap: TokenMap
): string {
  let output = template;
  
  // Replace all tokens in format {token_name}
  Object.entries(tokenMap).forEach(([token, value]) => {
    const regex = new RegExp(`\\{${token}\\}`, 'g');
    output = output.replace(regex, value || '');
  });
  
  return output;
}

/**
 * B. Dynamic Data Layer
 * Adds context we auto-detect: weather events, local references, roofing-specific details
 */
async function buildDynamicData(
  contact: ContactData,
  accountProfile: AccountProfile
): Promise<{
  recent_weather_event: string;
  local_reference: string;
  roofing_detail: string;
}> {
  const city = contact.city || '';
  const state = contact.state || '';
  
  // 1. Recent Weather Event (V1: Use LLM to infer phrase based on city + date)
  const recent_weather_event = await getWeatherEvent(city, state);
  
  // 2. Local Reference Injection
  const local_reference = buildLocalReference(city, accountProfile.service_area || '');
  
  // 3. Roofing-Specific Detail
  const roofing_detail = await getRoofingDetail(contact, city, state);
  
  return {
    recent_weather_event,
    local_reference,
    roofing_detail,
  };
}

/**
 * Get weather event phrase for city/state
 */
async function getWeatherEvent(city: string, state: string): Promise<string> {
  if (!city || !state) return '';
  
  // Check cache first (6-12 hour cache)
  const cacheKey = `weather:${city}:${state}:${new Date().toISOString().split('T')[0]}`;
  
  try {
    // For V1, use a simple LLM call to infer weather event
    const prompt = `Given the city "${city}, ${state}" and today's date, suggest a brief, natural phrase about recent weather that a roofing contractor might mention. Examples: "wind storm last week", "hail we had", "heavy rain recently". Keep it under 5 words. Return only the phrase, no quotes.`;
    
    const weatherPhrase = await callLLM(prompt, 20);
    return weatherPhrase.trim() || '';
  } catch (error) {
    console.error('Weather event generation failed:', error);
    return '';
  }
}

/**
 * Build local reference phrase
 */
function buildLocalReference(city: string, serviceArea: string): string {
  if (city) {
    return `around the ${city} area`;
  }
  if (serviceArea) {
    return `in your neighborhood`;
  }
  return '';
}

/**
 * Get roofing-specific detail using LLM
 */
async function getRoofingDetail(
  contact: ContactData,
  city: string,
  state: string
): Promise<string> {
  const roofType = contact.roof_type_guess || 'asphalt';
  const roofIssue = contact.roof_issue || 'your roof condition';
  
  try {
    const prompt = `Given a roofing context: roof type "${roofType}", location "${city}, ${state}", suggest ONE brief roofing-specific detail that is true for 80% of roofs. Examples: "shingle lifting", "granule loss", "soft spots", "gutters backing up", "ridge cap separation". Keep it under 3 words. Return only the detail, no quotes.`;
    
    const detail = await callLLM(prompt, 15);
    return detail.trim() || roofIssue;
  } catch (error) {
    console.error('Roofing detail generation failed:', error);
    return roofIssue;
  }
}

/**
 * C. Human Rewrite Layer
 * Rewrites email in friendly, local roofing tone
 */
async function humanRewrite(
  subject: string,
  body: string,
  context: {
    homeowner_name: string;
    city: string;
    service_area: string;
    recent_weather_event: string;
    roof_issue: string;
    owner_name: string;
    company_name: string;
  }
): Promise<{ subject: string; body: string }> {
  const rewritePrompt = `Rewrite the following email in a friendly, local roofing tone. 
Sound like a real roofing contractor texting a homeowner.
Keep it under 130 words.
Keep it human.
Avoid formal sales language.
Do not sound like AI.
Do not use fancy vocabulary.
Do not use emojis.
Do not use exclamation marks.
Do not overpromise.
Do not add disclaimers.

Here is the email after token replacement:

Subject: ${subject}

Body:
${body}

Context:
- Homeowner name: ${context.homeowner_name}
- City: ${context.city}
- Service area: ${context.service_area}
- Weather: ${context.recent_weather_event}
- Roofing detail: ${context.roof_issue}
- Roofer: ${context.owner_name} from ${context.company_name}

Goal:
Write a personal message that looks hand-typed.

Return JSON: {"subject": "...", "body": "..."}`;

  try {
    const response = await callLLM(rewritePrompt, 300, true);
    const parsed = JSON.parse(response);
    return {
      subject: parsed.subject || subject,
      body: parsed.body || body,
    };
  } catch (error) {
    console.error('Human rewrite failed:', error);
    // Fallback to original
    return { subject, body };
  }
}

/**
 * D. Tone Control Layer
 * Enforces tone rules: warm, short sentences, blue-collar language
 */
function applyToneControl(text: string): string {
  let output = text;
  
  // Remove common AI catchphrases
  const aiPhrases = [
    /I hope you're doing well/gi,
    /I wanted to reach out/gi,
    /I hope this email finds you well/gi,
    /I'm reaching out today/gi,
    /I wanted to touch base/gi,
  ];
  
  aiPhrases.forEach(regex => {
    output = output.replace(regex, '');
  });
  
  // Remove excessive punctuation
  output = output.replace(/!{2,}/g, '');
  output = output.replace(/\?{2,}/g, '?');
  
  // Ensure short sentences (split long ones)
  const sentences = output.split(/[.!?]+/);
  const shortSentences = sentences
    .map(s => s.trim())
    .filter(s => s.length > 0)
    .map(s => {
      // If sentence is too long, try to break it
      if (s.length > 80) {
        const parts = s.split(/,/);
        return parts.join('.');
      }
      return s;
    });
  
  output = shortSentences.join('. ').trim();
  
  return output;
}

/**
 * E. Spam Reduction Layer
 * Removes spammy phrases and cleans up formatting
 */
function reduceSpam(text: string): {
  cleaned: string;
  spamScore: number;
} {
  let cleaned = text;
  let spamScore = 0;
  
  // Spam indicators
  const spamPatterns = [
    { pattern: /FREE!!!/gi, score: 0.3 },
    { pattern: /GUARANTEED/gi, score: 0.2 },
    { pattern: /LIMITED TIME/gi, score: 0.2 },
    { pattern: /ACT NOW/gi, score: 0.2 },
    { pattern: /CLICK HERE/gi, score: 0.1 },
    { pattern: /URGENT/gi, score: 0.1 },
    { pattern: /ALL CAPS WORDS/gi, score: 0.1 },
  ];
  
  spamPatterns.forEach(({ pattern, score }) => {
    if (pattern.test(cleaned)) {
      spamScore += score;
      cleaned = cleaned.replace(pattern, '');
    }
  });
  
  // Remove excessive caps
  const capsWords = cleaned.match(/\b[A-Z]{3,}\b/g);
  if (capsWords && capsWords.length > 2) {
    spamScore += 0.2;
    cleaned = cleaned.replace(/\b([A-Z]{3,})\b/g, (match) => {
      return match.charAt(0) + match.slice(1).toLowerCase();
    });
  }
  
  // Clean up formatting
  cleaned = cleaned.replace(/\s+/g, ' ');
  cleaned = cleaned.trim();
  
  // Ensure under 130 words
  const words = cleaned.split(/\s+/);
  if (words.length > 130) {
    cleaned = words.slice(0, 130).join(' ');
  }
  
  return {
    cleaned,
    spamScore: Math.min(spamScore, 1.0),
  };
}

/**
 * Call LLM (OpenAI or compatible)
 */
async function callLLM(
  prompt: string,
  maxTokens: number = 200,
  jsonMode: boolean = false
): Promise<string> {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const model = process.env.OPENAI_MODEL || 'gpt-4o-mini';
  const endpoint = process.env.OPENAI_BASE_URL || 'https://api.openai.com/v1/chat/completions';

  try {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          {
            role: 'system',
            content: jsonMode
              ? 'You are a helpful assistant. Return only valid JSON, no markdown or code fences.'
              : 'You are a professional email copywriter specializing in roofing contractor outreach. Return only the requested text, no explanations or markdown.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: maxTokens,
        ...(jsonMode && { response_format: { type: 'json_object' } }),
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`LLM API error: ${response.status} ${errorText}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;

    if (!content) {
      throw new Error('No content returned from LLM');
    }

    // Clean up any markdown formatting
    return content
      .replace(/^```[\w]*\n?/g, '')
      .replace(/```\n?$/g, '')
      .trim();
  } catch (error: any) {
    console.error('LLM call failed:', error);
    throw new Error(`LLM generation failed: ${error.message}`);
  }
}

/**
 * Main personalization function
 */
export async function personalizeEmail(
  request: PersonalizationRequest
): Promise<PersonalizationResult> {
  const { template_body, template_subject, contact_id, campaign_id } = request;

  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  // 1. Load contact data (try contacts first, then leads)
  let contact: ContactData | null = null;
  
  const { data: contactData, error: contactError } = await supabaseAdmin
    .from('contacts')
    .select('*')
    .eq('id', contact_id)
    .maybeSingle<ContactData>();

  if (contactData) {
    contact = contactData;
  } else {
    // Try leads table if contact not found
    const { data: leadData, error: leadError } = await supabaseAdmin
      .from('leads')
      .select('id, first_name, last_name, city, state, zip, email')
      .eq('id', contact_id)
      .maybeSingle();

    if (leadData) {
      // Map lead to contact format
      contact = {
        id: leadData.id,
        first_name: leadData.first_name,
        last_name: leadData.last_name,
        city: null, // Leads might not have city
        state: null,
        zip: null,
        roof_type_guess: null,
        roof_issue: null,
        custom_fields: {},
      };
    }
  }

  if (!contact) {
    throw new Error(`Contact/Lead not found: ${contact_id}`);
  }

  // 2. Load account profile
  const { data: campaign } = await supabaseAdmin
    .from('campaigns')
    .select('workspace_id')
    .eq('id', campaign_id)
    .single();

  if (!campaign) {
    throw new Error(`Campaign not found: ${campaign_id}`);
  }

  const { data: profile } = await supabaseAdmin
    .from('account_profiles')
    .select('*')
    .eq('workspace_id', campaign.workspace_id)
    .maybeSingle<AccountProfile>();

  const accountProfile: AccountProfile = profile || {};

  // 3. Build dynamic data
  const dynamicData = await buildDynamicData(contact, accountProfile);

  // 4. Build token map
  const tokenMap: TokenMap = {
    homeowner_name: contact.first_name || 'there',
    city: contact.city || '',
    service_area: accountProfile.service_area || '',
    recent_weather_event: dynamicData.recent_weather_event,
    owner_name: accountProfile.owner_name || '',
    company_name: accountProfile.company_name || '',
    roof_type: contact.roof_type_guess || 'your roof',
    roof_issue: contact.roof_issue || dynamicData.roofing_detail || 'your roof condition',
  };

  // 5. Token Replacement Layer
  let personalizedSubject = replaceTokens(template_subject, tokenMap);
  let personalizedBody = replaceTokens(template_body, tokenMap);

  // 6. Human Rewrite Layer
  try {
    const rewritten = await humanRewrite(personalizedSubject, personalizedBody, {
      homeowner_name: tokenMap.homeowner_name,
      city: tokenMap.city,
      service_area: tokenMap.service_area,
      recent_weather_event: tokenMap.recent_weather_event,
      roof_issue: tokenMap.roof_issue,
      owner_name: tokenMap.owner_name,
      company_name: tokenMap.company_name,
    });
    personalizedSubject = rewritten.subject;
    personalizedBody = rewritten.body;
  } catch (error) {
    console.error('Human rewrite failed, using token-replaced version:', error);
    // Continue with token-replaced version
  }

  // 7. Tone Control Layer
  personalizedSubject = applyToneControl(personalizedSubject);
  personalizedBody = applyToneControl(personalizedBody);

  // 8. Spam Reduction Layer
  const spamResult = reduceSpam(personalizedBody);
  personalizedBody = spamResult.cleaned;

  // 9. Calculate readability score (simple word count / sentence count)
  const wordCount = personalizedBody.split(/\s+/).length;
  const sentenceCount = personalizedBody.split(/[.!?]+/).filter(s => s.trim().length > 0).length;
  const readabilityScore = sentenceCount > 0 ? wordCount / sentenceCount : 0;

  return {
    subject: personalizedSubject,
    body: personalizedBody,
    metadata: {
      readability_score: readabilityScore,
      spam_score: spamResult.spamScore,
      local_features: [
        dynamicData.local_reference,
        dynamicData.recent_weather_event,
      ].filter(Boolean),
      roofing_context_injected: !!dynamicData.roofing_detail,
    },
  };
}

