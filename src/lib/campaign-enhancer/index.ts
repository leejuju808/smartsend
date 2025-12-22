/**
 * Block 17100 — SmartSend AI Campaign Enhancer v1
 * 
 * The Intelligence Layer That Rewrites, Improves, Localizes & Storm-Optimizes Every Campaign Before Sending
 * 
 * 7 Enhancement Engines:
 * 1. Personalization Transformer
 * 2. Storm Intelligence Transformer
 * 3. Insurance Opportunity Transformer
 * 4. Deliverability Cleaner
 * 5. Tone Calibrator
 * 6. CTA Optimizer
 * 7. Subject Line Generator
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : null;

export interface EnhancementContext {
  campaignId: string;
  userId: string;
  originalSubject: string;
  originalBodyHtml: string;
  originalBodyText: string;
  recipientEmail?: string;
  recipientData?: {
    email: string;
    name?: string;
    city?: string;
    state?: string;
    zip?: string;
    neighborhood?: string;
    street?: string;
    roof_type_guess?: string;
    homeowner_likelihood?: string;
    property_type_guess?: string;
    storm_risk_level?: string;
  };
  listType?: 'storm_hits' | 'old_quotes' | 'past_customers' | 'neighborhood_canvassing' | 'cold_list' | 'insurance_claim' | 'high_value' | 'repair_opportunity';
  stormData?: {
    storm_date?: string;
    storm_type?: 'wind' | 'hail' | 'hurricane';
    zip_affected?: string;
    severity?: 'high' | 'medium' | 'low';
  };
  serviceArea?: {
    city?: string;
    neighborhoods?: string[];
    zip_codes?: string[];
  };
}

export interface EnhancementResult {
  enhanced_subject: string;
  enhanced_body_html: string;
  enhanced_body_text: string;
  enhancement_report: {
    personalization_applied: boolean;
    storm_context_added: boolean;
    insurance_optimized: boolean;
    deliverability_fixes: string[];
    tone_adjusted: string;
    cta_optimized: boolean;
    subject_generated: boolean;
    local_references: string[];
    improvements: string[];
  };
}

/**
 * Main enhancement function - orchestrates all 7 transformers
 */
