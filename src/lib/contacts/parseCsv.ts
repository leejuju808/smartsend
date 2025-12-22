import { ContactInput } from './schema';

export interface CsvRow {
  [key: string]: string;
}

export interface ParsedContact {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
  phone?: string;
  [key: string]: any; // Allow custom fields
}

export interface CsvParseResult {
  headers: string[];
  rows: ParsedContact[];
  errors: string[];
  totalRows: number;
  validRows: number;
}

export interface FieldMapping {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
  phone?: string;
  [key: string]: string | undefined;
}

/**
 * Parse CSV content with automatic field detection and mapping
 */
export function parseCsv(
  csvContent: string,
  fieldMapping?: FieldMapping
): CsvParseResult {
  const lines = csvContent.split('\n').filter(line => line.trim());
  if (lines.length === 0) {
    return {
      headers: [],
      rows: [],
      errors: ['Empty CSV file'],
      totalRows: 0,
      validRows: 0
    };
  }

  // Parse headers
  const headers = parseCsvLine(lines[0]);
  const result: CsvParseResult = {
    headers,
    rows: [],
    errors: [],
    totalRows: lines.length - 1,
    validRows: 0
  };

  // Auto-detect field mapping if not provided
  const mapping = fieldMapping || autoDetectFieldMapping(headers);

  // Parse data rows
  for (let i = 1; i < lines.length; i++) {
    try {
      const values = parseCsvLine(lines[i]);
      const row: CsvRow = {};
      
      // Map values to headers
      headers.forEach((header, index) => {
        row[header] = values[index] || '';
      });

      // Transform to ParsedContact
      const contact = transformRowToContact(row, mapping);
      if (contact) {
        result.rows.push(contact);
        result.validRows++;
      } else {
        result.errors.push(`Row ${i + 1}: Invalid contact data`);
      }
    } catch (error) {
      result.errors.push(`Row ${i + 1}: ${error instanceof Error ? error.message : 'Parse error'}`);
    }
  }

  return result;
}

/**
 * Parse a single CSV line, handling quoted fields and commas
 */
function parseCsvLine(line: string): string[] {
  const result: string[] = [];
  let current = '';
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];
    
    if (char === '"') {
      if (inQuotes && line[i + 1] === '"') {
        // Escaped quote
        current += '"';
        i += 2;
      } else {
        // Toggle quote state
        inQuotes = !inQuotes;
        i++;
      }
    } else if (char === ',' && !inQuotes) {
      // Field separator
      result.push(current.trim());
      current = '';
      i++;
    } else {
      current += char;
      i++;
    }
  }
  
  // Add the last field
  result.push(current.trim());
  
  return result;
}

/**
 * Auto-detect field mapping based on common header patterns
 */
function autoDetectFieldMapping(headers: string[]): FieldMapping {
  const mapping: FieldMapping = { email: '' };
  
  headers.forEach(header => {
    const lowerHeader = header.toLowerCase().trim();
    
    if (lowerHeader.includes('email') || lowerHeader === 'e-mail') {
      mapping.email = header;
    } else if (lowerHeader.includes('first') || lowerHeader === 'fname' || lowerHeader === 'firstname') {
      mapping.first_name = header;
    } else if (lowerHeader.includes('last') || lowerHeader === 'lname' || lowerHeader === 'lastname') {
      mapping.last_name = header;
    } else if (lowerHeader.includes('company') || lowerHeader === 'organization' || lowerHeader === 'org') {
      mapping.company = header;
    } else if (lowerHeader.includes('title') || lowerHeader === 'job') {
      mapping.title = header;
    } else if (lowerHeader.includes('phone') || lowerHeader === 'telephone') {
      mapping.phone = header;
    }
  });

  // Ensure we have an email field
  if (!mapping.email) {
    // Try to find any field that might contain emails
    const emailField = headers.find(header => 
      header.toLowerCase().includes('email') || 
      header.toLowerCase().includes('mail')
    );
    if (emailField) {
      mapping.email = emailField;
    } else if (headers.length > 0) {
      // Fallback to first field if no email field found
      mapping.email = headers[0];
    }
  }

  return mapping;
}

/**
 * Transform a CSV row to a ParsedContact object
 */
function transformRowToContact(row: CsvRow, mapping: FieldMapping): ParsedContact | null {
  const email = row[mapping.email];
  if (!email || !isValidEmail(email)) {
    return null;
  }

  const contact: ParsedContact = {
    email: email.trim().toLowerCase(),
  };

  if (mapping.first_name && row[mapping.first_name]) {
    contact.first_name = row[mapping.first_name].trim();
  }

  if (mapping.last_name && row[mapping.last_name]) {
    contact.last_name = row[mapping.last_name].trim();
  }

  if (mapping.company && row[mapping.company]) {
    contact.company = row[mapping.company].trim();
  }

  if (mapping.title && row[mapping.title]) {
    contact.title = row[mapping.title].trim();
  }

  if (mapping.phone && row[mapping.phone]) {
    contact.phone = row[mapping.phone].trim();
  }

  // Add any additional fields that aren't in the standard mapping
  Object.keys(row).forEach(key => {
    if (!Object.values(mapping).includes(key) && row[key]) {
      contact[key] = row[key].trim();
    }
  });

  return contact;
}

/**
 * Basic email validation
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email.trim());
}

/**
 * Convert ParsedContact to ContactInput for database insertion
 */
export function parsedContactToContactInput(contact: ParsedContact): ContactInput {
  return {
    email: contact.email,
    name: contact.first_name && contact.last_name 
      ? `${contact.first_name} ${contact.last_name}`.trim()
      : contact.first_name || contact.last_name || null,
    company: contact.company || null,
    tags: [],
  };
} 