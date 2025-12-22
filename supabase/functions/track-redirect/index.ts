// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

async function findLink(code: string) {
  const { data, error } = await supabase
    .from("tracked_links")
    .select("id, account_id, queue_id, original_url")
    .eq("short_code", code)
    .maybeSingle();

  if (error) {
    console.error("tracked_links lookup error", error);
  }
  return data;
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const code = url.pathname.split("/").pop() ?? "";
    if (!code) {
      return new Response("Not found", { status: 404 });
    }

    const link = await findLink(code);
    if (!link) {
      return new Response("Not found", { status: 404 });
    }

    const { data: queueRow, error: queueErr } = await supabase
      .from("send_queue")
      .select("account_id, lead_id, campaign_id")
      .eq("id", link.queue_id)
      .maybeSingle();

    if (queueErr) {
      console.error("send_queue lookup error", queueErr);
    }

    const ipHeader = req.headers.get("x-forwarded-for") ?? "";
    const userAgent = req.headers.get("user-agent") || null;
    const referrer = req.headers.get("referer") || null;
    const ip = ipHeader.split(",")[0]?.trim() || null;

    const { error: eventErr } = await supabase.from("tracking_events").insert({
      account_id: link.account_id,
      queue_id: link.queue_id,
      lead_id: queueRow?.lead_id ?? null,
      campaign_id: queueRow?.campaign_id ?? null,
      kind: "click",
      link_id: link.id,
      ua: userAgent,
      ip,
      referrer,
    });

    if (eventErr) {
      console.error("tracking_events insert error", eventErr);
    }

    const { error: incErr } = await supabase.rpc("safe_inc_click", {
      p_link_id: link.id,
    });

    if (incErr) {
      console.error("safe_inc_click error", incErr);
    }

    return new Response(null, {
      status: 302,
      headers: {
        Location: link.original_url,
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    console.error("track-redirect error", error);
    return new Response("Err", { status: 500 });
  }
});

