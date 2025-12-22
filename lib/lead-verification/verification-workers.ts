/**
 * Block 19500 — SmartSend Lead Verification Engine v1
 * Verification Workers for all 9 Category Checks
 */

import { validateEmail, isDisposableEmail, isSpamDomain } from "@/lib/import/email-validation";

// ============================================
// Types
// ============================================

export interface EmailVerificationResult {
  valid: boolean;
  formatValid: boolean;
  mailboxExists: boolean | null; // null = not checked
  domainReputation: "good" | "neutral" | "poor" | "unknown";
  spamMarkers: string[];
  disposable: boolean;
  status: "valid" | "risky" | "invalid" | "unknown";
  reasons: string[];
  score: number; // 0-100
  metadata?: Record<string, any>;
}

export interface PhoneVerificationResult {
  valid: boolean;
  type: "mobile" | "landline" | "voip" | "toll_free" | "unknown";
  carrier: string | null;
  spamLevel: "low" | "medium" | "high" | "unknown";
  status: "valid" | "risky" | "invalid" | "unknown";
  reasons: string[];
  score: number; // 0-100
  metadata?: Record<string, any>;
}

export interface AddressVerificationResult {
  valid: boolean;
  formatted: string | null;
  inTerritory: boolean | null;
  isPoBox: boolean;
  isCommercial: boolean;
  isMultiFamily: boolean;
  status: "valid" | "risky" | "invalid" | "unknown";
  reasons: string[];
  score: number; // 0-100
  metadata?: Record<string, any>;
}

export interface HomeownerVerificationResult {
  verified: boolean;
  matchScore: number; // 0.0-1.0
  matchSources: string[];
  status: "verified" | "likely" | "unlikely" | "unknown";
  reasons: string[];
  score: number; // 0-100
  metadata?: Record<string, any>;
}

export interface IntentVerificationResult {
  roofingRelevant: boolean;
  score: number; // 0.0-1.0
  keywords: string[];
  status: "relevant" | "maybe" | "irrelevant" | "unknown";
  reasons: string[];
  metadata?: Record<string, any>;
}

export interface SpamVerificationResult {
  detected: boolean;
  score: number; // 0.0-1.0
  patterns: string[];
  type: "vendor" | "bot" | "foreign_spam" | "link_spam" | "sales_pitch" | "none";
  status: "clean" | "suspicious" | "spam" | "unknown";
  reasons: string[];
  metadata?: Record<string, any>;
}

export interface DuplicateVerificationResult {
  isDuplicate: boolean;
  matches: string[]; // Array of contact/lead IDs
  matchFields: string[];
  status: "unique" | "duplicate" | "possible_duplicate" | "unknown";
  score: number; // 0-100 (lower is better for duplicates)
  metadata?: Record<string, any>;
}

export interface TerritoryVerificationResult {
  compliant: boolean;
  matchZip: boolean | null;
  matchNeighborhood: boolean | null;
  matchCounty: boolean | null;
  status: "in_territory" | "out_of_area" | "unknown";
  reasons: string[];
  score: number; // 0-100
  metadata?: Record<string, any>;
}

// ============================================
// 1. Email Quality Verification
// ============================================

