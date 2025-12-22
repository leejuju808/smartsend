import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Papa from "https://esm.sh/papaparse@5.4.1";

type LeadCsvRow = {
  email?: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  [key: string]: unknown;
};

type ErrorRow = {
  row: number;
  email?: string;
  error: string;
  raw?: Record<string, unknown>;
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

function isValidEmail(email: string): boolean {
  const lower = email.trim().toLowerCase();
  // Lightweight email check (good enough for import validation)
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(lower);
}

function toTrimmedLead(row: LeadCsvRow) {
  return {
    email: (row.email ?? "").toString().trim(),
    first_name: (row.first_name ?? "").toString().trim(),
    last_name: (row.last_name ?? "").toString().trim(),
    company: (row.company ?? "").toString().trim(),
  };
}

async function getCampaignInfo(campaignId: string): Promise<{ user_id: string; dedupe_strategy: string } | null> {
  const { data, error } = await supabase
    .from("campaigns")
    .select("user_id, dedupe_strategy")
    .eq("id", campaignId)
    .single();

  if (error || !data) return null;
  return {
    user_id: data.user_id,
    dedupe_strategy: data.dedupe_strategy || "per_campaign",
  };
}

async function getExistingEmailsForCampaign(campaignId: string, emails: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  if (emails.length === 0) return existing;

  // Supabase has limits for IN queries; chunk to be safe
  const chunkSize = 900;
  for (let i = 0; i < emails.length; i += chunkSize) {
    const chunk = emails.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("leads")
      .select("email")
      .eq("campaign_id", campaignId)
      .in("email", chunk);

    if (error) throw error;
    for (const row of data ?? []) {
      if (row?.email) existing.add(String(row.email).toLowerCase());
    }
  }

  return existing;
}

async function getGlobalEmails(userId: string, emails: string[]): Promise<Set<string>> {
  const existing = new Set<string>();
  if (emails.length === 0) return existing;

  const chunkSize = 900;
  for (let i = 0; i < emails.length; i += chunkSize) {
    const chunk = emails.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("smartsend_global_leads")
      .select("email")
      .eq("user_id", userId)
      .in("email", chunk);

    if (error) throw error;
    for (const row of data ?? []) {
      if (row?.email) existing.add(String(row.email).toLowerCase());
    }
  }

  return existing;
}

async function getExistingDomainsForCampaign(campaignId: string, emails: string[]): Promise<Set<string>> {
  const domains = new Set<string>();
  if (emails.length === 0) return domains;

  const chunkSize = 900;
  for (let i = 0; i < emails.length; i += chunkSize) {
    const chunk = emails.slice(i, i + chunkSize);
    const { data, error } = await supabase
      .from("leads")
      .select("email")
      .eq("campaign_id", campaignId)
      .in("email", chunk);

    if (error) throw error;
    for (const row of data ?? []) {
      if (row?.email) {
        const parts = String(row.email).toLowerCase().split("@");
        if (parts.length === 2) {
          domains.add(parts[1]);
        }
      }
    }
  }

  return domains;
}

async function insertIntoGlobalLeads(userId: string, emails: string[]) {
  if (emails.length === 0) return;

  const rows = emails.map((email) => ({
    user_id: userId,
    email: email.toLowerCase(),
  }));

  const chunkSize = 900;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    // Use insert with ignoreDuplicates option to handle duplicates gracefully
    // The unique constraint will prevent duplicates, but we use ignoreDuplicates to avoid errors
    const { error } = await supabase
      .from("smartsend_global_leads")
      .insert(chunk)
      .select();
    if (error) {
      // If it's a duplicate key error, that's fine - just log and continue
      // Otherwise, log the error but don't fail the import
      if (!error.message.includes("duplicate") && !error.message.includes("unique")) {
        console.warn("Failed to insert into global leads (non-fatal):", error.message);
      }
    }
  }
}

async function insertLeadsBatch(records: Array<Record<string, unknown>>) {
  if (records.length === 0) return;
  const chunkSize = 900;
  for (let i = 0; i < records.length; i += chunkSize) {
    const chunk = records.slice(i, i + chunkSize);
    const { error } = await supabase.from("leads").insert(chunk);
    if (error) throw error;
  }
}

async function logErrors(campaignId: string, errors: ErrorRow[]) {
  if (errors.length === 0) return;
  // Optional: write into a table for later download/visibility
  // Expecting a table `lead_import_errors` with columns:
  // campaign_id (uuid/text), row_number (int), email (text), error_message (text), raw_row (jsonb)
  const rows = errors.map((e) => ({
    campaign_id: campaignId,
    row_number: e.row,
    email: e.email ?? null,
    error_message: e.error,
    raw_row: e.raw ?? null,
  }));

  const chunkSize = 900;
  for (let i = 0; i < rows.length; i += chunkSize) {
    const chunk = rows.slice(i, i + chunkSize);
    const { error } = await supabase.from("lead_import_errors").insert(chunk);
    if (error) {
      // Don't fail the whole import because of error logging
      console.error("Failed to log import errors", error);
      break;
    }
  }
}

