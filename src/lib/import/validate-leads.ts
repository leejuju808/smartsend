import { isSuppressed } from "@/lib/hygiene/suppression";

/**
 * Validate leads and check suppression status
 * @param userId - The user ID (campaign owner)
 * @param emails - Array of email addresses to validate
 * @returns Array of validation results with suppression status
 */
export async function validateLeads(userId: string, emails: string[]) {
  const out = [];
  for (const email of emails) {
    const sup = await isSuppressed(userId, email);
    out.push({
      email,
      suppressed: sup.email || sup.domain,
      reason: sup.reason ?? null,
    });
  }
  return out;
}

/**
 * Batch validate leads (optimized for large lists)
 * @param userId - The user ID (campaign owner)
 * @param emails - Array of email addresses to validate
 * @returns Array of validation results with suppression status
 */
export async function validateLeadsBatch(userId: string, emails: string[]) {
  // Use Promise.all for parallel checks, but limit concurrency to avoid overwhelming DB
  const BATCH_SIZE = 50;
  const results = [];
  
  for (let i = 0; i < emails.length; i += BATCH_SIZE) {
    const batch = emails.slice(i, i + BATCH_SIZE);
    const batchResults = await Promise.all(
      batch.map(async (email) => {
        const sup = await isSuppressed(userId, email);
        return {
          email,
          suppressed: sup.email || sup.domain,
          reason: sup.reason ?? null,
        };
      })
    );
    results.push(...batchResults);
  }
  
  return results;
}

