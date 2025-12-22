// deno-lint-ignore-file no-explicit-any
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const PIXEL = Uint8Array.from(
  atob("R0lGODlhAQABAPAAAAAAAAAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw=="), // 1x1 gif
  c => c.charCodeAt(0)
);

async function logEvent(partial: any) {
  await supabase.from("delivery_events").insert(partial);
}

async function resolveLink(token: string) {
  const { data, error } = await supabase.from("tracking_links").select("*").eq("token", token).maybeSingle();
  if (error || !data) return null;
  return data;
}

Deno.serve(async (req) => {
  try {
    const url = new URL(req.url);
    const pathname = url.pathname;

    // /t/pixel?lead=&c=&s=
    if (pathname.endsWith("/t/pixel")) {
      const lead_id = url.searchParams.get("lead") || undefined;
      const campaign_id = url.searchParams.get("c") || undefined;
      const step_no = url.searchParams.get("s") ? Number(url.searchParams.get("s")) : undefined;

      // crude UA/IP capture
      const ua = req.headers.get("user-agent") || "";
      const ip = req.headers.get("x-forwarded-for") || "";

      await logEvent({
        event_type: "open",
        lead_id, campaign_id, step_no,
        meta: { ua, ip }
      });

      return new Response(PIXEL, { headers: { "content-type": "image/gif", "cache-control": "no-store" } });
    }

    // /t/r?u=<token>
    if (pathname.endsWith("/t/r")) {
      const token = url.searchParams.get("u");
      if (!token) return new Response("Missing token", { status: 400 });

      const rec = await resolveLink(token);
      if (!rec) return new Response("Not found", { status: 404 });

      // log click
      const ua = req.headers.get("user-agent") || "";
      const ip = req.headers.get("x-forwarded-for") || "";
      await logEvent({
        event_type: "click",
        lead_id: rec.lead_id, campaign_id: rec.campaign_id, step_no: rec.step_no,
        meta: { ua, ip, dest: rec.dest_url, token }
      });

      return Response.redirect(rec.dest_url, 302);
    }

    return new Response("OK", { headers: { "content-type":"text/plain" } });
  } catch (e) {
    return new Response(String(e), { status: 500 });
  }
});

