// app/api/track/open.gif/route.ts
import { NextRequest } from "next/server";
import { createClient } from "@supabase/supabase-js";

const sb = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

const GIF = Uint8Array.from([71,73,70,56,57,97,1,0,1,0,128,0,0,0,0,0,255,255,255,33,249,4,1,0,0,0,0,44,0,0,0,0,1,0,1,0,0,2,2,68,1,0,59]);

export async function GET(req: NextRequest) {
  const j = new URL(req.url).searchParams.get("j");
  if (j) {
    const { data: job } = await sb.from("email_jobs").select("id").eq("tracking_token", j).single();
    if (job) {
      await sb.from("email_events").insert({ job_id: job.id, kind: "open", meta: {} });
      await sb.rpc("mark_first_open", { p_job_id: job.id }).catch(() => {});
    }
  }
  return new Response(GIF, { headers: { "content-type": "image/gif", "cache-control": "no-store" } });
}