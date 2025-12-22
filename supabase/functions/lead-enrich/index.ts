import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const sb = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { persistSession: false } }
);

const CLEARBIT = Deno.env.get("CLEARBIT_KEY");
const HUNTER = Deno.env.get("HUNTER_KEY");
const PEOPLE = Deno.env.get("PEOPLEDATA_KEY");
const BUILT = Deno.env.get("BUILTWITH_KEY");

const LEAD_TTL_MS = 14 * 24 * 60 * 60 * 1000;
const TECH_TTL_MS = 30 * 24 * 60 * 60 * 1000;

type LeadRow = {
  id: string;
  email: string | null;
  website: string | null;
  account_id: string;
};

type LeadEnrichmentRow = {
  lead_id: string;
  updated_at: string;
  source: string | null;
  confidence: number | null;
  person: Record<string, any>;
  company: Record<string, any>;
  tech: any[];
  meta: Record<string, any>;
  ttl_expires_at: string | null;
};

Deno.serve(async (req) => {
  if (req.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  const payload = await req.json().catch(() => ({}));
  const lead_id = payload.lead_id as string | undefined;
  const force = Boolean(payload.force);

  if (!lead_id) {
    return json({ error: "Missing lead_id" }, 400);
  }

  const { data: lead, error: leadErr } = await sb
    .from("leads")
    .select("id,email,website,account_id")
    .eq("id", lead_id)
    .single<LeadRow>();

  if (leadErr || !lead) {
    return json({ error: "Lead not found" }, 404);
  }

  const { data: domainData, error: domainErr } = await sb.rpc("extract_domain", {
    p_email: lead.email,
    p_website: lead.website,
  });

  if (domainErr) {
    console.error("extract_domain failed", domainErr);
  }

  const domain = (domainData as string | null) ?? undefined;

  const { data: cached } = await sb
    .from("lead_enrichment")
    .select("*")
    .eq("lead_id", lead.id)
    .maybeSingle<LeadEnrichmentRow>();

  if (!force && cached?.ttl_expires_at) {
    const fresh = new Date(cached.ttl_expires_at).getTime() > Date.now();
    if (fresh) {
      await sb.rpc("apply_lead_enrichment", { p_lead: lead.id }).catch((err) =>
        console.error("apply_lead_enrichment (cached)", err)
      );
      return json({ ok: true, cached: true, ttl_expires_at: cached.ttl_expires_at });
    }
  }

  const [person, company, tech] = await Promise.all([
    personLookup(lead.email ?? undefined, domain),
    companyLookup(domain),
    techLookup(domain),
  ]);

  const merged = mergeResults({ person, company, tech });
  const ttl = new Date(Date.now() + LEAD_TTL_MS).toISOString();

  // Preserve previous details if new data is sparse
  const nextRecord = mergeWithPrevious(cached, merged);

  const { error: upsertErr } = await sb.from("lead_enrichment").upsert({
    lead_id: lead.id,
    updated_at: new Date().toISOString(),
    source: nextRecord.source,
    confidence: nextRecord.confidence,
    person: nextRecord.person,
    company: nextRecord.company,
    tech: nextRecord.tech,
    meta: nextRecord.meta,
    ttl_expires_at: ttl,
  });

  if (upsertErr) {
    console.error("lead_enrichment upsert failed", upsertErr);
    return json({ error: "Failed to persist enrichment" }, 500);
  }

  await sb.rpc("apply_lead_enrichment", { p_lead: lead.id }).catch((err) =>
    console.error("apply_lead_enrichment", err)
  );

  return json({
    ok: true,
    refreshed: true,
    confidence: nextRecord.confidence,
    ttl_expires_at: force ? ttl : nextRecord.ttl_expires_at ?? ttl,
  });
});

function json(body: any, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });
}

