import "jsr:@supabase/functions@1.4.0/types";
import { createClient } from "jsr:@supabase/supabase-js";

const SB_URL = Deno.env.get("SUPABASE_URL")!;
const SRK = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

type RunReq = { job_id: string; user_id: string; campaign_id?: string };

function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) {
    out.push(arr.slice(i, i + size));
  }
  return out;
}

Deno.serve(async (req) => {
  const sb = createClient(SB_URL, SRK);
  const { job_id, user_id, campaign_id } = await req.json() as RunReq;

  await sb.from("import_jobs").update({ status: "running" }).eq("id", job_id);

  const { data: rows } = await sb
    .from("import_rows")
    .select("id,normalized")
    .eq("job_id", job_id)
    .eq("valid", true)
    .limit(5000);

  let imported = 0;
  for (const group of chunk(rows ?? [], 200)) {
    for (const r of group) {
      if (!r.normalized) continue;
      await sb.rpc("upsert_lead_from_json", {
        p_user: user_id,
        p_campaign: campaign_id ?? null,
        p_payload: r.normalized,
      });
      imported++;
    }
  }

  await sb.from("import_jobs").update({ status: "done", good_rows: imported }).eq("id", job_id);

  return new Response(JSON.stringify({ ok: true, imported }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
});











