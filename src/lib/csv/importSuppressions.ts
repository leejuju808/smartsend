// /lib/csv/importSuppressions.ts
// Bulk import of suppressions from CSV with in-file dedupe and RPC fast-path

import { getBrowserSupabase } from "@/lib/supabase";

export type RawRow = Record<string, string | null | undefined>;

export function normalizeEmail(email: string | null | undefined): string | null {
  if (!email) return null;
  return email.trim().toLowerCase();
}

export async function bulkImportSuppressions(
  rows: RawRow[],
  mapping: { email: string; reason?: string; source?: string }
): Promise<{ attempted: number; imported: number; duplicates_in_file: number; errors: string[] }> {
  const attempted = rows.length;
  const errors: string[] = [];

  // Map and normalize
  const mapped = rows
    .map((r) => {
      const email = normalizeEmail((r[mapping.email] as string) ?? "");
      const reason = mapping.reason ? (r[mapping.reason] as string) ?? null : null;
      const source = mapping.source ? (r[mapping.source] as string) ?? null : "import";
      return { email: email || "", reason, source };
    })
    .filter((m) => !!m.email);

  // In-file dedupe
  const seen = new Set<string>();
  const unique: { email: string; reason: string | null; source: string | null }[] = [];
  let duplicates_in_file = 0;
  for (const r of mapped) {
    if (seen.has(r.email)) {
      duplicates_in_file++;
    } else {
      seen.add(r.email);
      unique.push(r);
    }
  }
  if (unique.length === 0) {
    return { attempted, imported: 0, duplicates_in_file, errors };
  }

  // RPC fast path if available
  const supabase = getBrowserSupabase();
  const { data: userRes } = await supabase.auth.getUser();
  const uid = userRes?.user?.id;
  if (!uid) {
    throw new Error("Not authenticated.");
  }

  try {
    // Try RPC (provided in /supabase/sql/bulk_insert_suppressions.sql below)
    const { data, error } = await supabase.rpc("bulk_insert_suppressions", {
      in_profile_id: uid,
      in_emails: unique.map((u) => u.email),
      in_reasons: unique.map((u) => u.reason),
      in_sources: unique.map((u) => u.source),
    });
    if (error) throw error;
    const imported = Array.isArray(data) && data.length > 0 ? Number((data[0] as any).inserted_count ?? 0) : 0;
    return { attempted, imported, duplicates_in_file, errors };
  } catch (e: any) {
    // Fallback: insert one-by-one (still safe via unique index)
    const batch = unique;
    let imported = 0;
    for (const r of batch) {
      const { error } = await supabase.from("suppressions_v2").insert({
        profile_id: uid,
        email: r.email,
        reason: r.reason,
        source: r.source ?? "import",
      });
      if (!error) {
        imported++;
      } else if ((error as any).code === "23505") {
        // duplicate — ignore
      } else {
        errors.push(error.message);
      }
    }
    return { attempted, imported, duplicates_in_file, errors };
  }
} 