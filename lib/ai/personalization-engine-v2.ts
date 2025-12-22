/**
 * Block 15700 — SmartSend Personalization Engine v2
 * 
 * The Deep Roofing-Specific Personalization Layer:
 * - 18 roofing-power tokens
 * - Personalized openers based on context
 * - Tone variations (urgent, helpful, advisory, friendly, conversational, confident, polished, simple)
 * - Personalization score (0-100)
 * - Smart fallback logic
 * - Conditional insert blocks ({% if %} syntax)
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : null;

export interface PersonalizationRequestV2 {
  template_body: string;
  template_subject: string;
  contact_id: string;
  campaign_id: string;
}

export interface PersonalizationResultV2 {
  subject: string;
  body: string;
  opener?: string;
  personalization_score: number;
  tone?: string;
  metadata: {
    tokens_used: string[];
    local_features: string[];
    storm_context?: {
      type?: string;
      date?: string;
      risk_level?: string;
    };
    fallbacks_applied: string[];
    warnings?: string[];
  };
}

interface TokenMapV2 {
  [key: string]: string;
}

interface PersonalizationCache {
  contact_id: string;
  neighborhood?: string | null;
  last_storm_type?: string | null;
  last_storm_date?: string | null;
  storm_risk_level?: string | null;
  claim_likelihood?: string | null;
  home_value_class?: string | null;
  job_type_guess?: string | null;
  past_quote_amount?: number | null;
  time_since_last_quote?: string | null;
  local_landmark?: string | null;
  roof_age_guess?: string | null;
  inspection_eta?: string | null;
  company_name?: string | null;
  roofer_name?: string | null;
  booking_link?: string | null;
  generated_opener?: string | null;
  personalization_score?: number | null;
  tone?: string | null;
  token_map?: Record<string, string>;
}

/**
 * Get or rebuild personalization cache for a contact
 */
async function getPersonalizationCache(contactId: string): Promise<PersonalizationCache | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  // Try to get from cache first
  const { data: cached, error: cacheError } = await supabaseAdmin
    .from('personalization_cache')
    .select('*')
    .eq('contact_id', contactId)
    .maybeSingle();

  if (cached && !cacheError) {
    return cached as PersonalizationCache;
  }

  // If not cached or expired, rebuild it
  try {
    const { data: rebuildResult, error: rebuildError } = await supabaseAdmin
      .rpc('rebuild_personalization_cache', { p_contact_id: contactId });

    if (rebuildError) {
      console.error('Failed to rebuild personalization cache:', rebuildError);
      return null;
    }

    // Fetch the newly created cache
    const { data: newCache } = await supabaseAdmin
      .from('personalization_cache')
      .select('*')
      .eq('contact_id', contactId)
      .maybeSingle();

    return newCache as PersonalizationCache | null;
  } catch (error) {
    console.error('Error rebuilding personalization cache:', error);
    return null;
  }
}

/**
 * Build comprehensive token map with all 18 v2 tokens
 */
