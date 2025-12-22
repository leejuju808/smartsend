import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

type SupabaseClient = ReturnType<typeof createServerClient>;

async function getClient(): Promise<SupabaseClient> {
  const cookieStore = await cookies();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get(name: string) {
          return cookieStore.get(name)?.value;
        },
        set() {},
        remove() {},
      },
    },
  );
}

type TemplateVersionRow = {
  id: string;
  status: "live" | "candidate";
  weight: number | null;
};

export async function chooseSmartTemplateVersion(
  templateId: string,
  explicitClient?: SupabaseClient,
): Promise<string | null> {
  const sb = explicitClient ?? (await getClient());
  const { data: tpl, error: tplErr } = await sb
    .from("smart_templates")
    .select("explore_ratio")
    .eq("id", templateId)
    .single();
  if (tplErr || !tpl) {
    console.error("chooseSmartTemplateVersion::template", tplErr);
    return null;
  }

  const { data: rows, error: verErr } = await sb
    .from("smart_template_versions")
    .select("id,status,weight")
    .eq("template_id", templateId)
    .in("status", ["live", "candidate"]);
  if (verErr || !rows?.length) {
    console.error("chooseSmartTemplateVersion::versions", verErr);
    return null;
  }

  const explore = Math.random() < (tpl.explore_ratio ?? 0.2);
  const pool = rows.filter((v) =>
    explore ? v.status === "candidate" : v.status === "live"
  );
  const fallbackPool = explore
    ? rows.filter((v) => v.status === "live")
    : rows.filter((v) => v.status === "candidate");
  const finalPool = pool.length ? pool : fallbackPool.length ? fallbackPool : rows;

  const totalWeight = finalPool.reduce(
    (sum, v) => sum + (v.weight ?? 1),
    0,
  );
  let cursor = Math.random() * (totalWeight || 1);
  for (const v of finalPool) {
    cursor -= v.weight ?? 1;
    if (cursor <= 0) return v.id;
  }
  return finalPool[0]?.id ?? null;
}

export async function recordSmartTemplateAttribution(opts: {
  accountId: string;
  templateId: string;
  versionId: string;
  queueId: number | null;
  leadId?: string | null;
  campaignId?: string | null;
  identityId?: string | null;
}, explicitClient?: SupabaseClient) {
  const sb = explicitClient ?? (await getClient());
  const { error } = await sb.from("template_attributions").insert({
    account_id: opts.accountId,
    template_id: opts.templateId,
    version_id: opts.versionId,
    queue_id: opts.queueId,
    lead_id: opts.leadId ?? null,
    campaign_id: opts.campaignId ?? null,
    identity_id: opts.identityId ?? null,
  });
  if (error) {
    console.error("recordSmartTemplateAttribution", error);
  }
}


