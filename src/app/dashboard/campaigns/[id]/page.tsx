import { redirect, notFound } from "next/navigation";
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { requireProOrRedirect } from "@/lib/subscription";
import CampaignControls from "./CampaignControls";
import CampaignStats from "./CampaignStats";
import CampaignQueue from "./CampaignQueue";
import CampaignKPIs from "./CampaignKPIs";
import EmailActivity from "@/components/EmailActivity";
import ActivityFeed from "./ActivityFeed";
import { ShareDialog } from "@/components/campaign/ShareDialog";
import { ExportMenu } from "@/components/campaigns/ExportMenu";
import ShareCampaignSection from "./ShareCampaignSection";
import SharedUsersList from "./SharedUsersList";
import { OwnerControls } from "@/components/campaign/OwnerControls";
import { TeamShareToggle } from "@/components/campaigns/TeamShareToggle";
import Link from "next/link";
import { BarChart3, Settings, MousePointer, Users, Upload, Share2 } from "lucide-react";
import { getCampaignRole } from "@/lib/auth/role";
import { can } from "@/lib/auth/permissions";
import { SafetyCard } from "@/components/metrics/SafetyCard";
import { ScheduleCard } from "@/components/campaign/ScheduleCard";
import { GuardBanner } from "@/components/campaign/GuardBanner";
import { CampaignLaunchButton } from "@/components/campaigns/campaign-launch-button";

interface CampaignPageProps {
  params: { id: string };
}