async function maybeUploadErrorCsv(campaignId: string, errors: ErrorRow[]): Promise<string | null> {
  if (errors.length === 0) return null;
  try {
    const headers = ["row", "email", "error"];
    const csv = [headers.join(",")]
      .concat(errors.map((e) => [e.row, e.email ?? "", e.error.replaceAll(",", " ")].join(",")))
      .join("\n");
    const fileName = `errors/${campaignId}/${Date.now()}.csv`;
    const { error } = await supabase.storage.from("imports").upload(fileName, new Blob([csv], { type: "text/csv" }), {
      contentType: "text/csv",
      upsert: true,
    });
    if (error) {
      console.warn("Failed to upload error CSV", error.message);
      return null;
    }
    const { data: publicUrl } = supabase.storage.from("imports").getPublicUrl(fileName);
    return publicUrl?.publicUrl ?? null;
  } catch (e) {
    console.warn("Error while generating/uploading error CSV", e);
    return null;
  }
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: { ...corsHeaders } });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const campaign_id = String(formData.get("campaign_id") ?? "").trim();

    if (!file || !campaign_id) {
      return new Response(JSON.stringify({ error: "Missing file or campaign_id" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Parse CSV
    const csvText = await file.text();
    const parsed = Papa.parse<LeadCsvRow>(csvText, {
      header: true,
      skipEmptyLines: true,
      dynamicTyping: false,
    });

    if (parsed.errors?.length) {
      // Surface the first parser error; others will be captured as row errors below if applicable
      console.warn("CSV parse warnings", parsed.errors);
    }

    const rawRows = (parsed.data || []) as LeadCsvRow[];

    // Optional mapping from form-data to remap CSV headers
    const mappingRaw = (formData.get("mapping") as string | null) ?? null;
    let mapping: Record<string, string> | null = null;
    try {
      mapping = mappingRaw ? JSON.parse(mappingRaw) : null;
    } catch (_) {
      mapping = null;
    }

    function pick(row: any, key: string) {
      if (!row) return "";
      return String(row[key] ?? "").trim();
    }

    // 🚧 Hard cap to protect DB & UX
    const ROW_CAP = 10_000;
    if (rawRows.length > ROW_CAP) {
      return new Response(
        JSON.stringify({
          error: `Too many rows (${rawRows.length}). Max allowed is ${ROW_CAP}. Please split your CSV and try again.`,
          code: "ROW_CAP_EXCEEDED",
          cap: ROW_CAP,
          rows: rawRows.length,
        }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const errors: ErrorRow[] = [];
    const candidates: Array<{
      rowNumber: number;
      emailLower: string;
      lead: { email: string; first_name: string; last_name: string; company?: string };
      raw: Record<string, unknown>;
    }> = [];

    const seenInFile = new Set<string>();

    // Validate per row and dedupe within the file
    for (let i = 0; i < rawRows.length; i++) {
      const raw = rawRows[i] ?? {};
      // Remap if mapping provided, else use defaults
      const remapped = mapping
        ? {
            email: pick(raw, mapping.email || "email"),
            first_name: pick(raw, mapping.first_name || "first_name"),
            last_name: pick(raw, mapping.last_name || "last_name"),
            company: pick(raw, mapping.company || "company"),
          }
        : toTrimmedLead(raw);

      const { email, first_name, last_name, company } = remapped;
      const rowNumber = i + 2; // +1 for 0-index, +1 for header row

      if (!email || !first_name || !last_name) {
        errors.push({ row: rowNumber, email, error: "Missing required fields: email, first_name, last_name", raw });
        continue;
      }

      if (!isValidEmail(email)) {
        errors.push({ row: rowNumber, email, error: "Invalid email format", raw });
        continue;
      }

      const emailLower = email.toLowerCase();
      if (seenInFile.has(emailLower)) {
        errors.push({ row: rowNumber, email, error: "Duplicate email in file", raw });
        continue;
      }
      seenInFile.add(emailLower);

      candidates.push({ rowNumber, emailLower, raw, lead: { email, first_name, last_name, company } });
    }

    // Get campaign info (user_id and dedupe_strategy)
    const campaignInfo = await getCampaignInfo(campaign_id);
    if (!campaignInfo) {
      return new Response(JSON.stringify({ error: "Campaign not found" }), {
        status: 404,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    const { user_id, dedupe_strategy } = campaignInfo;
    const dedupeStrategy = dedupe_strategy || "per_campaign";

    // STEP 1: Deduplicate inside the CSV itself (already done above)
    const uniqueRows = candidates;
    const duplicatesInsideCsv = rawRows.length - uniqueRows.length;

    // STEP 2: Detect Campaign-Level Duplicates
    const candidateEmails = uniqueRows.map((c) => c.emailLower);
    const existingCampaignEmails = await getExistingEmailsForCampaign(campaign_id, candidateEmails);
    
    let filtered = uniqueRows.filter((c) => !existingCampaignEmails.has(c.emailLower));
    const duplicatesInCampaign = uniqueRows.length - filtered.length;

    // STEP 3: Detect Global Duplicates (if strategy is 'global')
    let duplicatesGlobal = 0;
    let globalEmails: Set<string> = new Set();
    if (dedupeStrategy === "global") {
      globalEmails = await getGlobalEmails(user_id, filtered.map((c) => c.emailLower));
      const beforeGlobal = filtered.length;
      filtered = filtered.filter((c) => !globalEmails.has(c.emailLower));
      duplicatesGlobal = beforeGlobal - filtered.length;
    }

    // STEP 4: Domain-Level Dedupe (if strategy is 'domain')
    let duplicatesDomain = 0;
    let existingDomains: Set<string> = new Set();
    if (dedupeStrategy === "domain") {
      existingDomains = await getExistingDomainsForCampaign(campaign_id, filtered.map((c) => c.emailLower));
      const beforeDomain = filtered.length;
      filtered = filtered.filter((c) => {
        const parts = c.emailLower.split("@");
        if (parts.length !== 2) return true; // Keep invalid emails for error handling
        const domain = parts[1];
        return !existingDomains.has(domain);
      });
      duplicatesDomain = beforeDomain - filtered.length;
    }

    // Build import rows
    const importRows = filtered.map((c) => ({
      campaign_id,
      user_id, // Ensure user_id is set
      email: c.lead.email,
      first_name: c.lead.first_name,
      last_name: c.lead.last_name,
      company: c.lead.company || null,
      status: "queued",
    }));

    // Add errors for skipped duplicates
    const skippedForCampaign = uniqueRows.filter((c) => existingCampaignEmails.has(c.emailLower));
    for (const s of skippedForCampaign) {
      errors.push({ row: s.rowNumber, email: s.lead.email, error: "Duplicate email in database for this campaign", raw: s.raw });
    }

    if (dedupeStrategy === "global") {
      const skippedForGlobal = uniqueRows.filter((c) => {
        return !existingCampaignEmails.has(c.emailLower) && globalEmails.has(c.emailLower);
      });
      for (const s of skippedForGlobal) {
        errors.push({ row: s.rowNumber, email: s.lead.email, error: "Duplicate email in global index", raw: s.raw });
      }
    }

    if (dedupeStrategy === "domain") {
      const skippedForDomain = uniqueRows.filter((c) => {
        if (existingCampaignEmails.has(c.emailLower)) return false;
        const parts = c.emailLower.split("@");
        if (parts.length !== 2) return false;
        const domain = parts[1];
        return existingDomains.has(domain);
      });
      for (const s of skippedForDomain) {
        errors.push({ row: s.rowNumber, email: s.lead.email, error: "Duplicate domain in campaign", raw: s.raw });
      }
    }

    // Insert valid leads in batches
    await insertLeadsBatch(importRows);

    // STEP 5: Insert into Global Index (for all imported leads)
    if (importRows.length > 0) {
      const importedEmails = importRows.map((r) => String(r.email).toLowerCase());
      await insertIntoGlobalLeads(user_id, importedEmails);
    }

    // Log errors into dedicated table (best-effort)
    await logErrors(campaign_id, errors);

    // Optional: upload error CSV for visibility
    const errorCsvUrl = await maybeUploadErrorCsv(campaign_id, errors);

    const result = {
      message: "Import complete",
      total_rows: rawRows.length,
      parsed_rows: candidates.length,
      imported: importRows.length,
      errors_count: errors.length,
      error_csv_url: errorCsvUrl,
      // Deduplication summary
      duplicates_inside_csv: duplicatesInsideCsv,
      duplicates_in_campaign: duplicatesInCampaign,
      duplicates_global: duplicatesGlobal,
      duplicates_domain: duplicatesDomain,
      dedupe_strategy: dedupeStrategy,
      // Return up to first 20 errors inline for quick UI display
      errors_preview: errors.slice(0, 20),
    };

    return new Response(JSON.stringify(result), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  } catch (err: any) {
    console.error(err);
    return new Response(JSON.stringify({ error: err?.message ?? "Unknown error" }), {
      status: 500,
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }
});



