import SmartRewritePanel from "./SmartRewritePanel";

export default function CampaignEditPage({ params }: { params: { id: string } }) {
  const campaignId = params.id;
  
  // Mock campaign data - replace with actual data fetching
  const campaign = {
    id: campaignId,
    subject_template: "Hi {{first_name}}, interested in {{company}}?",
    body_template: "<p>Hi {{first_name}},</p><p>I noticed {{company}} might benefit from our solution...</p>"
  };

  const handleTemplateUpdate = async (updates: { subject?: string; body?: string }) => {
    try {
      const response = await fetch(`/api/campaigns/${campaignId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          subject_template: updates.subject ?? campaign.subject_template,
          body_template: updates.body ?? campaign.body_template
        })
      });
      
      if (!response.ok) {
        throw new Error('Failed to update campaign');
      }
      
      // Optionally show success message or refresh data
      console.log('Campaign updated successfully');
    } catch (error) {
      console.error('Error updating campaign:', error);
    }
  };

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Edit Campaign</h1>
        <div className="text-sm text-gray-500">Campaign ID: {campaignId}</div>
      </div>
      
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Current Template Display */}
        <div className="space-y-4">
          <h2 className="text-lg font-semibold">Current Template</h2>
          
          <div className="rounded-lg border p-4 space-y-3">
            <div>
              <label className="text-sm font-medium text-gray-700">Subject</label>
              <div className="mt-1 p-2 bg-gray-50 rounded border text-sm">
                {campaign.subject_template}
              </div>
            </div>
            
            <div>
              <label className="text-sm font-medium text-gray-700">Body</label>
              <div className="mt-1 p-2 bg-gray-50 rounded border text-sm prose prose-sm max-w-none">
                <div dangerouslySetInnerHTML={{ __html: campaign.body_template }} />
              </div>
            </div>
          </div>
        </div>
        
        {/* Smart Rewrite Panel */}
        <div>
          <h2 className="text-lg font-semibold mb-4">AI Template Rewriter</h2>
          <SmartRewritePanel
            initialSubject={campaign.subject_template}
            initialBody={campaign.body_template}
            onPick={handleTemplateUpdate}
          />
        </div>
      </div>
    </div>
  );
}