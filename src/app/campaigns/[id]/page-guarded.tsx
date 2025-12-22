// Example server-side ACL guard for campaign pages
// Shows how to use canReadCampaign to protect routes

import { canReadCampaign } from '@/lib/acl';
import { GenerateDraftsButton } from "@/components/drafts/GenerateDraftsButton";
import DraftReviewDrawer from "@/components/drafts/DraftReviewDrawer";
import CampaignAnalyticsCard from "./AnalyticsCard";
import { ActivityFeed } from "@/components/dashboard/ActivityFeed";
import LeadsTable from "@/components/leads/LeadsTable";

export default async function CampaignPage({ params }: { params: { id: string } }) {
  const campaignId = params.id;
  
  // Check if user can read this campaign
  const canRead = await canReadCampaign(campaignId);
  
  if (!canRead) {
    return (
      <main className="max-w-5xl mx-auto p-6">
        <div className="bg-red-50 border border-red-200 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-red-900 mb-2">Access Denied</h2>
          <p className="text-red-700">
            You don't have access to this campaign.
          </p>
        </div>
      </main>
    );
  }
  
  // User has access, render the campaign
  return (
    <main className="max-w-5xl mx-auto p-6 space-y-6">
      <div className="flex gap-3">
        <GenerateDraftsButton campaignId={campaignId} />
        <DraftReviewDrawer campaignId={campaignId} />
      </div>
      
      <CampaignAnalyticsCard id={campaignId} />
      <ActivityFeed campaignId={campaignId} />

      <LeadsTable campaignId={campaignId} />
      
      {/* ...rest of campaign UI... */}
    </main>
  );
}

// To use write guards:
// 
// import { canWriteCampaign } from '@/lib/acl';
// 
// export default async function CampaignEditPage({ params }: { params: { id: string } }) {
//   const canWrite = await canWriteCampaign(params.id);
//   if (!canWrite) {
//     return <div>You don't have permission to edit this campaign.</div>;
//   }
//   // ... render edit form
// }

