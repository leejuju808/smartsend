// Block 15400 — One-Click Clean-Up
// Cleans CSV data before import: normalizes, trims, formats, removes garbage

export interface CleanupStats {
  rowsCleaned: number;
  emailsNormalized: number;
  duplicatesMerged: number;
  spacesTrimmed: number;
  zipsFormatted: number;
  namesNormalized: number;
  longFieldsTrimmed: number;
}

export interface CleanedRow {
  [key: string]: any;
}

/**
 * Clean a single row of CSV data
 */
export function cleanRow(
  row: Record<string, any>,
  columnMapping: Record<string, string>
): { cleaned: CleanedRow; stats: Partial<CleanupStats> } {
  const cleaned: CleanedRow = {};
  const stats: Partial<CleanupStats> = {
    emailsNormalized: 0,
    spacesTrimmed: 0,
    zipsFormatted: 0,
    namesNormalized: 0,
    longFieldsTrimmed: 0,
  };

  for (const [csvCol, value] of Object.entries(row)) {
    if (value === null || value === undefined) {
      cleaned[csvCol] = '';
      continue;
    }

    let cleanedValue = String(value);

    // Trim leading/trailing spaces
    const originalLength = cleanedValue.length;
    cleanedValue = cleanedValue.trim();
    if (cleanedValue.length !== originalLength) {
      stats.spacesTrimmed = (stats.spacesTrimmed || 0) + 1;
    }

    // Normalize email
    const fieldType = columnMapping[csvCol];
    if (fieldType === 'email' && cleanedValue) {
      const normalized = normalizeEmail(cleanedValue);
      if (normalized !== cleanedValue) {
        stats.emailsNormalized = (stats.emailsNormalized || 0) + 1;
      }
      cleanedValue = normalized;
    }

    // Normalize names (title case)
    if ((fieldType === 'first_name' || fieldType === 'last_name' || fieldType === 'full_name') && cleanedValue) {
      const normalized = normalizeName(cleanedValue);
      if (normalized !== cleanedValue) {
        stats.namesNormalized = (stats.namesNormalized || 0) + 1;
      }
      cleanedValue = normalized;
    }

    // Format ZIP codes
    if (fieldType === 'zip' && cleanedValue) {
      const formatted = formatZip(cleanedValue);
      if (formatted !== cleanedValue) {
        stats.zipsFormatted = (stats.zipsFormatted || 0) + 1;
      }
      cleanedValue = formatted;
    }

    // Trim long text fields
    const maxLength = getMaxLengthForField(fieldType);
    if (maxLength && cleanedValue.length > maxLength) {
      cleanedValue = cleanedValue.substring(0, maxLength).trim();
      stats.longFieldsTrimmed = (stats.longFieldsTrimmed || 0) + 1;
    }

    // Collapse duplicate spaces
    cleanedValue = cleanedValue.replace(/\s+/g, ' ');

    cleaned[csvCol] = cleanedValue;
  }

  return { cleaned, stats };
}

/**
 * Clean an array of rows
 */
export function cleanRows(
  rows: Record<string, any>[],
  columnMapping: Record<string, string>
): { cleanedRows: CleanedRow[]; stats: CleanupStats } {
  const cleanedRows: CleanedRow[] = [];
  const aggregatedStats: CleanupStats = {
    rowsCleaned: 0,
    emailsNormalized: 0,
    duplicatesMerged: 0,
    spacesTrimmed: 0,
    zipsFormatted: 0,
    namesNormalized: 0,
    longFieldsTrimmed: 0,
  };

  const seenEmails = new Set<string>();
  const emailField = Object.keys(columnMapping).find((col) => columnMapping[col] === 'email');

  for (const row of rows) {
    const { cleaned, stats } = cleanRow(row, columnMapping);
    aggregatedStats.rowsCleaned++;

    // Aggregate stats
    aggregatedStats.emailsNormalized += stats.emailsNormalized || 0;
    aggregatedStats.spacesTrimmed += stats.spacesTrimmed || 0;
    aggregatedStats.zipsFormatted += stats.zipsFormatted || 0;
    aggregatedStats.namesNormalized += stats.namesNormalized || 0;
    aggregatedStats.longFieldsTrimmed += stats.longFieldsTrimmed || 0;

    // Check for duplicates (by email if available)
    if (emailField && cleaned[emailField]) {
      const email = cleaned[emailField].toLowerCase().trim();
      if (seenEmails.has(email)) {
        aggregatedStats.duplicatesMerged++;
        continue; // Skip duplicate
      }
      seenEmails.add(email);
    }

    // Remove obvious garbage rows (empty or all empty values)
    const hasData = Object.values(cleaned).some((val) => val && String(val).trim().length > 0);
    if (!hasData) {
      continue; // Skip empty rows
    }

    cleanedRows.push(cleaned);
  }

  return { cleanedRows, stats: aggregatedStats };
}

/**
 * Normalize email address
 */
function normalizeEmail(email: string): string {
  return email.trim().toLowerCase();
}

/**
 * Normalize name (title case)
 */
function normalizeName(name: string): string {
  // Don't change if already looks normalized (has mixed case)
  if (name !== name.toUpperCase() && name !== name.toLowerCase()) {
    return name; // Already has some case variation
  }

  // Convert to title case
  return name
    .toLowerCase()
    .split(/\s+/)
    .map((word) => {
      if (word.length === 0) return word;
      // Handle special cases like "Mc", "O'", etc.
      if (word.startsWith("mc") && word.length > 2) {
        return 'Mc' + word.charAt(2).toUpperCase() + word.slice(3);
      }
      if (word.startsWith("o'") && word.length > 2) {
        return "O'" + word.charAt(2).toUpperCase() + word.slice(3);
      }
      return word.charAt(0).toUpperCase() + word.slice(1);
    })
    .join(' ');
}

/**
 * Format ZIP code (US format: 12345 or 12345-6789)
 */
function formatZip(zip: string): string {
  // Remove all non-digits
  const digits = zip.replace(/\D/g, '');
  
  if (digits.length === 5) {
    return digits;
  } else if (digits.length === 9) {
    return `${digits.slice(0, 5)}-${digits.slice(5)}`;
  } else if (digits.length > 5) {
    return `${digits.slice(0, 5)}-${digits.slice(5, 9)}`;
  }
  
  return digits; // Return as-is if can't format
}

/**
 * Get maximum length for a field type
 */
function getMaxLengthForField(fieldType?: string): number | null {
  const maxLengths: Record<string, number> = {
    email: 255,
    first_name: 100,
    last_name: 100,
    full_name: 200,
    phone: 20,
    city: 100,
    state: 50,
    zip: 10,
    address: 255,
    company: 200,
    notes: 5000, // Allow longer notes
    tags: 500,
  };

  return fieldType ? maxLengths[fieldType] || null : null;
}

/**
 * Detect if a row is garbage (should be removed)
 */
export function isGarbageRow(row: Record<string, any>): boolean {
  const values = Object.values(row);
  
  // All empty
  if (values.every((v) => !v || String(v).trim().length === 0)) {
    return true;
  }

  // Common garbage patterns
  const allValues = values.map((v) => String(v).toLowerCase()).join(' ');
  
  // Headers row (contains common header words)
  const headerWords = ['email', 'name', 'address', 'phone', 'city', 'state', 'zip'];
  if (headerWords.some((word) => allValues.includes(word))) {
    return false; // Might be a header, but let it through for now
  }

  // Test data patterns
  if (allValues.match(/test|example|sample|dummy|fake/i)) {
    return true;
  }

  return false;
}





















































