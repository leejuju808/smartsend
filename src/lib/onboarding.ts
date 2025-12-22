import { createClient } from "@/lib/supabase/server";

export type OnboardingState = {
  hasContacts: boolean;
  hasCampaign: boolean;
  hasOutbound: boolean;
  hasReplies: boolean;
};

export async function getOnboardingState(): Promise<OnboardingState | null> {
  const supabase = createClient();

  // 1) Workspace
  const { data: ws, error: wsErr } = await supabase
    .from("workspace_members")
    .select("workspace_id")
    .limit(1)
    .maybeSingle();

  if (wsErr || !ws) {
    console.error("onboarding: no workspace", wsErr);
    return null;
  }

  const workspaceId = ws.workspace_id as string;

  // 2) Contacts count
  const { count: contactsCount } = await supabase
    .from("contacts")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  // 3) Campaigns count
  const { count: campaignsCount } = await supabase
    .from("campaigns")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  // 4) Outbound emails
  const { count: outboundCount } = await supabase
    .from("outbound_emails")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  // 5) Replies
  const { count: replyCount } = await supabase
    .from("email_replies")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  return {
    hasContacts: (contactsCount ?? 0) > 0,
    hasCampaign: (campaignsCount ?? 0) > 0,
    hasOutbound: (outboundCount ?? 0) > 0,
    hasReplies: (replyCount ?? 0) > 0,
  };
}
