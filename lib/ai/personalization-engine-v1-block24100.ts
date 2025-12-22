/**
 * Block 24100 — SmartSend Roofing Message Personalization Engine v1
 * 
 * FULL PERSONALIZATION ENGINE — ZERO FLUFF.
 * 
 * Every personalization rule directly increases:
 * ✔ opens
 * ✔ replies
 * ✔ booked inspections
 * ✔ roofing revenue
 * ✔ roofer retention
 * 
 * This is the system that makes SmartSend feel like a real human from the roofer's company — not AI.
 * 
 * THE 5 PERSONALIZATION LAYERS:
 * 
 * Layer 1 — Local Area Personalization (City + Neighborhood)
 * Layer 2 — Weather + Storm Personalization (Critical)
 * Layer 3 — Homeowner Behavior Personalization
 * Layer 4 — Roof-Specific Personalization
 * Layer 5 — Human Voice Personalization (AI Tone Matching)
 */

import { createClient } from '@supabase/supabase-js';
import { generateLocalPersonalizationTokens, LocalPersonalizationContext } from './local-personalization-engine';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : null;

export interface PersonalizationRequestV1 {
  template_body: string;
  template_subject: string;
  contact_id?: string;
  lead_id?: string;
  campaign_id: string;
  workspace_id: string;
}

export interface PersonalizationResultV1 {
  subject: string;
  body: string;
  opener?: string;
  personalization_score: number;
  layers_applied: {
    layer1_local: boolean;
    layer2_weather: boolean;
    layer3_behavior: boolean;
    layer4_roof: boolean;
    layer5_voice: boolean;
  };
  metadata: {
    tokens_used: string[];
    local_features: string[];
    weather_context?: {
      type?: string;
      date?: string;
      risk_level?: string;
    };
    behavior_context?: {
      last_reply?: string;
      last_open?: string;
      follow_up_count?: number;
    };
    roof_context?: {
      roof_type?: string;
      job_type?: string;
      roof_age?: number;
    };
    voice_matched?: boolean;
    fallbacks_applied: string[];
  };
}

interface PersonalizationCache {
  city?: string | null;
  neighborhood?: string | null;
  zip_code?: string | null;
  last_storm_type?: string | null;
  last_storm_date?: string | null;
  storm_risk_level?: string | null;
  follow_up_count?: number;
  last_reply_date?: string | null;
  last_open_date?: string | null;
  days_since_last_reply?: number | null;
  days_since_last_open?: number | null;
  behavior_summary?: string | null;
  roof_type?: string | null;
  job_type_guess?: string | null;
  leak_location?: string | null;
  roof_age_years?: number | null;
  home_age_years?: number | null;
  project_quoted?: boolean;
  past_quote_amount?: number | null;
  time_since_last_quote?: string | null;
  roofer_voice_profile_id?: string | null;
  tone_matched?: string | null;
  generated_opener?: string | null;
  personalization_score?: number | null;
}

interface RooferVoiceProfile {
  tone_preference?: string;
  sentence_length_avg?: number;
  greeting_style?: string[];
  signoff_style?: string[];
  common_phrases?: string[];
  uses_contractions?: boolean;
  uses_emojis?: boolean;
  uses_exclamation?: boolean;
}

/**
 * Get or rebuild personalization cache
 */
async function getPersonalizationCache(
  contactId?: string,
  leadId?: string,
  workspaceId: string
): Promise<PersonalizationCache | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  // Try to get from cache first
  let query = supabaseAdmin
    .from('personalization_cache_v1')
    .select('*')
    .eq('workspace_id', workspaceId);

  if (contactId) {
    query = query.eq('contact_id', contactId);
  } else if (leadId) {
    query = query.eq('lead_id', leadId);
  } else {
    return null;
  }

  const { data: cached, error } = await query.maybeSingle();

  if (cached && cached.expires_at && new Date(cached.expires_at) > new Date()) {
    return cached as PersonalizationCache;
  }

  // Rebuild cache if expired or missing
  try {
    const { data: rebuildResult, error: rebuildError } = await supabaseAdmin
      .rpc('rebuild_personalization_cache_v1', {
        p_contact_id: contactId || null,
        p_lead_id: leadId || null,
        p_workspace_id: workspaceId,
      });

    if (rebuildError) {
      console.error('Failed to rebuild personalization cache:', rebuildError);
      return null;
    }

    // Fetch the newly created cache
    let finalQuery = supabaseAdmin
      .from('personalization_cache_v1')
      .select('*')
      .eq('workspace_id', workspaceId);

    if (contactId) {
      finalQuery = finalQuery.eq('contact_id', contactId);
    } else if (leadId) {
      finalQuery = finalQuery.eq('lead_id', leadId);
    }

    const { data: finalCache } = await finalQuery.maybeSingle();
    return finalCache as PersonalizationCache | null;
  } catch (error) {
    console.error('Error rebuilding personalization cache:', error);
    return null;
  }
}

