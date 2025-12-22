/**
 * Block 12300 — Contact Import Validator v1
 * 
 * Comprehensive validation engine that protects:
 * - The user
 * - Their domain
 * - SmartSend infrastructure
 */

import { checkMX } from "@/lib/dnscheck";

// Error codes
export enum ValidationErrorCode {
  INVALID_EMAIL_SYNTAX = "INVALID_EMAIL_SYNTAX",
  MISSING_EMAIL = "MISSING_EMAIL",
  MULTIPLE_AT_SIGNS = "MULTIPLE_AT_SIGNS",
  INVALID_CHARACTERS = "INVALID_CHARACTERS",
  DISPOSABLE_DOMAIN = "DISPOSABLE_DOMAIN",
  NO_MX_RECORD = "NO_MX_RECORD",
  DUPLICATE_EMAIL = "DUPLICATE_EMAIL",
  DUPLICATE_NAME_ADDRESS = "DUPLICATE_NAME_ADDRESS",
  MISSING_REQUIRED_FIELD = "MISSING_REQUIRED_FIELD",
  ROLE_EMAIL = "ROLE_EMAIL",
  SPAMTRAP_PATTERN = "SPAMTRAP_PATTERN",
}

// Warning codes
export enum ValidationWarningCode {
  MISSING_FIRST_NAME = "MISSING_FIRST_NAME",
  MISSING_LAST_NAME = "MISSING_LAST_NAME",
  LOWERCASE_EMAIL = "LOWERCASE_EMAIL",
  WHITESPACE_IN_EMAIL = "WHITESPACE_IN_EMAIL",
  UNCAPITALIZED_NAME = "UNCAPITALIZED_NAME",
  EMOJI_IN_NAME = "EMOJI_IN_NAME",
}

// Disposable email domains (common ones)
const DISPOSABLE_DOMAINS = new Set([
  "mailinator.com",
  "temp-mail.org",
  "10minutemail.com",
  "yopmail.com",
  "guerrillamail.com",
  "throwaway.email",
  "tempmail.com",
  "getnada.com",
  "mohmal.com",
  "fakeinbox.com",
  "trashmail.com",
  "mintemail.com",
  "meltmail.com",
  "spamgourmet.com",
]);

// Role email prefixes
const ROLE_EMAIL_PREFIXES = new Set([
  "info",
  "admin",
  "administrator",
  "support",
  "help",
  "sales",
  "marketing",
  "noreply",
  "no-reply",
  "postmaster",
  "abuse",
  "webmaster",
  "contact",
  "hello",
]);

// Spamtrap patterns (common patterns that indicate spamtraps)
const SPAMTRAP_PATTERNS = [
  /^test\d+@/i,
  /^spam\d+@/i,
  /^abuse\d+@/i,
  /^postmaster\d+@/i,
  /^noreply\d+@/i,
  /^donotreply\d+@/i,
  /^invalid\d+@/i,
  /^bounce\d+@/i,
];

export interface ContactCSVRow {
  email?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  phone?: string;
  title?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  country?: string;
  [key: string]: any; // Allow other fields
}

export interface ValidatedContact {
  original: ContactCSVRow;
  cleaned: ContactCSVRow;
  valid: boolean;
  errors: ValidationErrorCode[];
  warnings: ValidationWarningCode[];
  suggested_fix?: string;
  duplicate_of?: string; // contact_id if duplicate
  row_number: number;
}

export interface ValidationResult {
  results: ValidatedContact[];
  summary: {
    total_rows: number;
    valid: number;
    invalid: number;
    warnings: number;
    duplicates: number;
    errors_by_code: Record<string, number>;
    warnings_by_code: Record<string, number>;
  };
}

/**
 * Extract domain from email
 */
function extractDomain(email: string): string | null {
  const parts = email.split("@");
  if (parts.length !== 2) return null;
  return parts[1].toLowerCase().trim();
}

