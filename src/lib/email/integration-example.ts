/**
 * Integration Examples for Unsubscribe Compliance System
 * 
 * This file shows how to integrate the new compliance system
 * with your existing email sending infrastructure.
 */

import { sendMailSafe, sendBulkMailSafe } from "./send";
import { addSuppression } from "./suppression";

// Example 1: Replace existing email send with compliant version
export async function sendWelcomeEmail(email: string, name: string) {
  // OLD WAY (non-compliant):
  // await emailProvider.send({
  //   to: email,
  //   subject: "Welcome to SmartSend!",
  //   text: `Hi ${name}, welcome aboard!`
  // });

  // NEW WAY (compliant):
  const result = await sendMailSafe({
    to: email,
    subject: "Welcome to SmartSend!",
    text: `Hi ${name}, welcome aboard!`
  });

  if (result.skipped) {
    console.log(`Skipped welcome email to ${result.email}: ${result.reason}`);
    return { sent: false, reason: result.reason };
  }

  return { sent: true, email, headers: result.headers };
}

// Example 2: Bulk email with suppression handling
export async function sendNewsletter(emails: string[], content: string) {
  const results = await sendBulkMailSafe(
    emails,
    "SmartSend Weekly Newsletter",
    content
  );

  console.log(`Newsletter Results:
    Total: ${results.total}
    Sent: ${results.sent}
    Suppressed: ${results.suppressed}
  `);

  return results;
}

// Example 3: Handle bounces and complaints
export async function handleBounce(email: string, bounceType: string) {
  // Add to suppression list
  await addSuppression(email, "webhook", bounceType);
  
  // Log for analytics
  console.log(`Added ${email} to suppressions due to ${bounceType}`);
  
  // Could also trigger other actions like:
  // - Update contact status
  // - Send notification to team
  // - Update deliverability metrics
}

// Example 4: Campaign sequence with compliance
export async function sendSequenceStep(
  contactId: string, 
  email: string, 
  stepNumber: number,
  content: string
) {
  // Check if contact should receive this step
  const result = await sendMailSafe({
    to: email,
    subject: `Step ${stepNumber}: Your SmartSend Journey`,
    text: content
  });

  if (result.skipped) {
    // Mark sequence as stopped for this contact
    await markSequenceStopped(contactId, result.reason);
    return { sent: false, reason: result.reason };
  }

  // Mark step as sent
  await markStepSent(contactId, stepNumber);
  return { sent: true, stepNumber };
}

// Example 5: Integration with existing campaign system
export async function sendCampaignEmail(
  campaignId: string,
  contactId: string,
  email: string,
  template: string
) {
  // Check suppressions first
  const result = await sendMailSafe({
    to: email,
    subject: "Your SmartSend Campaign",
    text: template
  });

  if (result.skipped) {
    // Update campaign contact status
    await updateCampaignContact(campaignId, contactId, {
      status: "suppressed",
      reason: result.reason,
      suppressedAt: new Date()
    });
    return { sent: false, reason: result.reason };
  }

  // Update campaign contact status
  await updateCampaignContact(campaignId, contactId, {
    status: "sent",
    sentAt: new Date()
  });

  return { sent: true, campaignId, contactId };
}

// Helper functions (implement based on your existing system)
async function markSequenceStopped(contactId: string, reason: string) {
  // Implementation depends on your sequence system
  console.log(`Stopping sequence for ${contactId}: ${reason}`);
}

async function markStepSent(contactId: string, stepNumber: number) {
  // Implementation depends on your sequence system
  console.log(`Marking step ${stepNumber} as sent for ${contactId}`);
}

async function updateCampaignContact(
  campaignId: string, 
  contactId: string, 
  updates: any
) {
  // Implementation depends on your campaign system
  console.log(`Updating campaign contact:`, { campaignId, contactId, updates });
}

// Example 6: Webhook handler for email provider events
export async function handleEmailWebhook(event: any) {
  switch (event.type) {
    case 'bounce':
      await addSuppression(event.email, 'webhook', event.bounceType);
      break;
      
    case 'complaint':
      await addSuppression(event.email, 'webhook', 'complaint');
      break;
      
    case 'unsubscribe':
      await addSuppression(event.email, 'webhook', 'user_unsubscribed');
      break;
      
    default:
      console.log('Unhandled email event:', event.type);
  }
}

// Example 7: Migration helper for existing emails
export async function migrateExistingEmails() {
  // Find all emails that don't have unsubscribe footers
  const emails = await getEmailsWithoutFooters();
  
  for (const email of emails) {
    // Add footer and resend if needed
    const updatedContent = email.content + buildFooter(email.recipient);
    
    // Update stored content
    await updateEmailContent(email.id, updatedContent);
  }
  
  console.log(`Migrated ${emails.length} emails to include unsubscribe footers`);
}

// Helper function for migration
async function getEmailsWithoutFooters(): Promise<Array<{id: string, content: string, recipient: string}>> {
  // Implementation depends on your email storage system
  return [];
}

async function updateEmailContent(emailId: string, content: string) {
  // Implementation depends on your email storage system
  console.log(`Updating email ${emailId} with footer`);
}

function buildFooter(email: string) {
  // This would use the footer utility
  return `\n\n—\nUnsubscribe: https://yoursite.com/unsubscribe`;
} 