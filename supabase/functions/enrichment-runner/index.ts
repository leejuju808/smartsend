// deno deploy target
import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

type Job = {
  id: number;
  lead_id: string;
  account_id: string;
  attempt: number;
  max_attempts: number;
  force: boolean;
  priority: number;
};

type Enrichment = Partial<{
  title: string;
  seniority: string;
  linkedin_url: string;
  company_name: string;
  company_domain: string;
  company_website: string;
  company_size: string;
  company_employee_count: number;
  industry: string;
  location: string;
  country: string;
  tech_tags: string[];
  social_tags: string[];
  extras: Record<string, unknown>;
  vendor: string;
  vendor_confidence: number;
  vendor_meta: Record<string, unknown>;
}>;

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const CLEARBIT_KEY = Deno.env.get("CLEARBIT_KEY");
const PDL_KEY = Deno.env.get("PDL_KEY");
const PROXYCURL_KEY = Deno.env.get("PROXYCURL_KEY");
const WAPPALYZER_KEY = Deno.env.get("WAPPALYZER_KEY");

const HOLD_MINUTES = 10;
const REFRESH_DAYS = 30;

const sb = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
  auth: { persistSession: false },
});

Deno.serve(async (req) => {
  const { limit = 25 } = (await req.json().catch(() => ({}))) as {
    limit?: number;
  };

  // opportunistically enqueue stale leads before we pick jobs
  await sb
    .rpc("enqueue_stale_enrichments", { p_limit: Math.min(limit * 4, 500) })
    .catch(() => null);

  const { data: picked, error: pickErr } = await sb.rpc("pick_enrichment_jobs", {
    p_limit: limit,
    p_hold_minutes: HOLD_MINUTES,
  });
  if (pickErr) {
    return new Response(pickErr.message, { status: 500 });
  }

  for (const job of (picked ?? []) as Job[]) {
    await processJob(job).catch(async (err) => {
      const nextAttempt = job.attempt + 1;
      const nextStatus = nextAttempt >= job.max_attempts ? "failed" : "queued";
      await sb
        .from("lead_enrichment_jobs")
        .update({
          status: nextStatus,
          picked_at: null,
          attempt: nextAttempt,
          error: String(err),
          priority:
            nextStatus === "queued"
              ? Math.min(job.priority + Math.pow(2, Math.min(nextAttempt, 6)), 1000)
              : job.priority,
        })
        .eq("id", job.id);
    });
  }

  return new Response(
    JSON.stringify({ processed: picked?.length ?? 0 }),
    { headers: { "content-type": "application/json" } },
  );
});

async function processJob(job: Job) {
  await sb.from("lead_enrichment_jobs").update({ status: "running" }).eq("id", job.id);

  const { data: leadRow, error: leadErr } = await sb
    .from("leads")
    .select("id,email,first_name,last_name,company_domain,account_id")
    .eq("id", job.lead_id)
    .single();
  if (leadErr || !leadRow) throw new Error("lead_not_found");

  if (!job.force) {
    const { data: cached } = await sb
      .from("lead_enrichments")
      .select("last_refreshed_at, refresh_after")
      .eq("lead_id", job.lead_id)
      .maybeSingle();

    if (cached?.refresh_after && new Date(cached.refresh_after) > new Date()) {
      await sb
        .from("lead_enrichment_jobs")
        .update({
          status: "done",
          finished_at: new Date().toISOString(),
          error: "fresh_enough",
        })
        .eq("id", job.id);
      return;
    }
  }

  const candidates: Array<Enrichment | null> = [];
  candidates.push(await safe(() => enrichFromDomainAutocomplete(leadRow)));

  if (CLEARBIT_KEY) candidates.push(await safe(() => enrichClearbit(leadRow)));
  if (PDL_KEY) candidates.push(await safe(() => enrichPDL(leadRow)));
  if (PROXYCURL_KEY) candidates.push(await safe(() => enrichProxycurl(leadRow)));

  const best = chooseBest(candidates.filter(Boolean) as Enrichment[]);

  if (best?.company_domain && WAPPALYZER_KEY) {
    const tech = await safe(() => enrichWappalyzer(best.company_domain!));
    if (tech?.tech_tags?.length) {
      best.tech_tags = Array.from(
        new Set([...(best.tech_tags ?? []), ...tech.tech_tags]),
      );
      best.extras = {
        ...(best.extras ?? {}),
        wappalyzer: tech.extras?.wappalyzer ?? tech.extras ?? {},
      };
    }
  }

  const nowIso = new Date().toISOString();
  const refreshAfter = new Date(
    Date.now() + REFRESH_DAYS * 24 * 60 * 60 * 1000,
  ).toISOString();

  const payload = {
    lead_id: job.lead_id,
    email: leadRow.email,
    first_name: leadRow.first_name,
    last_name: leadRow.last_name,
    title: best?.title ?? null,
    seniority: best?.seniority ?? null,
    linkedin_url: best?.linkedin_url ?? null,
    company_name: best?.company_name ?? null,
    company_domain: best?.company_domain ?? leadRow.company_domain ?? null,
    company_website:
      best?.company_website ??
      (best?.company_domain ? `https://${best.company_domain}` : null),
    company_size: best?.company_size ?? null,
    company_employee_count: best?.company_employee_count ?? null,
    industry: best?.industry ?? null,
    location: best?.location ?? null,
    country: best?.country ?? null,
    tech_tags: best?.tech_tags ?? [],
    social_tags: best?.social_tags ?? [],
    extras: best?.extras ?? {},
    vendor: best?.vendor ?? null,
    vendor_confidence: best?.vendor_confidence ?? null,
    vendor_meta: best?.vendor_meta ?? {},
    last_refreshed_at: nowIso,
    refresh_after: refreshAfter,
    is_stale: false,
  };

  await sb.from("lead_enrichments").upsert(payload, { onConflict: "lead_id" });

  await sb
    .from("lead_enrichment_jobs")
    .update({ status: "done", finished_at: nowIso, error: null })
    .eq("id", job.id);
}

