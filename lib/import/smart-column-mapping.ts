// Block 15400 — Smart Column Auto-Mapping
// Uses heuristics + AI to guess column mappings from CSV headers and sample data

export type FieldType =
  | 'email'
  | 'first_name'
  | 'last_name'
  | 'full_name'
  | 'phone'
  | 'city'
  | 'state'
  | 'zip'
  | 'address'
  | 'company'
  | 'notes'
  | 'tags'
  | 'past_quote_amount'
  | 'unknown';

export interface ColumnMapping {
  csvColumn: string;
  fieldType: FieldType;
  confidence: number; // 0-1
}

export interface SmartMappingResult {
  mappings: Record<string, FieldType>; // csvColumn -> fieldType
  confidence: number; // overall confidence 0-1
  suggestions: Array<{ csvColumn: string; suggestedType: FieldType; reason: string }>;
}

// Field type patterns (heuristics)
const FIELD_PATTERNS: Record<FieldType, RegExp[]> = {
  email: [
    /^email/i,
    /e-?mail/i,
    /email\s*address/i,
    /primary\s*email/i,
    /homeowner\s*email/i,
    /contact\s*email/i,
  ],
  first_name: [
    /^first/i,
    /fname/i,
    /given\s*name/i,
    /first\s*name/i,
  ],
  last_name: [
    /^last/i,
    /lname/i,
    /surname/i,
    /family\s*name/i,
    /last\s*name/i,
  ],
  full_name: [
    /^name$/i,
    /full\s*name/i,
    /homeowner/i,
    /customer\s*name/i,
    /contact\s*name/i,
    /first\s*&\s*last/i,
  ],
  phone: [
    /^phone/i,
    /cell/i,
    /mobile/i,
    /contact\s*phone/i,
    /phone\s*number/i,
  ],
  city: [
    /^city$/i,
    /town/i,
    /locality/i,
  ],
  state: [
    /^state$/i,
    /province/i,
  ],
  zip: [
    /^zip/i,
    /zipcode/i,
    /postal/i,
    /postal\s*code/i,
    /zip\s*code/i,
  ],
  address: [
    /^address/i,
    /street/i,
    /street\s*address/i,
    /home\s*address/i,
  ],
  company: [
    /^company/i,
    /business/i,
    /organization/i,
  ],
  notes: [
    /^notes/i,
    /comments/i,
    /internal\s*notes/i,
    /description/i,
    /remarks/i,
  ],
  tags: [
    /^tags/i,
    /lists/i,
    /labels/i,
    /categories/i,
  ],
  past_quote_amount: [
    /quote/i,
    /est_amount/i,
    /previous\s*estimate/i,
    /estimate/i,
    /quote\s*amount/i,
    /past\s*quote/i,
  ],
  unknown: [],
};

// Email validation regex
const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

// Phone validation patterns
const PHONE_REGEX = /^[\d\s\-\(\)\+\.]+$/;

// ZIP code patterns (US)
const ZIP_REGEX = /^\d{5}(-\d{4})?$/;

/**
 * Analyze a CSV column header and sample data to determine field type
 */
