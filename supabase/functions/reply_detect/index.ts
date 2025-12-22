// supabase/functions/reply_detect/index.ts
// AI Reply Detection (Auto-Mark as Replied)
// Heuristic detector + LLM fallback

import { serve } from "https://deno.land/std@0.216.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { sanitizeEmailBody } from "../_shared/sanitize_email.ts";

type CompiledRule = {
  scope: "global" | "campaign";
  campaign_id?: string | null;
  label: string;
  kind: "subject_regex" | "text_regex" | "header_key" | "header_value_regex";
  pattern: string;
  weight: number;
};

type CompiledRuleset = {
  version?: number;
  rules: CompiledRule[];
};

let CACHED_RULESET: CompiledRuleset | null = null;
let LAST_RULE_FETCH = 0;
const RULE_CACHE_MS = 5 * 60 * 1000;

async function getCompiledRules(): Promise<CompiledRule[]> {
  const now = Date.now();
  if (CACHED_RULESET && now - LAST_RULE_FETCH < RULE_CACHE_MS) {
    return CACHED_RULESET.rules ?? [];
  }

  const rulesUrl = Deno.env.get("RULES_PUBLIC_URL");
  if (!rulesUrl) {
    CACHED_RULESET = { rules: [] };
    LAST_RULE_FETCH = now;
    return [];
  }

  try {
    const res = await fetch(rulesUrl);
    if (!res.ok) {
      console.warn("Failed to fetch ruleset:", res.status, res.statusText);
      CACHED_RULESET = { rules: [] };
      LAST_RULE_FETCH = now;
      return [];
    }

    const json = (await res.json()) as CompiledRuleset;
    CACHED_RULESET = {
      version: json.version,
      rules: Array.isArray(json.rules) ? json.rules : [],
    };
    LAST_RULE_FETCH = now;
    return CACHED_RULESET.rules;
  } catch (error) {
    console.warn("Error fetching ruleset:", error);
    CACHED_RULESET = { rules: [] };
    LAST_RULE_FETCH = now;
    return [];
  }
}

function normalizeRuleLabel(
  label: string,
): DetectionResult["label"] | null {
  switch (label) {
    case "out_of_office":
    case "ooo":
      return "ooo";
    case "human":
    case "human_reply":
    case "positive_reply":
      return "human";
    case "bounce":
      return "bounce";
    case "spam":
      return "spam";
    case "noise":
      return "noise";
    default:
      return null;
  }
}

function normalizeHeaders(
  headers?: Record<string, unknown> | null,
): Record<string, string> {
  if (!headers) return {};
  const normalized: Record<string, string> = {};
  for (const [key, value] of Object.entries(headers)) {
    const lowerKey = key.toLowerCase();
    if (Array.isArray(value)) {
      normalized[lowerKey] = value.join(",").toLowerCase();
    } else if (value !== null && value !== undefined) {
      normalized[lowerKey] = String(value).toLowerCase();
    } else {
      normalized[lowerKey] = "";
    }
  }
  return normalized;
}

