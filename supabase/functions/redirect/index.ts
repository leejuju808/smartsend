// deno-lint-ignore-file no-explicit-any
import { serve } from "https://deno.land/std@0.224.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

function clientIp(req: Request) {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("cf-connecting-ip") ??
    undefined
  );
}

serve(async (req) => {
  try {
    const url = new URL(req.url);
    const token = url.pathname.replace(/^\/+/, "");
    if (!token || token.length > 64) {
      return new Response("Not found", { status: 404 });
    }

    const { data: link, error } = await supabase
      .from("message_links")
      .select("*")
      .eq("token", token)
      .maybeSingle();
    if (error || !link) {
      return new Response("Not found", { status: 404 });
    }

    const gdpr = url.searchParams.get("gdpr");
    if (gdpr !== "no_track") {
      await supabase.from("click_events").insert({
        account_id: link.account_id,
        campaign_id: link.campaign_id,
        lead_id: link.lead_id,
        message_id: link.message_id,
        token: link.token,
        ip: clientIp(req),
        ua: req.headers.get("user-agent") ?? null,
        referrer: req.headers.get("referer") ?? null,
      });
    }

    if (link.is_unsubscribe) {
      const unsub = new URL(`${Deno.env.get("APP_URL")}/unsubscribe`);
      unsub.searchParams.set("t", link.token);
      return Response.redirect(unsub.toString(), 302);
    }

    return Response.redirect(link.original_url, 302);
  } catch (_e) {
    return new Response("Server error", { status: 500 });
  }
});