export async function enhanceCampaign(context: EnhancementContext): Promise<EnhancementResult> {
  const report = {
    personalization_applied: false,
    storm_context_added: false,
    insurance_optimized: false,
    deliverability_fixes: [] as string[],
    tone_adjusted: 'neutral',
    cta_optimized: false,
    subject_generated: false,
    local_references: [] as string[],
    improvements: [] as string[],
  };

  let enhancedSubject = context.originalSubject;
  let enhancedBodyHtml = context.originalBodyHtml;
  let enhancedBodyText = context.originalBodyText;

  // 1. Personalization Transformer
  const personalizationResult = await applyPersonalization(context, enhancedBodyHtml, enhancedBodyText);
  enhancedBodyHtml = personalizationResult.html;
  enhancedBodyText = personalizationResult.text;
  if (personalizationResult.applied) {
    report.personalization_applied = true;
    report.local_references.push(...personalizationResult.localRefs);
    report.improvements.push('Added homeowner city, neighborhood, and local context');
  }

  // 2. Storm Intelligence Transformer
  if (context.stormData) {
    const stormResult = await applyStormIntelligence(context, enhancedBodyHtml, enhancedBodyText);
    enhancedBodyHtml = stormResult.html;
    enhancedBodyText = stormResult.text;
    report.storm_context_added = true;
    report.improvements.push('Added storm urgency and references');
  }

  // 3. Insurance Opportunity Transformer
  if (context.listType === 'insurance_claim' || context.recipientData?.homeowner_likelihood === 'high') {
    const insuranceResult = await applyInsuranceOptimization(context, enhancedBodyHtml, enhancedBodyText);
    enhancedBodyHtml = insuranceResult.html;
    enhancedBodyText = insuranceResult.text;
    report.insurance_optimized = true;
    report.improvements.push('Optimized for insurance claim opportunities');
  }

  // 4. Deliverability Cleaner
  const deliverabilityResult = await cleanDeliverability(enhancedBodyHtml, enhancedBodyText);
  enhancedBodyHtml = deliverabilityResult.html;
  enhancedBodyText = deliverabilityResult.text;
  report.deliverability_fixes = deliverabilityResult.fixes;
  if (deliverabilityResult.fixes.length > 0) {
    report.improvements.push(`Fixed ${deliverabilityResult.fixes.length} deliverability issues`);
  }

  // 5. Tone Calibrator
  const toneResult = await calibrateTone(context, enhancedBodyHtml, enhancedBodyText);
  enhancedBodyHtml = toneResult.html;
  enhancedBodyText = toneResult.text;
  report.tone_adjusted = toneResult.tone;
  if (toneResult.tone !== 'neutral') {
    report.improvements.push(`Adjusted tone to ${toneResult.tone}`);
  }

  // 6. CTA Optimizer
  const ctaResult = await optimizeCTA(context, enhancedBodyHtml, enhancedBodyText);
  enhancedBodyHtml = ctaResult.html;
  enhancedBodyText = ctaResult.text;
  report.cta_optimized = ctaResult.optimized;
  if (ctaResult.optimized) {
    report.improvements.push('Optimized call-to-action and booking link');
  }

  // 7. Subject Line Generator
  const subjectResult = await generateSubjectLine(context, enhancedSubject);
  enhancedSubject = subjectResult.subject;
  report.subject_generated = subjectResult.generated;
  if (subjectResult.generated) {
    report.improvements.push('Generated optimized subject line');
  }

  return {
    enhanced_subject: enhancedSubject,
    enhanced_body_html: enhancedBodyHtml,
    enhanced_body_text: enhancedBodyText,
    enhancement_report: report,
  };
}

/**
 * 1. Personalization Transformer
 */
async function applyPersonalization(
  context: EnhancementContext,
  html: string,
  text: string
): Promise<{ html: string; text: string; applied: boolean; localRefs: string[] }> {
  const localRefs: string[] = [];
  let applied = false;

  if (!context.recipientData) {
    return { html, text, applied, localRefs };
  }

  const { city, neighborhood, zip, street } = context.recipientData;

  // Inject city references
  if (city) {
    const cityRef = `near ${city}`;
    html = html.replace(/in your area/gi, cityRef);
    text = text.replace(/in your area/gi, cityRef);
    localRefs.push(city);
    applied = true;
  }

  // Inject neighborhood references
  if (neighborhood) {
    const neighborhoodRef = `in ${neighborhood}`;
    html = html.replace(/in your neighborhood/gi, neighborhoodRef);
    text = text.replace(/in your neighborhood/gi, neighborhoodRef);
    localRefs.push(neighborhood);
    applied = true;
  }

  // Inject street/address context
  if (street) {
    const streetName = street.split(' ')[0]; // Extract street name
    html = html.replace(/\{\{street_name\}\}/gi, streetName);
    text = text.replace(/\{\{street_name\}\}/gi, streetName);
    applied = true;
  }

  return { html, text, applied, localRefs };
}

/**
 * 2. Storm Intelligence Transformer
 */
async function applyStormIntelligence(
  context: EnhancementContext,
  html: string,
  text: string
): Promise<{ html: string; text: string }> {
  if (!context.stormData) {
    return { html, text };
  }

  const { storm_date, storm_type, severity } = context.stormData;
  const stormRefs: string[] = [];

  // Add storm date reference
  if (storm_date) {
    const dateRef = `after the ${storm_date} ${storm_type || 'storm'}`;
    html = html.replace(/recent storm/gi, dateRef);
    text = text.replace(/recent storm/gi, dateRef);
    stormRefs.push(dateRef);
  }

  // Add urgency based on severity
  if (severity === 'high') {
    const urgencyPhrase = 'Many roofs in your ZIP had shingle lift from the recent winds.';
    if (!html.includes(urgencyPhrase)) {
      html = html.replace(/(<p>|^)/, `$1<p>${urgencyPhrase}</p>`);
      text = text.replace(/^/, `${urgencyPhrase}\n\n`);
    }
  }

  return { html, text };
}

