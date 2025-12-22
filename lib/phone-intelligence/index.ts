// Block 17900 — SmartSend Phone Number Intelligence v1
// Phone validation, carrier lookup, line-type detection, and quality scoring

import { createClient } from "@supabase/supabase-js";
import type { Database } from "@/lib/supabase/types";
import { normalizePhoneNumber } from "@/lib/providers/sms";

export type PhoneLineType = 
  | 'mobile'
  | 'landline'
  | 'voip'
  | 'business'
  | 'google_voice'
  | 'burner'
  | 'temporary'
  | 'unknown';

export type SMSReadinessStatus = 
  | 'sms_ready'
  | 'landline_no_sms'
  | 'voip_unreliable'
  | 'carrier_blocks_unknown'
  | 'unknown';

export type HomeownerLikelihood = 
  | 'high'
  | 'medium'
  | 'low'
  | 'unlikely'
  | 'unknown';

export interface PhoneValidationResult {
  isValid: boolean;
  isActive: boolean | null;
  isReachable: boolean | null;
  isDisconnected: boolean;
  isTemporary: boolean;
  formattedNumber: string | null;
  error?: string;
}

export interface CarrierInfo {
  carrierName: string | null;
  carrierType: 'wireless' | 'landline' | 'voip' | null;
  country: string;
}

export interface LineTypeDetection {
  lineType: PhoneLineType;
  confidence: number; // 0.0 to 1.0
  signals: string[];
}

export interface SMSReadinessCheck {
  status: SMSReadinessStatus;
  smsCapable: boolean;
  reason?: string;
}

export interface HomeownerSignals {
  likelihood: HomeownerLikelihood;
  signals: string[];
  isBusinessLine: boolean;
  isSpamRisk: boolean;
  isWrongNumberRisk: boolean;
}

export interface PhoneIntelligence {
  phoneNumber: string;
  validation: PhoneValidationResult;
  carrier: CarrierInfo;
  lineType: LineTypeDetection;
  smsReadiness: SMSReadinessCheck;
  homeownerSignals: HomeownerSignals;
  qualityScore: number; // 0-100
  spamRiskScore: number; // 0-100
  tags: string[];
  metadata?: Record<string, any>;
}

/**
 * Validate phone number format and basic checks
 */
export function validatePhoneNumber(phone: string): PhoneValidationResult {
  const normalized = normalizePhoneNumber(phone);
  
  if (!normalized) {
    return {
      isValid: false,
      isActive: null,
      isReachable: null,
      isDisconnected: false,
      isTemporary: false,
      formattedNumber: null,
      error: 'Invalid phone number format',
    };
  }

  // Basic format validation (E.164)
  const e164Regex = /^\+1[2-9]\d{2}[2-9]\d{2}\d{4}$/;
  const isValid = e164Regex.test(normalized);

  // Check for temporary/burner number patterns
  // Common patterns: sequential numbers, repeating digits, etc.
  const digits = normalized.replace(/\D/g, '');
  const isTemporary = 
    /(\d)\1{4,}/.test(digits) || // 5+ repeating digits
    /12345|54321/.test(digits) || // Sequential
    /0000|1111|2222|3333|4444|5555|6666|7777|8888|9999/.test(digits); // Repeating groups

  return {
    isValid,
    isActive: null, // Requires API call
    isReachable: null, // Requires API call
    isDisconnected: false, // Requires API call
    isTemporary,
    formattedNumber: normalized,
  };
}

/**
 * Detect carrier from phone number (basic pattern matching)
 * For production, integrate with Twilio Lookup API or similar
 */
export function detectCarrier(phoneNumber: string): CarrierInfo {
  const normalized = normalizePhoneNumber(phoneNumber);
  if (!normalized) {
    return {
      carrierName: null,
      carrierType: null,
      country: 'US',
    };
  }

  // Extract area code and exchange
  const digits = normalized.replace(/\D/g, '');
  const areaCode = digits.substring(1, 4);
  const exchange = digits.substring(4, 7);

  // Basic carrier detection based on area code patterns
  // This is a simplified version - production should use Twilio Lookup API
  // Common patterns for major carriers (approximate)
  
  // This is placeholder logic - real implementation should use API
  return {
    carrierName: null, // Requires API call
    carrierType: null,
    country: 'US',
  };
}

