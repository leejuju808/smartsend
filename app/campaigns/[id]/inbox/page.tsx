import { cookies } from "next/headers";
import { getCampaignRole } from "@/lib/auth/role";
import { can } from "@/lib/auth/permissions";
import { notFound } from "next/navigation";
import { createServerComponentClient } from "@supabase/auth-helpers-nextjs";
import InboxClient from "./InboxClient";

export default async function InboxPage({ params }: { params: { id: string } }) {
  const campaignId = params.id;
  const role = await getCampaignRole(campaignId);
  if (!can(role, "canView")) {
    notFound();
  }

  const supabase = createServerComponentClient({ cookies });
  const { data: campaign } = await supabase
    .from("campaigns")
    .select("id, name, title")
    .eq("id", campaignId)
    .maybeSingle();

  const campaignName = campaign?.name ?? campaign?.title ?? "Campaign Inbox";
  const displayRole = (role ?? "viewer") as "owner" | "editor" | "viewer";

  return <InboxClient campaignId={campaignId} campaignName={campaignName} role={displayRole} />;
}