function applyRules(
  input: {
    subject?: string | null;
    text?: string | null;
    headers?: Record<string, string>;
  },
  rules: CompiledRule[],
  campaignId?: string | null,
): {
  matches: { rule: CompiledRule }[];
  totals: Record<string, number>;
} {
  const subject = (input.subject ?? "").toLowerCase();
  const text = (input.text ?? "").toLowerCase();
  const headers = input.headers ?? {};

  const matches: { rule: CompiledRule }[] = [];
  const totals: Record<string, number> = {};

  for (const rule of rules) {
    if (rule.scope === "campaign") {
      if (!campaignId) continue;
      if (rule.campaign_id && rule.campaign_id !== campaignId) continue;
    }

    let matched = false;
    try {
      switch (rule.kind) {
        case "subject_regex":
          matched = new RegExp(rule.pattern, "i").test(subject);
          break;
        case "text_regex":
          matched = new RegExp(rule.pattern, "i").test(text);
          break;
        case "header_key":
          matched = Object.prototype.hasOwnProperty.call(
            headers,
            rule.pattern.toLowerCase(),
          );
          break;
        case "header_value_regex": {
          const rx = new RegExp(rule.pattern, "i");
          matched = Object.values(headers).some((v) => rx.test(v));
          break;
        }
      }
    } catch {
      matched = false;
    }

    if (matched) {
      matches.push({ rule });
      totals[rule.label] = (totals[rule.label] ?? 0) + (rule.weight ?? 0);
    }
  }

  return { matches, totals };
}

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface DetectionResult {
  score: number;
  label: 'human' | 'ooo' | 'spam' | 'bounce' | 'noise';
  qRatio: number;
  linkDensity: number;
  isAuto: boolean;
  isOOO: boolean;
  isBounce: boolean;
  hasGreeting: boolean;
  hasQuestion: boolean;
  actionVerbs: number;
  reasons: string[];
}

function fastHeuristics(params: {
  headers?: Record<string, string>;
  subject: string;
  html: string;
  text: string;
  leadName?: string;
}): DetectionResult {
  const { headers = {}, subject = '', html = '', text = '', leadName = '' } = params;
  
  // Normalize text
  const normalizedSubject = (subject || '').toLowerCase().trim();
  const normalizedText = text.toLowerCase();
  const plainText = text.trim().length > 0
    ? text
    : html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  const fullText = `${normalizedSubject} ${plainText}`;
  
  // Extract quoted text ratio (common email patterns)
  const quotedMatches = plainText.match(/(^|>|\n)\s*([>]\s*)+/g) || [];
  const quotedLength = quotedMatches.reduce((sum, m) => sum + m.length, 0);
  const qRatio = plainText.length > 0 ? quotedLength / plainText.length : 0;
  
  // Extract links
  const linkMatches = (html.match(/<a[^>]+href\s*=\s*["']([^"']+)["']/gi) || []).length;
  const linkDensity = plainText.length > 0 ? linkMatches / plainText.length : 0;
  
  // Auto-reply headers
  const autoHeaders = [
    headers['auto-submitted'],
    headers['x-auto-response-suppress'],
    headers['precedence'],
    headers['auto-submitted']?.toLowerCase()
  ].filter(Boolean);
  const isAuto = autoHeaders.some(h => h && /auto|bulk|junk/i.test(h));
  
  // OOO detection
  const oooPatterns = [
    /out of office/i,
    /automatic reply/i,
    /autoreply/i,
    /away until/i,
    /vacation/i,
    /i'll be back/i,
    /currently out/i
  ];
  const isOOO = oooPatterns.some(r => r.test(normalizedSubject) || r.test(fullText));
  
  // Bounce detection
  const bouncePatterns = [
    /mailer-daemon/i,
    /undelivered mail returned/i,
    /delivery status notification/i,
    /dsn:/i,
    /returned to sender/i,
    /failure notice/i
  ];
  const isBounce = bouncePatterns.some(r => r.test(normalizedSubject) || r.test(fullText));
  
  // Greetings
  const greetingPatterns = [
    /^(hi|hey|hello|dear|greetings|good morning|good afternoon|good evening)\s+/i,
    /^thanks\s+/i,
    /^thank you\s+/i
  ];
  const hasGreeting = greetingPatterns.some(r => r.test(plainText.trim()));
  
  // Name match in salutation
  const nameMatch = leadName && leadName.length > 0 
    ? new RegExp(`(hi|hey|hello|dear)\\s+${leadName.split(' ')[0]}`, 'i').test(plainText)
    : false;
  
  // Questions
  const questionCount = (plainText.match(/\?/g) || []).length;
  const hasQuestion = questionCount > 0;
  
  // Action verbs / intent cues
  const intentPatterns = [
    /interested/i,
    /schedule/i,
    /let'?s\s+(talk|chat|do|book|meet)/i,
    /call/i,
    /demo/i,
    /available/i,
    /works for me/i,
    /sounds good/i,
    /price/i,
    /cost/i,
    /timeline/i
  ];
  const actionVerbs = intentPatterns.filter(r => r.test(plainText)).length;
  
  // Length check (very short = likely noise)
  const isVeryShort = plainText.length <= 20 && qRatio > 0.8;
  
  // Spam traits
  const spamPatterns = [
    /click here/i,
    /act now/i,
    /limited time/i,
    /\u200b/g  // zero-width space (homoglyph)
  ];
  const spamScore = spamPatterns.filter(r => r.test(plainText)).length;
  
  // Scoring rubric (0–1)
  let score = 0;
  const reasons: string[] = [];
  
  // Positive signals
  if (hasGreeting) {
    score += 0.15;
    reasons.push('greeting');
  }
  if (actionVerbs > 0) {
    score += Math.min(0.45, actionVerbs * 0.15);
    reasons.push(`intent_cues:${actionVerbs}`);
  }
  if (hasQuestion) {
    score += Math.min(0.20, questionCount * 0.05);
    reasons.push(`questions:${questionCount}`);
  }
  if (qRatio < 0.6) {
    score += 0.15;
    reasons.push('low_quoted_ratio');
  }
  if (nameMatch) {
    score += 0.10;
    reasons.push('name_match');
  }
  
  // Negative signals
  if (isAuto) {
    score -= 0.50;
    reasons.push('auto_headers');
  }
  if (isOOO) {
    score -= 0.40;
    reasons.push('ooo_keywords');
  }
  if (isBounce) {
    score -= 0.50;
    reasons.push('bounce_markers');
  }
  if (linkDensity > 0.15) {
    score -= 0.25;
    reasons.push('high_link_density');
  }
  if (isVeryShort) {
    score -= 0.30;
    reasons.push('very_short_with_quotes');
  }
  if (spamScore > 2) {
    score -= 0.20;
    reasons.push('spam_traits');
  }
  
  // Clamp score
  score = Math.max(0, Math.min(1, score));
  
  // Determine label
  let label: 'human' | 'ooo' | 'spam' | 'bounce' | 'noise' = 'noise';
  if (isBounce) {
    label = 'bounce';
  } else if (isOOO) {
    label = 'ooo';
  } else if (spamScore > 2 && linkDensity > 0.15) {
    label = 'spam';
  } else if (score >= 0.6) {
    label = 'human';
  } else if (score < 0.4) {
    // Low confidence - classify by strongest negative
    if (isBounce) label = 'bounce';
    else if (isOOO) label = 'ooo';
    else if (spamScore > 1) label = 'spam';
    else label = 'noise';
  }
  
  return {
    score,
    label,
    qRatio,
    linkDensity,
    isAuto,
    isOOO,
    isBounce,
    hasGreeting,
    hasQuestion: hasQuestion,
    actionVerbs,
    reasons
  };
}

