/**
 * Phone number utilities for call functionality
 */

/**
 * Normalize phone number to digits only
 */
export function normalizePhoneDigits(phone: string | null | undefined): string {
  if (!phone) return '';
  return phone.replace(/\D/g, '');
}

/**
 * Format phone number as (XXX) XXX-XXXX
 */
export function formatPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = normalizePhoneDigits(phone);
  if (digits.length === 10) {
    return `(${digits.slice(0, 3)}) ${digits.slice(3, 6)}-${digits.slice(6)}`;
  }
  return phone;
}

/**
 * Validate phone number (10 digits)
 */
export function validatePhoneNumber(phone: string | null | undefined): boolean {
  if (!phone) return false;
  const digits = normalizePhoneDigits(phone);
  return digits.length === 10;
}

/**
 * Extract phone numbers from text
 */
export function extractPhoneNumbers(text: string): string[] {
  if (!text) return [];
  
  // Match common phone patterns: (555) 123-4567, 555-123-4567, 555.123.4567, 5551234567
  const patterns = [
    /\(?\d{3}\)?[-.\s]?\d{3}[-.\s]?\d{4}/g,
    /\d{10}/g,
  ];
  
  const numbers: string[] = [];
  
  for (const pattern of patterns) {
    const matches = text.match(pattern);
    if (matches) {
      for (const match of matches) {
        const normalized = normalizePhoneDigits(match);
        if (normalized.length === 10 && !numbers.includes(normalized)) {
          numbers.push(normalized);
        }
      }
    }
  }
  
  return numbers;
}

/**
 * Get tel: link for phone number
 */
export function getTelLink(phone: string | null | undefined): string {
  if (!phone) return '';
  const digits = normalizePhoneDigits(phone);
  return `tel:${digits}`;
}

/**
 * Detect if device is mobile
 */
export function isMobileDevice(): boolean {
  if (typeof window === 'undefined') return false;
  return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(
    navigator.userAgent
  );
}

/**
 * Initiate phone call
 * On mobile: opens native dialer
 * On desktop: opens "Call Using..." dialog
 */
export function initiateCall(phone: string | null | undefined): void {
  if (!phone) return;
  
  const telLink = getTelLink(phone);
  
  if (isMobileDevice()) {
    // Mobile: open native dialer
    window.location.href = telLink;
  } else {
    // Desktop: open tel: link (browser will show "Call Using..." dialog)
    window.open(telLink, '_self');
  }
}



















































