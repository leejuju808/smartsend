/**
 * Block 20770 — SmartSend Roofing Notification Engine v1
 * 
 * Email notification sending functionality
 */

import { createClient } from '@supabase/supabase-js';
import { providerSendResend } from '@/lib/providers/resend';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseServiceKey);

export interface EmailNotificationOptions {
  userId: string;
  notificationId: string;
  title: string;
  body?: string;
  type: string;
  payload?: Record<string, any>;
}

/**
 * Sends an email notification to a user
 */
export async function sendEmailNotification(
  options: EmailNotificationOptions
): Promise<{ success: boolean; error?: string }> {
  try {
    // Get user email
    const { data: user, error: userError } = await supabase.auth.admin.getUserById(
      options.userId
    );

    if (userError || !user?.user?.email) {
      return {
        success: false,
        error: 'User not found or email not available',
      };
    }

    // Get notification details
    const { data: notification } = await supabase
      .from('notifications')
      .select('*')
      .eq('id', options.notificationId)
      .single();

    if (!notification) {
      return {
        success: false,
        error: 'Notification not found',
      };
    }

    // Build email subject and body
    const subject = buildEmailSubject(notification.type, notification.title);
    const htmlBody = buildEmailBody(notification);

    // Send email via Resend
    const sendResult = await providerSendResend({
      to: user.user.email,
      subject,
      html: htmlBody,
      text: notification.body || notification.title,
      from: process.env.FROM_EMAIL || 'notifications@smartsend.ai',
    });

    if (!sendResult.ok) {
      return {
        success: false,
        error: sendResult.error || 'Failed to send email',
      };
    }

    // Optionally track email sent in notification payload
    await supabase
      .from('notifications')
      .update({
        payload: {
          ...notification.payload,
          email_sent_at: new Date().toISOString(),
          email_message_id: sendResult.messageId,
        },
      })
      .eq('id', options.notificationId);

    return { success: true };
  } catch (error: any) {
    console.error('Error sending email notification:', error);
    return {
      success: false,
      error: error.message || 'Failed to send email notification',
    };
  }
}

/**
 * Builds email subject based on notification type
 */
function buildEmailSubject(type: string, title: string): string {
  // Add emoji prefix based on type
  const emojiMap: Record<string, string> = {
    homeowner_replied: '🟢',
    claim_approved: '🔵',
    adjuster_replied: '🟣',
    install_ready: '🔥',
    missed_follow_up_hot_lead: '⚠️',
    missed_follow_up_homeowner: '⚠️',
    missed_follow_up_adjuster: '⚠️',
    missed_follow_up_proposal: '⚠️',
    supplement_opportunity_detected: '🟠',
    adjuster_denied_claim: '🔴',
    homeowner_reported_leak: '🔴',
    homeowner_hired_another_company: '🔴',
    homeowner_complained_delays: '🔴',
  };

  const emoji = emojiMap[type] || '🔔';
  return `${emoji} ${title}`;
}

/**
 * Builds HTML email body for notification
 */
function buildEmailBody(notification: any): string {
  const { type, title, body, payload } = notification;

  let html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
        }
        .notification-card {
          background: #ffffff;
          border-radius: 8px;
          padding: 24px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          border-left: 4px solid #4F46E5;
        }
        .title {
          font-size: 20px;
          font-weight: 600;
          margin-bottom: 12px;
          color: #1F2937;
        }
        .body {
          font-size: 16px;
          color: #6B7280;
          margin-bottom: 16px;
        }
        .action-button {
          display: inline-block;
          background: #4F46E5;
          color: #ffffff;
          padding: 12px 24px;
          text-decoration: none;
          border-radius: 6px;
          font-weight: 500;
          margin-top: 16px;
        }
        .footer {
          margin-top: 24px;
          padding-top: 16px;
          border-top: 1px solid #E5E7EB;
          font-size: 14px;
          color: #9CA3AF;
        }
      </style>
    </head>
    <body>
      <div class="notification-card">
        <div class="title">${escapeHtml(title)}</div>
        ${body ? `<div class="body">${escapeHtml(body)}</div>` : ''}
        
        ${buildPayloadDetails(payload)}
        
        <a href="${process.env.NEXT_PUBLIC_APP_URL || 'https://app.smartsend.ai'}/inbox" class="action-button">
          View in SmartSend
        </a>
      </div>
      
      <div class="footer">
        <p>This is an automated notification from SmartSend.</p>
        <p>You can manage your notification preferences in your SmartSend settings.</p>
      </div>
    </body>
    </html>
  `;

  return html;
}

/**
 * Builds payload details section
 */
function buildPayloadDetails(payload: any): string {
  if (!payload || Object.keys(payload).length === 0) {
    return '';
  }

  let details = '<div style="margin-top: 16px; padding: 12px; background: #F9FAFB; border-radius: 6px;">';
  
  if (payload.project_value) {
    details += `<p style="margin: 4px 0;"><strong>Project Value:</strong> $${payload.project_value.toLocaleString()}</p>`;
  }
  
  if (payload.claim_amount) {
    details += `<p style="margin: 4px 0;"><strong>Claim Amount:</strong> $${payload.claim_amount.toLocaleString()}</p>`;
  }
  
  if (payload.supplement_value) {
    details += `<p style="margin: 4px 0;"><strong>Supplement Value:</strong> $${payload.supplement_value.toLocaleString()}</p>`;
  }
  
  if (payload.homeowner_name) {
    details += `<p style="margin: 4px 0;"><strong>Homeowner:</strong> ${escapeHtml(payload.homeowner_name)}</p>`;
  }
  
  if (payload.insurance_company) {
    details += `<p style="margin: 4px 0;"><strong>Insurance:</strong> ${escapeHtml(payload.insurance_company)}</p>`;
  }
  
  details += '</div>';
  return details;
}

/**
 * Escapes HTML to prevent XSS
 */
function escapeHtml(text: string): string {
  const div = typeof document !== 'undefined' ? document.createElement('div') : null;
  if (div) {
    div.textContent = text;
    return div.innerHTML;
  }
  // Fallback for server-side
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

