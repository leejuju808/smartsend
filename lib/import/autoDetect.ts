/**
 * Block 260: Bulk Importer v3 - Column Auto-Detection
 * Smart column type detection based on headers and sample values
 */

export type ColumnType =
  | "email"
  | "first_name"
  | "last_name"
  | "company"
  | "title"
  | "website"
  | "linkedin_url"
  | "phone"
  | null;

export interface AutoDetectResult {
  columnType: ColumnType;
  confidence: "high" | "medium" | "low";
}

/**
 * Auto-detect column type based on header name and sample values
 */
export function autoDetectColumnType(
  header: string,
  sampleValues: string[]
): AutoDetectResult {
  const h = header.toLowerCase().trim();
  const samples = sampleValues.filter((v) => v && typeof v === "string").slice(0, 10);

  // Email detection
  if (h.includes("email") || h.includes("e-mail") || h === "mail") {
    const emailMatch = samples.filter((v) => /@.+\..+/.test(v)).length;
    const confidence = emailMatch > samples.length * 0.8 ? "high" : emailMatch > 0 ? "medium" : "low";
    return { columnType: "email", confidence };
  }

  // First name detection
  if (
    h.includes("first") ||
    h === "fname" ||
    h === "given" ||
    h === "given_name" ||
    h.includes("firstname")
  ) {
    return { columnType: "first_name", confidence: "high" };
  }

  // Last name detection
  if (
    h.includes("last") ||
    h === "lname" ||
    h.includes("surname") ||
    h.includes("family") ||
    h.includes("lastname")
  ) {
    return { columnType: "last_name", confidence: "high" };
  }

  // Company detection
  if (
    h.includes("company") ||
    h.includes("account") ||
    h.includes("org") ||
    h.includes("organization") ||
    h.includes("firm") ||
    h.includes("business")
  ) {
    return { columnType: "company", confidence: "high" };
  }

  // Title detection
  if (
    h.includes("title") ||
    h.includes("role") ||
    h.includes("position") ||
    h.includes("job_title") ||
    h.includes("jobtitle")
  ) {
    return { columnType: "title", confidence: "high" };
  }

  // LinkedIn detection
  if (h.includes("linkedin") || h.includes("linked_in")) {
    const linkedInMatch = samples.filter((v) =>
      /linkedin\.com\/in\//i.test(v)
    ).length;
    const confidence = linkedInMatch > samples.length * 0.5 ? "high" : "medium";
    return { columnType: "linkedin_url", confidence };
  }
  // Also check if values contain LinkedIn URLs
  if (samples.length > 0) {
    const linkedInMatch = samples.filter((v) =>
      /linkedin\.com\/in\//i.test(v)
    ).length;
    if (linkedInMatch > samples.length * 0.5) {
      return { columnType: "linkedin_url", confidence: "medium" };
    }
  }

  // Phone detection
  if (
    h.includes("phone") ||
    h.includes("mobile") ||
    h.includes("cell") ||
    h.includes("telephone") ||
    h.includes("tel")
  ) {
    const phonePattern = /[\d\s\-\(\)\+]{10,}/;
    const phoneMatch = samples.filter((v) => phonePattern.test(v)).length;
    const confidence = phoneMatch > samples.length * 0.7 ? "high" : phoneMatch > 0 ? "medium" : "low";
    return { columnType: "phone", confidence };
  }

  // Domain/Website detection
  if (
    h.includes("domain") ||
    h.includes("website") ||
    h === "url" ||
    h === "site" ||
    h.includes("web")
  ) {
    const urlPattern = /^(https?:\/\/)?([\da-z\.-]+)\.([a-z\.]{2,6})([\/\w \.-]*)*\/?$/i;
    const domainMatch = samples.filter((v) => {
      const clean = v.replace(/^https?:\/\//i, "").split("/")[0];
      return urlPattern.test(clean) || /^[\da-z\.-]+\.[a-z]{2,}$/i.test(clean);
    }).length;
    const confidence = domainMatch > samples.length * 0.7 ? "high" : domainMatch > 0 ? "medium" : "low";
    return { columnType: "website", confidence };
  }

  return { columnType: null, confidence: "low" };
}

/**
 * Auto-detect mapping for all columns in a CSV
 */
export function autoDetectMapping(
  headers: string[],
  sampleRows: Record<string, any>[]
): Record<string, ColumnType> {
  const mapping: Record<string, ColumnType> = {};
  const usedTypes = new Set<ColumnType>();

  // Collect sample values for each column
  const columnSamples: Record<string, string[]> = {};
  for (const header of headers) {
    columnSamples[header] = sampleRows
      .map((row) => row[header])
      .filter((v) => v != null && v !== "")
      .slice(0, 10);
  }

  // First pass: high confidence detections
  for (const header of headers) {
    const result = autoDetectColumnType(header, columnSamples[header] || []);
    if (result.columnType && result.confidence === "high" && !usedTypes.has(result.columnType)) {
      mapping[header] = result.columnType;
      usedTypes.add(result.columnType);
    }
  }

  // Second pass: medium confidence detections (if not already mapped)
  for (const header of headers) {
    if (mapping[header]) continue;
    const result = autoDetectColumnType(header, columnSamples[header] || []);
    if (result.columnType && result.confidence === "medium" && !usedTypes.has(result.columnType)) {
      mapping[header] = result.columnType;
      usedTypes.add(result.columnType);
    }
  }

  return mapping;
}