/**
 * Detect line type from phone number and carrier info
 */
export function detectLineType(
  phoneNumber: string,
  carrierName: string | null,
  carrierType: string | null
): LineTypeDetection {
  const signals: string[] = [];
  let lineType: PhoneLineType = 'unknown';
  let confidence = 0.5;

  // Carrier-based detection
  if (carrierName) {
    const lowerCarrier = carrierName.toLowerCase();
    
    if (lowerCarrier.includes('verizon') || 
        lowerCarrier.includes('at&t') || 
        lowerCarrier.includes('t-mobile') || 
        lowerCarrier.includes('sprint')) {
      lineType = 'mobile';
      confidence = 0.9;
      signals.push(`Carrier: ${carrierName} (wireless)`);
    } else if (lowerCarrier.includes('comcast') || 
               lowerCarrier.includes('spectrum') || 
               lowerCarrier.includes('frontier')) {
      lineType = 'landline';
      confidence = 0.85;
      signals.push(`Carrier: ${carrierName} (landline)`);
    } else if (lowerCarrier.includes('google voice')) {
      lineType = 'google_voice';
      confidence = 0.95;
      signals.push('Google Voice number detected');
    } else if (lowerCarrier.includes('voip') || 
               lowerCarrier.includes('vonage') || 
               lowerCarrier.includes('ringcentral')) {
      lineType = 'voip';
      confidence = 0.8;
      signals.push(`VOIP carrier: ${carrierName}`);
    }
  }

  // Pattern-based detection (if carrier unknown)
  if (lineType === 'unknown') {
    const digits = phoneNumber.replace(/\D/g, '');
    
    // Check for temporary/burner patterns
    if (/(\d)\1{4,}/.test(digits) || /12345|54321/.test(digits)) {
      lineType = 'burner';
      confidence = 0.7;
      signals.push('Pattern suggests temporary/burner number');
    }
  }

  return {
    lineType,
    confidence,
    signals,
  };
}

/**
 * Determine SMS readiness based on line type and carrier
 */
export function checkSMSReadiness(
  lineType: PhoneLineType,
  carrierName: string | null,
  carrierType: string | null
): SMSReadinessCheck {
  // Mobile numbers are SMS ready
  if (lineType === 'mobile') {
    return {
      status: 'sms_ready',
      smsCapable: true,
      reason: 'Mobile number supports SMS',
    };
  }

  // Landlines don't support SMS
  if (lineType === 'landline') {
    return {
      status: 'landline_no_sms',
      smsCapable: false,
      reason: 'Landline does not support SMS',
    };
  }

  // VOIP numbers are unreliable
  if (lineType === 'voip' || lineType === 'google_voice') {
    return {
      status: 'voip_unreliable',
      smsCapable: true,
      reason: 'VOIP numbers may have unreliable SMS delivery',
    };
  }

  // Some carriers block unknown senders
  if (carrierName && ['AT&T', 'Verizon'].includes(carrierName)) {
    // Check if carrier blocks unknown senders (would need API call)
    // For now, assume they don't
  }

  return {
    status: 'unknown',
    smsCapable: false,
    reason: 'SMS capability unknown',
  };
}

/**
 * Infer homeowner identity signals from phone data
 */
