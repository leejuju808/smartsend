"use server";

import { createClient } from "@/utils/supabase/server";

export type LeadRow = {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  campaign_id: string;
  status?: string;
};

export async function importLeads(rows: LeadRow[]) {
  if (!rows?.length) return { ok: false, error: "No rows provided." };

  // Basic validation
  const invalid = rows.filter(
    (r) => !r.email || !r.campaign_id || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(r.email)
  );
  if (invalid.length) {
    return { ok: false, error: `Invalid rows: ${invalid.length}` };
  }

  const supabase = createClient();

  // Optional: ensure default status
  const prepared = rows.map((r) => ({
    ...r,
    status: r.status || "new",
  }));

  // If you have a unique constraint on (campaign_id, email), use upsert:
  const { error } = await supabase
    .from("leads")
    .upsert(prepared, { onConflict: "campaign_id,email" });

  if (error) return { ok: false, error: error.message };
  return { ok: true, count: prepared.length };
} 