function chooseBest(list: Enrichment[]): Enrichment | null {
  if (!list.length) return null;
  return [...list].sort(
    (a, b) => (b.vendor_confidence ?? 0) - (a.vendor_confidence ?? 0),
  )[0];
}

async function safe<T>(fn: () => Promise<T>): Promise<T | null> {
  try {
    return await fn();
  } catch (_err) {
    return null;
  }
}

async function enrichFromDomainAutocomplete(lead: any): Promise<Enrichment> {
  const domain =
    lead.company_domain ??
    (lead.email?.includes("@") ? lead.email.split("@")[1] : undefined);
  if (!domain) {
    return { vendor: "heuristic", vendor_confidence: 0.2 };
  }

  return {
    company_domain: domain.toLowerCase(),
    company_website: `https://${domain}`,
    vendor: "heuristic",
    vendor_confidence: 0.2,
    extras: { source: "email_domain" },
  };
}

async function enrichClearbit(lead: any): Promise<Enrichment> {
  const domain = lead.company_domain ?? lead.email?.split("@")[1];
  if (!domain) throw new Error("clearbit_no_domain");

  const resp = await fetch(
    `https://company.clearbit.com/v2/companies/find?domain=${encodeURIComponent(domain)}`,
    {
      headers: { Authorization: `Bearer ${CLEARBIT_KEY}` },
    },
  );

  if (resp.status === 404) throw new Error("clearbit_not_found");
  if (!resp.ok) throw new Error(`clearbit_http_${resp.status}`);

  const data = await resp.json();

  return {
    company_name: data.name,
    company_domain: data.domain,
    company_website: data.site?.url ?? (data.domain ? `https://${data.domain}` : null),
    industry: data.category?.industry,
    company_size: data.metrics?.employees ? sizeBucket(data.metrics.employees) : null,
    company_employee_count: data.metrics?.employees ?? null,
    location: data.location,
    country: data.geo?.country,
    tech_tags: Array.isArray(data?.tech) ? data.tech : data?.tech ? Object.keys(data.tech) : [],
    vendor: "clearbit",
    vendor_confidence: 0.85,
    vendor_meta: { id: data.id },
  };
}

async function enrichPDL(lead: any): Promise<Enrichment> {
  const email = lead.email;
  if (!email) throw new Error("pdl_no_email");

  const resp = await fetch("https://api.peopledatalabs.com/v5/person/enrich", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Api-Key": PDL_KEY!,
    },
    body: JSON.stringify({ email, titlecase: true }),
  });
  if (!resp.ok) throw new Error(`pdl_http_${resp.status}`);

  const data = await resp.json();
  const comp = data?.data?.job_company ?? {};
  const loc = data?.data?.location ?? {};

  return {
    title: data?.data?.job_title,
    seniority: data?.data?.job_seniority,
    linkedin_url: data?.data?.linkedin_url,
    company_name: comp?.name,
    company_domain: comp?.website?.replace(/^https?:\/\//, "") ?? comp?.domain,
    company_website: comp?.website,
    industry: comp?.industry,
    company_size: comp?.size,
    company_employee_count: comp?.employee_count,
    location: loc?.name,
    country: loc?.country,
    vendor: "pdl",
    vendor_confidence: 0.9,
    vendor_meta: { likelihood: data?.likelihood },
  };
}

async function enrichProxycurl(lead: any): Promise<Enrichment> {
  if (!lead.email) throw new Error("proxycurl_no_email");

  const resp = await fetch(
    `https://nubela.co/proxycurl/api/find/company-by-email?email=${encodeURIComponent(lead.email)}`,
    {
      headers: { Authorization: `Bearer ${PROXYCURL_KEY}` },
    },
  );
  if (!resp.ok) throw new Error(`proxycurl_http_${resp.status}`);

  const data = await resp.json();

  return {
    company_name: data?.company?.name,
    company_domain: data?.company?.domain,
    company_website: data?.company?.url,
    industry: data?.company?.industry,
    vendor: "proxycurl",
    vendor_confidence: 0.7,
    vendor_meta: { company_id: data?.company?.company_id },
  };
}

async function enrichWappalyzer(domain: string): Promise<Enrichment> {
  const resp = await fetch(
    "https://api.wappalyzer.com/v3/lookup/?urls=" +
      encodeURIComponent(`https://${domain}`),
    {
      headers: { "x-api-key": WAPPALYZER_KEY! },
    },
  );
  if (!resp.ok) throw new Error(`wappalyzer_http_${resp.status}`);

  const data = await resp.json();
  const first = Array.isArray(data) ? data[0] : data?.[domain] ?? data;
  const tech =
    first?.applications?.map((app: any) => app.name).slice(0, 50) ?? [];

  return {
    tech_tags: tech,
    extras: { wappalyzer: first },
    vendor: "wappalyzer",
    vendor_confidence: 0.6,
  };
}

function sizeBucket(n: number): string | null {
  if (!n || n < 1) return null;
  if (n <= 10) return "1-10";
  if (n <= 50) return "11-50";
  if (n <= 200) return "51-200";
  if (n <= 500) return "201-500";
  if (n <= 1000) return "501-1000";
  if (n <= 5000) return "1001-5000";
  return "5001+";
}

