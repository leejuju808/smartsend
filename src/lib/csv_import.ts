import { parse } from 'csv-parse/sync';

export interface ContactInput {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  name?: string;
  phone?: string;
  title?: string;
  website?: string;
  industry?: string;
  tags?: string | string[];
}

export interface ImportResult {
  total_in_file: number;
  valid_emails: number;
  invalid_emails: number;
  unique_after_dedup: number;
  existing_skipped: number;
  suppressed_skipped: number;
  inserted: number;
  duplicates_in_file: number;
  validation_errors: string[];
  column_mapping: Record<string, string>;
}

export interface ContactToInsert {
  user_id: string;
  email: string;
  name?: string;
  company?: string;
  custom?: Record<string, any>;
  tags: string[];
  created_at: string;
}

/**
 * Normalize email address (trim, lowercase)
 */
export function normalizeEmail(email: string | undefined): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

/**
 * Validate email format
 */
export function validateEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Detect column mapping from CSV headers
 */
export function detectColumnMapping(headers: string[]): Record<string, string> {
  const mapping: Record<string, string> = {};
  
  headers.forEach(header => {
    const lowerHeader = header.toLowerCase().trim();
    
    // Map common variations
    if (lowerHeader.includes('email') || lowerHeader === 'e-mail') {
      mapping[header] = 'email';
    } else if (lowerHeader.includes('first') || lowerHeader.includes('given')) {
      mapping[header] = 'first_name';
    } else if (lowerHeader.includes('last') || lowerHeader.includes('family') || lowerHeader.includes('surname')) {
      mapping[header] = 'last_name';
    } else if (lowerHeader.includes('name') && !lowerHeader.includes('first') && !lowerHeader.includes('last')) {
      mapping[header] = 'name';
    } else if (lowerHeader.includes('company') || lowerHeader.includes('organization') || lowerHeader.includes('org')) {
      mapping[header] = 'company';
    } else if (lowerHeader.includes('phone') || lowerHeader.includes('mobile') || lowerHeader.includes('cell')) {
      mapping[header] = 'phone';
    } else if (lowerHeader.includes('title') || lowerHeader.includes('job') || lowerHeader.includes('position')) {
      mapping[header] = 'title';
    } else if (lowerHeader.includes('website') || lowerHeader.includes('url') || lowerHeader.includes('site')) {
      mapping[header] = 'website';
    } else if (lowerHeader.includes('industry') || lowerHeader.includes('sector')) {
      mapping[header] = 'industry';
    } else if (lowerHeader.includes('tag') || lowerHeader.includes('label') || lowerHeader.includes('category')) {
      mapping[header] = 'tags';
    }
  });
  
  return mapping;
}

/**
 * Parse CSV content and extract contacts
 */
export function parseCSV(csvText: string): Record<string, any>[] {
  try {
    return parse(csvText, {
      columns: true,
      skip_empty_lines: true,
      trim: true
    });
  } catch (error) {
    throw new Error('Invalid CSV format');
  }
}

/**
 * Validate and normalize contacts from CSV rows
 */
export function validateContacts(
  rows: Record<string, any>[],
  columnMapping: Record<string, string>
): {
  validContacts: ContactInput[];
  invalidEmails: string[];
  duplicatesInFile: Set<string>;
  validationErrors: string[];
} {
  const validContacts: ContactInput[] = [];
  const invalidEmails: string[] = [];
  const emailMap = new Map<string, ContactInput>();
  const duplicatesInFile = new Set<string>();
  const validationErrors: string[] = [];

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNum = i + 2; // +2 because of 0-indexing and header row
    
    // Find email value using column mapping
    const emailKey = Object.keys(columnMapping).find(key => columnMapping[key] === 'email');
    if (!emailKey) {
      validationErrors.push(`Row ${rowNum}: No email column found`);
      continue;
    }
    
    const email = normalizeEmail(row[emailKey]);
    if (!email) {
      validationErrors.push(`Row ${rowNum}: Missing email address`);
      continue;
    }
    
    if (!validateEmail(email)) {
      invalidEmails.push(email);
      validationErrors.push(`Row ${rowNum}: Invalid email format: ${email}`);
      continue;
    }

    // Check for duplicates within file
    if (emailMap.has(email)) {
      duplicatesInFile.add(email);
      continue;
    }

    // Build contact object
    const contact: ContactInput = { email };
    
    // Map other fields
    Object.keys(columnMapping).forEach(header => {
      const fieldType = columnMapping[header];
      if (fieldType === 'email') return; // Already handled
      if (fieldType === 'first_name' || fieldType === 'last_name') {
        contact[fieldType] = row[header]?.trim() || undefined;
      } else if (fieldType === 'name' && !contact.first_name && !contact.last_name) {
        // If we have a name field but no first/last, use it as first_name
        contact.first_name = row[header]?.trim() || undefined;
      } else if (fieldType === 'company') {
        contact.company = row[header]?.trim() || undefined;
      } else if (fieldType === 'phone') {
        contact.phone = row[header]?.trim() || undefined;
      } else if (fieldType === 'title') {
        contact.title = row[header]?.trim() || undefined;
      } else if (fieldType === 'website') {
        contact.website = row[header]?.trim() || undefined;
      } else if (fieldType === 'industry') {
        contact.industry = row[header]?.trim() || undefined;
      } else if (fieldType === 'tags') {
        contact.tags = row[header]?.trim() || undefined;
      }
    });

    // Clean up undefined values
    Object.keys(contact).forEach(key => {
      if (contact[key as keyof ContactInput] === undefined) {
        delete contact[key as keyof ContactInput];
      }
    });

    emailMap.set(email, contact);
    validContacts.push(contact);
  }

  return {
    validContacts,
    invalidEmails,
    duplicatesInFile,
    validationErrors
  };
}

