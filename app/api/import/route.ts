/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { parse } from "csv-parse/sync";
import { suggestRepair } from "@/lib/import/errorRepair";

/**
 * POST /api/import/contacts
 * Accepts multipart/form-data:
 *  - file: CSV file
 *  - mapping: JSON string mapping incoming columns to fields:
 *      { email: "Email", first_name: "First Name", last_name: "Last Name", company: "Company", title: "Title", phone: "Phone", custom: ["Col A", "Col B"] }
 *  - workspaceId: string (uuid)
 *  - campaignId: string (uuid, optional)
 *
 * Behavior:
 *  - parses CSV
 *  - normalizes email (trim/lower)
 *  - drops invalid emails
 *  - dedupes within file and against existing contacts (per workspace)
 *  - skips globally suppressed or campaign-suppressed emails
 *  - detects role accounts (info@, admin@, sales@, support@, help@, billing@, no-reply@/noreply@, contact@)
 *    • if profiles.auto_suppress_role_accounts = true → upsert into suppressions(reason='role_account') and skip
 *    • if false → allow insert but flag in counts
 *  - inserts new contacts
 *  - returns counters + sample errors
 */

export const runtime = "nodejs"; // need node libs for csv-parse

type Mapping = {
  email: string;
  first_name?: string;
  last_name?: string;
  company?: string;
  title?: string;
  phone?: string;
  website?: string;
  linkedin_url?: string;
  custom?: string[]; // extra columns to stash into custom JSON
  // Block 260: Extended mapping structure
  columns?: Record<string, string>; // Alternative format: { "Email": "email", "First Name": "first_name" }
  source_template?: string;
  enrich_after_import?: boolean;
};