async function buildTokenMapV2(
  contactId: string,
  campaignId: string
): Promise<{ tokenMap: TokenMapV2; cache: PersonalizationCache | null; fallbacks: string[] }> {
  const cache = await getPersonalizationCache(contactId);
  const fallbacks: string[] = [];
  const tokenMap: TokenMapV2 = {};

  // Get contact data
  const { data: contact } = await supabaseAdmin!
    .from('contacts')
    .select('first_name, city, state, zip, past_quote_amount')
    .eq('id', contactId)
    .maybeSingle();

  // Get campaign data for booking link
  const { data: campaign } = await supabaseAdmin!
    .from('campaigns')
    .select('workspace_id, booking_link')
    .eq('id', campaignId)
    .maybeSingle();

  // Get workspace profile for company/roofer name
  let companyName = '';
  let rooferName = '';
  if (campaign?.workspace_id) {
    const { data: profile } = await supabaseAdmin!
      .from('workspace_profile')
      .select('company_name, owner_name')
      .eq('workspace_id', campaign.workspace_id)
      .maybeSingle();
    
    companyName = profile?.company_name || '';
    rooferName = profile?.owner_name || '';
  }

  // 1️⃣ {{first_name}}
  tokenMap.first_name = contact?.first_name || 'there';

  // 2️⃣ {{neighborhood}}
  if (cache?.neighborhood) {
    tokenMap.neighborhood = cache.neighborhood;
  } else if (contact?.city) {
    tokenMap.neighborhood = contact.city;
    fallbacks.push('neighborhood -> city');
  } else {
    tokenMap.neighborhood = '';
  }

  // 3️⃣ {{city}}
  tokenMap.city = contact?.city || '';

  // 4️⃣ {{zip}}
  tokenMap.zip = contact?.zip || '';

  // 5️⃣ {{last_storm_type}}
  if (cache?.last_storm_type) {
    tokenMap.last_storm_type = cache.last_storm_type;
  } else {
    tokenMap.last_storm_type = '';
  }

  // 6️⃣ {{last_storm_date}}
  if (cache?.last_storm_date) {
    // Format date using database function or fallback
    try {
      const { data: formatted, error } = await supabaseAdmin!
        .rpc('format_storm_date', { p_storm_date: cache.last_storm_date });
      tokenMap.last_storm_date = formatted || cache.last_storm_date || '';
    } catch (err) {
      // Fallback: use humanize_date or raw date
      const { data: humanized } = await supabaseAdmin!
        .rpc('humanize_date', { p_date: cache.last_storm_date });
      tokenMap.last_storm_date = humanized || cache.last_storm_date || '';
    }
  } else {
    tokenMap.last_storm_date = '';
  }

  // 7️⃣ {{storm_risk_level}}
  tokenMap.storm_risk_level = cache?.storm_risk_level || 'low';

  // 8️⃣ {{claim_likelihood}}
  tokenMap.claim_likelihood = cache?.claim_likelihood || 'low';

  // 9️⃣ {{home_value_class}}
  tokenMap.home_value_class = cache?.home_value_class || 'mid-range';

  // 🔟 {{job_type_guess}}
  tokenMap.job_type_guess = cache?.job_type_guess || 'replacement';

  // 1️⃣1️⃣ {{past_quote_amount}}
  if (cache?.past_quote_amount) {
    tokenMap.past_quote_amount = `$${cache.past_quote_amount.toLocaleString()}`;
  } else if (contact?.past_quote_amount) {
    tokenMap.past_quote_amount = `$${contact.past_quote_amount.toLocaleString()}`;
  } else {
    tokenMap.past_quote_amount = ''; // Hidden if missing
  }

  // 1️⃣2️⃣ {{time_since_last_quote}}
  if (cache?.time_since_last_quote) {
    tokenMap.time_since_last_quote = cache.time_since_last_quote;
  } else {
    tokenMap.time_since_last_quote = '';
  }

  // 1️⃣3️⃣ {{local_landmark}}
  if (cache?.local_landmark) {
    tokenMap.local_landmark = cache.local_landmark;
  } else {
    tokenMap.local_landmark = ''; // Removed if missing
  }

  // 1️⃣4️⃣ {{roof_age_guess}}
  if (cache?.roof_age_guess) {
    tokenMap.roof_age_guess = cache.roof_age_guess;
  } else {
    tokenMap.roof_age_guess = ''; // Removed if missing
  }

  // 1️⃣5️⃣ {{inspection_eta}}
  tokenMap.inspection_eta = cache?.inspection_eta || 'later this week';

  // 1️⃣6️⃣ {{company_name}}
  tokenMap.company_name = companyName || cache?.company_name || '';

  // 1️⃣7️⃣ {{roofer_name}}
  tokenMap.roofer_name = rooferName || cache?.roofer_name || '';

  // 1️⃣8️⃣ {{booking_link}}
  tokenMap.booking_link = campaign?.booking_link || cache?.booking_link || '';

  return { tokenMap, cache, fallbacks };
}

/**
 * Process conditional insert blocks ({% if %} syntax)
 */