/**
 * 3. Insurance Opportunity Transformer
 */
async function applyInsuranceOptimization(
  context: EnhancementContext,
  html: string,
  text: string
): Promise<{ html: string; text: string }> {
  // Shift tone to helpful and add insurance context
  const insurancePhrases = [
    'no-obligation inspection',
    'help with your insurance claim',
    'work directly with your adjuster',
  ];

  let hasInsuranceContext = false;
  for (const phrase of insurancePhrases) {
    if (html.toLowerCase().includes(phrase) || text.toLowerCase().includes(phrase)) {
      hasInsuranceContext = true;
      break;
    }
  }

  if (!hasInsuranceContext) {
    const insuranceAddon = '<p>We can help you navigate the insurance process and work directly with your adjuster. This is a no-obligation inspection.</p>';
    html = html.replace(/(<\/body>|$)/, insuranceAddon + '$1');
    text = text + '\n\nWe can help you navigate the insurance process and work directly with your adjuster. This is a no-obligation inspection.';
  }

  return { html, text };
}

/**
 * 4. Deliverability Cleaner
 */
async function cleanDeliverability(
  html: string,
  text: string
): Promise<{ html: string; text: string; fixes: string[] }> {
  const fixes: string[] = [];

  // Check for spam triggers
  const spamTriggers = [
    /\b(click here|buy now|limited time|act now|urgent|free money)\b/gi,
  ];

  for (const trigger of spamTriggers) {
    if (trigger.test(html) || trigger.test(text)) {
      // Replace with less spammy alternatives
      html = html.replace(/\bclick here\b/gi, 'learn more');
      text = text.replace(/\bclick here\b/gi, 'learn more');
      fixes.push('Replaced spam trigger words');
    }
  }

  // Check for long paragraphs (split if > 5 sentences)
  const longParagraphRegex = /<p>([^<]{300,})<\/p>/gi;
  if (longParagraphRegex.test(html)) {
    html = html.replace(longParagraphRegex, (match, content) => {
      const sentences = content.split(/[.!?]+/).filter((s: string) => s.trim().length > 0);
      if (sentences.length > 5) {
        const mid = Math.floor(sentences.length / 2);
        const firstHalf = sentences.slice(0, mid).join('. ') + '.';
        const secondHalf = sentences.slice(mid).join('. ') + '.';
        fixes.push('Split long paragraph');
        return `<p>${firstHalf}</p><p>${secondHalf}</p>`;
      }
      return match;
    });
  }

  // Check for too many links
  const linkCount = (html.match(/<a\s+href/gi) || []).length;
  if (linkCount > 3) {
    fixes.push(`Found ${linkCount} links (consider reducing)`);
  }

  return { html, text, fixes };
}

/**
 * 5. Tone Calibrator
 */
