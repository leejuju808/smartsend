// Example usage in a campaign page
// /app/campaigns/[id]/page.tsx (example integration)

import { QueueBuilder } from "./QueueBuilder";

export default function CampaignPage({ params }: { params: { id: string } }) {
  return (
    <div className="container mx-auto p-6">
      <h1 className="text-2xl font-bold mb-6">Campaign Details</h1>
      
      {/* Other campaign content */}
      
      <QueueBuilder campaignId={params.id} />
    </div>
  );
}