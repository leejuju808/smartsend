/**
 * Block 260: Bulk Importer v3 - Import Quality Scoring
 * Calculates quality scores and provides warnings for imports
 */

export interface QualityMetrics {
  totalRows: number;
  validEmailRows: number;
  missingEmailRows: number;
  invalidEmailRows: number;
  duplicateInFileRows: number;
  duplicateInDbRows: number;
  invalidDomainRows: number;
  rowsWithCompany: number;
}

export interface QualityScore {
  score: number;
  grade: "Clean" | "Needs Attention" | "Risky";
  metrics: QualityMetrics;
  warnings: string[];
}

/**
 * Calculate quality score for an import
 */
export function calculateQualityScore(metrics: QualityMetrics): QualityScore {
  const {
    totalRows,
    validEmailRows,
    missingEmailRows,
    invalidEmailRows,
    duplicateInFileRows,
    duplicateInDbRows,
    invalidDomainRows,
  } = metrics;

  if (totalRows === 0) {
    return {
      score: 0,
      grade: "Risky",
      metrics,
      warnings: ["No rows to import"],
    };
  }

  // Calculate percentages
  const missingEmailPct = (missingEmailRows / totalRows) * 100;
  const invalidEmailPct = (invalidEmailRows / totalRows) * 100;
  const duplicateInFilePct = (duplicateInFileRows / totalRows) * 100;
  const duplicateInDbPct = (duplicateInDbRows / totalRows) * 100;
  const invalidDomainPct = (invalidDomainRows / totalRows) * 100;

  // Calculate base score (100 = perfect)
  let score = 100;
  score -= missingEmailPct * 40; // Missing email is critical
  score -= invalidEmailPct * 30; // Invalid email format is critical
  score -= duplicateInFilePct * 15; // Duplicates in file are problematic
  score -= duplicateInDbPct * 15; // Duplicates in DB are less critical (will be skipped)
  score -= invalidDomainPct * 5; // Invalid domains are minor

  // Ensure score is between 0 and 100
  score = Math.max(0, Math.min(100, Math.round(score)));

  // Determine grade
  let grade: "Clean" | "Needs Attention" | "Risky";
  if (score >= 80) {
    grade = "Clean";
  } else if (score >= 50) {
    grade = "Needs Attention";
  } else {
    grade = "Risky";
  }

  // Generate warnings
  const warnings: string[] = [];
  if (missingEmailPct > 25) {
    warnings.push(`${Math.round(missingEmailPct)}% of rows missing email — they'll be skipped`);
  }
  if (invalidEmailPct > 5) {
    warnings.push(`${Math.round(invalidEmailPct)}% invalid email formats`);
  }
  if (duplicateInFilePct > 10) {
    warnings.push(`${Math.round(duplicateInFilePct)}% duplicates within file`);
  }
  if (duplicateInDbPct > 20) {
    warnings.push(`${Math.round(duplicateInDbPct)}% duplicates vs existing leads`);
  }
  if (invalidDomainPct > 10) {
    warnings.push(`${Math.round(invalidDomainPct)}% invalid domains`);
  }

  return {
    score,
    grade,
    metrics,
    warnings,
  };
}

/**
 * Validate email format
 */
export function isValidEmail(email: string | null | undefined): boolean {
  if (!email || typeof email !== "string") return false;
  const trimmed = email.trim();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmed);
}

/**
 * Validate domain format
 */
export function isValidDomain(domain: string | null | undefined): boolean {
  if (!domain || typeof domain !== "string") return false;
  const clean = domain.replace(/^https?:\/\//i, "").split("/")[0].trim();
  return /^[\da-z\.-]+\.[a-z]{2,}$/i.test(clean);
}









