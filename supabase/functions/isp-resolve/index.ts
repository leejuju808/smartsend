import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
const supabaseKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

Deno.serve(async (req) => {
  const supa = createClient(supabaseUrl, supabaseKey);

  try {
    const { domain } = await req.json();
    const ttlMs = 1000 * 60 * 60 * 24 * 7; // 7 days

    const { data: reg } = await supa.from("isp_registry").select("*");

    const direct = (reg || []).find((r: any) =>
      (r.domain_patterns || []).some((p: string) => domain.endsWith(p))
    );

    if (direct) {
      await upsertCache(supa, domain, domain, direct.key);
      return json({
        ok: true,
        isp: direct.key,
        mx_host: domain,
        source: "domain",
      });
    }

    const { data: cache } = await supa
      .from("mx_cache")
      .select("*")
      .eq("domain", domain)
      .maybeSingle();

    if (
      cache &&
      Date.now() - new Date(cache.fetched_at).getTime() < ttlMs
    ) {
      return json({
        ok: true,
        isp: cache.isp_key,
        mx_host: cache.mx_host,
        source: "cache",
      });
    }

    const doh = await fetch(
      `https://cloudflare-dns.com/dns-query?name=${encodeURIComponent(domain)}&type=MX`,
      {
        headers: { Accept: "application/dns-json" },
      },
    ).then((r) => r.json()).catch(() => null);

    const mx = doh?.Answer?.find((a: any) => a.type === 15)?.data?.split(" ")
      .pop()?.replace(/\.$/, "") || domain;

    const match = (reg || []).find((r: any) =>
      (r.mx_patterns || []).some((p: string) => mx.endsWith(p))
    );

    const isp = match?.key || "other";

    await upsertCache(supa, domain, mx, isp);

    return json({ ok: true, isp, mx_host: mx, source: "mx" });
  } catch (error) {
    return json({ ok: false, error: String(error) }, 500);
  }
});

async function upsertCache(
  supa: any,
  domain: string,
  mx_host: string,
  isp_key: string,
) {
  await supa.from("mx_cache").upsert({
    domain,
    mx_host,
    isp_key,
    fetched_at: new Date().toISOString(),
  });
}

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });
}