export default async function CampaignPage({ params }: CampaignPageProps) {
  const gate = await requireProOrRedirect();
  if (!gate.ok && gate.redirect) redirect(gate.redirect);

  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Check campaign access using role system
  const role = await getCampaignRole(params.id);
  if (!can(role, "canView")) {
    notFound();
  }

  // Get campaign details (remove user_id restriction to allow members to view)
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select(`
      *,
      mailboxes(from_email, from_name)
    `)
    .eq('id', params.id)
    .single();

  if (error || !campaign) {
    redirect('/dashboard/campaigns');
  }

  // Get campaign stats using RPC
  const { data: statsData } = await supabase
    .rpc('campaign_send_stats', { p_campaign_id: params.id })
    .single();
  
  const stats = statsData as { queued?: number; sent?: number; failed?: number; sending?: number } | null;
  
  const sent = stats?.sent || 0;
  const failed = stats?.failed || 0;
  const queued = stats?.queued || 0;
  const sending = stats?.sending || 0;

  // Get tracking stats
  let opens = 0, clicks = 0, uniqueOpens = 0, uniqueClicks = 0;
  try {
    const { data: trackingStats } = await supabase
      .from('tracking_events')
      .select('type, recipient_id')
      .eq('campaign_id', params.id);

    if (trackingStats) {
      const openEvents = trackingStats.filter(e => e.type === 'open');
      const clickEvents = trackingStats.filter(e => e.type === 'click');
      
      opens = openEvents.length;
      clicks = clickEvents.length;
      
      // Get unique counts
      const uniqueOpenRecipients = new Set(openEvents.map(e => e.recipient_id));
      const uniqueClickRecipients = new Set(clickEvents.map(e => e.recipient_id));
      
      uniqueOpens = uniqueOpenRecipients.size;
      uniqueClicks = uniqueClickRecipients.size;
    }
  } catch (error) {
    console.error('Error fetching tracking stats:', error);
  }

  // Get org_id - if not set, campaign may not be in an org yet
  const orgId = campaign.org_id || ''
  
  // Check if user is owner
  const isOwner = campaign.user_id === user.id

  return (
    <div className="space-y-6">
      {/* Guard Banner */}
      <GuardBanner campaignId={params.id} role={role === "none" ? null : role} />
      
      <div className="flex justify-between items-start">
        <div>
          <h1 className="text-2xl font-bold mb-2">{campaign.name}</h1>
          <p className="text-gray-600">
            Campaign ID: {campaign.id}
          </p>
          <p className="text-gray-600">
            From: {campaign.mailboxes?.from_name || campaign.from_name} &lt;{campaign.mailboxes?.from_email || campaign.from_email}&gt;
          </p>
        </div>
        
        <div className="text-right flex items-center gap-3">
          <OwnerControls
            campaignId={campaign.id}
            isOwner={isOwner}
            deletedAt={campaign.deleted_at}
          />
          <ExportMenu campaignId={campaign.id} />
          {orgId && <ShareDialog campaignId={campaign.id} orgId={orgId} />}
          <ShareCampaignSection campaignId={campaign.id} />
          <TeamShareToggle 
            campaignId={campaign.id} 
            visibility={campaign.visibility as "private" | "team" | null}
            isOwner={isOwner}
          />
          <div>
            <div className={`px-3 py-1 rounded-full text-sm font-medium ${
              campaign.status === 'draft' ? 'bg-gray-100 text-gray-800' :
              campaign.status === 'running' ? 'bg-green-100 text-green-800' :
              campaign.status === 'paused' ? 'bg-yellow-100 text-yellow-800' :
              campaign.status === 'done' ? 'bg-blue-100 text-blue-800' :
              'bg-red-100 text-red-800'
            }`}>
              {campaign.status.charAt(0).toUpperCase() + campaign.status.slice(1)}
            </div>
            <p className="text-sm text-gray-500 mt-1">
              Created: {new Date(campaign.created_at).toLocaleDateString()}
            </p>
          </div>
        </div>
      </div>

      {/* Navigation Tabs */}
      <div className="border-b border-gray-200">
        <nav className="-mb-px flex space-x-8">
          <Link
            href={`/dashboard/campaigns/${campaign.id}`}
            className="border-b-2 border-blue-500 py-2 px-1 text-sm font-medium text-blue-600"
          >
            Overview
          </Link>
          <Link
            href={`/dashboard/campaigns/${campaign.id}/analytics`}
            className="border-b-2 border-transparent py-2 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 flex items-center gap-2"
          >
            <BarChart3 className="w-4 h-4" />
            Analytics
          </Link>
          <Link
            href={`/dashboard/campaigns/${campaign.id}/click-actions`}
            className="border-b-2 border-transparent py-2 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 flex items-center gap-2"
          >
            <MousePointer className="w-4 h-4" />
            Click Actions
          </Link>
          <Link
            href={`/dashboard/campaigns/${campaign.id}/settings`}
            className="border-b-2 border-transparent py-2 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 flex items-center gap-2"
          >
            <Settings className="w-4 h-4" />
            Settings
          </Link>
          <Link
            href={`/dashboard/campaigns/${campaign.id}/settings/share`}
            className="border-b-2 border-transparent py-2 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 flex items-center gap-2"
          >
            <Share2 className="w-4 h-4" />
            Share
          </Link>
          <Link
            href={`/campaigns/${campaign.id}/settings/team`}
            className="border-b-2 border-transparent py-2 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 flex items-center gap-2"
          >
            <Users className="w-4 h-4" />
            Team
          </Link>
          <Link
            href={`/dashboard/campaigns/${campaign.id}/import`}
            className="border-b-2 border-transparent py-2 px-1 text-sm font-medium text-gray-500 hover:text-gray-700 hover:border-gray-300 flex items-center gap-2"
          >
            <Upload className="w-4 h-4" />
            Import Leads
          </Link>
        </nav>
      </div>

      {/* Campaign KPIs */}
      <CampaignKPIs campaignId={campaign.id} />

      {/* Safety Metrics and Schedule */}
      <div className="grid md:grid-cols-2 gap-4">
        <SafetyCard campaignId={campaign.id} />
        <ScheduleCard campaignId={campaign.id} role={role} />
      </div>

      {/* Campaign Stats */}
      <CampaignStats
        total={campaign.total}
        sent={sent}
        failed={failed}
        pending={queued}
        replied={0}
        status={campaign.status}
        opens={opens}
        clicks={clicks}
        uniqueOpens={uniqueOpens}
        uniqueClicks={uniqueClicks}
      />

      {/* Queue Stats Display */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Send Queue Status</h2>
        <div className="flex gap-6 items-center">
          <div className="flex items-center gap-2">
            <span className="text-2xl">🟢</span>
            <span className="font-medium">Sent {sent}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🟡</span>
            <span className="font-medium">Queued {queued}</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-2xl">🔴</span>
            <span className="font-medium">Failed {failed}</span>
          </div>
          {sending > 0 && (
            <div className="flex items-center gap-2">
              <span className="text-2xl">⏳</span>
              <span className="font-medium">Sending {sending}</span>
            </div>
          )}
        </div>
      </div>

      {/* Email Activity */}
      <EmailActivity campaignId={campaign.id} />

      {/* Campaign Controls */}
      <div className="flex items-center gap-4">
        <CampaignLaunchButton campaignId={campaign.id} disabled={campaign.status === 'paused'} />
        <CampaignControls
          id={campaign.id}
          status={campaign.status}
        />
      </div>

      {/* Campaign Queue */}
      <CampaignQueue campaignId={campaign.id} />

      {/* Activity Feed */}
      <ActivityFeed campaignId={campaign.id} />

      {/* Campaign Details */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-lg font-semibold mb-4">Campaign Details</h2>
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Subject
            </label>
            <p className="text-gray-900">{campaign.subject}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Daily Limit
            </label>
            <p className="text-gray-900">{campaign.daily_limit || 'No daily cap'}</p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reply Tracking
            </label>
            <p className="text-gray-900">
              {campaign.reply_tracking ? 'Enabled' : 'Disabled'}
            </p>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Unsubscribe Header
            </label>
            <p className="text-gray-900">
              {campaign.unsubscribe_header ? 'Enabled' : 'Disabled'}
            </p>
          </div>
        </div>
        
        {/* Shared Users Section */}
        <SharedUsersList campaignId={campaign.id} />
      </div>
    </div>
  );
}

