/**
 * Block 24100 — Roofer Voice Analyzer
 * 
 * Analyzes roofer's writing style from sample messages to build voice profiles
 * for Layer 5: Human Voice Personalization
 */

import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY!;

const supabaseAdmin = SUPABASE_URL && SUPABASE_SERVICE_ROLE_KEY
  ? createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
      auth: { persistSession: false },
    })
  : null;

export interface VoiceAnalysisResult {
  tone_preference: 'casual' | 'formal' | 'friendly' | 'professional' | 'conversational' | 'direct' | 'polished' | 'simple';
  sentence_length_avg: number;
  punctuation_style: 'minimal' | 'standard' | 'frequent';
  greeting_style: string[];
  signoff_style: string[];
  common_phrases: string[];
  vocabulary_level: 'simple' | 'moderate' | 'advanced';
  uses_contractions: boolean;
  uses_emojis: boolean;
  uses_exclamation: boolean;
  company_name_usage: 'always' | 'sometimes' | 'never';
  personal_name_usage: 'always' | 'sometimes' | 'never';
  booking_link_style: 'direct' | 'casual' | 'formal';
  analysis_confidence: number;
}

/**
 * Analyze sample messages to extract voice profile
 */
export async function analyzeRooferVoice(
  workspaceId: string,
  rooferId?: string,
  sampleMessages?: Array<{ subject?: string; body: string; date?: string }>
): Promise<VoiceAnalysisResult | null> {
  if (!supabaseAdmin) {
    throw new Error('Supabase admin client not configured');
  }

  // Get sample messages if not provided
  if (!sampleMessages || sampleMessages.length === 0) {
    const { data: messages } = await supabaseAdmin
      .from('email_logs')
      .select('subject, body_html, sent_at')
      .eq('workspace_id', workspaceId)
      .eq('direction', 'out')
      .not('body_html', 'is', null)
      .order('sent_at', { ascending: false })
      .limit(20);

    if (!messages || messages.length === 0) {
      return null;
    }

    sampleMessages = messages.map(m => ({
      subject: m.subject || undefined,
      body: m.body_html || '',
      date: m.sent_at || undefined,
    }));
  }

  if (sampleMessages.length === 0) {
    return null;
  }

  // Analyze messages
  const analysis = analyzeMessages(sampleMessages);

  // Save to database
  const { data: profile } = await supabaseAdmin
    .from('roofer_voice_profiles')
    .upsert({
      workspace_id: workspaceId,
      roofer_id: rooferId || null,
      ...analysis,
      sample_count: sampleMessages.length,
      last_analyzed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }, {
      onConflict: 'workspace_id,roofer_id',
    })
    .select()
    .single();

  return analysis;
}

/**
 * Analyze messages to extract voice characteristics
 */