/**
 * Get roofer voice profile
 */
async function getRooferVoiceProfile(
  workspaceId: string,
  rooferId?: string
): Promise<RooferVoiceProfile | null> {
  if (!supabaseAdmin) {
    return null;
  }

  let query = supabaseAdmin
    .from('roofer_voice_profiles')
    .select('*')
    .eq('workspace_id', workspaceId);

  if (rooferId) {
    query = query.eq('roofer_id', rooferId);
  }

  const { data: profile } = await query.maybeSingle();
  return profile as RooferVoiceProfile | null;
}

/**
 * Layer 1: Generate Local Area Personalization
 */
function generateLayer1Local(cache: PersonalizationCache | null): {
  tokens: Record<string, string>;
  phrases: string[];
} {
  const tokens: Record<string, string> = {};
  const phrases: string[] = [];

  if (cache?.city) {
    tokens.city = cache.city;
    phrases.push(`Quick question about your roof here in ${cache.city}.`);
  }

  if (cache?.neighborhood) {
    tokens.neighborhood = cache.neighborhood;
    phrases.push(`Anyone near ${cache.neighborhood} seeing wind damage?`);
  }

  if (cache?.zip_code) {
    tokens.zip_code = cache.zip_code;
  }

  return { tokens, phrases };
}

/**
 * Layer 2: Generate Weather + Storm Personalization
 */
function generateLayer2Weather(cache: PersonalizationCache | null): {
  tokens: Record<string, string>;
  phrases: string[];
} {
  const tokens: Record<string, string> = {};
  const phrases: string[] = [];

  if (cache?.last_storm_type && cache?.last_storm_date) {
    tokens.last_storm_type = cache.last_storm_type;
    tokens.last_storm_date = cache.last_storm_date;

    const cityRef = cache.city ? ` in ${cache.city}` : '';
    
    switch (cache.last_storm_type) {
      case 'hail':
        phrases.push(`Hail passed through${cityRef} ${cache.last_storm_date} — inspections filling up.`);
        phrases.push(`Hail passed through${cityRef} yesterday afternoon — want a free check for cracks or granule loss?`);
        break;
      case 'wind':
        phrases.push(`Wind gusts hit 40mph last night — lifted shingles are common.`);
        phrases.push(`Saw the wind hit 40mph this week — want us to check for lifted shingles?`);
        break;
      case 'rain':
        phrases.push(`Heavy rain${cityRef} can reveal roof issues — noticed any leaks?`);
        break;
      case 'snow':
        phrases.push(`The freeze${cityRef} can cause ice dams — want me to check your roof?`);
        break;
    }
  }

  if (cache?.storm_risk_level === 'high') {
    tokens.storm_risk_level = cache.storm_risk_level;
    phrases.push(`Storm season is here — want us to take a look before it gets worse?`);
  }

  return { tokens, phrases };
}

/**
 * Layer 3: Generate Homeowner Behavior Personalization
 */
function generateLayer3Behavior(cache: PersonalizationCache | null): {
  tokens: Record<string, string>;
  phrases: string[];
} {
  const tokens: Record<string, string> = {};
  const phrases: string[] = [];

  if (cache?.last_reply_date && cache?.days_since_last_reply) {
    const days = cache.days_since_last_reply;
    if (days > 0 && days < 7) {
      phrases.push(`Haven't heard back since earlier — still dealing with that leak?`);
    }
  }

  if (cache?.last_open_date && cache?.days_since_last_open) {
    const days = cache.days_since_last_open;
    if (days === 0 || days === 1) {
      phrases.push(`Saw you opened our message yesterday — want us to swing by?`);
    }
  }

  if (cache?.follow_up_count && cache.follow_up_count > 0) {
    tokens.follow_up_count = cache.follow_up_count.toString();
    if (cache.follow_up_count === 1) {
      phrases.push(`Just checking back in — still need help with your roof?`);
    } else if (cache.follow_up_count >= 2) {
      phrases.push(`This will be my last follow-up — if you still need help, I'm happy to take a look.`);
    }
  }

  return { tokens, phrases };
}

/**
 * Layer 4: Generate Roof-Specific Personalization
 */
