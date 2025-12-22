// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

const supabase = createClient(supabaseUrl, serviceKey, {
  auth: { persistSession: false }
});

type VariantMap = Record<string, { prompt?: string; score?: number }>;

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return new Response("Method Not Allowed", { status: 405 });
  }

  try {
    const body = await req.json();
    const ownerId = String(body?.owner_id ?? "").trim();
    const runId = String(body?.run_id ?? "").trim();
    const choose = String(body?.choose ?? "v1");
    const label = String(body?.label ?? "").trim();
    const tone = String(body?.tone ?? "").trim();

    if (!ownerId || !runId || !label || !tone) {
      return new Response(JSON.stringify({ error: "Missing params" }), {
        status: 400,
        headers: { "content-type": "application/json" }
      });
    }

    const { data: run, error: runError } = await supabase
      .from("rewrite_runs")
      .select("owner_id, preset_id, variant")
      .eq("id", runId)
      .maybeSingle();

    if (runError) throw new Error(runError.message);
    if (!run || run.owner_id !== ownerId) {
      return new Response(JSON.stringify({ error: "Run not found" }), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    }

    const variant = (run.variant ?? {}) as VariantMap;
    const picked = variant?.[choose]?.prompt ?? "";

    if (!picked) {
      return new Response(JSON.stringify({ error: "Variant not found" }), {
        status: 404,
        headers: { "content-type": "application/json" }
      });
    }

    const insert = await supabase.from("nudge_tuner").insert([
      {
        owner_id: ownerId,
        label,
        tone,
        prompt: picked,
        is_active: true,
        weight: 1.0
      }
    ]);

    if (insert.error) {
      throw new Error(insert.error.message);
    }

    const { error: updateError } = await supabase
      .from("rewrite_runs")
      .update({ chosen_key: choose, promoted: true })
      .eq("id", runId);

    if (updateError) throw new Error(updateError.message);

    return new Response(JSON.stringify({ ok: true }), {
      status: 200,
      headers: { "content-type": "application/json" }
    });
  } catch (error: any) {
    console.error("template-promote error", error);
    return new Response(
      JSON.stringify({ error: error?.message ?? "Unexpected error" }),
      {
        status: 500,
        headers: { "content-type": "application/json" }
      }
    );
  }
});

