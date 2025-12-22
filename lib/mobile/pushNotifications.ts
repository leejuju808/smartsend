// lib/mobile/pushNotifications.ts
// Block 120000 — Push Notification Sender for Mobile App
// Sends push notifications via Expo Push Notification Service

import { createClient } from '@/lib/supabase/server';

interface PushNotificationPayload {
  to: string; // Expo push token
  title: string;
  body: string;
  sound?: string;
  data?: Record<string, any>;
  badge?: number;
}

/**
 * Send push notification to a single device token
 */
async function sendExpoPushNotification(payload: PushNotificationPayload): Promise<boolean> {
  try {
    const response = await fetch('https://exp.host/--/api/v2/push/send', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
        'Accept-Encoding': 'gzip, deflate',
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.error('Expo push notification error:', errorText);
      return false;
    }

    const result = await response.json();
    if (result.data?.status === 'error') {
      console.error('Expo push notification error:', result.data);
      return false;
    }

    return true;
  } catch (error) {
    console.error('Error sending Expo push notification:', error);
    return false;
  }
}

/**
 * Send push notifications to all device tokens for a user
 */
export async function sendPushNotificationToUser(
  userId: string,
  title: string,
  body: string,
  data?: Record<string, any>
): Promise<{ sent: number; failed: number }> {
  const supabase = createClient();
  
  // Get all device tokens for the user
  const { data: tokens, error } = await supabase
    .from('device_tokens')
    .select('token')
    .eq('user_id', userId);

  if (error || !tokens || tokens.length === 0) {
    console.log(`No device tokens found for user ${userId}`);
    return { sent: 0, failed: 0 };
  }

  let sent = 0;
  let failed = 0;

  // Send notification to each token
  for (const tokenData of tokens) {
    const success = await sendExpoPushNotification({
      to: tokenData.token,
      title,
      body,
      sound: 'default',
      data,
      badge: 1,
    });

    if (success) {
      sent++;
      // Update last_used_at
      await supabase
        .from('device_tokens')
        .update({ last_used_at: new Date().toISOString() })
        .eq('token', tokenData.token);
    } else {
      failed++;
    }
  }

  return { sent, failed };
}

/**
 * Send hot lead notification
 */
export async function sendHotLeadNotification(
  userId: string,
  leadId: string,
  message: string
): Promise<void> {
  const title = '🔥 HOT Roofing Lead';
  const body = message.slice(0, 60) + (message.length > 60 ? '...' : '');

  await sendPushNotificationToUser(userId, title, body, {
    type: 'hot_lead',
    lead_id: leadId,
  });
}


