/**
 * Validate email syntax
 */
function validateEmailSyntax(email: string): { valid: boolean; error?: ValidationErrorCode } {
  if (!email || typeof email !== "string") {
    return { valid: false, error: ValidationErrorCode.MISSING_EMAIL };
  }

  const trimmed = email.trim();
  
  // Check for multiple @ signs
  const atCount = (trimmed.match(/@/g) || []).length;
  if (atCount !== 1) {
    return { valid: false, error: ValidationErrorCode.MULTIPLE_AT_SIGNS };
  }

  // Check for spaces
  if (trimmed.includes(" ")) {
    return { valid: false, error: ValidationErrorCode.INVALID_CHARACTERS };
  }

  // RFC 5322 compliant regex (simplified)
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: ValidationErrorCode.INVALID_EMAIL_SYNTAX };
  }

  return { valid: true };
}

/**
 * Check if domain is disposable
 */
function isDisposableDomain(domain: string): boolean {
  return DISPOSABLE_DOMAINS.has(domain.toLowerCase());
}

/**
 * Check if email is a role email
 */
function isRoleEmail(email: string): boolean {
  const localPart = email.split("@")[0].toLowerCase();
  return ROLE_EMAIL_PREFIXES.has(localPart);
}

/**
 * Check if email matches spamtrap patterns
 */
function isSpamtrapPattern(email: string): boolean {
  return SPAMTRAP_PATTERNS.some(pattern => pattern.test(email));
}

/**
 * Clean and format contact data
 */