export function inferHomeownerSignals(
  lineType: PhoneLineType,
  carrierName: string | null,
  addressMatch: boolean = false
): HomeownerSignals {
  const signals: string[] = [];
  let likelihood: HomeownerLikelihood = 'unknown';
  let isBusinessLine = false;
  let isSpamRisk = false;
  let isWrongNumberRisk = false;

  // Line type signals
  if (lineType === 'mobile') {
    likelihood = 'high';
    signals.push('Mobile number - likely homeowner');
  } else if (lineType === 'landline') {
    likelihood = 'medium';
    if (carrierName) {
      signals.push(`${carrierName} landline - possible older homeowner`);
    } else {
      signals.push('Landline - possible homeowner');
    }
  } else if (lineType === 'voip' || lineType === 'google_voice') {
    likelihood = 'low';
    signals.push('VOIP number - renter or spam risk likely');
    isSpamRisk = true;
  } else if (lineType === 'business') {
    likelihood = 'unlikely';
    isBusinessLine = true;
    signals.push('Business line - non-homeowner');
  } else if (lineType === 'burner' || lineType === 'temporary') {
    likelihood = 'unlikely';
    isSpamRisk = true;
    signals.push('Temporary/burner number - spam risk');
  }

  // Carrier-specific signals
  if (carrierName) {
    if (carrierName.includes('Frontier') && lineType === 'landline') {
      signals.push('Frontier landline - possible older homeowner');
      likelihood = 'medium';
    }
  }

  // Address match increases likelihood
  if (addressMatch) {
    likelihood = likelihood === 'unknown' ? 'medium' : 
                 likelihood === 'low' ? 'medium' : 
                 likelihood === 'medium' ? 'high' : likelihood;
    signals.push('Phone matches address - homeowner signal');
  }

  return {
    likelihood,
    signals,
    isBusinessLine,
    isSpamRisk,
    isWrongNumberRisk,
  };
}

/**
 * Calculate phone quality score (0-100)
 */
export function calculatePhoneQualityScore(
  lineType: PhoneLineType,
  carrierName: string | null,
  isValid: boolean,
  isActive: boolean | null,
  isDisconnected: boolean,
  smsReadiness: SMSReadinessStatus,
  homeownerLikelihood: HomeownerLikelihood,
  isSpamRisk: boolean,
  isBusinessLine: boolean
): number {
  let score = 50; // Start at neutral

  // Line type score (0-40 points)
  const lineTypeScores: Record<PhoneLineType, number> = {
    mobile: 40,
    landline: 16,
    voip: 12,
    business: 8,
    google_voice: 12,
    burner: 4,
    temporary: 8,
    unknown: 20,
  };
  score += lineTypeScores[lineType] || 20;

  // Carrier score (0-20 points)
  if (carrierName) {
    if (['Verizon', 'AT&T', 'T-Mobile', 'Sprint'].includes(carrierName)) {
      score += 20;
    } else if (['Comcast', 'Spectrum', 'Frontier'].includes(carrierName)) {
      score += 5; // Landline carriers
    } else if (carrierName.toLowerCase().includes('voip') || 
               ['Google Voice', 'Vonage'].includes(carrierName)) {
      score -= 10;
    }
  }

  // Connection status (0-20 points)
  if (isValid && isActive && !isDisconnected) {
    score += 20;
  } else if (isDisconnected) {
    score -= 40;
  } else if (!isValid) {
    score -= 30;
  }

  // SMS readiness (0-10 points)
  if (smsReadiness === 'sms_ready') {
    score += 10;
  } else if (smsReadiness === 'landline_no_sms') {
    score -= 5;
  } else if (smsReadiness === 'voip_unreliable') {
    score -= 5;
  }

  // Homeowner likelihood (0-10 points)
  const homeownerScores: Record<HomeownerLikelihood, number> = {
    high: 10,
    medium: 5,
    low: -5,
    unlikely: -15,
    unknown: 0,
  };
  score += homeownerScores[homeownerLikelihood] || 0;

  // Spam risk penalty
  if (isSpamRisk) {
    score -= 30;
  }

  // Business line penalty
  if (isBusinessLine) {
    score -= 20;
  }

  // Clamp to 0-100 range
  return Math.max(0, Math.min(100, score));
}

/**
 * Calculate spam risk score (0-100, lower is better)
 */