function analyzeMessages(
  messages: Array<{ subject?: string; body: string }>
): VoiceAnalysisResult {
  const allText = messages.map(m => `${m.subject || ''} ${m.body}`).join(' ');
  const sentences = allText.split(/[.!?]+/).filter(s => s.trim().length > 0);
  
  // Calculate average sentence length
  const sentenceLengths = sentences.map(s => s.trim().split(/\s+/).length);
  const avgSentenceLength = sentenceLengths.length > 0
    ? Math.round(sentenceLengths.reduce((a, b) => a + b, 0) / sentenceLengths.length)
    : 15;

  // Detect tone preference
  const tonePreference = detectTone(allText);

  // Detect greeting style
  const greetingStyle = detectGreetings(messages);

  // Detect signoff style
  const signoffStyle = detectSignoffs(messages);

  // Detect punctuation style
  const punctuationStyle = detectPunctuationStyle(allText);

  // Detect vocabulary level
  const vocabularyLevel = detectVocabularyLevel(allText);

  // Detect contractions
  const usesContractions = /\b(I'll|I'd|can't|won't|don't|doesn't|isn't|aren't|wasn't|weren't|haven't|hasn't|hadn't|wouldn't|couldn't|shouldn't|mustn't)\b/i.test(allText);

  // Detect emojis
  const usesEmojis = /[😀-🙏🌀-🗿]/g.test(allText);

  // Detect exclamation
  const usesExclamation = /!/.test(allText);

  // Detect company name usage
  const companyNameUsage = detectCompanyNameUsage(messages);

  // Detect personal name usage
  const personalNameUsage = detectPersonalNameUsage(messages);

  // Detect booking link style
  const bookingLinkStyle = detectBookingLinkStyle(messages);

  // Extract common phrases
  const commonPhrases = extractCommonPhrases(messages);

  // Calculate confidence (based on sample size)
  const analysisConfidence = Math.min(0.5 + (messages.length * 0.05), 1.0);

  return {
    tone_preference: tonePreference,
    sentence_length_avg: avgSentenceLength,
    punctuation_style: punctuationStyle,
    greeting_style: greetingStyle,
    signoff_style: signoffStyle,
    common_phrases: commonPhrases,
    vocabulary_level: vocabularyLevel,
    uses_contractions: usesContractions,
    uses_emojis: usesEmojis,
    uses_exclamation: usesExclamation,
    company_name_usage: companyNameUsage,
    personal_name_usage: personalNameUsage,
    booking_link_style: bookingLinkStyle,
    analysis_confidence: analysisConfidence,
  };
}

function detectTone(text: string): VoiceAnalysisResult['tone_preference'] {
  const lower = text.toLowerCase();

  // Formal indicators
  if (/\b(regarding|pursuant|hereby|therefore|furthermore)\b/.test(lower)) {
    return 'formal';
  }

  // Professional indicators
  if (/\b(professional|expertise|consultation|assessment)\b/.test(lower)) {
    return 'professional';
  }

  // Casual indicators
  if (/\b(hey|yeah|gonna|wanna|gotta)\b/.test(lower)) {
    return 'casual';
  }

  // Direct indicators
  if (/\b(quick|straightforward|simple|direct)\b/.test(lower)) {
    return 'direct';
  }

  // Friendly indicators
  if (/\b(thanks|appreciate|glad|happy|excited)\b/.test(lower)) {
    return 'friendly';
  }

  // Simple indicators
  if (text.split(/\s+/).length < 50 && avgWordLength(text) < 4.5) {
    return 'simple';
  }

  // Default to conversational
  return 'conversational';
}

function detectGreetings(messages: Array<{ subject?: string; body: string }>): string[] {
  const greetings: string[] = [];
  
  messages.forEach(msg => {
    const firstLine = msg.body.split('\n')[0].trim();
    if (/^(Hey|Hi|Hello|Good morning|Good afternoon)/i.test(firstLine)) {
      const match = firstLine.match(/^(Hey|Hi|Hello|Good morning|Good afternoon)/i);
      if (match && !greetings.includes(match[1])) {
        greetings.push(match[1]);
      }
    }
  });

  return greetings.length > 0 ? greetings : ['Hey'];
}

function detectSignoffs(messages: Array<{ body: string }>): string[] {
  const signoffs: string[] = [];
  
  messages.forEach(msg => {
    const lastLines = msg.body.split('\n').slice(-3).join(' ').trim();
    if (/(Thanks|Thank you|Best|Regards|Sincerely|Take care)/i.test(lastLines)) {
      const match = lastLines.match(/(Thanks|Thank you|Best|Regards|Sincerely|Take care)/i);
      if (match && !signoffs.includes(match[1])) {
        signoffs.push(match[1]);
      }
    }
  });

  return signoffs.length > 0 ? signoffs : ['Thanks'];
}

function detectPunctuationStyle(text: string): 'minimal' | 'standard' | 'frequent' {
  const punctuationCount = (text.match(/[.,!?;:]/g) || []).length;
  const wordCount = text.split(/\s+/).length;
  const ratio = punctuationCount / wordCount;

  if (ratio < 0.1) return 'minimal';
  if (ratio > 0.2) return 'frequent';
  return 'standard';
}

function detectVocabularyLevel(text: string): 'simple' | 'moderate' | 'advanced' {
  const words = text.toLowerCase().split(/\s+/);
  const avgLength = avgWordLength(text);

  if (avgLength < 4.0) return 'simple';
  if (avgLength > 5.5) return 'advanced';
  return 'moderate';
}

function avgWordLength(text: string): number {
  const words = text.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 0) return 0;
  return words.reduce((sum, w) => sum + w.length, 0) / words.length;
}

function detectCompanyNameUsage(messages: Array<{ body: string }>): 'always' | 'sometimes' | 'never' {
  let withCompany = 0;
  
  messages.forEach(msg => {
    if (/\b(company|LLC|Inc|Roofing|Contractors)\b/i.test(msg.body)) {
      withCompany++;
    }
  });

  const ratio = withCompany / messages.length;
  if (ratio > 0.8) return 'always';
  if (ratio > 0.3) return 'sometimes';
  return 'never';
}

function detectPersonalNameUsage(messages: Array<{ body: string }>): 'always' | 'sometimes' | 'never' {
  let withName = 0;
  
  messages.forEach(msg => {
    // Look for signature patterns
    if (/\n- [A-Z]|^[A-Z][a-z]+ [A-Z]|Best regards, [A-Z]/m.test(msg.body)) {
      withName++;
    }
  });

  const ratio = withName / messages.length;
  if (ratio > 0.8) return 'always';
  if (ratio > 0.3) return 'sometimes';
  return 'never';
}

function detectBookingLinkStyle(messages: Array<{ body: string }>): 'direct' | 'casual' | 'formal' {
  const allText = messages.map(m => m.body).join(' ');
  
  if (/\b(book|schedule|appointment|availability)\b/i.test(allText)) {
    if (/\b(here|link|click|book now)\b/i.test(allText)) {
      return 'direct';
    }
    if (/\b(when|time|convenient|work)\b/i.test(allText)) {
      return 'casual';
    }
    return 'formal';
  }

  return 'casual';
}

function extractCommonPhrases(messages: Array<{ body: string }>): string[] {
  const phrases: Record<string, number> = {};
  
  messages.forEach(msg => {
    const sentences = msg.body.split(/[.!?]+/);
    sentences.forEach(sentence => {
      const words = sentence.trim().toLowerCase().split(/\s+/);
      // Extract 3-word phrases
      for (let i = 0; i < words.length - 2; i++) {
        const phrase = words.slice(i, i + 3).join(' ');
        phrases[phrase] = (phrases[phrase] || 0) + 1;
      }
    });
  });

  // Return top 5 most common phrases
  return Object.entries(phrases)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
    .map(([phrase]) => phrase);
}






