async function llmFallback(openaiKey: string, text: string): Promise<{ label: string; confidence: number }> {
  try {
    const res = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${openaiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'system',
            content: 'You are a classifier. Output JSON only with {label, confidence}. Label must be one of: human, ooo, spam, bounce, noise.'
          },
          {
            role: 'user',
            content: `Classify the email reply string into: human, ooo, spam, bounce, or noise. Return JSON {label, confidence}. Email:\n\n${text.slice(0, 3000)}`
          }
        ],
        temperature: 0,
        response_format: { type: 'json_object' }
      })
    });
    
    if (!res.ok) {
      throw new Error(`OpenAI API error: ${res.status}`);
    }
    
    const json = await res.json();
    const content = json.choices?.[0]?.message?.content || '{"label":"noise","confidence":0.5}';
    
    try {
      const parsed = JSON.parse(content);
      return {
        label: parsed.label || 'noise',
        confidence: Math.max(0.1, Math.min(0.99, parsed.confidence || 0.5))
      };
    } catch {
      return { label: 'noise', confidence: 0.5 };
    }
  } catch (error) {
    console.error('LLM fallback error:', error);
    return { label: 'noise', confidence: 0.5 };
  }
}

serve(async (req) => {
  // Handle CORS
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405, headers: corsHeaders });
  }
  
  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );
    const OPENAI_API_KEY = Deno.env.get('OPENAI_API_KEY');
    
    const { org_id, message_id, workspace_id, campaign_id: campaignIdFromRequest } = await req.json();
    const identifier = org_id || workspace_id;
    
    if (!identifier || !message_id) {
      return new Response(
        JSON.stringify({ error: 'Bad Request: org_id/workspace_id and message_id required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Load message and thread
    // Try to get thread via thread_id or find/create thread
    const { data: msg, error: mErr } = await supabase
      .from('email_messages')
      .select(`
        *,
        thread:email_threads!email_messages_thread_id_fkey(*)
      `)
      .eq('id', message_id)
      .single();
    
    if (mErr || !msg) {
      console.error('Message fetch error:', mErr);
      return new Response(
        JSON.stringify({ error: 'Message not found', details: mErr?.message }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    // Extract text content
    const subject = msg.subject || '';
    const html = msg.body_html || '';
    const snippet = msg.snippet || '';
    const bodyText = msg.body_text || '';

    const cleanBody = sanitizeEmailBody({
      plaintext: bodyText?.trim()?.length ? bodyText : snippet || undefined,
      html,
    });
    const text = cleanBody;
    const cleanPreview = cleanBody.slice(0, 240);
    const rawPresent =
      Boolean(bodyText && bodyText.trim().length > 0) ||
      Boolean(html && html.trim().length > 0);
    const rawHeaders = (msg.headers as Record<string, unknown>) || {};
    const headers = normalizeHeaders(rawHeaders);
    
    // Get lead name if available (from lead_id or thread)
    let leadName = '';
    if (msg.lead_id) {
      const { data: lead } = await supabase
        .from('leads')
        .select('first_name, last_name, email')
        .eq('id', msg.lead_id)
        .maybeSingle();
      if (lead) {
        leadName = `${lead.first_name || ''} ${lead.last_name || ''}`.trim() || lead.email?.split('@')[0] || '';
      }
    }
    
    // Fast heuristic path
    const fast = fastHeuristics({
      headers,
      subject,
      html,
      text,
      leadName
    });
    
    let label = fast.label;
    let confidence = Math.max(0.5, Math.min(0.99, fast.score));

    const compiledRules = await getCompiledRules();
    const rulesVersion = CACHED_RULESET?.version ?? null;
    const campaignId = (msg.campaign_id as string | null) || campaignIdFromRequest || null;
    const { matches: ruleMatches, totals: ruleTotalsRaw } = applyRules(
      { subject, text, headers },
      compiledRules,
      campaignId,
    );

    const ruleTotals: Record<DetectionResult["label"], number> = {};
    for (const [ruleLabel, total] of Object.entries(ruleTotalsRaw)) {
      const normalized = normalizeRuleLabel(ruleLabel);
      if (!normalized) continue;
      ruleTotals[normalized] = (ruleTotals[normalized] ?? 0) + total;
    }

    if (ruleTotals.human) {
      const boost = Math.min(0.4, ruleTotals.human * 0.1);
      fast.score = Math.max(0, Math.min(1, fast.score + boost));
      fast.reasons.push(`rule_human:${ruleTotals.human.toFixed(2)}`);
      confidence = Math.max(confidence, fast.score);
    }

    if (ruleTotals.ooo) {
      fast.isOOO = true;
      fast.reasons.push(`rule_ooo:${ruleTotals.ooo.toFixed(2)}`);
    }

    if (ruleTotals.spam) {
      fast.reasons.push(`rule_spam:${ruleTotals.spam.toFixed(2)}`);
    }

    if (ruleTotals.bounce) {
      fast.isBounce = true;
      fast.reasons.push(`rule_bounce:${ruleTotals.bounce.toFixed(2)}`);
    }

    let ruleOverride: DetectionResult["label"] | null = null;
    if (ruleTotals.ooo) {
      ruleOverride = "ooo";
    } else if (ruleTotals.bounce) {
      ruleOverride = "bounce";
    } else if (ruleTotals.spam) {
      ruleOverride = "spam";
    } else if (ruleTotals.human && fast.score >= 0.6) {
      ruleOverride = "human";
    }

    if (ruleOverride) {
      label = ruleOverride;
    }
    
    // LLM fallback for ambiguous cases (0.4 <= score < 0.6)
    if (fast.score >= 0.4 && fast.score < 0.6 && OPENAI_API_KEY) {
      try {
        const llm = await llmFallback(OPENAI_API_KEY, text);
        if (llm.label && ['human', 'ooo', 'spam', 'bounce', 'noise'].includes(llm.label)) {
          label = llm.label as typeof label;
          confidence = llm.confidence;
        }
      } catch (error) {
        console.error('LLM fallback failed:', error);
        // Continue with heuristic result
      }
    }
    
    // Persist detection
    const detectionData = {
      is_reply: label === 'human',
      confidence,
      label,
      reasons: fast.reasons,
      score: fast.score,
      qRatio: fast.qRatio,
      linkDensity: fast.linkDensity,
      isAuto: fast.isAuto,
      isOOO: fast.isOOO,
      isBounce: fast.isBounce,
      rulesVersion,
      ruleOverride,
      ruleTotals: ruleTotals,
      ruleTotalsRaw: ruleTotalsRaw,
      ruleMatches: ruleMatches.map(({ rule }) => ({
        scope: rule.scope,
        campaign_id: rule.campaign_id ?? null,
        label: rule.label,
        kind: rule.kind,
        weight: rule.weight,
      })),
      clean_preview: cleanPreview,
      text_raw_present: rawPresent,
    };
    
    const { error: updateErr } = await supabase
      .from('email_messages')
      .update({ detection: detectionData })
      .eq('id', message_id);
    
    if (updateErr) {
      console.error('Failed to update detection:', updateErr);
    }
    
    // Update thread state if thread_id exists
    if (msg.thread_id) {
      const threadId = typeof msg.thread_id === 'string' ? msg.thread_id : msg.thread_id.id || msg.thread_id;
      
      if (label === 'human') {
        // Mark as replied
        const updateData: any = {
          status: 'replied',
          last_message_at: msg.received_at || msg.sent_at || new Date().toISOString()
        };
        
        // Set first_replied_at if not already set
        const thread = Array.isArray(msg.thread) ? msg.thread[0] : msg.thread;
        if (thread && !thread.first_replied_at) {
          updateData.first_replied_at = msg.received_at || msg.sent_at || new Date().toISOString();
        }
        
        await supabase
          .from('email_threads')
          .update(updateData)
          .eq('id', threadId);
      } else if (label === 'ooo') {
        await supabase
          .from('email_threads')
          .update({ ai_flag: 'ooo' })
          .eq('id', threadId);
      } else if (label === 'bounce') {
        await supabase
          .from('email_threads')
          .update({ ai_flag: 'bounce' })
          .eq('id', threadId);
      } else if (label === 'spam') {
        await supabase
          .from('email_threads')
          .update({ ai_flag: 'spammy' })
          .eq('id', threadId);
      } else {
        // Low confidence - mark as needs_review
        await supabase
          .from('email_threads')
          .update({ status: 'needs_review' })
          .eq('id', threadId);
      }
    }
    
    return new Response(
      JSON.stringify({
        ok: true,
        label,
        confidence,
        fast,
        detection: detectionData,
        clean_preview: cleanPreview,
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    );
    
  } catch (error) {
    console.error('Reply detection error:', error);
    return new Response(
      JSON.stringify({
        error: 'Internal server error',
        details: error instanceof Error ? error.message : 'Unknown error'
      }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});

