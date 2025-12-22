"use server";

import { createClient } from "@/lib/supabase/server";
import { parse } from "csv-parse/sync";

type LeadField =
  | "email"
  | "first_name"
  | "last_name"
  | "company"
  | "city"
  | "ignore"
  | `custom_${string}`;

interface ColumnMapping {
  [header: string]: LeadField;
}

interface ImportResult {
  imported: number;
  duplicates_inside_csv: number;
  duplicates_in_campaign: number;
  duplicates_global: number;
}

export async function importLeadsWithMapping(
  campaignId: string,
  file: File,
  mapping: ColumnMapping
): Promise<ImportResult> {
  const supabase = createClient();

  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error("Not authenticated");

  const buffer = Buffer.from(await file.arrayBuffer());
  const csvText = buffer.toString("utf-8");

  const rows: any[] = parse(csvText, {
    columns: true,
    skip_empty_lines: true,
  });

  if (!rows.length) {
    return {
      imported: 0,
      duplicates_inside_csv: 0,
      duplicates_in_campaign: 0,
      duplicates_global: 0,
    };
  }

  // 1) Map CSV rows → lead objects
  const mappedRows = rows.map((row) => {
    const lead: any = {
      campaign_id: campaignId,
      custom: {},
    };

    for (const header of Object.keys(row)) {
      const field = mapping[header];
      const value = (row[header] ?? "").toString().trim();
      if (!field || field === "ignore" || value === "") continue;

      if (field === "email") {
        lead.email = value.toLowerCase();
      } else if (field === "first_name") {
        lead.first_name = value;
      } else if (field === "last_name") {
        lead.last_name = value;
      } else if (field === "company") {
        lead.company = value;
      } else if (field === "city") {
        lead.city = value;
      } else if (field.startsWith("custom_")) {
        const key = field.replace("custom_", "");
        if (!lead.custom) lead.custom = {};
        lead.custom[key] = value;
      }
    }

    return lead;
  });

  // Filter out no-email rows
  const withEmail = mappedRows.filter((r) => !!r.email);

  // 2) Remove duplicates inside CSV
  const uniqueRows: any[] = [];
  const seen = new Set<string>();
  for (const row of withEmail) {
    const emailLower = row.email.toLowerCase();
    if (!seen.has(emailLower)) {
      seen.add(emailLower);
      uniqueRows.push(row);
    }
  }
  const duplicates_inside_csv = withEmail.length - uniqueRows.length;

  // 3) Campaign-level duplicates
  const { data: existingCampaignLeads } = await supabase
    .from("leads")
    .select("email")
    .eq("campaign_id", campaignId);

  const campaignSet = new Set(
    (existingCampaignLeads || []).map((l: any) => l.email.toLowerCase())
  );

  const filtered: any[] = uniqueRows.filter(
    (row) => !campaignSet.has(row.email.toLowerCase())
  );
  const duplicates_in_campaign = uniqueRows.length - filtered.length;

  // 4) Global duplicates (Block 8800)
  const { data: globalLeads } = await supabase
    .from("smartsend_global_leads")
    .select("email")
    .eq("user_id", user.id);

  const globalSet = new Set(
    (globalLeads || []).map((l: any) => l.email.toLowerCase())
  );

  const finalRows: any[] = filtered.filter(
    (row) => !globalSet.has(row.email.toLowerCase())
  );
  const duplicates_global = filtered.length - finalRows.length;

  if (!finalRows.length) {
    return {
      imported: 0,
      duplicates_inside_csv,
      duplicates_in_campaign,
      duplicates_global,
    };
  }

  // 5) Insert into leads (ensure user_id is set)
  const leadsToInsert = finalRows.map((r) => ({
    ...r,
    user_id: user.id,
  }));
  const { error: leadsErr } = await supabase.from("leads").insert(leadsToInsert);
  if (leadsErr) throw leadsErr;

  // 6) Insert into global leads index (ignore duplicates)
  const globalInsert = leadsToInsert.map((r) => ({
    user_id: user.id,
    email: r.email.toLowerCase(),
  }));
  const { error: globalErr } = await supabase
    .from("smartsend_global_leads")
    .insert(globalInsert);
  // Ignore duplicate key errors (they're expected)
  if (globalErr && !globalErr.message.includes("duplicate") && !globalErr.message.includes("unique")) {
    console.warn("Failed to insert into global leads (non-fatal):", globalErr.message);
  }

  return {
    imported: finalRows.length,
    duplicates_inside_csv,
    duplicates_in_campaign,
    duplicates_global,
  };
}

