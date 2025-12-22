/**
 * Block 13400 — SmartSend Contact Enrichment v1
 * 
 * Automatically enriches contacts with:
 * - City, ZIP, Neighborhood
 * - First & Last Name extraction
 * - Property Type inference
 * - Insurance vs Out-of-Pocket Intent
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

export interface EnrichmentResult {
  inferred_first_name?: string;
  inferred_last_name?: string;
  name_confidence: number;
  inferred_city?: string;
  city_confidence: number;
  inferred_zip?: string;
  zip_confidence: number;
  inferred_state?: string;
  inferred_neighborhood?: string;
  neighborhood_confidence: number;
  property_type?: 'single_family' | 'multi_family' | 'commercial' | 'unknown';
  property_type_confidence: number;
  insurance_interest: boolean;
  storm_risk_level?: 'high' | 'medium' | 'low' | 'unknown';
  enrichment_sources: string[];
}

export interface EnrichmentContext {
  email: string;
  existingFirstName?: string;
  existingLastName?: string;
  existingCity?: string;
  existingZip?: string;
  existingState?: string;
  existingTags?: string[];
  replyContent?: string;
  workspaceId: string;
  serviceArea?: string[]; // Roofer's service area cities
}

/**
 * Extract first and last name from email address
 * Examples:
 * - john.wilson22@gmail.com → John Wilson (high confidence)
 * - sarah_lopez@icloud.com → Sarah Lopez (high confidence)
 * - r.house@gmail.com → R House (low confidence)
 */
export function extractNameFromEmail(email: string): {
  first_name?: string;
  last_name?: string;
  confidence: number;
} {
  const localPart = email.split('@')[0].toLowerCase();
  
  // Pattern: firstname.lastname or firstname_lastname
  const dotPattern = /^([a-z]+)\.([a-z]+)/;
  const underscorePattern = /^([a-z]+)_([a-z]+)/;
  
  let match = localPart.match(dotPattern) || localPart.match(underscorePattern);
  
  if (match && match[1] && match[2]) {
    const first = match[1];
    const last = match[2];
    
    // Filter out numbers and very short names
    if (first.length >= 2 && last.length >= 2 && !/\d/.test(first) && !/\d/.test(last)) {
      return {
        first_name: capitalize(first),
        last_name: capitalize(last),
        confidence: 0.85
      };
    }
  }
  
  // Pattern: firstname + numbers
  const nameWithNumbers = /^([a-z]{3,})(\d+)/;
  match = localPart.match(nameWithNumbers);
  if (match && match[1]) {
    return {
      first_name: capitalize(match[1]),
      confidence: 0.6 // Lower confidence for partial names
    };
  }
  
  // Single word - might be first name only
  const singleWord = /^([a-z]{3,})/;
  match = localPart.match(singleWord);
  if (match && match[1] && match[1].length >= 3 && !/\d/.test(match[1])) {
    return {
      first_name: capitalize(match[1]),
      confidence: 0.4 // Low confidence for single word
    };
  }
  
  return { confidence: 0 };
}

/**
 * Infer city from various sources
 */
export async function inferCity(
  context: EnrichmentContext,
  supabase: any
): Promise<{ city?: string; confidence: number; source: string }> {
  const sources: Array<{ city?: string; confidence: number; source: string }> = [];
  
  // 1. Use existing city if present
  if (context.existingCity) {
    return { city: context.existingCity, confidence: 1.0, source: 'existing' };
  }
  
  // 2. Infer from ZIP code if available
  if (context.existingZip) {
    const zipCity = await lookupCityFromZip(context.existingZip, supabase);
    if (zipCity) {
      sources.push({ city: zipCity, confidence: 0.9, source: 'zip_lookup' });
    }
  }
  
  // 3. Infer from email domain (common patterns)
  const domainCity = inferCityFromDomain(context.email);
  if (domainCity) {
    sources.push({ city: domainCity, confidence: 0.3, source: 'email_domain' });
  }
  
  // 4. Extract from reply content
  if (context.replyContent) {
    const replyCity = extractCityFromText(context.replyContent);
    if (replyCity) {
      sources.push({ city: replyCity, confidence: 0.7, source: 'reply_content' });
    }
  }
  
  // 5. Use roofer's service area as fallback (low confidence)
  if (context.serviceArea && context.serviceArea.length > 0) {
    sources.push({ 
      city: context.serviceArea[0], 
      confidence: 0.2, 
      source: 'service_area_fallback' 
    });
  }
  
  // Return highest confidence result
  if (sources.length > 0) {
    const best = sources.reduce((a, b) => a.confidence > b.confidence ? a : b);
    return best;
  }
  
  return { confidence: 0, source: 'none' };
}

