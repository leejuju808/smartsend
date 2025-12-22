/**
 * Duplicate Detection Service for Contact Import v2
 * Detects duplicates based on email, name+address, zip+name similarity
 */

import { createClient } from '@/lib/supabase/server';

export interface DuplicateMatch {
  contactId: string;
  matchType: 'exact_email' | 'name_address' | 'zip_name' | 'phone';
  matchScore: number;
  matchReason: string;
}

export interface DuplicateCheckResult {
  isDuplicate: boolean;
  matches: DuplicateMatch[];
  bestMatch?: DuplicateMatch;
}

/**
 * Normalize string for comparison
 */
function normalizeString(str: string | null | undefined): string {
  if (!str) return '';
  return str
    .toLowerCase()
    .trim()
    .replace(/[^\w\s]/g, '') // Remove special characters
    .replace(/\s+/g, ' '); // Normalize whitespace
}

/**
 * Calculate string similarity (simple Levenshtein-like)
 */
function stringSimilarity(str1: string, str2: string): number {
  const s1 = normalizeString(str1);
  const s2 = normalizeString(str2);
  
  if (s1 === s2) return 1.0;
  if (!s1 || !s2) return 0.0;
  
  // Simple similarity check
  const longer = s1.length > s2.length ? s1 : s2;
  const shorter = s1.length > s2.length ? s2 : s1;
  
  if (longer.length === 0) return 1.0;
  
  // Check if shorter is contained in longer
  if (longer.includes(shorter)) {
    return shorter.length / longer.length;
  }
  
  // Simple character overlap
  let matches = 0;
  for (let i = 0; i < shorter.length; i++) {
    if (longer.includes(shorter[i])) {
      matches++;
    }
  }
  
  return matches / longer.length;
}

/**
 * Normalize phone number
 */
function normalizePhone(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/\D/g, ''); // Remove non-digits
}

/**
 * Check for exact email match
 */
export async function checkExactEmailMatch(
  email: string,
  workspaceId: string,
  supabase: any
): Promise<DuplicateMatch | null> {
  const { data: existing } = await supabase
    .from('contacts')
    .select('id, email, first_name, last_name')
    .eq('workspace_id', workspaceId)
    .ilike('email', email.trim())
    .is('merged_into', null)
    .limit(1)
    .single();

  if (existing) {
    return {
      contactId: existing.id,
      matchType: 'exact_email',
      matchScore: 100,
      matchReason: 'Exact email match',
    };
  }

  return null;
}

/**
 * Check for name + address match
 */
export async function checkNameAddressMatch(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  address: string | null | undefined,
  workspaceId: string,
  supabase: any
): Promise<DuplicateMatch | null> {
  if (!firstName && !lastName) return null;
  if (!address) return null;

  const normalizedAddress = normalizeString(address);
  if (!normalizedAddress) return null;

  const { data: existing } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, address, street')
    .eq('workspace_id', workspaceId)
    .is('merged_into', null);

  if (!existing || existing.length === 0) return null;

  for (const contact of existing) {
    const contactAddress = normalizeString(contact.address || contact.street || '');
    if (!contactAddress) continue;

    // Check address similarity (high threshold)
    const addressSimilarity = stringSimilarity(normalizedAddress, contactAddress);
    if (addressSimilarity < 0.8) continue;

    // Check name match
    const contactFirstName = normalizeString(contact.first_name || '');
    const contactLastName = normalizeString(contact.last_name || '');
    const inputFirstName = normalizeString(firstName || '');
    const inputLastName = normalizeString(lastName || '');

    let nameMatch = false;
    if (inputFirstName && contactFirstName) {
      nameMatch = contactFirstName === inputFirstName;
    }
    if (inputLastName && contactLastName) {
      nameMatch = nameMatch || contactLastName === inputLastName;
    }
    if (!inputFirstName && !inputLastName && !contactFirstName && !contactLastName) {
      nameMatch = true; // Both have no name
    }

    if (nameMatch && addressSimilarity >= 0.8) {
      return {
        contactId: contact.id,
        matchType: 'name_address',
        matchScore: Math.round(addressSimilarity * 85),
        matchReason: `Name + address match (${Math.round(addressSimilarity * 100)}% similarity)`,
      };
    }
  }

  return null;
}