async function personLookup(email?: string, domain?: string) {
  const candidates: any[] = [];

  if (PEOPLE && email) {
    try {
      const res = await fetch(
        `https://api.peopledatalabs.com/v5/person/enrich?email=${encodeURIComponent(email)}`,
        {
          headers: { "X-Api-Key": PEOPLE },
        }
      );
      if (res.ok) {
        const data = await res.json();
        const p = data?.data ?? data;
        candidates.push({
          name: p?.full_name || [p?.first_name, p?.last_name].filter(Boolean).join(" ") || undefined,
          title: p?.job_title,
          seniority: p?.job_seniority,
          linkedin: p?.linkedin_url,
          twitter: p?.twitter_url,
        });
      }
    } catch (err) {
      console.error("PEOPLEDATA lookup failed", err);
    }
  }

  if (HUNTER && email) {
    try {
      const res = await fetch(
        `https://api.hunter.io/v2/email-finder?email=${encodeURIComponent(email)}&api_key=${HUNTER}`
      );
      if (res.ok) {
        const data = await res.json();
        const d = data?.data ?? {};
        candidates.push({
          name:
            d.first_name && d.last_name ? `${d.first_name} ${d.last_name}` : d.first_name ?? undefined,
          title: d.position,
          linkedin: d.linkedin_url,
        });
      }
    } catch (err) {
      console.error("HUNTER lookup failed", err);
    }
  }

  if (CLEARBIT && email) {
    try {
      const res = await fetch(
        `https://person.clearbit.com/v2/people/find?email=${encodeURIComponent(email)}`,
        {
          headers: { Authorization: `Bearer ${CLEARBIT}` },
        }
      );
      if (res.status === 200) {
        const data = await res.json();
        candidates.push({
          name: data?.name?.fullName,
          title: data?.employment?.title,
          seniority: data?.employment?.seniority,
          linkedin: data?.linkedin?.handle
            ? `https://www.linkedin.com/${data.linkedin.handle}`
            : undefined,
          twitter: data?.twitter?.handle ? `https://twitter.com/${data.twitter.handle}` : undefined,
        });
      }
    } catch (err) {
      console.error("CLEARBIT person lookup failed", err);
    }
  }

  if (email && candidates.length === 0) {
    const guess = email.split("@")[0]?.replace(/[._]/g, " ").trim();
    if (guess) {
      candidates.push({ name: guess });
    }
  }

  return pickBestPerson(candidates);
}

async function companyLookup(domain?: string) {
  const candidates: any[] = [];

  if (!domain) {
    return pickBestCompany(candidates);
  }

  if (CLEARBIT) {
    try {
      const res = await fetch(
        `https://company.clearbit.com/v2/companies/find?domain=${encodeURIComponent(domain)}`,
        {
          headers: { Authorization: `Bearer ${CLEARBIT}` },
        }
      );
      if (res.status === 200) {
        const data = await res.json();
        candidates.push({
          name: data?.name,
          domain: data?.domain,
          website: data?.site?.url ?? `https://${data?.domain ?? domain}`,
          size: data?.metrics?.employeesRange,
          industry: data?.category?.sector ?? data?.category?.industry,
          locality: [data?.location].filter(Boolean).join(", "),
          logo: data?.logo,
        });
      }
    } catch (err) {
      console.error("CLEARBIT company lookup failed", err);
    }
  }

  if (candidates.length === 0) {
    candidates.push({
      domain,
      website: `https://${domain}`,
    });
  }

  return pickBestCompany(candidates);
}