function generateLayer4Roof(cache: PersonalizationCache | null): {
  tokens: Record<string, string>;
  phrases: string[];
} {
  const tokens: Record<string, string> = {};
  const phrases: string[] = [];

  if (cache?.roof_age_years) {
    tokens.roof_age_years = cache.roof_age_years.toString();
    phrases.push(`Since your roof is around ${cache.roof_age_years} years old, we recommend checking the flashing.`);
  }

  if (cache?.leak_location) {
    tokens.leak_location = cache.leak_location;
    phrases.push(`Following up on the leak ${cache.leak_location} — want us to take a look this week?`);
  }

  if (cache?.job_type_guess) {
    tokens.job_type_guess = cache.job_type_guess;
    if (cache.job_type_guess === 'repair') {
      phrases.push(`We can take care of that repair this week.`);
    } else if (cache.job_type_guess === 'replacement') {
      phrases.push(`Since you're looking at replacement, we can get you a quote this week.`);
    }
  }

  if (cache?.roof_type) {
    tokens.roof_type = cache.roof_type;
  }

  if (cache?.project_quoted && cache?.time_since_last_quote) {
    tokens.time_since_last_quote = cache.time_since_last_quote;
    phrases.push(`Just checking — any questions about the estimate ${cache.time_since_last_quote}?`);
  }

  return { tokens, phrases };
}

/**
 * Layer 5: Apply Human Voice Personalization (Tone Matching)
 */
