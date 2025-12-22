import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { assertBearer } from "../_shared/middleware.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL) throw new Error("Missing SUPABASE_URL");
if (!SUPABASE_SERVICE_ROLE_KEY) throw new Error("Missing SUPABASE_SERVICE_ROLE_KEY");

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

type NetJob = {
  id: string;
  url: string;
  headers: Record<string, string> | null;
  body: string | null;
};

async function finishJob(id: string, ok: boolean, errorText: string | null) {
  const { error } = await supabase.rpc("net_finish_job", {
    p_id: id,
    p_ok: ok,
    p_error: errorText,
  });
  if (error) {
    console.error("net_finish_job failed", { id, error });
  }
}

export async function handler(req: Request) {
  const env = Deno.env.toObject();
  try {
    assertBearer(req, env);
  } catch (err) {
    if (err instanceof Response) {
      return err;
    }
    throw err;
  }

  const { data, error } = await supabase.rpc("net_claim_job");
  if (error) {
    console.error("net_claim_job error", error);
    return new Response(JSON.stringify({ ok: false, error: "claim_failed" }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }

  const job = Array.isArray(data) ? (data[0] as NetJob | undefined) : (data as NetJob | null);
  if (!job) {
    return new Response(JSON.stringify({ ok: true, idle: true }), {
      status: 200,
      headers: { "Content-Type": "application/json" },
    });
  }

  try {
    const response = await fetch(job.url, {
      method: "POST",
      headers: job.headers ?? undefined,
      body: job.body ?? undefined,
      redirect: "follow",
    });

    if (!response.ok) {
      const txt = await response.text();
      await finishJob(job.id, false, `HTTP ${response.status}: ${txt.slice(0, 500)}`);
      return new Response(JSON.stringify({ ok: false, job: job.id, status: response.status }), {
        status: 200,
        headers: { "Content-Type": "application/json" },
      });
    }

    await finishJob(job.id, true, null);
  } catch (err) {
    await finishJob(job.id, false, String(err).slice(0, 500));
  }

  return new Response(JSON.stringify({ ok: true }), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

Deno.serve(handler);







