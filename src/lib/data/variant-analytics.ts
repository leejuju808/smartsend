import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";

export type VariantVersionStats = {
  variant_key: string | null;
  template_version_id: string | null;
  version_label: string | null;
  sent: number;
  replies: number;
  bounces: number;
  complaints: number;
  replyRate: number; // replies / sent
  failRate: number; // (bounces+complaints) / sent
};

export async function variantAnalytics(
  campaignId: string,
  days = 14
): Promise<VariantVersionStats[]> {
  const cookieStore = await cookies();
  const sb = createServerClient(
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
    }
  );
  const since = new Date(
    Date.now() - days * 24 * 60 * 60 * 1000
  ).toISOString();

  // Sent counts grouped by variant+version
  const { data: sentRows } = await sb
    .from("send_logs")
    .select("variant_key, template_version_id")
    .eq("campaign_id", campaignId)
    .gte("sent_at", since);

  // Group sent counts
  const sentMap = new Map<string, number>();
  for (const r of sentRows ?? []) {
    const k = `${r.variant_key ?? "default"}::${r.template_version_id ?? "none"}`;
    sentMap.set(k, (sentMap.get(k) ?? 0) + 1);
  }

  // Replies grouped by variant+version
  const { data: replyRows } = await sb.rpc("analytics_replies_by_variant_version", {
    c_id: campaignId,
    since_ts: since,
  });

  // Bounces & complaints by variant+version
  const { data: bounceRows } = await sb.rpc(
    "analytics_bounces_by_variant_version",
    {
      c_id: campaignId,
      since_ts: since,
    }
  );
  const { data: complaintRows } = await sb.rpc(
    "analytics_complaints_by_variant_version",
    {
      c_id: campaignId,
      since_ts: since,
    }
  );

  // Labels for versions
  const versionIds = Array.from(
    new Set(
      (sentRows ?? [])
        .map((r) => r.template_version_id)
        .filter((id): id is string => Boolean(id))
    )
  );
  let labels: Record<string, string> = {};
  if (versionIds.length) {
    const { data: versions } = await sb
      .from("template_versions")
      .select("id, version_label")
      .in("id", versionIds);
    labels = Object.fromEntries(
      (versions ?? []).map((v) => [v.id, v.version_label])
    );
  }

  // Assemble
  const key = (v: any, t: any) => `${v ?? "default"}::${t ?? "none"}`;
  const map = new Map<string, VariantVersionStats>();

  // Initialize from sent counts
  for (const [k, count] of sentMap.entries()) {
    const [v, t] = k.split("::");
    map.set(k, {
      variant_key: v === "default" ? "default" : v,
      template_version_id: t === "none" ? null : t,
      version_label:
        t && t !== "none" ? labels[t] ?? t : null,
      sent: count,
      replies: 0,
      bounces: 0,
      complaints: 0,
      replyRate: 0,
      failRate: 0,
    });
  }

  // Add replies
  for (const r of replyRows ?? []) {
    const k = key(r.variant_key, r.template_version_id);
    const cur =
      map.get(k) ??
      ({
        variant_key: r.variant_key ?? "default",
        template_version_id: r.template_version_id ?? null,
        version_label: r.template_version_id
          ? labels[r.template_version_id] ?? null
          : null,
        sent: 0,
        replies: 0,
        bounces: 0,
        complaints: 0,
        replyRate: 0,
        failRate: 0,
      } as VariantVersionStats);
    cur.replies = Number(r.count ?? 0);
    map.set(k, cur);
  }

  // Add bounces
  for (const r of bounceRows ?? []) {
    const k = key(r.variant_key, r.template_version_id);
    const cur =
      map.get(k) ??
      ({
        variant_key: r.variant_key ?? "default",
        template_version_id: r.template_version_id ?? null,
        version_label: r.template_version_id
          ? labels[r.template_version_id] ?? null
          : null,
        sent: 0,
        replies: 0,
        bounces: 0,
        complaints: 0,
        replyRate: 0,
        failRate: 0,
      } as VariantVersionStats);
    cur.bounces = Number(r.count ?? 0);
    map.set(k, cur);
  }

  // Add complaints
  for (const r of complaintRows ?? []) {
    const k = key(r.variant_key, r.template_version_id);
    const cur =
      map.get(k) ??
      ({
        variant_key: r.variant_key ?? "default",
        template_version_id: r.template_version_id ?? null,
        version_label: r.template_version_id
          ? labels[r.template_version_id] ?? null
          : null,
        sent: 0,
        replies: 0,
        bounces: 0,
        complaints: 0,
        replyRate: 0,
        failRate: 0,
      } as VariantVersionStats);
    cur.complaints = Number(r.count ?? 0);
    map.set(k, cur);
  }

  // Calculate rates
  for (const s of map.values()) {
    s.replyRate = s.sent ? s.replies / s.sent : 0;
    s.failRate = s.sent ? (s.bounces + s.complaints) / s.sent : 0;
  }

  // Sort by replyRate desc then sent desc
  return Array.from(map.values()).sort(
    (a, b) => b.replyRate - a.replyRate || b.sent - a.sent
  );
}