/**
 * Prepare contacts for database insertion
 */
export function prepareContactsForInsertion(
  contacts: ContactInput[],
  userId: string,
  addTag?: string
): ContactToInsert[] {
  return contacts.map(contact => {
    const tags: string[] = [];
    if (addTag) tags.push(addTag);
    if (contact.tags) {
      // Handle both string and array tags
      if (typeof contact.tags === 'string') {
        // Split tags by comma, semicolon, or pipe
        const tagList = contact.tags.split(/[,;|]/).map((t: string) => t.trim()).filter((t: string) => t);
        tags.push(...tagList);
      } else if (Array.isArray(contact.tags)) {
        tags.push(...contact.tags.filter((t: any) => t && typeof t === 'string'));
      }
    }
    
    return {
      user_id: userId,
      email: contact.email,
      name: contact.first_name && contact.last_name 
        ? `${contact.first_name} ${contact.last_name}`.trim()
        : contact.first_name || contact.last_name || undefined,
      company: contact.company,
      custom: {
        ...(contact.phone && { phone: contact.phone }),
        ...(contact.title && { title: contact.title }),
        ...(contact.website && { website: contact.website }),
        ...(contact.industry && { industry: contact.industry }),
      },
      tags: tags.length > 0 ? tags : [],
      created_at: new Date().toISOString()
    };
  });
}

/**
 * Process CSV import with full validation and deduplication
 */
export async function processCSVImport(
  csvText: string,
  userId: string,
  addTag?: string,
  existingEmails: string[] = [],
  suppressedEmails: string[] = []
): Promise<{ result: ImportResult; contactsToInsert: ContactToInsert[] }> {
  // Parse CSV
  const rows = parseCSV(csvText);
  if (!rows.length) {
    throw new Error('No rows found in CSV');
  }

  // Detect column mapping
  const headers = Object.keys(rows[0]);
  const columnMapping = detectColumnMapping(headers);
  
  // Validate required columns
  if (!columnMapping['email']) {
    throw new Error('No email column found. Please ensure your CSV has an "email" column or similar.');
  }

  // Validate and normalize contacts
  const { validContacts, invalidEmails, duplicatesInFile, validationErrors } = validateContacts(rows, columnMapping);

  // Check for existing contacts to avoid duplicates
  const existingSet = new Set(existingEmails.map(e => e.toLowerCase()));
  const newContacts = validContacts.filter(c => !existingSet.has(c.email.toLowerCase()));

  // Filter out suppressed emails
  const suppressedSet = new Set(suppressedEmails.map(e => e.toLowerCase()));
  const toInsert = newContacts.filter(c => !suppressedSet.has(c.email.toLowerCase()));

  // Prepare contacts for insertion
  const contactsToInsert = prepareContactsForInsertion(toInsert, userId, addTag);

  const result: ImportResult = {
    total_in_file: rows.length,
    valid_emails: validContacts.length,
    invalid_emails: invalidEmails.length,
    unique_after_dedup: validContacts.length,
    existing_skipped: validContacts.length - newContacts.length,
    suppressed_skipped: newContacts.length - toInsert.length,
    inserted: contactsToInsert.length,
    duplicates_in_file: duplicatesInFile.size,
    validation_errors: validationErrors,
    column_mapping: columnMapping
  };

  return {
    result,
    contactsToInsert
  };
} 