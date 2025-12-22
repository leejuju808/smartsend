// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { cleanBody } from "../_shared/cleaner.ts";

const SUPABASE_URL = Deno.env.get("NEXT_PUBLIC_SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CRON_SECRET = Deno.env.get("CRON_SECRET")!;
const BATCH = 100;

function sb() {
  return createClient(SUPABASE_URL, SERVICE_KEY, {
    auth: { persistSession: false },
  });
}

Deno.serve(async (req) => {
  if (CRON_SECRET && req.headers.get("x-cron-secret") !== CRON_SECRET) {
    return new Response("Unauthorized", { status: 401 });
  }
  const client = sb();

  // 1) pull uncleaned bodies
  const { data: bodies, error } = await client
    .from("message_bodies")
    .select("id,account_id,provider,provider_message_id,body_text,body_html,cleaned_at")
    .is("cleaned_at", null)
    .order("created_at", { ascending: true })
    .limit(BATCH);
  if (error) return new Response(error.message, { status: 500 });

  let n = 0;
  for (const b of bodies ?? []) {
    const { cleaned, preview } = cleanBody({ text: b.body_text, html: b.body_html });

    await client
      .from("message_bodies")
      .update({
        clean_text: cleaned,
        clean_html: null, // keep only text for search/preview; can render HTML raw if you want
        cleaned_at: new Date().toISOString(),
      })
      .eq("id", b.id);

    // 2) update normalized_messages.preview_clean for this provider message
    await client
      .from("normalized_messages")
      .update({
        preview_clean: preview ?? null,
      })
      .eq("account_id", b.account_id)
      .eq("provider", b.provider)
      .eq("provider_message_id", b.provider_message_id);

    n++;
  }

  return new Response(JSON.stringify({ ok: true, cleaned: n }), {
    headers: { "content-type": "application/json" },
  });
});


