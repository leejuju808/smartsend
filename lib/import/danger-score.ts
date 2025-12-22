// Block 15400 — Danger Score Calculation
// Calculates import safety level based on data quality indicators

export type DangerLevel = 'safe' | 'caution' | 'risky';

export interface DangerScoreInput {
  missingEmailPct: number; // Percentage of rows missing email
  invalidEmailPct: number; // Percentage of rows with invalid email format
  duplicatePct: number; // Percentage of duplicate emails
  hasStormTags?: boolean; // Whether list has storm/vendor tags
  looksLikeBoughtList?: boolean; // Whether list looks like purchased data
  domainReputationFragile?: boolean; // Whether sender domain reputation is already fragile
}

export interface DangerScoreResult {
  level: DangerLevel;
  score: number; // 0-10, higher = more risky
  reasons: string[];
  recommendations: string[];
}

/**
 * Calculate danger score for an import
 */
export function calculateDangerScore(input: DangerScoreInput): DangerScoreResult {
  let score = 0;
  const reasons: string[] = [];
  const recommendations: string[] = [];

  // Missing emails (critical)
  if (input.missingEmailPct > 30) {
    score += 3;
    reasons.push(`${Math.round(input.missingEmailPct)}% of rows are missing emails`);
    recommendations.push('Remove rows without valid email addresses');
  } else if (input.missingEmailPct > 15) {
    score += 2;
    reasons.push(`${Math.round(input.missingEmailPct)}% of rows are missing emails`);
    recommendations.push('Consider removing rows without email addresses');
  } else if (input.missingEmailPct > 5) {
    score += 1;
    reasons.push(`${Math.round(input.missingEmailPct)}% of rows are missing emails`);
  }

  // Invalid emails (critical)
  if (input.invalidEmailPct > 20) {
    score += 3;
    reasons.push(`${Math.round(input.invalidEmailPct)}% of emails are invalid`);
    recommendations.push('Clean invalid email addresses before importing');
  } else if (input.invalidEmailPct > 10) {
    score += 2;
    reasons.push(`${Math.round(input.invalidEmailPct)}% of emails are invalid`);
    recommendations.push('Review and fix invalid email addresses');
  } else if (input.invalidEmailPct > 5) {
    score += 1;
    reasons.push(`${Math.round(input.invalidEmailPct)}% of emails are invalid`);
  }

  // Duplicates (moderate concern)
  if (input.duplicatePct > 15) {
    score += 2;
    reasons.push(`${Math.round(input.duplicatePct)}% of contacts are duplicates`);
    recommendations.push('Remove duplicate contacts to avoid sending multiple emails');
  } else if (input.duplicatePct > 5) {
    score += 1;
    reasons.push(`${Math.round(input.duplicatePct)}% of contacts are duplicates`);
  }

  // Storm/vendor tags (moderate concern - these lists can be risky)
  if (input.hasStormTags) {
    score += 1;
    reasons.push('List contains storm/vendor leads (higher risk of complaints)');
    recommendations.push('Use lower daily send caps for vendor lists');
    recommendations.push('Consider warming up these contacts gradually');
  }

  // Bought list indicators (high concern)
  if (input.looksLikeBoughtList) {
    score += 2;
    reasons.push('List appears to be purchased (high risk of spam complaints)');
    recommendations.push('Split into smaller sends');
    recommendations.push('Use very conservative daily caps (20-50/day)');
    recommendations.push('Consider double opt-in before sending');
  }

  // Domain reputation (critical if already fragile)
  if (input.domainReputationFragile) {
    score += 2;
    reasons.push('Your sending domain reputation is already fragile');
    recommendations.push('Use extra caution with this import');
    recommendations.push('Consider using a different sending domain');
    recommendations.push('Start with very small test sends');
  }

  // Determine level
  let level: DangerLevel;
  if (score >= 6) {
    level = 'risky';
  } else if (score >= 3) {
    level = 'caution';
  } else {
    level = 'safe';
  }

  // Add general recommendations based on level
  if (level === 'risky') {
    recommendations.push('We strongly recommend cleaning this list before importing');
    recommendations.push('Consider splitting into multiple smaller imports');
    recommendations.push('Use lower daily send caps');
  } else if (level === 'caution') {
    recommendations.push('Review the data quality issues above');
    recommendations.push('Consider cleaning invalid contacts');
  }

  return {
    level,
    score: Math.min(score, 10), // Cap at 10
    reasons,
    recommendations: [...new Set(recommendations)], // Remove duplicates
  };
}

/**
 * Analyze sample rows to detect if list looks like a bought list
 */
export function detectBoughtList(rows: Record<string, any>[], emailField: string): boolean {
  if (rows.length < 10) return false;

  const emails = rows
    .map((r) => String(r[emailField] || '').toLowerCase().trim())
    .filter((e) => e.length > 0);

  if (emails.length < 10) return false;

  // Check for common bought list patterns:
  
  // 1. High percentage of free email domains (gmail, yahoo, hotmail, etc.)
  const freeDomains = ['gmail.com', 'yahoo.com', 'hotmail.com', 'outlook.com', 'aol.com', 'icloud.com'];
  const freeEmailCount = emails.filter((e) => {
    const domain = e.split('@')[1];
    return domain && freeDomains.includes(domain.toLowerCase());
  }).length;
  const freeEmailPct = freeEmailCount / emails.length;
  
  // Bought lists often have >80% free emails
  if (freeEmailPct > 0.8) {
    return true;
  }

  // 2. Sequential or pattern-based emails (less common in real lists)
  // This is harder to detect, but we can check for unusual patterns
  // For now, we'll rely on other indicators

  // 3. Missing other data (names, addresses) - bought lists often have minimal data
  const hasNames = rows.some((r) => {
    const nameFields = ['name', 'first_name', 'last_name', 'full_name'];
    return nameFields.some((f) => r[f] && String(r[f]).trim().length > 0);
  });
  
  if (!hasNames && freeEmailPct > 0.7) {
    return true;
  }

  return false;
}

/**
 * Calculate statistics from sample rows
 */
export function calculateImportStats(
  rows: Record<string, any>[],
  columnMapping: Record<string, string>
): {
  missingEmailPct: number;
  invalidEmailPct: number;
  duplicatePct: number;
  totalRows: number;
} {
  const emailField = Object.keys(columnMapping).find((col) => columnMapping[col] === 'email');
  if (!emailField) {
    return {
      missingEmailPct: 100,
      invalidEmailPct: 0,
      duplicatePct: 0,
      totalRows: rows.length,
    };
  }

  const emails = rows.map((r) => String(r[emailField] || '').trim());
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

  let missingCount = 0;
  let invalidCount = 0;
  const seenEmails = new Set<string>();
  let duplicateCount = 0;

  emails.forEach((email) => {
    if (!email || email.length === 0) {
      missingCount++;
      return;
    }

    if (!emailRegex.test(email.toLowerCase())) {
      invalidCount++;
      return;
    }

    const normalized = email.toLowerCase();
    if (seenEmails.has(normalized)) {
      duplicateCount++;
    } else {
      seenEmails.add(normalized);
    }
  });

  const totalRows = rows.length;
  const missingEmailPct = totalRows > 0 ? (missingCount / totalRows) * 100 : 0;
  const invalidEmailPct = totalRows > 0 ? (invalidCount / totalRows) * 100 : 0;
  const duplicatePct = totalRows > 0 ? (duplicateCount / totalRows) * 100 : 0;

  return {
    missingEmailPct,
    invalidEmailPct,
    duplicatePct,
    totalRows,
  };
}





















































