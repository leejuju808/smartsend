#!/usr/bin/env tsx

/**
 * SmartSend — Send-time Suppression Check (Cron Patch)
 * 
 * This script demonstrates how to patch your existing send loop to:
 * 1. Check suppressions before sending
 * 2. Insert unsubscribe tokens at send-time
 * 3. Skip suppressed contacts
 * 4. Log suppression events
 */

import { createClient } from '@supabase/supabase-js';
import { createEnhancedUnsubscribeManager } from '../src/lib/unsub-enhanced';

// Initialize Supabase client
const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

// Initialize unsubscribe manager
const unsubscribeManager = createEnhancedUnsubscribeManager();

/**
 * Check if a contact is suppressed for a specific workspace
 */
async function isContactSuppressed(workspaceId: string, email: string): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc('is_contact_suppressed', {
      p_workspace_id: workspaceId,
      p_email: email
    });

    if (error) {
      console.error('Error checking suppression:', error);
      return false;
    }

    return data || false;
  } catch (error) {
    console.error('Error checking suppression:', error);
    return false;
  }
}

/**
 * Insert unsubscribe token for a contact
 */
async function insertUnsubscribeToken(
  workspaceId: string,
  email: string,
  campaignId: string,
  contactId?: string
): Promise<string> {
  try {
    const token = await unsubscribeManager.createToken(
      workspaceId,
      email,
      campaignId,
      contactId
    );

    console.log(`Created unsubscribe token for ${email}: ${token}`);
    return token;
  } catch (error) {
    console.error(`Failed to create unsubscribe token for ${email}:`, error);
    throw error;
  }
}

/**
 * Patch your existing send loop with suppression checks
 * 
 * Add this function call just before picking mailbox/provider in your cron:
 */
export async function sendWithSuppressionCheck(
  workspaceId: string,
  campaignId: string,
  contactId: string,
  email: string,
  contactId?: string
): Promise<{
  shouldSend: boolean;
  reason?: string;
  unsubscribeToken?: string;
}> {
  try {
    // 1. Check if contact is suppressed
    const isSuppressed = await isContactSuppressed(workspaceId, email);
    
    if (isSuppressed) {
      console.log(`Skipping suppressed contact: ${email}`);
      
      // Log the suppression event
      await supabase
        .from('email_events')
        .insert({
          workspace_id: workspaceId,
          campaign_id: campaignId,
          contact_id: contactId,
          event_type: 'suppressed',
          created_at: new Date().toISOString(),
          metadata: {
            reason: 'suppression_check',
            timestamp: new Date().toISOString(),
          },
        });

      return {
        shouldSend: false,
        reason: 'Contact is suppressed',
      };
    }

    // 2. Insert unsubscribe token for this send
    const unsubscribeToken = await insertUnsubscribeToken(
      workspaceId,
      email,
      campaignId,
      contactId
    );

    // 3. Return success with token
    return {
      shouldSend: true,
      unsubscribeToken,
    };

  } catch (error) {
    console.error(`Error in suppression check for ${email}:`, error);
    
    // On error, err on the side of caution - don't send
    return {
      shouldSend: false,
      reason: 'Error during suppression check',
    };
  }
}

/**
 * Example usage in your existing cron job:
 */
async function exampleCronUsage() {
  // Your existing logic to get contacts to send to
  const contactsToSend = [
    { id: 'contact-1', email: 'user1@example.com', workspaceId: 'workspace-1', campaignId: 'campaign-1' },
    { id: 'contact-2', email: 'user2@example.com', workspaceId: 'workspace-1', campaignId: 'campaign-1' },
  ];

  for (const contact of contactsToSend) {
    // PATCH: Add this suppression check before sending
    const suppressionResult = await sendWithSuppressionCheck(
      contact.workspaceId,
      contact.campaignId,
      contact.id,
      contact.email
    );

    if (!suppressionResult.shouldSend) {
      console.log(`Skipping ${contact.email}: ${suppressionResult.reason}`);
      continue;
    }

    // Your existing send logic here
    console.log(`Sending to ${contact.email} with token: ${suppressionResult.unsubscribeToken}`);
    
    // Include the unsubscribe token in your email template
    // Example: {{unsubscribe_url}} = /u/${suppressionResult.unsubscribeToken}
  }
}

/**
 * Patch your bounce webhook to insert into suppressions:
 */
export async function handleBounceWebhook(
  workspaceId: string,
  email: string,
  bounceType: 'hard' | 'soft',
  reason?: string
): Promise<void> {
  try {
    // Add to suppressions
    await supabase
      .from('suppressions')
      .upsert({
        workspace_id: workspaceId,
        user_id: null, // Will be set by RLS policy
        kind: 'email',
        value_lower: email.toLowerCase(),
        reason: reason || `${bounceType} bounce`,
        source: 'bounce',
        metadata: {
          bounce_type: bounceType,
          timestamp: new Date().toISOString(),
        },
      });

    // Auto-stop future sends for this contact
    // You'll need to find the campaign_id and contact_id from your bounce data
    // This is just an example structure
    const { data: campaignContacts } = await supabase
      .from('campaign_contacts')
      .select('campaign_id, contact_id')
      .eq('workspace_id', workspaceId)
      .eq('email_lower', email.toLowerCase())
      .eq('status', 'pending');

    for (const cc of campaignContacts || []) {
      await supabase.rpc('stop_future_sends', {
        p_workspace_id: workspaceId,
        p_contact_id: cc.contact_id,
        p_campaign_id: cc.campaign_id,
        p_reason: 'bounced',
      });
    }

    console.log(`Added ${email} to suppressions due to ${bounceType} bounce`);

  } catch (error) {
    console.error(`Error handling bounce for ${email}:`, error);
  }
}

/**
 * Patch your complaint webhook to insert into suppressions:
 */
export async function handleComplaintWebhook(
  workspaceId: string,
  email: string,
  reason?: string
): Promise<void> {
  try {
    // Add to suppressions
    await supabase
      .from('suppressions')
      .upsert({
        workspace_id: workspaceId,
        user_id: null, // Will be set by RLS policy
        kind: 'email',
        value_lower: email.toLowerCase(),
        reason: reason || 'Complaint received',
        source: 'complained',
        metadata: {
          timestamp: new Date().toISOString(),
        },
      });

    // Auto-stop future sends for this contact
    const { data: campaignContacts } = await supabase
      .from('campaign_contacts')
      .select('campaign_id, contact_id')
      .eq('workspace_id', workspaceId)
      .eq('email_lower', email.toLowerCase())
      .eq('status', 'pending');

    for (const cc of campaignContacts || []) {
      await supabase.rpc('stop_future_sends', {
        p_workspace_id: workspaceId,
        p_contact_id: cc.contact_id,
        p_campaign_id: cc.campaign_id,
        p_reason: 'complained',
      });
    }

    console.log(`Added ${email} to suppressions due to complaint`);

  } catch (error) {
    console.error(`Error handling complaint for ${email}:`, error);
  }
}

// Export functions for use in your existing cron jobs
export {
  isContactSuppressed,
  insertUnsubscribeToken,
  handleBounceWebhook,
  handleComplaintWebhook,
};

// Run example if this script is executed directly
if (require.main === module) {
  exampleCronUsage().catch(console.error);
} 