export function analyzeColumn(
  header: string,
  samples: string[],
  allHeaders: string[]
): { fieldType: FieldType; confidence: number; reason: string } {
  const normalizedHeader = header.trim().toLowerCase();
  let bestMatch: FieldType = 'unknown';
  let bestConfidence = 0;
  let reason = '';

  // Check header patterns
  for (const [fieldType, patterns] of Object.entries(FIELD_PATTERNS)) {
    if (fieldType === 'unknown') continue;

    for (const pattern of patterns) {
      if (pattern.test(normalizedHeader)) {
        const confidence = 0.7; // Base confidence from header match
        if (confidence > bestConfidence) {
          bestMatch = fieldType as FieldType;
          bestConfidence = confidence;
          reason = `Header matches pattern: ${pattern}`;
        }
      }
    }
  }

  // Analyze sample data for additional confidence
  if (samples.length > 0) {
    const nonEmptySamples = samples.filter((s) => s && s.trim().length > 0).slice(0, 10);

    // Email detection
    if (bestMatch === 'email' || bestMatch === 'unknown') {
      const emailMatches = nonEmptySamples.filter((s) => EMAIL_REGEX.test(s.trim().toLowerCase()));
      const emailRatio = emailMatches.length / Math.max(nonEmptySamples.length, 1);
      if (emailRatio > 0.8) {
        bestMatch = 'email';
        bestConfidence = Math.max(bestConfidence, 0.95);
        reason = `${Math.round(emailRatio * 100)}% of samples are valid emails`;
      }
    }

    // Phone detection
    if (bestMatch === 'phone' || bestMatch === 'unknown') {
      const phoneMatches = nonEmptySamples.filter((s) => {
        const cleaned = s.replace(/[\s\-\(\)\+\.]/g, '');
        return PHONE_REGEX.test(s) && cleaned.length >= 10 && cleaned.length <= 15;
      });
      const phoneRatio = phoneMatches.length / Math.max(nonEmptySamples.length, 1);
      if (phoneRatio > 0.7 && normalizedHeader.match(/phone|cell|mobile/i)) {
        bestMatch = 'phone';
        bestConfidence = Math.max(bestConfidence, 0.85);
        reason = `${Math.round(phoneRatio * 100)}% of samples look like phone numbers`;
      }
    }

    // ZIP detection
    if (bestMatch === 'zip' || bestMatch === 'unknown') {
      const zipMatches = nonEmptySamples.filter((s) => ZIP_REGEX.test(s.trim()));
      const zipRatio = zipMatches.length / Math.max(nonEmptySamples.length, 1);
      if (zipRatio > 0.7 && normalizedHeader.match(/zip|postal/i)) {
        bestMatch = 'zip';
        bestConfidence = Math.max(bestConfidence, 0.9);
        reason = `${Math.round(zipRatio * 100)}% of samples are valid ZIP codes`;
      }
    }

    // Name detection (if contains spaces and looks like a name)
    if (bestMatch === 'full_name' || bestMatch === 'unknown') {
      const nameMatches = nonEmptySamples.filter((s) => {
        const trimmed = s.trim();
        return trimmed.split(/\s+/).length >= 2 && trimmed.length < 50 && !EMAIL_REGEX.test(trimmed);
      });
      const nameRatio = nameMatches.length / Math.max(nonEmptySamples.length, 1);
      if (nameRatio > 0.6 && normalizedHeader.match(/name|homeowner|customer/i)) {
        bestMatch = 'full_name';
        bestConfidence = Math.max(bestConfidence, 0.75);
        reason = `${Math.round(nameRatio * 100)}% of samples look like full names`;
      }
    }

    // Past quote amount detection (numeric with $ or currency)
    if (bestMatch === 'past_quote_amount' || bestMatch === 'unknown') {
      const amountMatches = nonEmptySamples.filter((s) => {
        const cleaned = s.replace(/[\$,\s]/g, '');
        return !isNaN(parseFloat(cleaned)) && parseFloat(cleaned) > 0;
      });
      const amountRatio = amountMatches.length / Math.max(nonEmptySamples.length, 1);
      if (amountRatio > 0.5 && normalizedHeader.match(/quote|estimate|amount/i)) {
        bestMatch = 'past_quote_amount';
        bestConfidence = Math.max(bestConfidence, 0.8);
        reason = `${Math.round(amountRatio * 100)}% of samples are numeric amounts`;
      }
    }
  }

  return {
    fieldType: bestMatch,
    confidence: bestConfidence,
    reason: reason || `Header: ${header}`,
  };
}

/**
 * Generate smart column mappings for a CSV file
 */
