import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import Papa from "https://esm.sh/papaparse@5.4.1";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const MAX_ROWS = 10_000;
const BATCH_SIZE = 1000;

// Simple email validation regex
function isValidEmail(email: string): boolean {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(email.toLowerCase().trim());
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const formData = await req.formData();
    const file = formData.get("file") as File | null;
    const campaignId = formData.get("campaign_id") as string;
    const mappingRaw = formData.get("mapping") as string | null;

    if (!file || !campaignId || !mappingRaw) {
      return new Response(
        JSON.stringify({ error: "Missing file, campaign_id, or mapping" }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // Parse CSV
    const csvText = await file.text();
    const parsed = Papa.parse<Record<string, string>>(csvText, {
      header: true,
      skipEmptyLines: true,
      transform: (v) => (typeof v === "string" ? v.trim() : v),
    });

    const rows = parsed.data;

    if (rows.length > MAX_ROWS) {
      return new Response(
        JSON.stringify({ error: `Exceeds max rows (${MAX_ROWS})` }),
        { status: 400, headers: { "Content-Type": "application/json", ...corsHeaders } }
      );
    }

    const mapping = JSON.parse(mappingRaw) as Record<string, string>;

    // Validate and clean rows
    const errors: { row: number; error: string }[] = [];
    const cleaned: any[] = [];
    const seen = new Set<string>();

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i];
      const emailCol = mapping.email;
      const fnCol = mapping.first_name;
      const lnCol = mapping.last_name;
      const compCol = mapping.company;

      const email = (r[emailCol] || "").trim().toLowerCase();

      if (!email) {
        errors.push({ row: i + 2, error: "Missing email" });
        continue;
      }

      if (!isValidEmail(email)) {
        errors.push({ row: i + 2, error: "Invalid email format" });
        continue;
      }

      const dedupeKey = `${campaignId}:${email}`;
      if (seen.has(dedupeKey)) {
        errors.push({ row: i + 2, error: "Duplicate within file" });
        continue;
      }

      seen.add(dedupeKey);

      cleaned.push({
        campaign_id: campaignId,
        email,
        first_name: fnCol ? String(r[fnCol] || "").trim() : null,
        last_name: lnCol ? String(r[lnCol] || "").trim() : null,
        company: compCol ? String(r[compCol] || "").trim() : null,
        status: "new",
      });
    }

    // Insert in batches with ON CONFLICT DO NOTHING (skip existing duplicates)
    let inserted = 0;
    let skipped_duplicates = 0;

    for (let i = 0; i < cleaned.length; i += BATCH_SIZE) {
      const chunk = cleaned.slice(i, i + BATCH_SIZE);
      const { error, count } = await supabase
        .from("leads")
        .insert(chunk, { count: "exact" })
        .select("id", { count: "exact" });

      if (error) {
        // Check if error is due to unique violation
        const isUniqueViolation = error.message.includes("unique") || error.code === "23505";
        
        if (isUniqueViolation) {
          // Query existing emails to determine which to skip
          const chunkEmails = chunk.map(c => c.email);
          const { data: existing } = await supabase
            .from("leads")
            .select("email")
            .eq("campaign_id", campaignId)
            .in("email", chunkEmails);
          
          const existingEmails = new Set((existing || []).map(e => e.email.toLowerCase()));
          const newChunk = chunk.filter(c => !existingEmails.has(c.email.toLowerCase()));
          
          if (newChunk.length > 0) {
            const { count: finalCount } = await supabase
              .from("leads")
              .insert(newChunk, { count: "exact" })
              .select("id", { count: "exact" });
            
            inserted += finalCount || 0;
            skipped_duplicates += chunk.length - (finalCount || 0);
          } else {
            skipped_duplicates += chunk.length;
          }
        } else {
          // Other error - log and skip chunk
          console.error("Batch insert error:", error);
          for (let j = 0; j < chunk.length; j++) {
            errors.push({ row: 0, error: `Batch error: ${error.message}` });
          }
        }
      } else {
        inserted += count || 0;
      }
    }

    // If we have failures, write an error CSV to storage and sign a URL
    let error_csv_url: string | null = null;
    if (errors.length > 0) {
      const header = "row,error\n";
      const body = errors.map((e) => `${e.row},"${e.error.replaceAll('"', '""')}"`).join("\n");
      const blob = new Blob([header + body], { type: "text/csv" });
      const timestamp = Date.now();
      const errKey = `imports/${campaignId}/${timestamp}.errors.csv`;

      const { error: upErr } = await supabase.storage.from("app-uploads").upload(errKey, blob, {
        contentType: "text/csv",
        upsert: true,
      });

      if (!upErr) {
        const { data: signed } = await supabase.storage.from("app-uploads").createSignedUrl(errKey, 60 * 60 * 24);
        error_csv_url = signed?.signedUrl ?? null;
      }
    }

    return new Response(
      JSON.stringify({ inserted, skipped_duplicates, failed: errors.length, error_csv_url }),
      { status: 200, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  } catch (e: any) {
    console.error("Import error:", e);
    return new Response(
      JSON.stringify({ message: e.message || "server error" }),
      { status: 500, headers: { "Content-Type": "application/json", ...corsHeaders } }
    );
  }
});

