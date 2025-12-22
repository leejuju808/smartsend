// @ts-nocheck
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL");
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
  console.error("Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY");
}

const supabase = createClient(SUPABASE_URL!, SUPABASE_SERVICE_ROLE_KEY!, {
  auth: { persistSession: false },
});

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

Deno.serve(async (req) => {
  try {
    if (req.method === "OPTIONS") {
      return new Response(null, {
        status: 204,
        headers: {
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "POST, OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type, Authorization",
        },
      });
    }

    if (req.method !== "POST") {
      return jsonResponse({ error: "method not allowed" }, 405);
    }

    const payload = await req.json().catch(() => null);
    if (!payload) {
      return jsonResponse({ error: "invalid json" }, 400);
    }

    const { label, tone, success } = payload as {
      label?: string;
      tone?: string;
      success?: boolean;
    };

    if (!label || !tone || typeof success !== "boolean") {
      return jsonResponse(
        { error: "label, tone, and success boolean required" },
        400,
      );
    }

    const column = success ? "success_count" : "fail_count";

    const { error } = await supabase.rpc("increment_nudge_stats", {
      label_input: label,
      tone_input: tone,
      column_input: column,
    });

    if (error) {
      console.error("increment_nudge_stats error", error);
      return jsonResponse({ error: error.message }, 500);
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    console.error("nudge-feedback unexpected error", message);
    return jsonResponse({ error: message }, 500);
  }
});
