function isValidEmail(e: string): boolean {
  const email = e.trim().toLowerCase();
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

function normalizeEmail(e: string): string {
  return e.trim().toLowerCase();
}

const ROLE_PREFIXES = [
  "admin", "administrator", "billing", "contact", "enquiries", "enquiry",
  "finance", "help", "hello", "hr", "info", "inquiries", "inquiry", "jobs",
  "marketing", "no-reply", "noreply", "office", "press", "privacy", "sales",
  "security", "service", "services", "support", "team", "webmaster"
];

function isRoleAccount(email: string): boolean {
  const at = email.indexOf("@");
  if (at <= 0) return false;
  const local = email.slice(0, at);
  // exact match for common role prefixes
  if (ROLE_PREFIXES.includes(local)) return true;
  // patterns like support+something@
  for (const p of ROLE_PREFIXES) {
    if (local === p) return true;
    if (local.startsWith(p + "+")) return true;
  }
  return false;
}

export async function POST(req: NextRequest) {
  let importId: string | null = null;
  try {
    const form = await req.formData();
    const file = form.get("file") as File | null;
    const mappingRaw = form.get("mapping") as string | null;
    const workspaceId = form.get("workspaceId") as string | null;
    const campaignId = (form.get("campaignId") as string | null) || null;

    if (!file || !mappingRaw || !workspaceId) {
      return NextResponse.json(
        { error: "Missing file, mapping, or workspaceId" },
        { status: 400 }
      );
    }

    const mappingRawParsed = JSON.parse(mappingRaw);
    const mapping: Mapping = mappingRawParsed;

    // Block 260: Support new mapping format with columns object
    let normalizedMapping: Mapping;
    if (mapping.columns) {
      // Convert columns format to old format for compatibility
      normalizedMapping = {
        email: mapping.columns[mapping.email] || mapping.email,
        first_name: mapping.columns[mapping.first_name || ""] || mapping.first_name,
        last_name: mapping.columns[mapping.last_name || ""] || mapping.last_name,
        company: mapping.columns[mapping.company || ""] || mapping.company,
        title: mapping.columns[mapping.title || ""] || mapping.title,
        phone: mapping.columns[mapping.phone || ""] || mapping.phone,
        website: mapping.columns[mapping.website || ""] || mapping.website,
        linkedin_url: mapping.columns[mapping.linkedin_url || ""] || mapping.linkedin_url,
        custom: mapping.custom,
        source_template: mapping.source_template,
        enrich_after_import: mapping.enrich_after_import,
      };
    } else {
      normalizedMapping = mapping;
    }

    // Block 260: Validate email mapping exists
    if (!normalizedMapping.email) {
      return NextResponse.json(
        { error: "You must map Email to at least one column to import leads." },
        { status: 400 }
      );
    }

    const buf = Buffer.from(await file.arrayBuffer());
    const text = buf.toString("utf8");

    const records: any[] = parse(text, {
      columns: true,
      skip_empty_lines: true,
      bom: true,
      trim: true,
    });

    const supabase = createClient();

    // Get user for import record
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Create import record with extended mapping structure
    const { data: importRecord, error: importErr } = await supabase
      .from("imports")
      .insert({
        workspace_id: workspaceId,
        user_id: user.id,
        filename: file.name,
        mapping: {
          ...normalizedMapping,
          source_template: mapping.source_template,
          enrich_after_import: mapping.enrich_after_import || false,
        },
        total_rows: records.length,
      })
      .select()
      .single();

    if (importErr) {
      return NextResponse.json({ error: importErr.message }, { status: 500 });
    }

    importId = importRecord.id;

    // Feature flags from profile (by workspace) + plan gating
    const { data: profile, error: profErr } = await supabase
      .from("profiles")
      .select("workspace_id, auto_suppress_role_accounts, subscription_status")
      .eq("workspace_id", workspaceId)
      .limit(1)
      .maybeSingle();

    if (profErr) {
      return NextResponse.json({ error: profErr.message }, { status: 500 });
    }

    const plan = profile?.subscription_status || "free";
    const paid =
      plan !== "free" && plan !== "canceled" && plan !== "past_due";
    const autoSuppressRolesSetting = profile?.auto_suppress_role_accounts ?? true;
    // Gate: only paid plans can auto-suppress role accounts on import
    const autoSuppressRoles = paid && autoSuppressRolesSetting;

    // Fetch existing contacts + suppressions for fast lookups
    const { data: existingContacts, error: contactsErr } = await supabase
      .from("contacts")
      .select("email")
      .eq("workspace_id", workspaceId);

    if (contactsErr) {
      return NextResponse.json({ error: contactsErr.message }, { status: 500 });
    }

    const existingSet = new Set(
      (existingContacts || []).map((c: any) => c.email.toLowerCase())
    );

    const { data: globalSuppressions, error: supErr } = await supabase
      .from("suppressions")
      .select("email")
      .eq("workspace_id", workspaceId);

    if (supErr) {
      return NextResponse.json({ error: supErr.message }, { status: 500 });
    }

    const suppressedGlobal = new Set(
      (globalSuppressions || []).map((s: any) => s.email.toLowerCase())
    );

    let suppressedScoped = new Set<string>();
    if (campaignId) {
      const { data: scoped, error: scopedErr } = await supabase
        .from("campaign_suppressions")
        .select("email, campaign_id")
        .eq("campaign_id", campaignId);
      if (scopedErr) {
        return NextResponse.json({ error: scopedErr.message }, { status: 500 });
      }
      suppressedScoped = new Set((scoped || []).map((s: any) => s.email.toLowerCase()));
    }

    // In-file dedupe and normalization
    const seenInFile = new Set<string>();

    const toInsert: any[] = [];
    const errors: { row: number; email?: string; message: string; row_data?: any }[] = [];
    const errorRowsToStore: Array<{ 
      import_id: string; 
      row_data: any; 
      error_message: string;
      suggestion?: any; // Block 260: Add repair suggestions
    }> = [];

    let counts = {
      total_rows: records.length,
      valid: 0,
      inserted: 0,
      skipped_invalid_email: 0,
      skipped_duplicate_in_file: 0,
      skipped_existing_contact: 0,
      skipped_suppressed_global: 0,
      skipped_suppressed_campaign: 0,
      skipped_role_accounts: 0,     // auto-suppressed + skipped
      flagged_role_accounts: 0      // allowed in (flag only) when toggle OFF
    };

    for (let i = 0; i < records.length; i++) {
      const row = records[i];
      const emailRaw = row[normalizedMapping.email];
      if (!emailRaw || !isValidEmail(emailRaw)) {
        counts.skipped_invalid_email++;
        const errorMsg = emailRaw ? "Invalid email format" : "Missing email";
        const suggestion = emailRaw ? suggestRepair("email", emailRaw, errorMsg) : null;
        errors.push({ row: i + 1, message: errorMsg, row_data: row });
        if (importId) {
          errorRowsToStore.push({
            import_id: importId,
            row_data: row,
            error_message: errorMsg,
            suggestion: suggestion || undefined,
          });
        }
        continue;
      }
      const email = normalizeEmail(emailRaw);
      if (seenInFile.has(email)) {
        counts.skipped_duplicate_in_file++;
        const errorMsg = "Duplicate in this CSV";
        errors.push({ row: i + 1, email, message: errorMsg, row_data: row });
        if (importId) {
          errorRowsToStore.push({
            import_id: importId,
            row_data: row,
            error_message: errorMsg,
          });
        }
        continue;
      }
      seenInFile.add(email);

      // role account detection
      const role = isRoleAccount(email);

      if (existingSet.has(email)) {
        counts.skipped_existing_contact++;
        continue;
      }
      if (suppressedGlobal.has(email)) {
        counts.skipped_suppressed_global++;
        continue;
      }
      if (campaignId && suppressedScoped.has(email)) {
        counts.skipped_suppressed_campaign++;
        continue;
      }

      if (role && autoSuppressRoles) {
        // insert into global suppressions (idempotent; ignore unique constraint)
        const { error: insSupErr } = await supabase.from("suppressions").insert({
          workspace_id: workspaceId,
          email,
          reason: "role_account",
          metadata: { source: "import_auto_role" }
        });
        if (insSupErr && !/duplicate key|unique constraint/i.test(insSupErr.message)) {
          const errorMsg = `Failed to suppress role account: ${insSupErr.message}`;
          errors.push({ row: i + 1, email, message: errorMsg, row_data: row });
          if (importId) {
            errorRowsToStore.push({
              import_id: importId,
              row_data: row,
              error_message: errorMsg,
            });
          }
        }
        counts.skipped_role_accounts++;
        // do not insert as contact
        continue;
      }

      const contact: any = {
        workspace_id: workspaceId,
        email,
        first_name: normalizedMapping.first_name ? row[normalizedMapping.first_name] || null : null,
        last_name: normalizedMapping.last_name ? row[normalizedMapping.last_name] || null : null,
        company: normalizedMapping.company ? row[normalizedMapping.company] || null : null,
        title: normalizedMapping.title ? row[normalizedMapping.title] || null : null,
        phone: normalizedMapping.phone ? row[normalizedMapping.phone] || null : null,
        custom: {},
      };

      // Block 260: Support website and linkedin_url fields
      if (normalizedMapping.website && row[normalizedMapping.website]) {
        contact.custom.website = row[normalizedMapping.website];
      }
      if (normalizedMapping.linkedin_url && row[normalizedMapping.linkedin_url]) {
        contact.custom.linkedin_url = row[normalizedMapping.linkedin_url];
      }

      if (Array.isArray(normalizedMapping.custom)) {
        for (const key of normalizedMapping.custom) {
          if (key && key in row) {
            contact.custom[key] = row[key];
          }
        }
      }

      toInsert.push(contact);
      counts.valid++;

      if (role && !autoSuppressRoles) {
        counts.flagged_role_accounts++;
      }
    }

    // Batch insert (chunked)
    const chunkSize = 1000;
    let inserted = 0;
    for (let i = 0; i < toInsert.length; i += chunkSize) {
      const chunk = toInsert.slice(i, i + chunkSize);
      if (chunk.length === 0) continue;
      const { error: insErr, count } = await supabase
        .from("contacts")
        .insert(chunk, { count: "exact" });
      if (insErr) {
        const errorMsg = `Insert failed (chunk ${i / chunkSize + 1}): ${insErr.message}`;
        errors.push({ row: -1, message: errorMsg });
        // Store errors for failed chunks
        for (const contact of chunk) {
          if (importId) {
            errorRowsToStore.push({
              import_id: importId,
              row_data: contact,
              error_message: errorMsg,
            });
          }
        }
        continue;
      }
      inserted += count || chunk.length;
    }
    counts.inserted = inserted;

    // Store errors in import_errors table
    if (importId && errorRowsToStore.length > 0) {
      // Batch insert errors in chunks
      const errorChunkSize = 500;
      for (let i = 0; i < errorRowsToStore.length; i += errorChunkSize) {
        const chunk = errorRowsToStore.slice(i, i + errorChunkSize);
        await supabase.from("import_errors").insert(chunk);
      }
    }

    // Calculate final stats
    const failedRows = counts.skipped_invalid_email + counts.skipped_duplicate_in_file;
    const duplicateRows = counts.skipped_existing_contact;
    const ignoredRows = counts.skipped_suppressed_global + counts.skipped_suppressed_campaign + counts.skipped_role_accounts;

    // Update import record with final stats
    if (importId) {
      await supabase
        .from("imports")
        .update({
          success_rows: counts.inserted,
          failed_rows: failedRows,
          duplicate_rows: duplicateRows,
          ignored_rows: ignoredRows,
        })
        .eq("id", importId);
    }

    return NextResponse.json({
      ok: true,
      import_id: importId,
      counts,
      sample_errors: errors.slice(0, 20),
      flags: { autoSuppressRoles, paywalledRoleAutoSuppress: !paid && autoSuppressRolesSetting === true }
    });
  } catch (e: any) {
    // Update import record with error if we have an importId
    if (importId) {
      try {
        const supabase = createClient();
        await supabase
          .from("imports")
          .update({
            failed_rows: 0, // Will be set properly if processing started
          })
          .eq("id", importId);
      } catch (updateErr) {
        console.error("Failed to update import record:", updateErr);
      }
    }
    return NextResponse.json({ error: e.message ?? "Unknown error" }, { status: 500 });
  }
} 