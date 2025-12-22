// Block 9300 — Template Library v1
// Personalization Engine for Token Replacement

import personalizationTokens from './personalization-tokens.json';

export interface PersonalizationContext {
  homeowner_name?: string;
  city?: string;
  service_area?: string;
  roof_issue?: string;
  roof_type?: string;
  recent_weather_event?: string;
  company_name?: string;
  owner_name?: string;
  season?: string;
  street_or_area?: string;
}

/**
 * Replace placeholders in template body/subject with actual values
 */
export function replaceTokens(
  text: string,
  context: PersonalizationContext
): string {
  let result = text;

  // Replace all tokens in the format {token_name}
  Object.entries(context).forEach(([key, value]) => {
    if (value) {
      const token = `{${key}}`;
      result = result.replace(new RegExp(token.replace(/[{}]/g, '\\$&'), 'g'), value);
    }
  });

  return result;
}

/**
 * Extract all placeholders from a template
 */
export function extractPlaceholders(text: string): string[] {
  const matches = text.match(/\{([^}]+)\}/g);
  if (!matches) return [];
  
  return matches.map(match => match.slice(1, -1)); // Remove { and }
}

/**
 * Get available tokens with descriptions
 */
export function getAvailableTokens(): Record<string, string> {
  return personalizationTokens.tokens;
}

/**
 * Personalize a template using AI (optional enhancement)
 * This can be enhanced to use OpenAI for more sophisticated personalization
 */
export async function personalizeWithAI(
  template: string,
  context: PersonalizationContext,
  options?: {
    tone?: 'friendly' | 'professional' | 'direct';
    maxWords?: number;
  }
): Promise<string> {
  // First, replace basic tokens
  let personalized = replaceTokens(template, context);

  // If OpenAI is available and configured, enhance with AI
  if (process.env.OPENAI_API_KEY && options) {
    try {
      const response = await fetch('https://api.openai.com/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.OPENAI_MODEL || 'gpt-4o-mini',
          messages: [
            {
              role: 'system',
              content: `You are a roofing contractor email personalization assistant.
Rewrite this email in a friendly, local roofing tone.
Keep it under ${options.maxWords || 120} words.
Insert local references if appropriate.
Use roofing-industry language and keep it simple.`
            },
            {
              role: 'user',
              content: `Template:\n${personalized}\n\nContext: ${JSON.stringify(context)}`
            }
          ],
          temperature: 0.7,
          max_tokens: 300,
        }),
      });

      if (response.ok) {
        const data = await response.json();
        const aiPersonalized = data.choices?.[0]?.message?.content;
        if (aiPersonalized) {
          // Replace tokens again in case AI added placeholders
          return replaceTokens(aiPersonalized, context);
        }
      }
    } catch (error) {
      console.error('AI personalization failed, using basic replacement:', error);
    }
  }

  return personalized;
}
























































