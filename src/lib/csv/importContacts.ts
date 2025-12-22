// /lib/csv/importContacts.ts
// CSV → rows mapping → dedupe → suppression filter → bulk insert via RPC
// Relies on RLS and SQL pack you pasted into Supabase (normalize_email, unique indexes, RPC)

import { getBrowserSupabase } from "../supabase";

export type RawRow = Record<string, string | null | undefined>;

export type MappedRow = {
  email: string;
  first_name?: string | null;
  last_name?: string | null;
  company?: string | null;
};

export type ImportSummary = {
  imported: number;
  duplicates_in_file: number;
  suppressed: number;
  already_in_contacts: number;
  attempted: number;
  errors?: string[];
};

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

export function mapRows(
  rows: RawRow[],
  mapping: { email: string; first_name?: string; last_name?: string; company?: string }
): MappedRow[] {
  return rows
    .map((r) => {
      const email = normalizeEmail((r[mapping.email] as string) ?? "");
      const first = mapping.first_name ? (r[mapping.first_name] as string) ?? null : null;
      const last = mapping.last_name ? (r[mapping.last_name] as string) ?? null : null;
      const company = mapping.company ? (r[mapping.company] as string) ?? null : null;
      return {
        email: email || "",
        first_name: first,
        last_name: last,
        company,
      };
    })
    .filter((m) => !!m.email);
}

export function dedupeInFile(mapped: MappedRow[]): { unique: MappedRow[]; duplicates: number } {
  const seen = new Set<string>();
  const unique: MappedRow[] = [];
  let dup = 0;
  for (const r of mapped) {
    const key = r.email;
    if (seen.has(key)) {
      dup++;
    } else {
      seen.add(key);
      unique.push(r);
    }
  }
  return { unique, duplicates: dup };
}

/**
 * Cross-check existing contacts and suppressions for this user (by normalized email)
 */
export async function crossCheckExistingAndSuppressed(
  emails: string[]
): Promise<{ alreadyInContacts: Set<string>; suppressed: Set<string> }> {
  const supabase = getBrowserSupabase();

  // Fetch current user to ensure session; profile_id = auth.uid()
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes?.user) {
    throw new Error("Not authenticated. Please sign in.");
  }
  const uid = userRes.user.id;

  // Query both tables with a single round-trip each
  const { data: existing, error: exErr } = await supabase
    .from("contacts_v2")
    .select("email")
    .eq("profile_id", uid);
  if (exErr) throw exErr;

  const { data: suppressed, error: supErr } = await supabase
    .from("suppressions_v2")
    .select("email")
    .eq("profile_id", uid);
  if (supErr) throw supErr;

  return {
    alreadyInContacts: new Set((existing ?? []).map((r) => (r as any).email as string)),
    suppressed: new Set((suppressed ?? []).map((r) => (r as any).email as string)),
  };
}

/**
 * Perform bulk insert via RPC public.bulk_insert_contacts_v2 to leverage server-side dedupe.
 * Returns count inserted.
 */
export async function bulkInsertViaRPC(
  rows: MappedRow[]
): Promise<number> {
  const supabase = getBrowserSupabase();
  const { data: userRes, error: userErr } = await supabase.auth.getUser();
  if (userErr || !userRes?.user) {
    throw new Error("Not authenticated. Please sign in.");
  }
  const profileId = userRes.user.id;

  const emails: string[] = rows.map((r) => r.email);
  const firsts: (string | null)[] = rows.map((r) => r.first_name ?? null);
  const lasts: (string | null)[] = rows.map((r) => r.last_name ?? null);
  const companies: (string | null)[] = rows.map((r) => r.company ?? null);

  // Supabase RPC call to bulk_insert_contacts_v2
  const { data, error } = await supabase.rpc("bulk_insert_contacts_v2", {
    in_profile_id: profileId,
    in_emails: emails,
    in_first_names: firsts,
    in_last_names: lasts,
    in_companies: companies,
  });

  if (error) throw error;

  // RPC returns a table with inserted_count column; aggregate it
  const inserted = Array.isArray(data) && data.length > 0 ? Number((data[0] as any).inserted_count ?? 0) : 0;
  return inserted;
}

