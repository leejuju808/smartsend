import { getServerSupabase } from "@/lib/supabase/server";

export async function getDashboardStats(workspaceId: string) {
  const supabase = await getServerSupabase();

  // Get current user and org_id
  const { data: { user } } = await supabase.auth.getUser();
  const { data: profile } = user ? await supabase
    .from("profiles")
    .select("current_org_id")
    .eq("id", user.id)
    .single() : { data: null };

  // Get total leads count
  const { count: leads } = await supabase
    .from("leads")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId);

  // Get emails sent today from send_queue (join via campaigns)
  const todayStart = new Date();
  todayStart.setHours(0, 0, 0, 0);
  
  // Get campaign_ids for this workspace, filtered by org if current_org_id is set
  let campaignQuery = supabase
    .from("campaigns")
    .select("id")
    .eq("workspace_id", workspaceId);
  
  // Filter by org: if current_org_id set → show campaigns where org_id = current_org_id or owned-only if null
  if (profile?.current_org_id && user) {
    campaignQuery = campaignQuery.or(`org_id.eq.${profile.current_org_id},user_id.eq.${user.id}`);
  } else if (user) {
    // If no current org, show only owned campaigns
    campaignQuery = campaignQuery.eq("user_id", user.id);
  }
  
  const { data: workspaceCampaigns } = await campaignQuery;
  const campaignIds = workspaceCampaigns?.map((c: any) => c.id) || [];
  
  const { count: sent } = await supabase
    .from("send_queue")
    .select("*", { count: "exact", head: true })
    .in("campaign_id", campaignIds)
    .eq("status", "sent")
    .gte("created_at", todayStart.toISOString());

  // Get replies today from campaign_leads (via campaigns)
  const { count: replies } = await supabase
    .from("campaign_leads")
    .select("*", { count: "exact", head: true })
    .in("campaign_id", campaignIds)
    .eq("has_replied", true)
    .gte("created_at", todayStart.toISOString());

  // Get active campaigns count (with org filtering)
  let activeCampaignsQuery = supabase
    .from("campaigns")
    .select("*", { count: "exact", head: true })
    .eq("workspace_id", workspaceId)
    .eq("status", "active");
  
  if (profile?.current_org_id && user) {
    activeCampaignsQuery = activeCampaignsQuery.or(`org_id.eq.${profile.current_org_id},user_id.eq.${user.id}`);
  } else if (user) {
    activeCampaignsQuery = activeCampaignsQuery.eq("user_id", user.id);
  }
  
  const { count: campaigns } = await activeCampaignsQuery;

  // Calculate reply rate
  const replyRate = sent && sent > 0 ? ((replies ?? 0) / sent * 100).toFixed(1) : "0.0";

  // Auto-Retries Today: count of rows whose attempts > 0 and status in ('queued','sending','sent') created today
  const { count: autoRetries } = await supabase
    .from("send_queue")
    .select("*", { count: "exact", head: true })
    .in("campaign_id", campaignIds)
    .gt("attempts", 0)
    .in("status", ["queued", "sending", "sent"])
    .gte("created_at", todayStart.toISOString());

  // Dead Letters: count
  const { count: deadLetters } = await supabase
    .from("dead_letters")
    .select("*", { count: "exact", head: true })
    .in("campaign_id", campaignIds);

  return { 
    leads: leads ?? 0, 
    sent: sent ?? 0, 
    replies: replies ?? 0, 
    campaigns: campaigns ?? 0, 
    replyRate,
    autoRetries: autoRetries ?? 0,
    deadLetters: deadLetters ?? 0
  };
}
