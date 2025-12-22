import { redirect } from "next/navigation";
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { requireProOrRedirect } from "@/lib/subscription";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import LeadImporter from "@/components/import/LeadImporter";

interface CampaignImportPageProps {
  params: { id: string };
}

export default async function CampaignImportPage({ params }: CampaignImportPageProps) {
  const gate = await requireProOrRedirect();
  if (!gate.ok) redirect(gate.redirect);

  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) redirect('/login');

  // Get campaign details
  const { data: campaign, error } = await supabase
    .from('campaigns')
    .select('*')
    .eq('id', params.id)
    .eq('user_id', user.id)
    .single();

  if (error || !campaign) {
    redirect('/dashboard/campaigns');
  }

  // Get workspace_id
  const { data: workspace } = await supabase
    .from('workspace_members')
    .select('workspace_id')
    .eq('user_id', user.id)
    .limit(1)
    .single();

  if (!workspace?.workspace_id) {
    redirect('/dashboard');
  }

  return (
    <div className="space-y-6 p-6">
      <div className="flex items-center gap-4">
        <Link
          href={`/dashboard/campaigns/${campaign.id}`}
          className="flex items-center gap-2 text-gray-600 hover:text-gray-900 transition-colors"
        >
          <ArrowLeft className="w-4 h-4" />
          Back to Campaign
        </Link>
      </div>

      <div className="space-y-2">
        <h1 className="text-3xl font-bold">Import Leads</h1>
        <p className="text-gray-600">
          Import leads for <strong>{campaign.name}</strong>
        </p>
      </div>

      <LeadImporter
        campaignId={campaign.id}
        workspaceId={workspace.workspace_id}
        onSuccess={(result) => {
          console.log('Import completed:', result);
        }}
        onError={(error) => {
          console.error('Import error:', error);
        }}
      />
    </div>
  );
}