/**
 * Check for zip + name similarity match
 */
export async function checkZipNameMatch(
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  zip: string | null | undefined,
  workspaceId: string,
  supabase: any
): Promise<DuplicateMatch | null> {
  if (!zip) return null;
  if (!firstName && !lastName) return null;

  const normalizedZip = zip.trim().substring(0, 5); // First 5 digits

  const { data: existing } = await supabase
    .from('contacts')
    .select('id, first_name, last_name, zip, postal_code')
    .eq('workspace_id', workspaceId)
    .is('merged_into', null)
    .or(`zip.eq.${normalizedZip},postal_code.eq.${normalizedZip}`);

  if (!existing || existing.length === 0) return null;

  const inputFirstName = normalizeString(firstName || '');
  const inputLastName = normalizeString(lastName || '');
  const inputFullName = `${inputFirstName} ${inputLastName}`.trim();

  for (const contact of existing) {
    const contactFirstName = normalizeString(contact.first_name || '');
    const contactLastName = normalizeString(contact.last_name || '');
    const contactFullName = `${contactFirstName} ${contactLastName}`.trim();

    if (!contactFullName && !inputFullName) continue;

    // Calculate name similarity
    const nameSimilarity = stringSimilarity(inputFullName, contactFullName);
    
    // High threshold for zip+name match
    if (nameSimilarity >= 0.7) {
      return {
        contactId: contact.id,
        matchType: 'zip_name',
        matchScore: Math.round(nameSimilarity * 75),
        matchReason: `Zip + name similarity (${Math.round(nameSimilarity * 100)}% match)`,
      };
    }
  }

  return null;
}

/**
 * Check for phone match
 */
export async function checkPhoneMatch(
  phone: string | null | undefined,
  workspaceId: string,
  supabase: any
): Promise<DuplicateMatch | null> {
  if (!phone) return null;

  const normalizedPhone = normalizePhone(phone);
  if (normalizedPhone.length < 10) return null; // Need at least 10 digits

  const { data: existing } = await supabase
    .from('contacts')
    .select('id, phone')
    .eq('workspace_id', workspaceId)
    .is('merged_into', null)
    .not('phone', 'is', null);

  if (!existing || existing.length === 0) return null;

  for (const contact of existing) {
    const contactPhone = normalizePhone(contact.phone);
    if (contactPhone === normalizedPhone) {
      return {
        contactId: contact.id,
        matchType: 'phone',
        matchScore: 85,
        matchReason: 'Same phone number',
      };
    }
  }

  return null;
}

/**
 * Comprehensive duplicate check
 */
export async function checkDuplicate(
  email: string,
  firstName: string | null | undefined,
  lastName: string | null | undefined,
  address: string | null | undefined,
  zip: string | null | undefined,
  phone: string | null | undefined,
  workspaceId: string,
  supabase: any
): Promise<DuplicateCheckResult> {
  const matches: DuplicateMatch[] = [];

  // 1. Check exact email match (highest priority)
  const emailMatch = await checkExactEmailMatch(email, workspaceId, supabase);
  if (emailMatch) {
    matches.push(emailMatch);
    return {
      isDuplicate: true,
      matches: [emailMatch],
      bestMatch: emailMatch,
    };
  }

  // 2. Check name + address match
  const nameAddressMatch = await checkNameAddressMatch(
    firstName,
    lastName,
    address,
    workspaceId,
    supabase
  );
  if (nameAddressMatch) {
    matches.push(nameAddressMatch);
  }

  // 3. Check phone match
  const phoneMatch = await checkPhoneMatch(phone, workspaceId, supabase);
  if (phoneMatch) {
    matches.push(phoneMatch);
  }

  // 4. Check zip + name match (lower priority)
  const zipNameMatch = await checkZipNameMatch(
    firstName,
    lastName,
    zip,
    workspaceId,
    supabase
  );
  if (zipNameMatch) {
    matches.push(zipNameMatch);
  }

  // Sort matches by score (highest first)
  matches.sort((a, b) => b.matchScore - a.matchScore);

  return {
    isDuplicate: matches.length > 0,
    matches,
    bestMatch: matches.length > 0 ? matches[0] : undefined,
  };
}





















































