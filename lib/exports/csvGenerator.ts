/**
 * CSV Generator for Lead Exports
 * Generates CSV with all required columns per Block 12500 spec
 */

export interface LeadExportRow {
  homeowner_email: string;
  first_name: string;
  last_name: string;
  city: string;
  state: string;
  zip: string;
  tags: string; // CSV within CSV (comma-separated)
  lead_status: string; // HOT/WARM/etc.
  date_first_contacted: string;
  date_last_message_sent: string;
  date_of_last_reply: string;
  last_reply_snippet: string;
  assigned_team_member: string;
  campaign_origin: string;
  created_at: string;
  updated_at: string;
}

/**
 * Escape CSV value
 */
function escapeCSV(value: any): string {
  if (value === null || value === undefined) return "";
  const str = String(value);
  if (str.includes(",") || str.includes('"') || str.includes("\n") || str.includes("\r")) {
    return `"${str.replace(/"/g, '""')}"`;
  }
  return str;
}

/**
 * Generate CSV header row
 */
export function generateCSVHeader(): string {
  return [
    "homeowner_email",
    "first_name",
    "last_name",
    "city",
    "state",
    "zip",
    "tags",
    "lead_status",
    "date_first_contacted",
    "date_last_message_sent",
    "date_of_last_reply",
    "last_reply_snippet",
    "assigned_team_member",
    "campaign_origin",
    "created_at",
    "updated_at",
  ].join(",");
}

/**
 * Generate CSV row from data object
 */
export function generateCSVRow(row: LeadExportRow): string {
  return [
    escapeCSV(row.homeowner_email),
    escapeCSV(row.first_name),
    escapeCSV(row.last_name),
    escapeCSV(row.city),
    escapeCSV(row.state),
    escapeCSV(row.zip),
    escapeCSV(row.tags),
    escapeCSV(row.lead_status),
    escapeCSV(row.date_first_contacted),
    escapeCSV(row.date_last_message_sent),
    escapeCSV(row.date_of_last_reply),
    escapeCSV(row.last_reply_snippet),
    escapeCSV(row.assigned_team_member),
    escapeCSV(row.campaign_origin),
    escapeCSV(row.created_at),
    escapeCSV(row.updated_at),
  ].join(",");
}

/**
 * Generate full CSV from array of rows
 */
export function generateCSV(rows: LeadExportRow[]): string {
  const header = generateCSVHeader();
  const csvRows = rows.map(generateCSVRow);
  return [header, ...csvRows].join("\n");
}

/**
 * Format date for CSV (ISO string or empty)
 */
export function formatDateForCSV(date: string | null | undefined): string {
  if (!date) return "";
  try {
    return new Date(date).toISOString();
  } catch {
    return "";
  }
}

/**
 * Format tags array to CSV string (comma-separated)
 */
export function formatTagsForCSV(tags: string[] | null | undefined): string {
  if (!tags || !Array.isArray(tags) || tags.length === 0) return "";
  return tags.join(",");
}

/**
 * Truncate snippet to reasonable length (max 200 chars)
 */
export function truncateSnippet(text: string | null | undefined, maxLength: number = 200): string {
  if (!text) return "";
  if (text.length <= maxLength) return text;
  return text.substring(0, maxLength) + "...";
}





















