export async function verifyEmail(contactOrLead: any): Promise<EmailVerificationResult> {
  const email = contactOrLead?.email;
  const result: EmailVerificationResult = {
    valid: false,
    formatValid: false,
    mailboxExists: null,
    domainReputation: "unknown",
    spamMarkers: [],
    disposable: false,
    status: "unknown",
    reasons: [],
    score: 0,
  };

  if (!email || typeof email !== "string") {
    result.reasons.push("No email provided");
    result.status = "invalid";
    return result;
  }

  const emailLower = email.toLowerCase().trim();

  // Format validation
  const emailValidation = validateEmail(emailLower);
  result.formatValid = emailValidation.isValid;
  
  if (!emailValidation.isValid) {
    result.reasons.push(emailValidation.reason || "Invalid email format");
    result.status = "invalid";
    return result;
  }

  // Disposable check
  result.disposable = isDisposableEmail(emailLower);
  if (result.disposable) {
    result.spamMarkers.push("disposable_email");
    result.reasons.push("Disposable email domain detected");
    result.status = "invalid";
    result.score = 0;
    return result;
  }

  // Spam domain check
  if (isSpamDomain(emailLower)) {
    result.spamMarkers.push("spam_domain");
    result.reasons.push("Known spam domain");
    result.domainReputation = "poor";
    result.status = "invalid";
    result.score = 10;
    return result;
  }

  // Domain reputation (basic heuristic)
  const domain = emailLower.split("@")[1];
  if (domain) {
    // Check for common legitimate domains
    const trustedDomains = ["gmail.com", "yahoo.com", "outlook.com", "icloud.com", "hotmail.com", "aol.com"];
    if (trustedDomains.includes(domain)) {
      result.domainReputation = "good";
    } else if (domain.includes(".") && domain.split(".").length >= 2) {
      result.domainReputation = "neutral";
    } else {
      result.domainReputation = "poor";
      result.spamMarkers.push("suspicious_domain");
    }
  }

  // Check for suspicious patterns
  const suspiciousPatterns = [
    /^[a-z0-9]+$/i, // All lowercase/numeric (e.g., "test123@gmail.com")
    /^\d+@/, // Starts with numbers
    /test/i,
    /fake/i,
    /temp/i,
  ];

  for (const pattern of suspiciousPatterns) {
    if (pattern.test(emailLower)) {
      result.spamMarkers.push("suspicious_pattern");
      result.reasons.push("Suspicious email pattern detected");
      break;
    }
  }

  // Calculate score
  if (result.disposable || result.spamMarkers.length > 2) {
    result.score = 0;
    result.status = "invalid";
  } else if (result.spamMarkers.length > 0) {
    result.score = 50;
    result.status = "risky";
  } else {
    result.score = result.domainReputation === "good" ? 100 : result.domainReputation === "neutral" ? 80 : 60;
    result.status = "valid";
  }

  result.valid = result.status === "valid" || result.status === "risky";

  return result;
}

// ============================================
// 2. Phone Validation
// ============================================

export async function verifyPhone(contactOrLead: any): Promise<PhoneVerificationResult> {
  const phone = contactOrLead?.phone;
  const result: PhoneVerificationResult = {
    valid: false,
    type: "unknown",
    carrier: null,
    spamLevel: "unknown",
    status: "unknown",
    reasons: [],
    score: 0,
  };

  if (!phone || typeof phone !== "string") {
    result.reasons.push("No phone provided");
    result.status = "unknown";
    result.score = 50; // Neutral score if no phone
    return result;
  }

  // Normalize phone number (remove all non-digits)
  const digitsOnly = phone.replace(/\D/g, "");

  // Check if it's a valid US phone number format
  if (digitsOnly.length === 10 || (digitsOnly.length === 11 && digitsOnly.startsWith("1"))) {
    const normalized = digitsOnly.length === 11 ? digitsOnly.slice(1) : digitsOnly;
    
    // Check for obvious fake patterns
    const fakePatterns = [
      /(\d)\1{4,}/, // Same digit repeated 5+ times
      /12345|54321/, // Sequential
      /0000|1111|2222|3333|4444|5555|6666|7777|8888|9999/, // All same digits
    ];

    let isFake = false;
    for (const pattern of fakePatterns) {
      if (pattern.test(normalized)) {
        isFake = true;
        result.reasons.push("Suspicious phone pattern detected");
        result.spamLevel = "high";
        break;
      }
    }

    if (isFake) {
      result.status = "invalid";
      result.score = 0;
      return result;
    }

    // Basic VoIP detection (area codes that are commonly VoIP)
    // This is a simplified check - in production, use Twilio Lookup API
    const voipAreaCodes = ["833", "844", "855", "866", "877", "888"]; // Toll-free
    const areaCode = normalized.substring(0, 3);
    
    if (voipAreaCodes.includes(areaCode)) {
      result.type = "toll_free";
      result.reasons.push("Toll-free number detected");
      result.spamLevel = "medium";
      result.status = "risky";
      result.score = 60;
    } else {
      // Assume mobile/landline (would need carrier lookup API for accurate detection)
      result.type = "mobile"; // Default assumption
      result.valid = true;
      result.status = "valid";
      result.spamLevel = "low";
      result.score = 90;
    }
  } else {
    result.reasons.push("Invalid phone number format");
    result.status = "invalid";
    result.score = 0;
  }

  return result;
}