function processConditionalBlocks(template: string, tokenMap: TokenMapV2): string {
  let output = template;

  // Match {% if token == 'value' %} ... {% endif %}
  const conditionalRegex = /\{%\s*if\s+(\w+)\s*==\s*['"]([^'"]+)['"]\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
  
  output = output.replace(conditionalRegex, (match, token, value, content) => {
    const tokenValue = tokenMap[token] || '';
    if (tokenValue === value) {
      return content;
    }
    return '';
  });

  // Match {% if token %} ... {% endif %} (truthy check)
  const truthyRegex = /\{%\s*if\s+(\w+)\s*%\}([\s\S]*?)\{%\s*endif\s*%\}/g;
  
  output = output.replace(truthyRegex, (match, token, content) => {
    const tokenValue = tokenMap[token] || '';
    if (tokenValue && tokenValue.trim() !== '') {
      return content;
    }
    return '';
  });

  return output;
}

/**
 * Replace tokens with fallback logic
 */
function replaceTokensV2(template: string, tokenMap: TokenMapV2): string {
  let output = template;

  // First process conditional blocks
  output = processConditionalBlocks(output, tokenMap);

  // Then replace tokens (support both {{token}} and {token} formats for backward compatibility)
  Object.entries(tokenMap).forEach(([token, value]) => {
    // Support both {{token}} (v2) and {token} (v1) formats
    const regexV2 = new RegExp(`\\{\\{${token}\\}\\}`, 'g');
    const regexV1 = new RegExp(`\\{${token}\\}`, 'g');
    
    // Apply fallback logic
    let replacement = value;
    
    if (!replacement || replacement.trim() === '') {
      // Fallback rules
      switch (token) {
        case 'neighborhood':
          replacement = tokenMap.city || '';
          break;
        case 'past_quote_amount':
        case 'local_landmark':
        case 'roof_age_guess':
          replacement = ''; // Hidden/removed
          break;
        case 'last_storm_type':
        case 'last_storm_date':
          // Remove entire line if storm info missing
          output = output.replace(new RegExp(`[^\\n]*\\{\\{${token}\\}\\}[^\\n]*\\n?`, 'g'), '');
          output = output.replace(new RegExp(`[^\\n]*\\{${token}\\}[^\\n]*\\n?`, 'g'), '');
          return; // Skip this replacement
        default:
          replacement = '';
      }
    }
    
    // Replace both formats
    output = output.replace(regexV2, replacement);
    output = output.replace(regexV1, replacement);
  });

  // Clean up empty lines
  output = output.replace(/\n\s*\n\s*\n/g, '\n\n');
  
  return output.trim();
}

/**
 * Generate personalized opener based on context
 */
function generateOpener(cache: PersonalizationCache | null, tokenMap: TokenMapV2): string {
  if (cache?.generated_opener) {
    return cache.generated_opener;
  }

  const firstName = tokenMap.first_name || 'there';

  // Storm example
  if (cache?.last_storm_type && cache?.last_storm_date) {
    return `Hey ${firstName}, saw your neighborhood got hit with ${cache.last_storm_type} ${tokenMap.last_storm_date} — want me to take a quick look?`;
  }

  // Old quote example
  if (cache?.past_quote_amount && cache?.time_since_last_quote) {
    return `Hey ${firstName}, we gave you a quote about ${cache.time_since_last_quote} — want me to recheck the roof or pricing?`;
  }

  // Neighborhood example
  if (cache?.neighborhood) {
    return `Hey ${firstName}, I've been working with a lot of homeowners around ${cache.neighborhood} lately.`;
  }

  // Insurance example
  if (cache?.claim_likelihood === 'high' || cache?.job_type_guess === 'insurance inspection') {
    return `If you're dealing with an insurance claim, I can help check the roof before the adjuster comes.`;
  }

  // Default
  return `Hey ${firstName}, quick question about your roof — mind if I take a look?`;
}

/**
 * Determine tone based on context
 */
function determineTone(cache: PersonalizationCache | null): string {
  if (cache?.tone) {
    return cache.tone;
  }

  // Auto-determine tone
  if (cache?.storm_risk_level === 'high' || cache?.last_storm_type) {
    return 'urgent';
  }
  if (cache?.past_quote_amount) {
    return 'helpful';
  }
  if (cache?.claim_likelihood === 'high' || cache?.job_type_guess === 'insurance inspection') {
    return 'advisory';
  }
  if (cache?.neighborhood) {
    return 'friendly';
  }
  if (cache?.job_type_guess === 'repair') {
    return 'conversational';
  }
  if (cache?.job_type_guess === 'replacement') {
    return 'confident';
  }
  if (cache?.home_value_class === 'premium') {
    return 'polished';
  }
  if (cache?.home_value_class === 'economy') {
    return 'simple';
  }

  return 'conversational';
}

/**
 * Calculate personalization score
 */
function calculatePersonalizationScore(
  tokenMap: TokenMapV2,
  cache: PersonalizationCache | null,
  hasOpener: boolean
): number {
  if (cache?.personalization_score !== null && cache?.personalization_score !== undefined) {
    return cache.personalization_score;
  }

  let score = 0;
  const tokensUsed: string[] = [];

  // Basic tokens (5 points each)
  const basicTokens = ['first_name', 'city', 'zip'];
  basicTokens.forEach(token => {
    if (tokenMap[token] && tokenMap[token].trim() !== '') {
      score += 5;
      tokensUsed.push(token);
    }
  });

  // Advanced tokens (10 points each)
  const advancedTokens = [
    'neighborhood', 'last_storm_type', 'last_storm_date',
    'local_landmark', 'past_quote_amount', 'roof_age_guess'
  ];
  advancedTokens.forEach(token => {
    if (tokenMap[token] && tokenMap[token].trim() !== '') {
      score += 10;
      tokensUsed.push(token);
    }
  });

  // Quality bonuses
  if (tokenMap.neighborhood || tokenMap.local_landmark) {
    score += 10; // Local reference bonus
  }
  if (tokenMap.last_storm_type || cache?.storm_risk_level === 'high') {
    score += 10; // Storm context bonus
  }
  if (hasOpener) {
    score += 15; // Personalized opener bonus
  }

  return Math.min(score, 100);
}

/**
 * Main personalization function v2
 */
export async function personalizeEmailV2(
  request: PersonalizationRequestV2
): Promise<PersonalizationResultV2> {
  const { template_body, template_subject, contact_id, campaign_id } = request;

  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  // Build token map
  const { tokenMap, cache, fallbacks } = await buildTokenMapV2(contact_id, campaign_id);

  // Generate opener
  const opener = generateOpener(cache, tokenMap);

  // Determine tone
  const tone = determineTone(cache);

  // Replace tokens with fallback logic
  let personalizedSubject = replaceTokensV2(template_subject, tokenMap);
  let personalizedBody = replaceTokensV2(template_body, tokenMap);

  // Calculate personalization score
  const personalizationScore = calculatePersonalizationScore(tokenMap, cache, !!opener);

  // Collect tokens used
  const tokensUsed = Object.entries(tokenMap)
    .filter(([_, value]) => value && value.trim() !== '')
    .map(([key]) => key);

  // Build metadata
  const metadata = {
    tokens_used: tokensUsed,
    local_features: [
      cache?.neighborhood,
      cache?.local_landmark,
      cache?.last_storm_type,
    ].filter(Boolean) as string[],
    storm_context: cache?.last_storm_type ? {
      type: cache.last_storm_type,
      date: cache.last_storm_date || undefined,
      risk_level: cache.storm_risk_level || undefined,
    } : undefined,
    fallbacks_applied: fallbacks,
    warnings: personalizationScore < 60 ? [
      'Boost personalization for better homeowner replies.'
    ] : undefined,
  };

  return {
    subject: personalizedSubject,
    body: personalizedBody,
    opener,
    personalization_score: personalizationScore,
    tone,
    metadata,
  };
}

