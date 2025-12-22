/**
 * Email Validation Service for Contact Import v2
 * Validates emails for disposable domains, malformed addresses, dead domains, spam domains
 */

// Common disposable email domains
const DISPOSABLE_EMAIL_DOMAINS = new Set([
  '10minutemail.com',
  'tempmail.com',
  'guerrillamail.com',
  'mailinator.com',
  'throwaway.email',
  'temp-mail.org',
  'getnada.com',
  'mohmal.com',
  'fakeinbox.com',
  'trashmail.com',
  'mintemail.com',
  'yopmail.com',
  'sharklasers.com',
  'getairmail.com',
  'maildrop.cc',
  'tempr.email',
  'emailondeck.com',
  'mytrashmail.com',
  'throwawaymail.com',
  'tempinbox.com',
  'mailcatch.com',
  'spamgourmet.com',
  'spamhole.com',
  'spamex.com',
  'spamfree24.org',
  'spamobox.com',
  'spamtraps.com',
  'spamday.com',
  'meltmail.com',
  'melt.li',
  'dispostable.com',
  'mailmoat.com',
  'emailias.com',
  'spamgourmet.com',
  'spamhole.com',
  'spamex.com',
  'spamfree24.org',
  'spamobox.com',
  'spamtraps.com',
  'spamday.com',
]);

// Common spam domains (known for abuse)
const SPAM_DOMAINS = new Set([
  'example.com',
  'test.com',
  'test123.com',
  'invalid.com',
  'noreply.com',
  'no-reply.com',
  'donotreply.com',
  'do-not-reply.com',
]);

export interface EmailValidationResult {
  isValid: boolean;
  isDisposable: boolean;
  isMalformed: boolean;
  isSpamDomain: boolean;
  isDeadDomain: boolean; // Requires DNS check - set to false by default
  reason?: string;
}

/**
 * Validates email format
 */
export function validateEmailFormat(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const trimmed = email.trim().toLowerCase();
  
  // Basic format check
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!emailRegex.test(trimmed)) {
    return false;
  }

  // Check for common issues
  if (trimmed.includes('..')) {
    return false; // Double dots
  }

  if (trimmed.startsWith('.') || trimmed.endsWith('.')) {
    return false; // Starts or ends with dot
  }

  if (trimmed.includes('@.') || trimmed.includes('.@')) {
    return false; // Dot adjacent to @
  }

  // Check length
  if (trimmed.length > 254) {
    return false; // RFC 5321 limit
  }

  const [localPart, domain] = trimmed.split('@');
  if (!localPart || !domain) {
    return false;
  }

  // Local part length check
  if (localPart.length > 64) {
    return false; // RFC 5321 limit
  }

  // Domain must have at least one dot
  if (!domain.includes('.')) {
    return false;
  }

  return true;
}

/**
 * Checks if email domain is disposable
 */
export function isDisposableEmail(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const domain = email.toLowerCase().split('@')[1];
  if (!domain) {
    return false;
  }

  // Check exact match
  if (DISPOSABLE_EMAIL_DOMAINS.has(domain)) {
    return true;
  }

  // Check for common disposable patterns
  const disposablePatterns = [
    /^temp.*mail/i,
    /^.*temp.*email/i,
    /^.*throwaway/i,
    /^.*spam/i,
    /^.*fake/i,
    /^.*trash/i,
    /^.*disposable/i,
  ];

  return disposablePatterns.some(pattern => pattern.test(domain));
}

/**
 * Checks if email domain is a known spam domain
 */
export function isSpamDomain(email: string): boolean {
  if (!email || typeof email !== 'string') {
    return false;
  }

  const domain = email.toLowerCase().split('@')[1];
  if (!domain) {
    return false;
  }

  return SPAM_DOMAINS.has(domain);
}

/**
 * Comprehensive email validation
 */
export function validateEmail(email: string): EmailValidationResult {
  const result: EmailValidationResult = {
    isValid: false,
    isDisposable: false,
    isMalformed: false,
    isSpamDomain: false,
    isDeadDomain: false,
  };

  if (!email || typeof email !== 'string') {
    result.reason = 'Email is required';
    return result;
  }

  const trimmed = email.trim();
  if (!trimmed) {
    result.reason = 'Email cannot be empty';
    return result;
  }

  // Check format
  if (!validateEmailFormat(trimmed)) {
    result.isMalformed = true;
    result.reason = 'Invalid email format';
    return result;
  }

  // Check disposable
  if (isDisposableEmail(trimmed)) {
    result.isDisposable = true;
    result.reason = 'Disposable email domain';
    result.isValid = false;
    return result;
  }

  // Check spam domain
  if (isSpamDomain(trimmed)) {
    result.isSpamDomain = true;
    result.reason = 'Known spam domain';
    result.isValid = false;
    return result;
  }

  // Email is valid
  result.isValid = true;
  return result;
}

/**
 * Batch validate emails
 */
export function validateEmails(emails: string[]): Map<string, EmailValidationResult> {
  const results = new Map<string, EmailValidationResult>();
  
  for (const email of emails) {
    if (email) {
      results.set(email.toLowerCase().trim(), validateEmail(email));
    }
  }
  
  return results;
}

/**
 * Check if email should be skipped (invalid, disposable, spam)
 */
export function shouldSkipEmail(email: string): boolean {
  const validation = validateEmail(email);
  return !validation.isValid || validation.isDisposable || validation.isSpamDomain;
}





















































