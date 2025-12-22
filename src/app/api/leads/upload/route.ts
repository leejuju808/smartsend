import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { createSupabaseServer } from "@/lib/supabaseServer";
import { parseCSV } from "@/lib/csv/parse";
import { normalizeEmail, normalizePhone } from "@/lib/validators/leads";

export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) {
      return NextResponse.json({ error: "not_authenticated" }, { status: 401 });
    }

    const form = await req.formData();
    const file = form.get("file") as File | null;
    const mappingJson = form.get("mapping") as string | null;
    const campaignIdParam = form.get("campaign_id") as string | null;

    if (!file || !mappingJson) {
      return NextResponse.json({ error: "missing_params" }, { status: 400 });
    }

    const mapping = JSON.parse(mappingJson) as Record<string, string>; // target -> csv header
    const text = await file.text();
    const { headers, rows } = parseCSV(text);

    if (rows.length === 0) {
      return NextResponse.json({ error: "empty_csv" }, { status: 400 });
    }

    // Map CSV rows to lead objects
    const leadRows = rows
      .map((row) => {
        const email = normalizeEmail(row[mapping.email] || "");
        if (!email) return null;

        const lead: any = {
          user_id: user.id,
          email,
          first_name: (row[mapping.first_name] ? String(row[mapping.first_name]).trim() : null) || null,
          last_name: (row[mapping.last_name] ? String(row[mapping.last_name]).trim() : null) || null,
          company: (row[mapping.company] ? String(row[mapping.company]).trim() : null) || null,
          title: (row[mapping.title] ? String(row[mapping.title]).trim() : null) || null,
          phone: normalizePhone(row[mapping.phone] || ""),
          custom: {} as Record<string, any>,
        };

        // Store any unmapped columns in custom JSONB
        for (const [csvHeader, value] of Object.entries(row)) {
          const mappedTo = Object.entries(mapping).find(([, v]) => v === csvHeader)?.[0];
          if (!mappedTo || !["email", "first_name", "last_name", "company", "title", "phone"].includes(mappedTo)) {
            const strValue = value ? String(value).trim() : "";
            if (strValue) {
              lead.custom[csvHeader] = strValue;
            }
          }
        }

        // If no custom fields, set to null
        if (Object.keys(lead.custom).length === 0) {
          lead.custom = null;
        }

        return lead;
      })
      .filter(Boolean) as any[];

    if (leadRows.length === 0) {
      return NextResponse.json({ error: "no_valid_leads" }, { status: 400 });
    }

    // Use service client for bulk operations
    const serviceSupabase = createSupabaseServer();

    // Bulk upsert leads (dedupe by user_id + email)
    let inserted = 0;
    let skipped = 0;
    const chunkSize = 1000;
    const leadIdMap = new Map<string, string>(); // email -> lead_id

    for (let i = 0; i < leadRows.length; i += chunkSize) {
      const batch = leadRows.slice(i, i + chunkSize);
      
      const { data, error } = await serviceSupabase
        .from("leads")
        .upsert(batch, {
          onConflict: "user_id,email",
          ignoreDuplicates: false,
        })
        .select("id,email");

      if (error) {
        console.error("Upsert error:", error);
        return NextResponse.json({ error: error.message }, { status: 500 });
      }

      if (data) {
        inserted += data.length;
        for (const lead of data) {
          leadIdMap.set(lead.email.toLowerCase(), lead.id);
        }
      }
    }

    skipped = leadRows.length - inserted;

    // Optionally attach to campaign via campaign_leads junction table
    if (campaignIdParam) {
      const campaignRows = Array.from(leadIdMap.entries()).map(([email, leadId]) => ({
        campaign_id: campaignIdParam,
        lead_id: leadId,
      }));

      // Insert in chunks to avoid payload limits (ignore duplicates)
      for (let i = 0; i < campaignRows.length; i += chunkSize) {
        const batch = campaignRows.slice(i, i + chunkSize);
        const { error: campaignError } = await serviceSupabase
          .from("campaign_leads")
          .upsert(batch, {
            onConflict: "campaign_id,lead_id",
            ignoreDuplicates: true,
          });

        if (campaignError) {
          // Log but don't fail - campaign attachment is optional
          console.warn("campaign_leads insert warning:", campaignError.message);
        }
      }
    }

    return NextResponse.json({ inserted, skipped });
  } catch (error: any) {
    console.error("Upload error:", error);
    return NextResponse.json({ error: error.message || "upload_failed" }, { status: 500 });
  }
}
