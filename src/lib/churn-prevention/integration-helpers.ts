/**
 * Block 23610 — Integration Helpers
 * Helper functions to integrate churn prevention tracking into existing code
 */

import { recordUsage } from './monitoring-service';

/**
 * Track campaign launch (call this when a campaign is created/activated)
 */
export async function trackCampaignLaunch(
  workspaceId: string,
  userId: string
): Promise<void> {
  try {
    await recordUsage(workspaceId, userId, 'campaign_launched', 1);
  } catch (error) {
    console.error('Error tracking campaign launch:', error);
    // Don't throw - tracking shouldn't break the main flow
  }
}

/**
 * Track campaign email sent (call this when emails are sent)
 */
export async function trackCampaignSent(
  workspaceId: string,
  userId: string,
  count: number = 1
): Promise<void> {
  try {
    await recordUsage(workspaceId, userId, 'campaign_sent', count);
  } catch (error) {
    console.error('Error tracking campaign sent:', error);
  }
}

/**
 * Track reply received (call this when a reply is detected)
 */
export async function trackReplyReceived(
  workspaceId: string,
  userId: string
): Promise<void> {
  try {
    await recordUsage(workspaceId, userId, 'reply_received', 1);
  } catch (error) {
    console.error('Error tracking reply:', error);
  }
}

/**
 * Track email open (call this when an email is opened)
 */
export async function trackEmailOpen(
  workspaceId: string,
  userId: string
): Promise<void> {
  try {
    await recordUsage(workspaceId, userId, 'open', 1);
  } catch (error) {
    console.error('Error tracking email open:', error);
  }
}

/**
 * Track email click (call this when a link is clicked)
 */
export async function trackEmailClick(
  workspaceId: string,
  userId: string
): Promise<void> {
  try {
    await recordUsage(workspaceId, userId, 'click', 1);
  } catch (error) {
    console.error('Error tracking email click:', error);
  }
}






































