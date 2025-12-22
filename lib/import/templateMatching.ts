/**
 * Block 260: Bulk Importer v3 - Source-Aware Template Matching
 * Matches CSV headers to known import templates (Apollo, Clay, LinkedIn, etc.)
 */

/**
 * Calculate Jaccard similarity between two arrays
 */
function jaccardSimilarity(a: string[], b: string[]): number {
  const setA = new Set(a.map((s) => s.toLowerCase().trim()));
  const setB = new Set(b.map((s) => s.toLowerCase().trim()));

  const intersection = new Set([...setA].filter((x) => setB.has(x)));
  const union = new Set([...setA, ...setB]);

  if (union.size === 0) return 0;
  return intersection.size / union.size;
}

/**
 * Normalize header signature (sort and normalize)
 */
export function normalizeHeaderSignature(headers: string[]): string[] {
  return headers
    .map((h) => h.toLowerCase().trim())
    .filter((h) => h.length > 0)
    .sort();
}

/**
 * Match headers to a template signature
 */
export function matchTemplate(
  headers: string[],
  templateSignature: string[]
): { similarity: number; matched: boolean } {
  const normalizedHeaders = normalizeHeaderSignature(headers);
  const normalizedSignature = normalizeHeaderSignature(templateSignature);

  const similarity = jaccardSimilarity(normalizedHeaders, normalizedSignature);
  // Consider it a match if similarity is >= 0.7 (70%)
  const matched = similarity >= 0.7;

  return { similarity, matched };
}

/**
 * Known template signatures for common sources
 */
export const KNOWN_TEMPLATES: Record<string, string[]> = {
  Apollo: [
    "email",
    "first_name",
    "last_name",
    "company",
    "title",
    "linkedin_url",
    "phone",
  ],
  Clay: [
    "email",
    "first_name",
    "last_name",
    "company",
    "title",
    "website",
    "phone",
  ],
  "LinkedIn CSV": [
    "first_name",
    "last_name",
    "email",
    "company",
    "title",
    "linkedin_url",
  ],
  "HubSpot Export": [
    "email",
    "first_name",
    "last_name",
    "company",
    "job_title",
    "phone",
  ],
  "Salesforce Export": [
    "email",
    "first_name",
    "last_name",
    "company",
    "title",
    "phone",
  ],
};

/**
 * Find best matching template for given headers
 */
export function findBestTemplate(
  headers: string[]
): { sourceName: string; similarity: number; mapping?: Record<string, string> } | null {
  let bestMatch: { sourceName: string; similarity: number } | null = null;

  for (const [sourceName, signature] of Object.entries(KNOWN_TEMPLATES)) {
    const { similarity, matched } = matchTemplate(headers, signature);
    if (matched && (!bestMatch || similarity > bestMatch.similarity)) {
      bestMatch = { sourceName, similarity };
    }
  }

  return bestMatch;
}