async function calibrateTone(
  context: EnhancementContext,
  html: string,
  text: string
): Promise<{ html: string; text: string; tone: string }> {
  let tone = 'neutral';

  // Determine appropriate tone based on list type
  if (context.listType === 'past_customers') {
    tone = 'friendly';
    // Make it more conversational
    html = html.replace(/Dear/gi, 'Hi');
    text = text.replace(/Dear/gi, 'Hi');
  } else if (context.listType === 'insurance_claim') {
    tone = 'helpful';
    // More professional and helpful
    html = html.replace(/Hey/gi, 'Hello');
    text = text.replace(/Hey/gi, 'Hello');
  } else if (context.listType === 'storm_hits') {
    tone = 'urgent';
    // Add urgency markers
    if (!html.includes('important') && !html.includes('urgent')) {
      html = html.replace(/(<p>)/, '<p><strong>Important:</strong> ');
      text = text.replace(/^/, 'Important: ');
    }
  } else {
    tone = 'neighborly';
    // Friendly, local tone
    html = html.replace(/We're reaching out/gi, "We're reaching out as your local roofing team");
    text = text.replace(/We're reaching out/gi, "We're reaching out as your local roofing team");
  }

  return { html, text, tone };
}

/**
 * 6. CTA Optimizer
 */
async function optimizeCTA(
  context: EnhancementContext,
  html: string,
  text: string
): Promise<{ html: string; text: string; optimized: boolean }> {
  let optimized = false;

  // Ensure booking link is highlighted
  const bookingLinkRegex = /(schedule|book|appointment|inspection)/gi;
  const hasBookingLink = bookingLinkRegex.test(html) || bookingLinkRegex.test(text);

  if (hasBookingLink) {
    // Make CTA more prominent
    html = html.replace(
      /(schedule|book|appointment|inspection)/gi,
      '<strong>$1</strong>'
    );
    optimized = true;
  } else {
    // Add clear CTA if missing
    const cta = '<p><a href="#" style="background-color: #007bff; color: white; padding: 12px 24px; text-decoration: none; border-radius: 4px; display: inline-block;">Schedule Your Free Roof Check</a></p>';
    html = html.replace(/(<\/body>|$)/, cta + '$1');
    text = text + '\n\nSchedule Your Free Roof Check: [booking link]';
    optimized = true;
  }

  return { html, text, optimized };
}

/**
 * 7. Subject Line Generator
 */
export async function generateSubjectLine(
  context: EnhancementContext,
  originalSubject: string
): Promise<{ subject: string; generated: boolean }> {
  // If subject already looks good, keep it
  if (originalSubject.length > 10 && originalSubject.length < 60) {
    return { subject: originalSubject, generated: false };
  }

  // Generate optimized subject based on context
  let newSubject = originalSubject;

  if (context.recipientData?.street) {
    const streetName = context.recipientData.street.split(' ')[0];
    newSubject = `Quick roof question for ${streetName}`;
  } else if (context.stormData) {
    newSubject = 'After the storm…';
  } else if (context.recipientData?.neighborhood) {
    newSubject = `Free 10-minute roof check for ${context.recipientData.neighborhood}`;
  } else {
    newSubject = 'Something on your roof?';
  }

  // Use AI to generate if OpenAI is available
  if (process.env.OPENAI_API_KEY) {
    try {
      const aiSubject = await generateSubjectWithAI(context, originalSubject);
      if (aiSubject) {
        newSubject = aiSubject;
      }
    } catch (error) {
      console.error('Failed to generate AI subject:', error);
    }
  }

  return { subject: newSubject, generated: true };
}

/**
 * Generate subject line using AI
 */
async function generateSubjectWithAI(
  context: EnhancementContext,
  originalSubject: string
): Promise<string | null> {
  if (!process.env.OPENAI_API_KEY) {
    return null;
  }

  const prompt = `Generate 3 optimized email subject lines for a roofing contractor campaign.

Context:
- Original subject: ${originalSubject}
- List type: ${context.listType || 'general'}
- Recipient location: ${context.recipientData?.city || 'unknown'}
${context.stormData ? `- Storm date: ${context.stormData.storm_date}` : ''}

Requirements:
- 30-50 characters
- Personal and local when possible
- Clear value proposition
- Not spammy

Return ONLY the best subject line, no explanations.`;

  try {
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are an expert email subject line writer for roofing contractors. Return only the subject line, no explanations.',
          },
          {
            role: 'user',
            content: prompt,
          },
        ],
        temperature: 0.7,
        max_tokens: 100,
      }),
    });

    if (!response.ok) {
      return null;
    }

    const data = await response.json();
    const subject = data.choices?.[0]?.message?.content?.trim();
    return subject || null;
  } catch (error) {
    console.error('AI subject generation error:', error);
    return null;
  }
}