export function calculateSpamRiskScore(
  lineType: PhoneLineType,
  isTemporary: boolean,
  isSpamRisk: boolean,
  homeownerLikelihood: HomeownerLikelihood
): number {
  let riskScore = 0;

  // Line type risk
  const lineTypeRisks: Record<PhoneLineType, number> = {
    mobile: 10,
    landline: 20,
    voip: 60,
    business: 40,
    google_voice: 50,
    burner: 90,
    temporary: 80,
    unknown: 50,
  };
  riskScore += lineTypeRisks[lineType] || 50;

  // Temporary number risk
  if (isTemporary) {
    riskScore += 30;
  }

  // Spam risk flag
  if (isSpamRisk) {
    riskScore += 40;
  }

  // Homeowner likelihood reduces risk
  const homeownerRiskReduction: Record<HomeownerLikelihood, number> = {
    high: -30,
    medium: -10,
    low: 10,
    unlikely: 30,
    unknown: 0,
  };
  riskScore += homeownerRiskReduction[homeownerLikelihood] || 0;

  // Clamp to 0-100 range
  return Math.max(0, Math.min(100, riskScore));
}

/**
 * Generate intelligence tags for phone number
 */
export function generatePhoneTags(
  lineType: PhoneLineType,
  smsReadiness: SMSReadinessStatus,
  isDisconnected: boolean,
  isSpamRisk: boolean,
  homeownerLikelihood: HomeownerLikelihood,
  carrierName: string | null
): string[] {
  const tags: string[] = [];

  // Line type tags
  if (lineType === 'mobile') {
    tags.push('Mobile — High Quality');
  } else if (lineType === 'landline') {
    tags.push('Landline — OK');
  } else if (lineType === 'voip') {
    tags.push('VOIP — Low Intent');
  }

  // SMS readiness tags
  if (smsReadiness === 'sms_ready') {
    tags.push('SMS Ready');
  } else if (smsReadiness === 'landline_no_sms') {
    tags.push('SMS Not Supported');
  }

  // Status tags
  if (isDisconnected) {
    tags.push('Disconnected Number');
  }

  if (isSpamRisk) {
    tags.push('Spam Risk');
  }

  if (homeownerLikelihood === 'unlikely') {
    tags.push('Possibly Wrong Number');
  }

  // Carrier risk tags
  if (carrierName && ['Google Voice', 'Vonage'].includes(carrierName) && 
      ['low', 'unlikely'].includes(homeownerLikelihood)) {
    tags.push('Carrier Risk');
  }

  return tags;
}

/**
 * Get comprehensive phone intelligence
 */
