import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Json = Record<string, unknown>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const respond = (body: Json, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

serve(async (req) => {
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return respond({ ok: false, error: "Server misconfigured" }, 500);
  }

  const payload = await req.json().catch(() => null);
  if (!payload) {
    return respond({ ok: false, error: "invalid payload" }, 400);
  }

  const { task_id, assignee } = payload as {
    task_id?: string;
    assignee?: string;
  };

  if (!task_id || !assignee) {
    return respond({ ok: false, error: "missing fields" }, 400);
  }

  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  const { error: taskErr } = await client
    .from("ai_label_tasks")
    .update({ status: "skipped" })
    .eq("id", task_id)
    .neq("status", "labeled");

  if (taskErr) {
    return respond({ ok: false, error: taskErr.message }, 500);
  }

  const { error: finishErr } = await client
    .from("ai_label_assignments")
    .update({ finished_at: new Date().toISOString() })
    .eq("task_id", task_id)
    .eq("assignee", assignee);

  if (finishErr) {
    console.error("assignment finish update failed", finishErr);
  }

  return respond({ ok: true });
});

