export function generateSmartMappings(
  headers: string[],
  sampleRows: Record<string, any>[],
  maxSamples: number = 100
): SmartMappingResult {
  const mappings: Record<string, FieldType> = {};
  const suggestions: Array<{ csvColumn: string; suggestedType: FieldType; reason: string }> = [];
  let totalConfidence = 0;
  let mappedCount = 0;

  // Extract samples for each column
  const columnSamples: Record<string, string[]> = {};
  headers.forEach((header) => {
    columnSamples[header] = sampleRows
      .slice(0, maxSamples)
      .map((row) => String(row[header] || ''))
      .filter((val) => val.trim().length > 0);
  });

  // Analyze each column
  headers.forEach((header) => {
    const samples = columnSamples[header] || [];
    const analysis = analyzeColumn(header, samples, headers);

    if (analysis.confidence > 0.5) {
      mappings[header] = analysis.fieldType;
      totalConfidence += analysis.confidence;
      mappedCount++;
    }

    suggestions.push({
      csvColumn: header,
      suggestedType: analysis.fieldType,
      reason: analysis.reason,
    });
  });

  const overallConfidence = mappedCount > 0 ? totalConfidence / mappedCount : 0;

  return {
    mappings,
    confidence: overallConfidence,
    suggestions,
  };
}

/**
 * Apply preset mappings based on source type
 */
export function applyPresetMapping(
  sourceType: 'google_sheets' | 'jobnimbus' | 'yard_sign' | 'website_form' | 'storm_vendor' | 'custom',
  headers: string[]
): Record<string, FieldType> {
  const presets: Record<string, Record<string, FieldType>> = {
    google_sheets: {
      // Common Google Sheets export patterns
    },
    jobnimbus: {
      // JobNimbus CRM export patterns
      'Email': 'email',
      'First Name': 'first_name',
      'Last Name': 'last_name',
      'Phone': 'phone',
      'City': 'city',
      'State': 'state',
      'Zip': 'zip',
      'Address': 'address',
      'Notes': 'notes',
    },
    yard_sign: {
      // Yard sign / canvassing sheet patterns
      'Name': 'full_name',
      'Email': 'email',
      'Phone': 'phone',
      'Address': 'address',
      'City': 'city',
      'Zip': 'zip',
    },
    website_form: {
      // Website form export patterns
      'email': 'email',
      'name': 'full_name',
      'phone': 'phone',
      'message': 'notes',
    },
    storm_vendor: {
      // Storm lead vendor patterns
      'Email': 'email',
      'Name': 'full_name',
      'Address': 'address',
      'City': 'city',
      'State': 'state',
      'Zip': 'zip',
    },
  };

  const preset = presets[sourceType] || {};
  const mapping: Record<string, FieldType> = {};

  headers.forEach((header) => {
    // Try exact match first
    if (preset[header]) {
      mapping[header] = preset[header];
      return;
    }

    // Try case-insensitive match
    const normalizedHeader = header.toLowerCase().trim();
    for (const [presetHeader, fieldType] of Object.entries(preset)) {
      if (presetHeader.toLowerCase() === normalizedHeader) {
        mapping[header] = fieldType;
        return;
      }
    }
  });

  return mapping;
}

/**
 * Get default tags for a source type
 */
export function getDefaultTagsForSource(
  sourceType: 'google_sheets' | 'jobnimbus' | 'yard_sign' | 'website_form' | 'storm_vendor' | 'custom'
): string[] {
  const tagMap: Record<string, string[]> = {
    google_sheets: [],
    jobnimbus: ['crm_import'],
    yard_sign: ['yard_sign', 'canvassing'],
    website_form: ['website_lead'],
    storm_vendor: ['storm_vendor', 'vendor_lead'],
    custom: [],
  };

  return tagMap[sourceType] || [];
}

/**
 * Get recommended send caps for a source type
 */
export function getSendCapsForSource(
  sourceType: 'google_sheets' | 'jobnimbus' | 'yard_sign' | 'website_form' | 'storm_vendor' | 'custom'
): { daily?: number; weekly?: number } {
  const capsMap: Record<string, { daily?: number; weekly?: number }> = {
    google_sheets: {}, // No special caps
    jobnimbus: {}, // No special caps
    yard_sign: {}, // No special caps
    website_form: {}, // No special caps
    storm_vendor: { daily: 50, weekly: 200 }, // Lower caps for vendor lists
    custom: {},
  };

  return capsMap[sourceType] || {};
}





















































