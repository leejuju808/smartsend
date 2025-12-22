import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase2 = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  try {
    const { lead_ids } = await req.json();
    if (!Array.isArray(lead_ids) || lead_ids.length === 0) return new Response(JSON.stringify({ error: "lead_ids required" }), { status: 400 });

    // Select failed rows for those leads where attempt_count < max_attempts
    const { data: failed, error } = await supabase2
      .from("send_queue")
      .select("id, lead_id, status, attempt_count, max_attempts")
      .in("lead_id", lead_ids)
      .eq("status", "failed");
    if (error) throw error;

    const eligible = (failed ?? []).filter((r) => (r.attempt_count ?? 0) < (r.max_attempts ?? 3));
    if (eligible.length === 0) return new Response(JSON.stringify({ updated: 0, skipped: (failed ?? []).length }), { headers: { "content-type": "application/json" } });

    const ids = eligible.map((r) => r.id);
    const { error: upErr } = await supabase2.from("send_queue").update({ status: "queued", attempt_count: (null as unknown as number) })
      // attempt_count increment will occur when your sender picks it up; if you want, increment now:
      .in("id", ids);
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ updated: ids.length, skipped: (failed ?? []).length - ids.length }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500 });
  }
});

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase2 = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  try {
    const { lead_ids } = await req.json();
    if (!Array.isArray(lead_ids) || lead_ids.length === 0) return new Response(JSON.stringify({ error: "lead_ids required" }), { status: 400 });

    // Select failed rows for those leads where attempt_count < max_attempts
    const { data: failed, error } = await supabase2
      .from("send_queue")
      .select("id, lead_id, status, attempt_count, max_attempts")
      .in("lead_id", lead_ids)
      .eq("status", "failed");
    if (error) throw error;

    const eligible = (failed ?? []).filter((r) => (r.attempt_count ?? 0) < (r.max_attempts ?? 3));
    if (eligible.length === 0) return new Response(JSON.stringify({ updated: 0, skipped: (failed ?? []).length }), { headers: { "content-type": "application/json" } });

    const ids = eligible.map((r) => r.id);
    const { error: upErr } = await supabase2.from("send_queue").update({ status: "queued", attempt_count: (null as unknown as number) })
      // attempt_count increment will occur when your sender picks it up; if you want, increment now:
      .in("id", ids);
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ updated: ids.length, skipped: (failed ?? []).length - ids.length }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String(e?.message ?? e) }), { status: 500 });
  }
});

import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase2 = createClient(Deno.env.get("SUPABASE_URL")!, Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!);

serve(async (req) => {
  if (req.method !== "POST") return new Response("Method Not Allowed", { status: 405 });
  try {
    const { lead_ids } = await req.json();
    if (!Array.isArray(lead_ids) || lead_ids.length === 0) return new Response(JSON.stringify({ error: "lead_ids required" }), { status: 400 });

    const { data: failed, error } = await supabase2
      .from("send_queue")
      .select("id, lead_id, status, attempt_count, max_attempts")
      .in("lead_id", lead_ids)
      .eq("status", "failed");
    if (error) throw error;

    const eligible = (failed ?? []).filter((r) => (r.attempt_count ?? 0) < (r.max_attempts ?? 3));
    if (eligible.length === 0) return new Response(JSON.stringify({ updated: 0, skipped: (failed ?? []).length }), { headers: { "content-type": "application/json" } });

    const ids = eligible.map((r) => r.id);
    const { error: upErr } = await supabase2
      .from("send_queue")
      .update({ status: "queued", attempt_count: (null as unknown as number) })
      .in("id", ids);
    if (upErr) throw upErr;

    return new Response(JSON.stringify({ updated: ids.length, skipped: (failed ?? []).length - ids.length }), { headers: { "content-type": "application/json" } });
  } catch (e) {
    return new Response(JSON.stringify({ error: String((e as any)?.message ?? e) }), { status: 500 });
  }
});


