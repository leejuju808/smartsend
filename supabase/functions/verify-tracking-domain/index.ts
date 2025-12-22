import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { resolveTxt } from "https://deno.land/x/dns@1.0.2/mod.ts";

Deno.serve(async (req) => {
  const url = new URL(req.url);
  const domain = url.searchParams.get("domain");
  if (!domain) {
    return new Response("missing domain", { status: 400 });
  }

  const sbUrl = Deno.env.get("SUPABASE_URL");
  const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!sbUrl || !key) {
    console.error("[verify-tracking-domain] missing Supabase env vars");
    return new Response("server misconfigured", { status: 500 });
  }

  const headers = {
    apikey: key,
    Authorization: `Bearer ${key}`,
    Prefer: "return=representation",
  };

  const lookup = await fetch(
    `${sbUrl}/rest/v1/tracking_domains?select=*&domain=eq.${encodeURIComponent(domain)}`,
    { headers },
  );

  if (!lookup.ok) {
    const text = await lookup.text().catch(() => "");
    console.error("[verify-tracking-domain] lookup error:", lookup.status, text);
    return new Response("lookup failed", { status: 500 });
  }

  const rows = await lookup.json();
  const row = Array.isArray(rows) ? rows[0] : null;
  if (!row) {
    return new Response("unknown domain", { status: 404 });
  }

  let verified = false;

  try {
    const txt = await resolveTxt(domain);
    const flattened = txt.flat();
    verified = flattened.some((value) =>
      value === `smartsend-verification=${row.verification_token}`
    );
  } catch (error) {
    console.error("[verify-tracking-domain] resolveTxt failed:", error);
  }

  const updateBody = JSON.stringify([{
    verified,
    last_checked_at: new Date().toISOString(),
  }]);

  const updateResponse = await fetch(
    `${sbUrl}/rest/v1/tracking_domains?id=eq.${row.id}`,
    {
      method: "PATCH",
      headers: {
        ...headers,
        "Content-Type": "application/json",
      },
      body: updateBody,
    },
  );

  if (!updateResponse.ok) {
    const text = await updateResponse.text().catch(() => "");
    console.error("[verify-tracking-domain] update failed:", text);
  }

  return new Response(
    JSON.stringify({ ok: true, domain, verified }),
    { headers: { "Content-Type": "application/json" } },
  );
});



