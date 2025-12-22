import { ReactNode } from "react";
import { cookies } from "next/headers";
import { createServerClient } from "@supabase/ssr";
import { getCampaignRole } from "@/lib/auth/role";
import { can } from "@/lib/auth/permissions";
import { notFound } from "next/navigation";
import { RoleBadge } from "@/components/role-badge";
import ShareDialog from "@/app/(campaign)/[id]/ShareDialog";
import { PreflightButton } from "./components/PreflightButton";

type CampaignLayoutProps = {
  children: ReactNode;
  params: { id: string };
};

async function getSupabase() {
  const cookieStore = cookies();
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
    }
  );
}

export default async function CampaignLayout({ children, params }: CampaignLayoutProps) {
  const campaignId = params.id;
  const role = await getCampaignRole(campaignId);
  if (!can(role, "canView")) {
    notFound();
  }

  const supabase = await getSupabase();
  const [{ data: campaign }, { data: members }] = await Promise.all([
    supabase
      .from("campaigns")
      .select("id, name, title, user_id, account_id")
      .eq("id", campaignId)
      .maybeSingle(),
    supabase
      .from("campaign_members")
      .select("user_id, role")
      .eq("campaign_id", campaignId)
      .order("created_at", { ascending: true }),
  ]);

  const userIds = new Set<string>();
  if (campaign?.user_id) {
    userIds.add(campaign.user_id);
  }
  (members ?? []).forEach((m) => {
    if (m.user_id) {
      userIds.add(m.user_id);
    }
  });

  let profileMap = new Map<string, { full_name: string | null; email: string | null }>();
  if (userIds.size > 0) {
    const { data: profiles } = await supabase
      .from("profiles")
      .select("id, full_name, name, email")
      .in("id", Array.from(userIds));
    if (profiles) {
      profileMap = new Map(
        profiles.map((p) => [
          p.id,
          { full_name: p.full_name ?? p.name ?? null, email: p.email ?? null },
        ])
      );
    }
  }

  const ownerEntry =
    campaign?.user_id != null
      ? [
          {
            user_id: campaign.user_id,
            role: "owner" as const,
            display:
              profileMap.get(campaign.user_id)?.full_name ??
              profileMap.get(campaign.user_id)?.email ??
              campaign.user_id,
          },
        ]
      : [];

  const memberEntries =
    members?.map((m) => ({
      user_id: m.user_id,
      role: m.role as "owner" | "editor" | "viewer",
      display:
        profileMap.get(m.user_id)?.full_name ??
        profileMap.get(m.user_id)?.email ??
        m.user_id,
    })) ?? [];

  const combined = [...ownerEntry, ...memberEntries].reduce<
    { user_id: string; role: "owner" | "editor" | "viewer"; display: string }[]
  >((acc, cur) => {
    if (acc.find((x) => x.user_id === cur.user_id)) {
      return acc;
    }
    return [...acc, cur];
  }, []);

  const campaignName = campaign?.name ?? campaign?.title ?? "Campaign";
  const normalizedRole = ["owner", "admin", "editor", "viewer"].includes(role ?? "")
    ? (role as "owner" | "admin" | "editor" | "viewer")
    : "viewer";
  const accountId = campaign?.account_id ?? null;
  const canInvite = (normalizedRole === "owner" || normalizedRole === "admin") && Boolean(accountId);
  const canLaunch = can(role, "canSend");
  const sharedCount = combined.length;
  const sharedLabel = sharedCount === 1 ? "person" : "people";

  return (
    <div className="space-y-6">
      <header className="flex flex-col gap-4 border-b px-6 py-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <div className="text-xs uppercase text-muted-foreground">Campaign</div>
            <h1 className="text-2xl font-semibold">{campaignName}</h1>
          </div>
          <div className="flex items-center gap-2">
            <RoleBadge role={normalizedRole} />
            {canLaunch && <PreflightButton campaignId={campaignId} />}
            {canInvite && accountId && (
              <ShareDialog accountId={accountId} campaignId={campaignId} />
            )}
          </div>
        </div>
        <div className="flex flex-wrap gap-2 text-xs text-muted-foreground">
          <span className="inline-flex items-center gap-2 rounded-full border bg-muted/40 px-3 py-1">
            Shared with {sharedCount} {sharedLabel} • Your role: {normalizedRole}
          </span>
        </div>
      </header>
      <section>{children}</section>
    </div>
  );
}

