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

  const { assignee } = await req.json().catch(() => ({}));
  if (!assignee) {
    return respond({ ok: false, error: "assignee required" }, 400);
  }

  const client = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false },
  });

  for (let attempt = 0; attempt < 5; attempt++) {
    const { data: task, error: taskErr } = await client
      .from("ai_label_tasks")
      .select("*")
      .eq("status", "queued")
      .order("priority", { ascending: true })
      .order("created_at", { ascending: true })
      .limit(1)
      .maybeSingle();

    if (taskErr) {
      return respond({ ok: false, error: taskErr.message }, 500);
    }

    if (!task) {
      return respond({ ok: false, error: "no tasks" }, 200);
    }

    const { data: updatedTask, error: updateErr } = await client
      .from("ai_label_tasks")
      .update({ status: "assigned" })
      .eq("id", task.id)
      .eq("status", "queued")
      .select("*")
      .maybeSingle();

    if (updateErr) {
      return respond({ ok: false, error: updateErr.message }, 500);
    }

    if (!updatedTask) {
      // Lost the race, retry
      continue;
    }

    const { error: assignErr } = await client
      .from("ai_label_assignments")
      .insert({ task_id: updatedTask.id, assignee });

    if (assignErr) {
      await client
        .from("ai_label_tasks")
        .update({ status: "queued" })
        .eq("id", updatedTask.id);
      return respond({ ok: false, error: assignErr.message }, 500);
    }

    return respond({ ok: true, task: updatedTask });
  }

  return respond({ ok: false, error: "unable to assign task" }, 409);
});

















