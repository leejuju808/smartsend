// Block 10400 — Smart Personalization Engine v1
// Generates hyper-personalized email openers and local-context sentences

export type CampaignType = 'hail' | 'storm' | 'inspection' | 'insurance' | 'general';

export interface PersonalizationRequest {
  name?: string;
  city?: string;
  state?: string;
  zip?: string;
  tags?: string[];
  campaignType: CampaignType;
  tone?: 'friendly' | 'direct' | 'professional';
}

export interface PersonalizationResult {
  opener: string;
  local_reference: string;
  roof_context: string;
}

const OPENAI_API_KEY = process.env.OPENAI_API_KEY;
const OPENAI_MODEL = process.env.OPENAI_MODEL || 'gpt-4o-mini';

/**
 * Generate personalized content using OpenAI
 */
export async function generatePersonalization(
  request: PersonalizationRequest
): Promise<PersonalizationResult> {
  if (!OPENAI_API_KEY) {
    throw new Error('OPENAI_API_KEY not configured');
  }

  const tone = request.tone || 'direct';
  
  // Build context from available data
  const locationParts: string[] = [];
  if (request.city) locationParts.push(request.city);
  if (request.state) locationParts.push(request.state);
  const location = locationParts.length > 0 ? locationParts.join(', ') : null;

  const tags = request.tags || [];
  const hasHail = tags.some(t => t.toLowerCase().includes('hail'));
  const hasStorm = tags.some(t => t.toLowerCase().includes('storm'));
  const hasInsurance = tags.some(t => t.toLowerCase().includes('insurance'));
  const hasLeak = tags.some(t => t.toLowerCase().includes('leak'));

  // Determine campaign context
  let campaignContext = request.campaignType;
  if (campaignContext === 'general' && hasHail) campaignContext = 'hail';
  if (campaignContext === 'general' && hasStorm) campaignContext = 'storm';

  const systemPrompt = `You are a roofing contractor email personalization assistant. 
Generate hyper-personalized, natural-sounding content for cold outreach emails.

Guidelines:
- Sound like a local roofer who knows the area
- Be direct and confident, no fluff
- Use contractor-friendly language ("We do free inspections", "We're in your area this week")
- Keep openers to 1-2 sentences max
- Keep local references and roof context to 1 sentence each
- Avoid generic phrases
- Don't make up specific storm dates or events unless context suggests it
- If location info is missing, use general but still personal language

Tone: ${tone === 'friendly' ? 'Warm and approachable' : tone === 'professional' ? 'Professional and polished' : 'Direct and confident'}`;

  const userPrompt = `Generate personalized content for a roofing outreach email.

Contact Info:
${request.name ? `Name: ${request.name}` : 'Name: Not provided'}
${location ? `Location: ${location}` : 'Location: Not provided'}
${request.zip ? `ZIP: ${request.zip}` : 'ZIP: Not provided'}
${tags.length > 0 ? `Tags: ${tags.join(', ')}` : 'Tags: None'}
Campaign Type: ${campaignContext}

Generate three pieces of content:

1. **Opener** (1-2 sentences): A personalized opening that references:
   - Location (if available): mention city/area, recent weather patterns, local roofing issues
   - Campaign context: ${campaignContext === 'hail' ? 'hail damage' : campaignContext === 'storm' ? 'storm damage' : campaignContext === 'inspection' ? 'roof inspection needs' : campaignContext === 'insurance' ? 'insurance claims' : 'roofing needs'}
   - Make it feel like you know their neighborhood

2. **Local Reference** (1 sentence): A short sentence that:
   - Mentions working in their area/neighborhood
   - References local context (storms, weather patterns, common roofing issues)
   - Sounds natural and local

3. **Roof Context** (1 sentence): A sentence about:
   - Common roofing issues for their situation
   - What you typically see in inspections
   - Relevant to their tags/campaign type

Return ONLY valid JSON in this exact format:
{
  "opener": "...",
  "local_reference": "...",
  "roof_context": "..."
}`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: OPENAI_MODEL,
        temperature: 0.7,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('OpenAI API error:', errorText);
      throw new Error(`OpenAI API error: ${response.status}`);
    }

    const data = await response.json();
    const content = data.choices?.[0]?.message?.content;
    
    if (!content) {
      throw new Error('No content returned from OpenAI');
    }

    const parsed = JSON.parse(content) as PersonalizationResult;

    // Validate structure
    if (!parsed.opener || !parsed.local_reference || !parsed.roof_context) {
      throw new Error('Invalid personalization structure returned');
    }

    return {
      opener: parsed.opener.trim(),
      local_reference: parsed.local_reference.trim(),
      roof_context: parsed.roof_context.trim(),
    };
  } catch (error: any) {
    console.error('Personalization generation error:', error);
    
    // Fallback to safe defaults
    return getFallbackPersonalization(request);
  }
}

/**
 * Fallback personalization when AI generation fails or data is missing
 */
function getFallbackPersonalization(request: PersonalizationRequest): PersonalizationResult {
  const location = request.city ? `${request.city}${request.state ? `, ${request.state}` : ''}` : 'your area';
  
  let opener = `Wanted to reach out quickly — we're checking in with homeowners in ${location} about roofing needs this month.`;
  
  if (request.campaignType === 'hail' && request.city) {
    opener = `I saw the hail that hit parts of ${request.city} recently — a lot of roofs here took some real hits.`;
  } else if (request.campaignType === 'storm' && request.city) {
    opener = `After the recent storms in ${request.city}, we're helping homeowners assess roof damage.`;
  } else if (request.city) {
    opener = `I noticed ${request.city}'s been getting some weather swings — perfect time to catch small roof issues before they turn big.`;
  }

  const local_reference = `We're already working with a few homeowners near ${location} this week.`;
  
  let roof_context = 'Most people don't notice issues until they see leaks or missing shingles.';
  if (request.campaignType === 'hail') {
    roof_context = 'Most hail damage we see includes bruised shingles and hidden leaks that show up later.';
  } else if (request.campaignType === 'storm') {
    roof_context = 'Storm damage often includes lifted shingles, damaged flashing, and water intrusion points.';
  } else if (request.campaignType === 'inspection') {
    roof_context = 'These freeze–thaw swings can cause cracked shingles and lifted flashing.';
  }

  return {
    opener,
    local_reference,
    roof_context,
  };
}





























