// ============================================
// 3. Address Accuracy Verification
// ============================================

export async function verifyAddress(
  contactOrLead: any,
  workspaceId: string
): Promise<AddressVerificationResult> {
  const address = contactOrLead?.address || contactOrLead?.street_address;
  const city = contactOrLead?.city;
  const state = contactOrLead?.state;
  const zip = contactOrLead?.zip || contactOrLead?.postal_code;
  
  const result: AddressVerificationResult = {
    valid: false,
    formatted: null,
    inTerritory: null,
    isPoBox: false,
    isCommercial: false,
    isMultiFamily: false,
    status: "unknown",
    reasons: [],
    score: 0,
  };

  // Check if address exists
  if (!address && !city && !zip) {
    result.reasons.push("No address information provided");
    result.status = "unknown";
    result.score = 50; // Neutral score
    return result;
  }

  // PO Box detection
  if (address && /p\.?\s*o\.?\s*box|po box|post office box/i.test(address)) {
    result.isPoBox = true;
    result.reasons.push("PO Box detected");
    result.status = "risky";
    result.score = 30;
    return result;
  }

  // Commercial building detection (basic patterns)
  if (address) {
    const commercialPatterns = [
      /\b(suite|ste|unit|apt|apartment|#)\s*\d+/i,
      /\b(plaza|mall|center|building|complex|tower)\b/i,
    ];
    
    for (const pattern of commercialPatterns) {
      if (pattern.test(address)) {
        result.isCommercial = true;
        result.reasons.push("Possible commercial address");
        break;
      }
    }
  }

  // Multi-family detection
  if (address && /(apartment|apt|unit|#|\/)/i.test(address)) {
    result.isMultiFamily = true;
    result.reasons.push("Multi-family address detected");
  }

  // Basic validation
  if (address && address.trim().length > 5) {
    result.valid = true;
    result.formatted = [address, city, state, zip].filter(Boolean).join(", ");
    
    if (zip && /^\d{5}(-\d{4})?$/.test(zip)) {
      result.status = "valid";
      result.score = result.isPoBox ? 30 : result.isCommercial ? 60 : 90;
    } else {
      result.status = "risky";
      result.reasons.push("Invalid or missing ZIP code");
      result.score = 50;
    }
  } else {
    result.status = "invalid";
    result.reasons.push("Incomplete address");
    result.score = 20;
  }

  return result;
}

// ============================================
// 4. Homeowner Verification
// ============================================

export async function verifyHomeowner(contactOrLead: any): Promise<HomeownerVerificationResult> {
  const name = `${contactOrLead?.first_name || ""} ${contactOrLead?.last_name || ""}`.trim();
  const address = contactOrLead?.address || contactOrLead?.street_address;
  const city = contactOrLead?.city;
  const state = contactOrLead?.state;
  const zip = contactOrLead?.zip || contactOrLead?.postal_code;

  const result: HomeownerVerificationResult = {
    verified: false,
    matchScore: 0.0,
    matchSources: [],
    status: "unknown",
    reasons: [],
    score: 0,
  };

  // Check if we have enough data to verify
  if (!name || !address || !zip) {
    result.reasons.push("Insufficient data for homeowner verification");
    result.status = "unknown";
    result.score = 50; // Neutral score
    return result;
  }

  // In a real implementation, this would call Zillow/Redfin APIs or property tax records
  // For now, we'll use basic heuristics:
  // - If name and address are provided, assume likely homeowner
  // - In production, integrate with property data APIs

  // Basic name validation
  const nameParts = name.split(" ").filter(p => p.length > 0);
  if (nameParts.length >= 2 && nameParts.every(p => /^[a-z]+$/i.test(p))) {
    result.matchScore = 0.7; // Likely real name
    result.matchSources.push("name_format");
  } else {
    result.matchScore = 0.3;
    result.reasons.push("Name format appears suspicious");
  }

  // Address validation
  if (address && address.length > 10 && zip && /^\d{5}/.test(zip)) {
    result.matchScore += 0.2;
    result.matchSources.push("address_format");
  }

  // Determine status
  if (result.matchScore >= 0.8) {
    result.status = "verified";
    result.verified = true;
    result.score = 90;
  } else if (result.matchScore >= 0.5) {
    result.status = "likely";
    result.verified = true;
    result.score = 70;
  } else {
    result.status = "unlikely";
    result.score = 30;
  }

  return result;
}

// ============================================
// 5. Lead Intent Match (Roofing Relevance)
// ============================================

export async function verifyIntent(contactOrLead: any): Promise<IntentVerificationResult> {
  const message = contactOrLead?.notes || contactOrLead?.message || contactOrLead?.subject || "";
  const messageLower = message.toLowerCase();

  const result: IntentVerificationResult = {
    roofingRelevant: false,
    score: 0.0,
    keywords: [],
    status: "unknown",
    reasons: [],
  };

  if (!message || message.trim().length === 0) {
    result.reasons.push("No message or notes provided");
    result.status = "unknown";
    return result;
  }

  // Roofing-relevant keywords (positive signals)
  const roofingKeywords = [
    "roof", "roofing", "shingle", "shingles", "gutter", "gutters",
    "leak", "leaking", "hail", "storm", "damage", "repair", "replace",
    "quote", "estimate", "inspection", "insurance", "claim",
    "missing", "broken", "cracked", "worn", "old", "age",
    "vent", "flashing", "chimney", "skylight", "dormer",
  ];

  // Non-roofing keywords (negative signals)
  const nonRoofingKeywords = [
    "solar", "hvac", "heating", "cooling", "air conditioning",
    "landscaping", "landscape", "lawn", "yard", "fence",
    "painting", "paint", "driveway", "paving", "concrete",
    "handyman", "plumbing", "electrical", "appliance",
    "job application", "resume", "hire", "employment",
    "vendor", "partnership", "seo", "marketing", "advertising",
  ];

  // Count matches
  let roofingMatches = 0;
  let nonRoofingMatches = 0;
  const foundKeywords: string[] = [];

  for (const keyword of roofingKeywords) {
    if (messageLower.includes(keyword)) {
      roofingMatches++;
      foundKeywords.push(keyword);
    }
  }

  for (const keyword of nonRoofingKeywords) {
    if (messageLower.includes(keyword)) {
      nonRoofingMatches++;
      result.reasons.push(`Non-roofing keyword detected: ${keyword}`);
    }
  }

  // Calculate score
  if (roofingMatches > 0 && nonRoofingMatches === 0) {
    result.roofingRelevant = true;
    result.score = Math.min(1.0, 0.5 + (roofingMatches * 0.1));
    result.status = "relevant";
    result.keywords = foundKeywords;
  } else if (roofingMatches > nonRoofingMatches) {
    result.roofingRelevant = true;
    result.score = 0.6;
    result.status = "maybe";
    result.keywords = foundKeywords;
  } else if (nonRoofingMatches > roofingMatches) {
    result.roofingRelevant = false;
    result.score = 0.2;
    result.status = "irrelevant";
  } else if (roofingMatches === 0 && nonRoofingMatches === 0) {
    result.score = 0.5;
    result.status = "unknown";
    result.reasons.push("No clear roofing or non-roofing keywords found");
  } else {
    result.score = 0.4;
    result.status = "maybe";
  }

  return result;
}

// ============================================
// 6. Spam Detection Engine
// ============================================

export async function verifySpam(contactOrLead: any): Promise<SpamVerificationResult> {
  const message = contactOrLead?.notes || contactOrLead?.message || contactOrLead?.subject || "";
  const email = contactOrLead?.email || "";
  const messageLower = message.toLowerCase();
  const emailLower = email.toLowerCase();

  const result: SpamVerificationResult = {
    detected: false,
    score: 0.0,
    patterns: [],
    type: "none",
    status: "unknown",
    reasons: [],
  };

  // Vendor/spam patterns
  const vendorPatterns = [
    /partner.*with.*you/i,
    /we offer.*seo/i,
    /we offer.*marketing/i,
    /can you review/i,
    /check out.*product/i,
    /visit.*website/i,
    /click.*link/i,
    /free.*trial/i,
    /limited.*offer/i,
  ];

  // Sales pitch patterns
  const salesPitchPatterns = [
    /hi.*i.*like.*to.*partner/i,
    /we.*provide.*services/i,
    /our.*company.*offers/i,
    /contact.*us.*for.*more/i,
  ];

  // Link spam patterns
  const linkSpamPatterns = [
    /http[s]?:\/\//i,
    /www\./i,
    /\.com.*\.com/i, // Multiple domains
  ];

  // Bot patterns
  const botPatterns = [
    /^hi\s*$/i,
    /^hello\s*$/i,
    /^test\s*$/i,
    /^\w{1,3}\s*$/i, // Very short messages
  ];

  // Check patterns
  for (const pattern of vendorPatterns) {
    if (pattern.test(messageLower)) {
      result.detected = true;
      result.patterns.push("vendor_offer");
      result.type = "vendor";
      result.score += 0.3;
      result.reasons.push("Vendor/spam pattern detected");
    }
  }

  for (const pattern of salesPitchPatterns) {
    if (pattern.test(messageLower)) {
      result.detected = true;
      result.patterns.push("sales_pitch");
      if (result.type === "none") result.type = "sales_pitch";
      result.score += 0.2;
      result.reasons.push("Sales pitch pattern detected");
    }
  }

  for (const pattern of linkSpamPatterns) {
    if (pattern.test(messageLower)) {
      result.detected = true;
      result.patterns.push("link_spam");
      if (result.type === "none") result.type = "link_spam";
      result.score += 0.4;
      result.reasons.push("Link spam detected");
    }
  }

  for (const pattern of botPatterns) {
    if (pattern.test(messageLower) && messageLower.trim().length < 10) {
      result.detected = true;
      result.patterns.push("bot");
      if (result.type === "none") result.type = "bot";
      result.score += 0.5;
      result.reasons.push("Bot-like message pattern");
    }
  }

  // Check for foreign spam (non-English characters in suspicious contexts)
  if (/[^\x00-\x7F]/.test(message) && message.length < 50) {
    result.detected = true;
    result.patterns.push("foreign_spam");
    if (result.type === "none") result.type = "foreign_spam";
    result.score += 0.3;
    result.reasons.push("Possible foreign spam");
  }

  // Determine status
  if (result.score >= 0.7) {
    result.status = "spam";
  } else if (result.score >= 0.4) {
    result.status = "suspicious";
  } else if (result.score > 0) {
    result.status = "suspicious";
  } else {
    result.status = "clean";
  }

  return result;
}

// ============================================
// 7. Duplicate Detection
// ============================================

export async function verifyDuplicates(
  contactOrLead: any,
  workspaceId: string
): Promise<DuplicateVerificationResult> {
  // This would typically query the database for duplicates
  // For now, return a placeholder that indicates we need database access
  const result: DuplicateVerificationResult = {
    isDuplicate: false,
    matches: [],
    matchFields: [],
    status: "unknown",
    score: 100, // 100 = unique (no duplicates)
  };

  // Note: Actual duplicate detection requires database queries
  // This should be implemented in the API route with Supabase client
  result.status = "unique";
  return result;
}

// ============================================
// 8. Territory Compliance
// ============================================

export async function verifyTerritory(
  contactOrLead: any,
  workspaceId: string
): Promise<TerritoryVerificationResult> {
  const zip = contactOrLead?.zip || contactOrLead?.postal_code;
  const city = contactOrLead?.city;
  const state = contactOrLead?.state;

  const result: TerritoryVerificationResult = {
    compliant: false,
    matchZip: null,
    matchNeighborhood: null,
    matchCounty: null,
    status: "unknown",
    reasons: [],
    score: 0,
  };

  if (!zip) {
    result.reasons.push("No ZIP code provided");
    result.status = "unknown";
    result.score = 50; // Neutral score
    return result;
  }

  // Note: Actual territory checking requires querying contractor_territory table
  // This should be implemented in the API route with Supabase client
  // For now, return unknown status
  result.status = "unknown";
  result.score = 50;

  return result;
}

// ============================================
// 9. Quality Score Calculation
// ============================================

export interface QualityScoreInputs {
  email: EmailVerificationResult;
  phone: PhoneVerificationResult;
  address: AddressVerificationResult;
  homeowner: HomeownerVerificationResult;
  intent: IntentVerificationResult;
  territory: TerritoryVerificationResult;
  spam: SpamVerificationResult;
  duplicate: DuplicateVerificationResult;
}

export function calculateQualityScore(inputs: QualityScoreInputs): number {
  // Component scores (0-100)
  const emailScore = inputs.email.score;
  const phoneScore = inputs.phone.score;
  const addressScore = inputs.address.score;
  const homeownerScore = inputs.homeowner.score;
  const intentScore = inputs.intent.score * 100; // Convert 0-1 to 0-100
  const territoryScore = inputs.territory.score;

  // Penalties (0-100, subtracted)
  const spamPenalty = inputs.spam.score * 100; // Convert 0-1 to 0-100
  const duplicatePenalty = 100 - inputs.duplicate.score; // Invert (100 = unique, 0 = duplicate)

  // Weighted scoring
  const weightedScore =
    emailScore * 0.15 +
    phoneScore * 0.15 +
    addressScore * 0.10 +
    homeownerScore * 0.25 +
    intentScore * 0.20 +
    territoryScore * 0.15;

  // Apply penalties
  const finalScore = weightedScore - (spamPenalty * 0.5) - (duplicatePenalty * 0.3);

  // Ensure score is between 0 and 100
  return Math.max(0, Math.min(100, Math.round(finalScore)));
}

// ============================================
// 10. Red Alerts Generation
// ============================================

export interface RedAlertsInputs {
  email: EmailVerificationResult;
  phone: PhoneVerificationResult;
  homeowner: HomeownerVerificationResult;
  territory: TerritoryVerificationResult;
  spam: SpamVerificationResult;
  duplicate: DuplicateVerificationResult;
  intent: IntentVerificationResult;
}

export function generateRedAlerts(inputs: RedAlertsInputs): string[] {
  const alerts: string[] = [];

  // Email alerts
  if (inputs.email.status === "invalid") {
    alerts.push("invalid_email");
  }
  if (inputs.email.disposable) {
    alerts.push("disposable_email");
  }

  // Phone alerts
  if (inputs.phone.type === "voip") {
    alerts.push("voip_phone");
  }
  if (inputs.phone.status === "invalid") {
    alerts.push("invalid_phone");
  }

  // Homeowner alerts
  if (inputs.homeowner.verified === false && inputs.homeowner.status !== "unknown") {
    alerts.push("not_homeowner");
  }

  // Territory alerts
  if (inputs.territory.compliant === false) {
    alerts.push("territory_mismatch");
  }

  // Spam alerts
  if (inputs.spam.detected) {
    alerts.push("spam_detected");
  }
  if (inputs.spam.type === "vendor") {
    alerts.push("likely_vendor");
  }

  // Duplicate alerts
  if (inputs.duplicate.isDuplicate) {
    alerts.push("duplicate_lead");
  }

  // Intent alerts
  if (inputs.intent.roofingRelevant === false && inputs.intent.status !== "unknown") {
    alerts.push("not_roofing_lead");
  }

  return alerts;
}
