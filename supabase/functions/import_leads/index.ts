import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type LeadRow = { email: string; first_name?: string; last_name?: string; company?: string; meta?: Record<string, any> };

function isValidEmail(email: string | undefined) {
  if (!email) return false;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

serve(async (req) => {
  try {
    const ADMIN_TOKEN = Deno.env.get("ADMIN_TOKEN");
    if (ADMIN_TOKEN) {
      const auth = req.headers.get("x-admin-token");
      if (auth !== ADMIN_TOKEN) {
        return new Response(JSON.stringify({ error: "Unauthorized" }), { status: 401 });
      }
    }

    const { campaign_id, rows } = await req.json();
    if (!campaign_id || !Array.isArray(rows)) {
      return new Response(JSON.stringify({ error: "Invalid payload" }), { status: 400 });
    }

    const supabase = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

    const cleaned: LeadRow[] = [];
    const errors: Array<Record<string, any>> = [];

    for (let i = 0; i < rows.length; i++) {
      const r = rows[i] as Record<string, any>;
      const email = String(r.email || "").trim();
      const first_name = r.first_name?.toString()?.trim() || undefined;
      const last_name = r.last_name?.toString()?.trim() || undefined;
      const company = r.company?.toString()?.trim() || undefined;
      const meta = r.meta && typeof r.meta === 'object' ? r.meta : {};

      if (!isValidEmail(email)) {
        errors.push({ row: i + 1, email: r.email ?? "", reason: "Invalid or missing email" });
        continue;
      }

      cleaned.push({ email: email.toLowerCase(), first_name, last_name, company, meta });
    }

    const chunkSize = 1000;
    let inserted = 0;

    for (let i = 0; i < cleaned.length; i += chunkSize) {
      const chunk = cleaned.slice(i, i + chunkSize).map((c) => ({
        ...c,
        campaign_id,
        status: 'new',
      }));

      const { error } = await supabase.from("leads").insert(chunk, { count: "exact" }).select("id");

      if (error) {
        const duplicateEmails = chunk.map((c) => c.email);
        for (const d of duplicateEmails) {
          errors.push({ row: null, email: d, reason: "Duplicate (campaign + email unique)" });
        }
      } else {
        inserted += chunk.length;
      }
    }

    return new Response(JSON.stringify({ inserted, errors }), { status: 200, headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: e?.message ?? String(e) }), { status: 500 });
  }
});


