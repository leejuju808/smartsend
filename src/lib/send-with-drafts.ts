// Example integration for your existing send queue
// This shows how to use approved drafts when sending emails

import { getApprovedDrafts, getDraftForLead } from "@/lib/drafts";

export async function sendCampaignWithDrafts(campaignId: string, leads: any[]) {
  // Get all approved drafts for this campaign
  const approvedDrafts = await getApprovedDrafts(campaignId);
  const draftsByLeadId = new Map(approvedDrafts.map(d => [d.lead_id, d]));

  // Process each lead
  for (const lead of leads) {
    const draft = draftsByLeadId.get(lead.id);
    
    if (draft) {
      // Use AI-generated draft
      const subject = draft.subject;
      const body = draft.body_markdown; // Convert markdown to HTML on send
      
      // Send email with AI draft
      await sendEmail({
        to: lead.email,
        subject,
        body: markdownToHtml(body), // Your markdown-to-HTML converter
        // ... other email parameters
      });
    } else {
      // Fall back to your existing template system
      const subject = compileTemplate(campaign.subject_template, lead);
      const body = compileTemplate(campaign.body_template, lead);
      
      await sendEmail({
        to: lead.email,
        subject,
        body,
        // ... other email parameters
      });
    }
  }
}

// Helper function to convert markdown to HTML (you may want to use a library like marked)
function markdownToHtml(markdown: string): string {
  // Simple markdown to HTML conversion
  // You might want to use a proper markdown library like 'marked' or 'remark'
  return markdown
    .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
    .replace(/\*(.*?)\*/g, '<em>$1</em>')
    .replace(/\n\n/g, '</p><p>')
    .replace(/\n/g, '<br>')
    .replace(/^(.*)$/, '<p>$1</p>');
}

// Placeholder functions - replace with your actual implementations
async function sendEmail(params: any) {
  // Your existing email sending logic
}

function compileTemplate(template: string, data: any): string {
  // Your existing template compilation logic
  return template;
}