function cleanContactData(row: ContactCSVRow): ContactCSVRow {
  const cleaned: ContactCSVRow = { ...row };

  // Clean email
  if (cleaned.email) {
    cleaned.email = cleaned.email.trim().toLowerCase();
  }

  // Clean and capitalize names
  if (cleaned.first_name) {
    cleaned.first_name = cleaned.first_name.trim();
    // Capitalize first letter of each word
    cleaned.first_name = cleaned.first_name
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
    // Remove emojis and special characters (keep letters, spaces, hyphens, apostrophes)
    cleaned.first_name = cleaned.first_name.replace(/[^\p{L}\s'-]/gu, "");
  }

  if (cleaned.last_name) {
    cleaned.last_name = cleaned.last_name.trim();
    cleaned.last_name = cleaned.last_name
      .split(" ")
      .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
      .join(" ");
    cleaned.last_name = cleaned.last_name.replace(/[^\p{L}\s'-]/gu, "");
  }

  // Clean company
  if (cleaned.company) {
    cleaned.company = cleaned.company.trim();
  }

  // Clean phone (remove non-digit characters except +)
  if (cleaned.phone) {
    cleaned.phone = cleaned.phone.trim();
  }

  // Clean address fields
  if (cleaned.address) cleaned.address = cleaned.address.trim();
  if (cleaned.city) cleaned.city = cleaned.city.trim();
  if (cleaned.state) cleaned.state = cleaned.state.trim();
  if (cleaned.zip) cleaned.zip = cleaned.zip.trim();
  if (cleaned.country) cleaned.country = cleaned.country.trim();

  return cleaned;
}

/**
 * Detect warnings for a contact
 */
function detectWarnings(original: ContactCSVRow, cleaned: ContactCSVRow): ValidationWarningCode[] {
  const warnings: ValidationWarningCode[] = [];

  // Check for missing recommended fields
  if (!cleaned.first_name) {
    warnings.push(ValidationWarningCode.MISSING_FIRST_NAME);
  }
  if (!cleaned.last_name) {
    warnings.push(ValidationWarningCode.MISSING_LAST_NAME);
  }

  // Check formatting issues
  if (original.email && original.email !== original.email.toLowerCase()) {
    warnings.push(ValidationWarningCode.LOWERCASE_EMAIL);
  }
  if (original.email && original.email.includes(" ")) {
    warnings.push(ValidationWarningCode.WHITESPACE_IN_EMAIL);
  }
  if (original.first_name && original.first_name !== cleaned.first_name && cleaned.first_name) {
    warnings.push(ValidationWarningCode.UNCAPITALIZED_NAME);
  }
  if (original.last_name && original.last_name !== cleaned.last_name && cleaned.last_name) {
    warnings.push(ValidationWarningCode.UNCAPITALIZED_NAME);
  }

  // Check for emojis in names
  if (original.first_name && /[\u{1F300}-\u{1F9FF}]/u.test(original.first_name)) {
    warnings.push(ValidationWarningCode.EMOJI_IN_NAME);
  }
  if (original.last_name && /[\u{1F300}-\u{1F9FF}]/u.test(original.last_name)) {
    warnings.push(ValidationWarningCode.EMOJI_IN_NAME);
  }

  return warnings;
}

/**
 * Validate a single contact row
 */
export async function validateContactRow(
  row: ContactCSVRow,
  rowNumber: number,
  existingEmails: Set<string>,
  existingContacts: Map<string, { id: string; first_name?: string; last_name?: string; phone?: string; address?: string }>,
  options: {
    checkMX?: boolean;
    skipMXCheck?: boolean;
  } = {}
): Promise<ValidatedContact> {
  const original = { ...row };
  const cleaned = cleanContactData(row);
  const errors: ValidationErrorCode[] = [];
  const warnings = detectWarnings(original, cleaned);

  // Required field check: email is mandatory
  if (!cleaned.email) {
    errors.push(ValidationErrorCode.MISSING_EMAIL);
    return {
      original,
      cleaned,
      valid: false,
      errors,
      warnings,
      row_number: rowNumber,
    };
  }

  // Email syntax validation
  const syntaxCheck = validateEmailSyntax(cleaned.email);
  if (!syntaxCheck.valid) {
    errors.push(syntaxCheck.error!);
    return {
      original,
      cleaned,
      valid: false,
      errors,
      warnings,
      row_number: rowNumber,
    };
  }

  // Extract domain
  const domain = extractDomain(cleaned.email);
  if (!domain) {
    errors.push(ValidationErrorCode.INVALID_EMAIL_SYNTAX);
    return {
      original,
      cleaned,
      valid: false,
      errors,
      warnings,
      row_number: rowNumber,
    };
  }

  // Check disposable domains
  if (isDisposableDomain(domain)) {
    errors.push(ValidationErrorCode.DISPOSABLE_DOMAIN);
  }

  // Check role emails
  if (isRoleEmail(cleaned.email)) {
    errors.push(ValidationErrorCode.ROLE_EMAIL);
  }

  // Check spamtrap patterns
  if (isSpamtrapPattern(cleaned.email)) {
    errors.push(ValidationErrorCode.SPAMTRAP_PATTERN);
  }

  // MX record check (async, can be slow)
  if (options.checkMX && !options.skipMXCheck) {
    try {
      const mxResult = await checkMX(domain);
      if (!mxResult.ok) {
        errors.push(ValidationErrorCode.NO_MX_RECORD);
      }
    } catch (error) {
      // If MX check fails, don't block but could add warning
      console.warn(`MX check failed for ${domain}:`, error);
    }
  }

  // Duplicate detection
  const emailLower = cleaned.email.toLowerCase();
  if (existingEmails.has(emailLower)) {
    errors.push(ValidationErrorCode.DUPLICATE_EMAIL);
    // Find the duplicate contact ID
    const existingContact = existingContacts.get(emailLower);
    if (existingContact) {
      return {
        original,
        cleaned,
        valid: false,
        errors,
        warnings,
        duplicate_of: existingContact.id,
        row_number: rowNumber,
      };
    }
  }

  // Check for duplicate by name + phone or name + address
  if (cleaned.first_name && cleaned.last_name) {
    const nameKey = `${cleaned.first_name.toLowerCase()}_${cleaned.last_name.toLowerCase()}`;
    
    // Check name + phone match
    if (cleaned.phone) {
      for (const [email, contact] of existingContacts.entries()) {
        if (
          contact.first_name?.toLowerCase() === cleaned.first_name.toLowerCase() &&
          contact.last_name?.toLowerCase() === cleaned.last_name.toLowerCase() &&
          contact.phone === cleaned.phone
        ) {
          errors.push(ValidationErrorCode.DUPLICATE_NAME_ADDRESS);
          return {
            original,
            cleaned,
            valid: false,
            errors,
            warnings,
            duplicate_of: contact.id,
            row_number: rowNumber,
          };
        }
      }
    }

    // Check name + address match
    if (cleaned.address) {
      for (const [email, contact] of existingContacts.entries()) {
        if (
          contact.first_name?.toLowerCase() === cleaned.first_name.toLowerCase() &&
          contact.last_name?.toLowerCase() === cleaned.last_name.toLowerCase() &&
          contact.address === cleaned.address
        ) {
          errors.push(ValidationErrorCode.DUPLICATE_NAME_ADDRESS);
          return {
            original,
            cleaned,
            valid: false,
            errors,
            warnings,
            duplicate_of: contact.id,
            row_number: rowNumber,
          };
        }
      }
    }
  }

  // Generate suggested fixes
  let suggested_fix: string | undefined;
  if (warnings.length > 0) {
    const fixes: string[] = [];
    if (warnings.includes(ValidationWarningCode.LOWERCASE_EMAIL)) {
      fixes.push("lowercase email");
    }
    if (warnings.includes(ValidationWarningCode.UNCAPITALIZED_NAME)) {
      fixes.push("capitalize name");
    }
    if (warnings.includes(ValidationWarningCode.WHITESPACE_IN_EMAIL)) {
      fixes.push("trim email");
    }
    if (fixes.length > 0) {
      suggested_fix = fixes.join(", ");
    }
  }

  return {
    original,
    cleaned,
    valid: errors.length === 0,
    errors,
    warnings,
    suggested_fix,
    row_number: rowNumber,
  };
}

/**
 * Validate multiple contact rows
 */
export async function validateContacts(
  rows: ContactCSVRow[],
  existingEmails: string[] = [],
  existingContacts: Array<{ id: string; email: string; first_name?: string; last_name?: string; phone?: string; address?: string }> = [],
  options: {
    checkMX?: boolean;
    skipMXCheck?: boolean;
    maxRows?: number;
  } = {}
): Promise<ValidationResult> {
  // Guardrail: Hard limit per upload
  const MAX_ROWS = options.maxRows || 25000;
  if (rows.length > MAX_ROWS) {
    throw new Error(`Upload exceeds maximum of ${MAX_ROWS} contacts. Please split your file.`);
  }

  // Build lookup maps for duplicates
  const existingEmailsSet = new Set(existingEmails.map(e => e.toLowerCase()));
  const existingContactsMap = new Map<string, { id: string; first_name?: string; last_name?: string; phone?: string; address?: string }>();
  
  for (const contact of existingContacts) {
    existingContactsMap.set(contact.email.toLowerCase(), {
      id: contact.id,
      first_name: contact.first_name,
      last_name: contact.last_name,
      phone: contact.phone,
      address: contact.address,
    });
  }

  // Track duplicates within the upload
  const seenInUpload = new Set<string>();

  // Validate all rows
  const results: ValidatedContact[] = [];
  const errorsByCode: Record<string, number> = {};
  const warningsByCode: Record<string, number> = {};

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2; // +2 for header row and 0-indexing

    // Check for duplicates within the upload
    if (row.email) {
      const emailLower = row.email.toLowerCase().trim();
      if (seenInUpload.has(emailLower)) {
        // Mark as duplicate
        results.push({
          original: row,
          cleaned: cleanContactData(row),
          valid: false,
          errors: [ValidationErrorCode.DUPLICATE_EMAIL],
          warnings: [],
          row_number: rowNumber,
        });
        errorsByCode[ValidationErrorCode.DUPLICATE_EMAIL] = (errorsByCode[ValidationErrorCode.DUPLICATE_EMAIL] || 0) + 1;
        continue;
      }
      seenInUpload.add(emailLower);
    }

    const validated = await validateContactRow(
      row,
      rowNumber,
      existingEmailsSet,
      existingContactsMap,
      options
    );

    results.push(validated);

    // Count errors and warnings
    for (const error of validated.errors) {
      errorsByCode[error] = (errorsByCode[error] || 0) + 1;
    }
    for (const warning of validated.warnings) {
      warningsByCode[warning] = (warningsByCode[warning] || 0) + 1;
    }
  }

  // Calculate summary
  const valid = results.filter(r => r.valid).length;
  const invalid = results.filter(r => !r.valid).length;
  const warnings = results.filter(r => r.warnings.length > 0).length;
  const duplicates = results.filter(r => r.errors.includes(ValidationErrorCode.DUPLICATE_EMAIL)).length;

  // Guardrail: Bounce risk prediction
  const bounceRiskThreshold = 0.20; // 20%
  const invalidRate = invalid / results.length;
  if (invalidRate > bounceRiskThreshold) {
    throw new Error(
      `This list appears low quality (${Math.round(invalidRate * 100)}% invalid) and could harm deliverability. ` +
      `Please clean it before importing.`
    );
  }

  return {
    results,
    summary: {
      total_rows: results.length,
      valid,
      invalid,
      warnings,
      duplicates,
      errors_by_code: errorsByCode,
      warnings_by_code: warningsByCode,
    },
  };
}

/**
 * Get human-readable error message
 */
export function getErrorMessage(code: ValidationErrorCode): string {
  const messages: Record<ValidationErrorCode, string> = {
    [ValidationErrorCode.INVALID_EMAIL_SYNTAX]: "Invalid email format",
    [ValidationErrorCode.MISSING_EMAIL]: "Missing email address",
    [ValidationErrorCode.MULTIPLE_AT_SIGNS]: "Email contains multiple @ signs",
    [ValidationErrorCode.INVALID_CHARACTERS]: "Email contains invalid characters",
    [ValidationErrorCode.DISPOSABLE_DOMAIN]: "Disposable email domain not allowed",
    [ValidationErrorCode.NO_MX_RECORD]: "Domain has no MX records",
    [ValidationErrorCode.DUPLICATE_EMAIL]: "Duplicate email address",
    [ValidationErrorCode.DUPLICATE_NAME_ADDRESS]: "Potential duplicate (name + phone/address match)",
    [ValidationErrorCode.MISSING_REQUIRED_FIELD]: "Missing required field",
    [ValidationErrorCode.ROLE_EMAIL]: "Role email address (info@, admin@, etc.)",
    [ValidationErrorCode.SPAMTRAP_PATTERN]: "Matches spamtrap pattern",
  };
  return messages[code] || "Unknown error";
}

/**
 * Get human-readable warning message
 */
export function getWarningMessage(code: ValidationWarningCode): string {
  const messages: Record<ValidationWarningCode, string> = {
    [ValidationWarningCode.MISSING_FIRST_NAME]: "Missing first name (recommended)",
    [ValidationWarningCode.MISSING_LAST_NAME]: "Missing last name (recommended)",
    [ValidationWarningCode.LOWERCASE_EMAIL]: "Email should be lowercase",
    [ValidationWarningCode.WHITESPACE_IN_EMAIL]: "Email contains whitespace",
    [ValidationWarningCode.UNCAPITALIZED_NAME]: "Name should be capitalized",
    [ValidationWarningCode.EMOJI_IN_NAME]: "Name contains emoji or special characters",
  };
  return messages[code] || "Unknown warning";
}




























