/**
 * Main import pipeline used by the page.
 */
export async function importContactsPipeline(
  rows: RawRow[],
  mapping: { email: string; first_name?: string; last_name?: string; company?: string }
): Promise<ImportSummary> {
  const summary: ImportSummary = {
    imported: 0,
    duplicates_in_file: 0,
    suppressed: 0,
    already_in_contacts: 0,
    attempted: 0,
    errors: [],
  };

  // Map and normalize
  const mapped = mapRows(rows, mapping);
  summary.attempted = mapped.length;

  // In-file dedupe
  const { unique, duplicates } = dedupeInFile(mapped);
  summary.duplicates_in_file = duplicates;

  if (unique.length === 0) return summary;

  // Cross-check against existing + suppressions
  const uniqueEmails = unique.map((r) => r.email);
  const { alreadyInContacts, suppressed } = await crossCheckExistingAndSuppressed(uniqueEmails);

  const toInsert = unique.filter((r) => {
    if (suppressed.has(r.email)) {
      summary.suppressed++;
      return false;
    }
    if (alreadyInContacts.has(r.email)) {
      summary.already_in_contacts++;
      return false;
    }
    return true;
  });

  if (toInsert.length === 0) return summary;

  // Bulk insert via RPC (server-side unique constraint still protects us)
  try {
    const inserted = await bulkInsertViaRPC(toInsert);
    summary.imported = inserted;
  } catch (e: any) {
    summary.errors?.push(e?.message ?? String(e));
  }

  return summary;
}

// Keep existing types and functions for backward compatibility
export interface ContactRow {
  first_name?: string;
  last_name?: string;
  email: string;
  company?: string;
}

export interface ImportResult {
  imported: number;
  duplicates: number;
  suppressed: number;
  invalid: number;
  total: number;
}

export interface ColumnMapping {
  [csvHeader: string]: 'first_name' | 'last_name' | 'email' | 'company';
}

/**
 * Legacy import function for backward compatibility
 */
export async function importContacts(
  rows: ContactRow[],
  profileId: string,
  workspaceId: string
): Promise<ImportResult> {
  // Convert to new format and use new pipeline
  const rawRows = rows.map(row => ({
    email: row.email,
    first_name: row.first_name,
    last_name: row.last_name,
    company: row.company,
  }));

  const mapping = {
    email: 'email',
    first_name: 'first_name',
    last_name: 'last_name',
    company: 'company',
  };

  const summary = await importContactsPipeline(rawRows, mapping);

  return {
    imported: summary.imported,
    duplicates: summary.duplicates_in_file + summary.already_in_contacts,
    suppressed: summary.suppressed,
    invalid: summary.attempted - summary.imported - summary.duplicates_in_file - summary.suppressed - summary.already_in_contacts,
    total: summary.attempted,
  };
}

/**
 * Detect column mapping from CSV headers
 */
export function detectColumnMapping(headers: string[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  
  headers.forEach(header => {
    const lowerHeader = header.toLowerCase().trim();
    
    if (lowerHeader.includes('email') || lowerHeader === 'e-mail') {
      mapping[header] = 'email';
    } else if (lowerHeader.includes('first') || lowerHeader.includes('given')) {
      mapping[header] = 'first_name';
    } else if (lowerHeader.includes('last') || lowerHeader.includes('family') || lowerHeader.includes('surname')) {
      mapping[header] = 'last_name';
    } else if (lowerHeader.includes('company') || lowerHeader.includes('organization') || lowerHeader.includes('org')) {
      mapping[header] = 'company';
    }
  });
  
  return mapping;
}

/**
 * Map CSV rows to ContactRow format using column mapping
 */
export function mapCsvRows(
  rows: any[],
  columnMapping: ColumnMapping
): ContactRow[] {
  return rows.map(row => {
    const contact: ContactRow = { email: '' };
    
    Object.entries(columnMapping).forEach(([csvHeader, field]) => {
      if (field === 'email') {
        contact.email = row[csvHeader] || '';
      } else {
        contact[field] = row[csvHeader] || '';
      }
    });
    
    return contact;
  });
} 