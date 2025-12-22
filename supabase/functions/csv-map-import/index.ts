import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

function guessCountry(email: string | null | undefined): string | null {
  if (!email) return null;
  const domain = email.split("@")[1]?.toLowerCase() ?? "";
  if (domain.endsWith(".ca")) return "CA";
  if (domain.endsWith(".co.uk")) return "GB";
  if (domain.endsWith(".au")) return "AU";
  if (domain.endsWith(".de")) return "DE";
  if (domain.endsWith(".fr")) return "FR";
  return "US";
}

function guessTz(country: string | null | undefined): string {
  const map: Record<string, string> = {
    US: "America/New_York",
    CA: "America/Toronto",
    GB: "Europe/London",
    AU: "Australia/Sydney",
    DE: "Europe/Berlin",
    FR: "Europe/Paris",
  };
  if (!country) return "America/New_York";
  return map[country] ?? "America/New_York";
}

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const { import_id, campaign_id, mapping } = await req.json();
    if (!import_id || !campaign_id || !mapping) {
      return new Response("Missing params", { status: 400 });
    }

    const sb = createClient(SB_URL, SRK, { auth: { persistSession: false } });
    const { data: imp, error: fetchError } = await sb
      .from("lead_import_staging")
      .select("rows")
      .eq("id", import_id)
      .single();

    if (fetchError || !imp) {
      return new Response("Staging not found", { status: 404 });
    }

    const rows = (imp.rows as Record<string, string>[]).map((r) => {
      const email = r[mapping.email]?.trim()?.toLowerCase() ?? "";
      const first_name = r[mapping.first_name]?.trim() ?? null;
      const last_name = r[mapping.last_name]?.trim() ?? null;
      const company = r[mapping.company]?.trim() ?? null;
      const country = guessCountry(email);
      const tz = guessTz(country);
      return { email, first_name, last_name, company, country, tz };
    });

    const { data: inserted, error: rpcError } = await sb.rpc("insert_leads_bulk", {
      p_campaign: campaign_id,
      p_rows: rows,
    });

    if (rpcError) {
      throw new Error(rpcError.message);
    }

    return new Response(JSON.stringify({ ok: true, inserted }), {
      headers: { "content-type": "application/json" },
    });
  } catch (err) {
    return new Response((err as Error).message, { status: 500 });
  }
});