function applyLayer5Voice(
  text: string,
  voiceProfile: RooferVoiceProfile | null
): string {
  if (!voiceProfile) {
    return text;
  }

  let output = text;

  // Apply tone preferences
  if (voiceProfile.tone_preference === 'casual') {
    // Make it more casual
    output = output.replace(/Hi there/g, 'Hey');
    output = output.replace(/I would like/g, "I'd like");
    output = output.replace(/I will/g, "I'll");
  } else if (voiceProfile.tone_preference === 'formal') {
    // Make it more formal
    output = output.replace(/Hey/g, 'Hi');
    output = output.replace(/I'll/g, 'I will');
  }

  // Apply greeting style
  if (voiceProfile.greeting_style && voiceProfile.greeting_style.length > 0) {
    const greeting = voiceProfile.greeting_style[0];
    output = output.replace(/^(Hey|Hi|Hello)/, greeting);
  }

  // Apply signoff style
  if (voiceProfile.signoff_style && voiceProfile.signoff_style.length > 0) {
    const signoff = voiceProfile.signoff_style[0];
    // Replace common signoffs
    output = output.replace(/(Best|Thanks|Thank you|Regards)[,\s]*$/i, signoff);
  }

  // Apply contractions preference
  if (voiceProfile.uses_contractions === false) {
    output = output.replace(/I'll/g, 'I will');
    output = output.replace(/I'd/g, 'I would');
    output = output.replace(/can't/g, 'cannot');
    output = output.replace(/won't/g, 'will not');
  }

  // Remove emojis if not used
  if (voiceProfile.uses_emojis === false) {
    output = output.replace(/[😀-🙏🌀-🗿]/g, '');
  }

  // Remove exclamation if not used
  if (voiceProfile.uses_exclamation === false) {
    output = output.replace(/!/g, '.');
  }

  return output;
}

/**
 * Generate personalized opener based on all layers
 */
function generatePersonalizedOpener(
  cache: PersonalizationCache | null,
  layer1: { phrases: string[] },
  layer2: { phrases: string[] },
  layer3: { phrases: string[] },
  layer4: { phrases: string[] },
  firstName?: string
): string {
  const name = firstName || 'there';

  // Priority: Storm > Behavior > Roof > Local
  if (layer2.phrases.length > 0) {
    return layer2.phrases[0];
  }

  if (layer3.phrases.length > 0) {
    return layer3.phrases[0];
  }

  if (layer4.phrases.length > 0) {
    return layer4.phrases[0];
  }

  if (layer1.phrases.length > 0) {
    return layer1.phrases[0];
  }

  // Default opener
  return `Hey ${name}, quick question about your roof — mind if I take a look?`;
}

/**
 * Calculate personalization score (0-100)
 */
function calculatePersonalizationScore(
  cache: PersonalizationCache | null,
  layersApplied: PersonalizationResultV1['layers_applied']
): number {
  let score = 0;

  // Layer 1: Local (20 points max)
  if (layersApplied.layer1_local) {
    score += cache?.city ? 10 : 0;
    score += cache?.neighborhood ? 10 : 0;
  }

  // Layer 2: Weather (25 points max)
  if (layersApplied.layer2_weather) {
    score += cache?.last_storm_type ? 15 : 0;
    score += cache?.storm_risk_level === 'high' ? 10 : 0;
  }

  // Layer 3: Behavior (20 points max)
  if (layersApplied.layer3_behavior) {
    score += cache?.last_open_date ? 10 : 0;
    score += cache?.last_reply_date ? 10 : 0;
  }

  // Layer 4: Roof (25 points max)
  if (layersApplied.layer4_roof) {
    score += cache?.roof_type ? 8 : 0;
    score += cache?.job_type_guess ? 8 : 0;
    score += cache?.roof_age_years ? 9 : 0;
  }

  // Layer 5: Voice (10 points max)
  if (layersApplied.layer5_voice) {
    score += 10;
  }

  return Math.min(score, 100);
}

/**
 * Replace tokens in template
 */
function replaceTokens(template: string, tokenMap: Record<string, string>): string {
  let output = template;

  Object.entries(tokenMap).forEach(([key, value]) => {
    const regex = new RegExp(`\\{\\{${key}\\}\\}`, 'g');
    output = output.replace(regex, value || '');
  });

  return output;
}

/**
 * Main personalization function
 */
export async function personalizeEmailV1Block24100(
  request: PersonalizationRequestV1
): Promise<PersonalizationResultV1> {
  const { template_body, template_subject, contact_id, lead_id, campaign_id, workspace_id } = request;

  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  // Get contact/lead data
  let firstName = '';
  let contactData: any = null;

  if (contact_id) {
    const { data } = await supabaseAdmin
      .from('contacts')
      .select('first_name, city, state, zip, neighborhood')
      .eq('id', contact_id)
      .maybeSingle();
    contactData = data;
    firstName = data?.first_name || '';
  } else if (lead_id) {
    const { data } = await supabaseAdmin
      .from('leads')
      .select('first_name, city, state, zip')
      .eq('id', lead_id)
      .maybeSingle();
    contactData = data;
    firstName = data?.first_name || '';
  }

  // Get personalization cache
  const cache = await getPersonalizationCache(contact_id, lead_id, workspace_id);

  // Get roofer voice profile
  const { data: campaign } = await supabaseAdmin
    .from('campaigns')
    .select('workspace_id')
    .eq('id', campaign_id)
    .maybeSingle();

  let voiceProfile: RooferVoiceProfile | null = null;
  if (campaign?.workspace_id) {
    voiceProfile = await getRooferVoiceProfile(campaign.workspace_id);
  }

  // Generate all 5 layers
  const layer1 = generateLayer1Local(cache);
  const layer2 = generateLayer2Weather(cache);
  const layer3 = generateLayer3Behavior(cache);
  const layer4 = generateLayer4Roof(cache);

  // Build token map
  const tokenMap: Record<string, string> = {
    first_name: firstName || 'there',
    ...layer1.tokens,
    ...layer2.tokens,
    ...layer3.tokens,
    ...layer4.tokens,
  };

  // Generate personalized opener
  const opener = generatePersonalizedOpener(
    cache,
    layer1,
    layer2,
    layer3,
    layer4,
    firstName
  );

  // Replace tokens in template
  let personalizedSubject = replaceTokens(template_subject, tokenMap);
  let personalizedBody = replaceTokens(template_body, tokenMap);

  // Insert opener if {{opener}} token exists
  personalizedBody = personalizedBody.replace(/\{\{opener\}\}/g, opener);

  // Apply Layer 5: Voice matching
  personalizedSubject = applyLayer5Voice(personalizedSubject, voiceProfile);
  personalizedBody = applyLayer5Voice(personalizedBody, voiceProfile);

  // Determine which layers were applied
  const layersApplied = {
    layer1_local: layer1.phrases.length > 0 || !!cache?.city,
    layer2_weather: layer2.phrases.length > 0 || !!cache?.last_storm_type,
    layer3_behavior: layer3.phrases.length > 0 || !!cache?.last_open_date,
    layer4_roof: layer4.phrases.length > 0 || !!cache?.roof_type,
    layer5_voice: !!voiceProfile,
  };

  // Calculate personalization score
  const personalizationScore = calculatePersonalizationScore(cache, layersApplied);

  // Collect tokens used
  const tokensUsed = Object.keys(tokenMap).filter(key => tokenMap[key] && tokenMap[key].trim() !== '');

  // Build metadata
  const metadata: PersonalizationResultV1['metadata'] = {
    tokens_used: tokensUsed,
    local_features: [
      cache?.city,
      cache?.neighborhood,
      cache?.zip_code,
    ].filter(Boolean) as string[],
    weather_context: cache?.last_storm_type ? {
      type: cache.last_storm_type,
      date: cache.last_storm_date || undefined,
      risk_level: cache.storm_risk_level || undefined,
    } : undefined,
    behavior_context: {
      last_reply: cache?.last_reply_date || undefined,
      last_open: cache?.last_open_date || undefined,
      follow_up_count: cache?.follow_up_count || undefined,
    },
    roof_context: {
      roof_type: cache?.roof_type || undefined,
      job_type: cache?.job_type_guess || undefined,
      roof_age: cache?.roof_age_years || undefined,
    },
    voice_matched: !!voiceProfile,
    fallbacks_applied: [],
  };

  return {
    subject: personalizedSubject,
    body: personalizedBody,
    opener,
    personalization_score: personalizationScore,
    layers_applied: layersApplied,
    metadata,
  };
}