export async function getPhoneIntelligence(
  supabase: ReturnType<typeof createClient<Database>>,
  phoneNumber: string,
  orgId: string,
  contactId?: string
): Promise<PhoneIntelligence> {
  // Normalize phone number
  const normalized = normalizePhoneNumber(phoneNumber);
  if (!normalized) {
    throw new Error('Invalid phone number format');
  }

  // Check if we have cached intelligence
  const { data: cached } = await supabase
    .from('phone_intelligence')
    .select('*')
    .eq('phone_number', normalized)
    .eq('org_id', orgId)
    .maybeSingle();

  // If cached and recent (within 30 days), return cached
  if (cached && cached.last_validated_at) {
    const daysSinceValidation = 
      (Date.now() - new Date(cached.last_validated_at).getTime()) / (1000 * 60 * 60 * 24);
    if (daysSinceValidation < 30) {
      return {
        phoneNumber: normalized,
        validation: {
          isValid: cached.is_valid,
          isActive: cached.is_active,
          isReachable: cached.is_reachable,
          isDisconnected: cached.is_disconnected,
          isTemporary: cached.is_temporary,
          formattedNumber: normalized,
        },
        carrier: {
          carrierName: cached.carrier_name,
          carrierType: cached.carrier_type as any,
          country: cached.carrier_country || 'US',
        },
        lineType: {
          lineType: cached.line_type as PhoneLineType,
          confidence: cached.line_type_confidence || 0.5,
          signals: cached.homeowner_signals?.signals || [],
        },
        smsReadiness: {
          status: cached.sms_readiness as SMSReadinessStatus,
          smsCapable: cached.sms_capable,
        },
        homeownerSignals: {
          likelihood: cached.homeowner_likelihood as HomeownerLikelihood,
          signals: cached.homeowner_signals?.signals || [],
          isBusinessLine: cached.is_business_line,
          isSpamRisk: cached.is_spam_risk,
          isWrongNumberRisk: cached.is_wrong_number_risk,
        },
        qualityScore: cached.quality_score || 0,
        spamRiskScore: cached.spam_risk_score || 0,
        tags: generatePhoneTags(
          cached.line_type as PhoneLineType,
          cached.sms_readiness as SMSReadinessStatus,
          cached.is_disconnected,
          cached.is_spam_risk,
          cached.homeowner_likelihood as HomeownerLikelihood,
          cached.carrier_name
        ),
        metadata: cached.metadata,
      };
    }
  }

  // Perform fresh validation
  const validation = validatePhoneNumber(phoneNumber);
  
  // Detect carrier (would integrate with API in production)
  const carrier = detectCarrier(normalized);
  
  // Detect line type
  const lineType = detectLineType(normalized, carrier.carrierName, carrier.carrierType);
  
  // Check SMS readiness
  const smsReadiness = checkSMSReadiness(lineType.lineType, carrier.carrierName, carrier.carrierType);
  
  // Infer homeowner signals
  const homeownerSignals = inferHomeownerSignals(lineType.lineType, carrier.carrierName);
  
  // Calculate scores
  const qualityScore = calculatePhoneQualityScore(
    lineType.lineType,
    carrier.carrierName,
    validation.isValid,
    validation.isActive,
    validation.isDisconnected,
    smsReadiness.status,
    homeownerSignals.likelihood,
    homeownerSignals.isSpamRisk,
    homeownerSignals.isBusinessLine
  );

  const spamRiskScore = calculateSpamRiskScore(
    lineType.lineType,
    validation.isTemporary,
    homeownerSignals.isSpamRisk,
    homeownerSignals.likelihood
  );

  // Generate tags
  const tags = generatePhoneTags(
    lineType.lineType,
    smsReadiness.status,
    validation.isDisconnected,
    homeownerSignals.isSpamRisk,
    homeownerSignals.likelihood,
    carrier.carrierName
  );

  // Save to database
  const intelligenceData = {
    phone_number: normalized,
    org_id: orgId,
    contact_id: contactId || null,
    is_valid: validation.isValid,
    is_active: validation.isActive,
    is_reachable: validation.isReachable,
    is_disconnected: validation.isDisconnected,
    is_temporary: validation.isTemporary,
    line_type: lineType.lineType,
    line_type_confidence: lineType.confidence,
    carrier_name: carrier.carrierName,
    carrier_type: carrier.carrierType,
    carrier_country: carrier.country,
    sms_readiness: smsReadiness.status,
    sms_capable: smsReadiness.smsCapable,
    homeowner_likelihood: homeownerSignals.likelihood,
    homeowner_signals: { signals: homeownerSignals.signals },
    is_business_line: homeownerSignals.isBusinessLine,
    is_spam_risk: homeownerSignals.isSpamRisk,
    is_wrong_number_risk: homeownerSignals.isWrongNumberRisk,
    quality_score: qualityScore,
    spam_risk_score: spamRiskScore,
    validation_source: 'internal',
    last_validated_at: new Date().toISOString(),
    metadata: {},
  };

  const { data: savedIntelligence, error } = await supabase
    .from('phone_intelligence')
    .upsert(intelligenceData, {
      onConflict: 'phone_number,org_id',
    })
    .select()
    .single();

  if (error) {
    console.error('Error saving phone intelligence:', error);
  }

  // Update contact if provided
  if (contactId && savedIntelligence) {
    await supabase
      .from('contacts')
      .update({
        phone_valid: validation.isValid,
        phone_line_type: lineType.lineType,
        phone_carrier: carrier.carrierName,
        phone_sms_readiness: smsReadiness.status,
        phone_quality_score: qualityScore,
        phone_intelligence_id: savedIntelligence.id,
      })
      .eq('id', contactId);
  }

  return {
    phoneNumber: normalized,
    validation,
    carrier,
    lineType,
    smsReadiness,
    homeownerSignals,
    qualityScore,
    spamRiskScore,
    tags,
    metadata: savedIntelligence?.metadata,
  };
}





















