/**
 * Infer ZIP code from various sources
 */
export async function inferZip(
  context: EnrichmentContext,
  supabase: any
): Promise<{ zip?: string; confidence: number; source: string }> {
  // 1. Use existing ZIP if present
  if (context.existingZip) {
    return { zip: context.existingZip, confidence: 1.0, source: 'existing' };
  }
  
  // 2. Infer from city if available
  if (context.existingCity || context.existingState) {
    const zipFromCity = await lookupZipFromCity(
      context.existingCity || '',
      context.existingState || '',
      supabase
    );
    if (zipFromCity) {
      return { zip: zipFromCity, confidence: 0.6, source: 'city_lookup' };
    }
  }
  
  // 3. Extract from reply content
  if (context.replyContent) {
    const zipPattern = /\b(\d{5}(?:-\d{4})?)\b/;
    const match = context.replyContent.match(zipPattern);
    if (match) {
      return { zip: match[1].split('-')[0], confidence: 0.8, source: 'reply_content' };
    }
  }
  
  return { confidence: 0, source: 'none' };
}

/**
 * Detect neighborhood from text or city
 */
export function detectNeighborhood(
  text: string,
  city?: string
): { neighborhood?: string; confidence: number } {
  // Common neighborhood patterns
  const patterns = [
    /(?:in|from|near|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:neighborhood|area|district|side|hill|heights|valley|park|beach)/i,
    /(?:live|located|situated)\s+(?:in|on|at)\s+([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*(?:neighborhood|area|district|side|hill|heights|valley|park|beach)?/i,
    /([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s+(?:neighborhood|area|district|side|hill|heights|valley|park|beach)/i,
  ];
  
  for (const pattern of patterns) {
    const match = text.match(pattern);
    if (match && match[1]) {
      const neighborhood = match[1].trim();
      // Filter out common false positives
      if (!['the', 'a', 'an', 'my', 'our', 'your'].includes(neighborhood.toLowerCase())) {
        return { neighborhood, confidence: 0.7 };
      }
    }
  }
  
  // Common neighborhood keywords
  const keywords = [
    'south hill', 'north side', 'downtown', 'west valley', 'east heights',
    'uptown', 'midtown', 'suburbs', 'riverside', 'lakeside'
  ];
  
  const lowerText = text.toLowerCase();
  for (const keyword of keywords) {
    if (lowerText.includes(keyword)) {
      return { neighborhood: capitalizeWords(keyword), confidence: 0.6 };
    }
  }
  
  return { confidence: 0 };
}

/**
 * Infer property type from context
 */
export function inferPropertyType(
  context: EnrichmentContext
): { property_type: 'single_family' | 'multi_family' | 'commercial' | 'unknown'; confidence: number } {
  const text = (context.replyContent || '').toLowerCase();
  const email = context.email.toLowerCase();
  
  // Commercial indicators
  if (
    text.includes('office') ||
    text.includes('business') ||
    text.includes('commercial') ||
    text.includes('retail') ||
    email.includes('business') ||
    email.includes('office')
  ) {
    return { property_type: 'commercial', confidence: 0.7 };
  }
  
  // Multi-family indicators
  if (
    text.includes('apartment') ||
    text.includes('condo') ||
    text.includes('townhouse') ||
    text.includes('duplex') ||
    text.includes('multi-family')
  ) {
    return { property_type: 'multi_family', confidence: 0.7 };
  }
  
  // Single family is default for residential
  if (
    text.includes('home') ||
    text.includes('house') ||
    text.includes('residential') ||
    text.includes('single family')
  ) {
    return { property_type: 'single_family', confidence: 0.8 };
  }
  
  return { property_type: 'unknown', confidence: 0 };
}

/**
 * Detect insurance interest from reply content
 */
export function detectInsuranceInterest(replyContent?: string): boolean {
  if (!replyContent) return false;
  
  const lowerContent = replyContent.toLowerCase();
  const indicators = [
    'adjuster',
    'claim',
    'insurance said',
    'insurance company',
    'filing a claim',
    'insurance claim',
    'adjuster came',
    'insurance approved',
    'insurance denied',
    'deductible'
  ];
  
  return indicators.some(indicator => lowerContent.includes(indicator));
}

/**
 * Main enrichment function
 */
export async function enrichContact(
  contactId: string,
  context: EnrichmentContext,
  supabase: any
): Promise<EnrichmentResult> {
  const sources: string[] = [];
  const result: EnrichmentResult = {
    name_confidence: 0,
    city_confidence: 0,
    zip_confidence: 0,
    neighborhood_confidence: 0,
    property_type_confidence: 0,
    insurance_interest: false,
    enrichment_sources: []
  };
  
  // 1. Extract name from email
  if (!context.existingFirstName && !context.existingLastName) {
    const nameResult = extractNameFromEmail(context.email);
    if (nameResult.first_name) {
      result.inferred_first_name = nameResult.first_name;
      result.inferred_last_name = nameResult.last_name;
      result.name_confidence = nameResult.confidence;
      sources.push('email_name_extraction');
    }
  }
  
  // 2. Infer city
  const cityResult = await inferCity(context, supabase);
  if (cityResult.city) {
    result.inferred_city = cityResult.city;
    result.city_confidence = cityResult.confidence;
    sources.push(cityResult.source);
  }
  
  // 3. Infer ZIP
  const zipResult = await inferZip(context, supabase);
  if (zipResult.zip) {
    result.inferred_zip = zipResult.zip;
    result.zip_confidence = zipResult.confidence;
    sources.push(zipResult.source);
  }
  
  // 4. Detect neighborhood
  if (context.replyContent) {
    const neighborhoodResult = detectNeighborhood(context.replyContent, result.inferred_city);
    if (neighborhoodResult.neighborhood) {
      result.inferred_neighborhood = neighborhoodResult.neighborhood;
      result.neighborhood_confidence = neighborhoodResult.confidence;
      sources.push('reply_content');
    }
  }
  
  // 5. Infer property type
  const propertyResult = inferPropertyType(context);
  result.property_type = propertyResult.property_type;
  result.property_type_confidence = propertyResult.confidence;
  if (propertyResult.property_type !== 'unknown') {
    sources.push('context_analysis');
  }
  
  // 6. Detect insurance interest
  result.insurance_interest = detectInsuranceInterest(context.replyContent);
  if (result.insurance_interest) {
    sources.push('reply_content');
  }
  
  result.enrichment_sources = sources;
  
  return result;
}

// Helper functions

function capitalize(str: string): string {
  return str.charAt(0).toUpperCase() + str.slice(1);
}

function capitalizeWords(str: string): string {
  return str.split(' ').map(capitalize).join(' ');
}

function inferCityFromDomain(email: string): string | null {
  // Very basic domain-based inference (can be expanded)
  const domain = email.split('@')[1]?.toLowerCase();
  if (!domain) return null;
  
  // Common patterns (limited examples)
  const cityDomains: Record<string, string> = {
    'gmail.com': null, // Too generic
    'yahoo.com': null,
    'outlook.com': null,
  };
  
  // Could add more sophisticated domain analysis here
  return cityDomains[domain] || null;
}

function extractCityFromText(text: string): string | null {
  // Look for common city patterns in text
  // This is a simplified version - could use NLP or geocoding API
  const cityPattern = /\b([A-Z][a-z]+(?:\s+[A-Z][a-z]+)*)\s*(?:,\s*[A-Z]{2})?\b/;
  const match = text.match(cityPattern);
  return match ? match[1] : null;
}

async function lookupCityFromZip(zip: string, supabase: any): Promise<string | null> {
  // In a real implementation, this would query a ZIP code database
  // For now, return null (can be implemented with a ZIP code lookup API or database)
  return null;
}

async function lookupZipFromCity(city: string, state: string, supabase: any): Promise<string | null> {
  // In a real implementation, this would query a city/ZIP database
  // For now, return null (can be implemented with a geocoding API)
  return null;
}





















































