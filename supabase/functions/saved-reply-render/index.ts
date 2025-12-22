import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  const auth = req.headers.get("Authorization");
  if (!auth) {
    return new Response("Unauthorized", { status: 401 });
  }

  let payload: { thread_id?: string; saved_reply_id?: string };
  try {
    payload = await req.json();
  } catch (_err) {
    return new Response("Invalid JSON", { status: 400 });
  }

  const { thread_id, saved_reply_id } = payload;
  if (!thread_id || !saved_reply_id) {
    return new Response("Missing params", { status: 400 });
  }

  const sb = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_ANON_KEY")!,
    {
      global: { headers: { Authorization: auth } },
    }
  );

  const { data: thread, error: threadError } = await sb
    .from("inbox_threads")
    .select("id, campaign_id, lead_id")
    .eq("id", thread_id)
    .single();

  if (threadError || !thread) {
    return new Response("Thread not found", { status: 404 });
  }

  const { data, error } = await sb.rpc("render_saved_reply", {
    p_saved_reply: saved_reply_id,
    p_campaign: thread.campaign_id,
    p_lead: thread.lead_id,
  });

  if (error || !data) {
    return new Response(error?.message || "Render failed", { status: 400 });
  }

  const rendered = Array.isArray(data) ? data[0] : data;

  return new Response(JSON.stringify(rendered), {
    headers: { "content-type": "application/json" },
  });
});