async function techLookup(domain?: string) {
  if (!domain) return [];

  const { data: cached } = await sb
    .from("company_tech_cache")
    .select("*")
    .eq("domain", domain)
    .maybeSingle<{
      domain: string;
      tech: any[];
      ttl_expires_at: string | null;
    }>();

  if (cached?.ttl_expires_at) {
    const isFresh = new Date(cached.ttl_expires_at).getTime() > Date.now();
    if (isFresh && Array.isArray(cached.tech)) {
      return cached.tech;
    }
  }

  let tech: any[] = [];

  if (BUILTWITH) {
    try {
      const res = await fetch(
        `https://api.builtwith.com/v21/api.json?KEY=${BUILTWITH}&LOOKUP=${encodeURIComponent(
          domain
        )}`
      );
      if (res.ok) {
        const data = await res.json();
        const technologies =
          data?.Technologies ??
          data?.Results?.[0]?.Result?.Paths?.flatMap((p: any) => p?.Technologies ?? []) ??
          [];
        const unique = new Map<string, { slug: string; label: string }>();
        for (const techObj of technologies) {
          const label = techObj?.Name ?? techObj?.name;
          if (!label) continue;
          const slug = slugify(label);
          if (!unique.has(slug)) {
            unique.set(slug, { slug, label });
          }
        }
        tech = Array.from(unique.values()).slice(0, 50);
      }
    } catch (err) {
      console.error("BUILTWITH lookup failed", err);
    }
  }

  if (tech.length === 0 && cached?.tech) {
    tech = cached.tech;
  }

  const ttl = new Date(Date.now() + TECH_TTL_MS).toISOString();
  await sb
    .from("company_tech_cache")
    .upsert({
      domain,
      tech,
      updated_at: new Date().toISOString(),
      ttl_expires_at: ttl,
    })
    .catch((err) => console.error("company_tech_cache upsert failed", err));

  return tech;
}

function pickBestPerson(candidates: any[]) {
  if (!candidates.length) return {};
  const best = candidates[0];
  const seniority = normalizeSeniority(best.title, best.seniority);
  return {
    name: best.name,
    title: best.title,
    seniority,
    linkedin: best.linkedin,
    twitter: best.twitter,
  };
}

function pickBestCompany(candidates: any[]) {
  if (!candidates.length) return {};
  const best = candidates[0];
  return {
    name: best.name,
    domain: best.domain,
    website: best.website,
    size: best.size,
    industry: best.industry,
    locality: best.locality,
    logo: best.logo,
  };
}

function mergeResults({
  person,
  company,
  tech,
}: {
  person: any;
  company: any;
  tech: any[];
}) {
  const personScore = (person?.title ? 0.2 : 0) + (person?.linkedin ? 0.3 : 0);
  const companyScore = company?.name ? 0.2 : 0;
  const techScore = tech?.length ? 0.1 : 0;
  const confidence = Math.min(1, 0.2 + personScore + companyScore + techScore);

  return {
    source: "mixed",
    confidence,
    person: person ?? {},
    company: company ?? {},
    tech: tech ?? [],
    meta: {},
    ttl_expires_at: new Date(Date.now() + LEAD_TTL_MS).toISOString(),
  };
}

function mergeWithPrevious(
  previous: LeadEnrichmentRow | null | undefined,
  next: {
    source: string;
    confidence: number;
    person: any;
    company: any;
    tech: any[];
    meta: any;
    ttl_expires_at: string;
  }
) {
  if (!previous) return next;

  const person = hasKeys(next.person) || !hasKeys(previous.person) ? next.person : previous.person;
  const company = hasKeys(next.company) || !hasKeys(previous.company) ? next.company : previous.company;
  const tech = next.tech?.length ? next.tech : previous.tech ?? [];
  const confidence = Math.max(next.confidence ?? 0, previous.confidence ?? 0);

  return {
    source: next.source ?? previous.source ?? "mixed",
    confidence,
    person,
    company,
    tech,
    meta: { ...(previous.meta ?? {}), ...(next.meta ?? {}) },
    ttl_expires_at: next.ttl_expires_at ?? previous.ttl_expires_at ?? null,
  };
}

function normalizeSeniority(title?: string | null, seniority?: string | null) {
  const norm = (seniority ?? title ?? "").toLowerCase();
  if (/(founder|owner|principal)/.test(norm)) return "owner";
  if (/(chief|cxo|ceo|coo|cfo|cto|cmo)/.test(norm)) return "c-level";
  if (/(vp|vice president)/.test(norm)) return "vp";
  if (/(director)/.test(norm)) return "director";
  if (/(manager|lead)/.test(norm)) return "manager";
  if (/(intern|assistant|associate|specialist|representative)/.test(norm)) return "ic";
  return seniority ?? "other";
}

function slugify(input: string) {
  return (input || "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

function hasKeys(obj: any) {
  return obj && typeof obj === "object" && Object.keys(obj).length > 0;
}

