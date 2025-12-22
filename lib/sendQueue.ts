// lib/sendQueue.ts
// Send dispatcher with deliverability shield checks

import { checkMailboxSafety, recordSend, recordBounce } from './deliverability/mailboxSafety';
import { selectMailboxForSend } from './deliverability/smartRotation';
import { spamRiskScore } from './deliverability/spamRiskScore';

/**
 * Check if we can send from a mailbox before queuing
 */
export async function canSendFromMailbox(
  mailboxId: string
): Promise<{ canSend: boolean; reason?: string }> {
  const safety = await checkMailboxSafety(mailboxId);
  
  if (!safety.canSend) {
    return {
      canSend: false,
      reason: safety.reason || 'limit_reached',
    };
  }

  return { canSend: true };
}

/**
 * Get mailbox for a lead/user and check limits
 */
export async function getMailboxForLead(
  userId: string,
  leadId?: string
): Promise<{ mailboxId: string | null; reason?: string }> {
  // Use smart rotation to select mailbox
  const result = await selectMailboxForSend(userId);
  
  if (!result.mailboxId) {
    return {
      mailboxId: null,
      reason: result.reason || 'no_available_mailboxes',
    };
  }

  // Verify mailbox can still send
  const canSend = await canSendFromMailbox(result.mailboxId);
  
  if (!canSend.canSend) {
    return {
      mailboxId: null,
      reason: canSend.reason || 'limit_reached',
    };
  }

  return { mailboxId: result.mailboxId };
}

/**
 * Check template risk before sending
 */
export function checkTemplateRisk(
  subject: string,
  body: string
): { riskScore: number; isHighRisk: boolean; highRiskWords: string[] } {
  const { score, highRiskWords } = spamRiskScore(subject, body);
  return {
    riskScore: score,
    isHighRisk: score > 60,
    highRiskWords,
  };
}

/**
 * Process send queue item with all safety checks
 */
export async function processSendQueueItem(options: {
  userId: string;
  leadId: string;
  campaignId?: string;
  subject: string;
  body: string;
  mailboxId?: string;
}): Promise<{
  success: boolean;
  reason?: string;
  mailboxId?: string;
  riskScore?: number;
}> {
  // 1. Check template risk
  const riskCheck = checkTemplateRisk(options.subject, options.body);
  
  if (riskCheck.isHighRisk) {
    return {
      success: false,
      reason: 'high_risk_template',
      riskScore: riskCheck.riskScore,
    };
  }

  // 2. Get or select mailbox
  let mailboxId = options.mailboxId;
  
  if (!mailboxId) {
    const mailboxResult = await getMailboxForLead(options.userId, options.leadId);
    if (!mailboxResult.mailboxId) {
      return {
        success: false,
        reason: mailboxResult.reason || 'no_available_mailbox',
      };
    }
    mailboxId = mailboxResult.mailboxId;
  }

  // 3. Final safety check
  const canSend = await canSendFromMailbox(mailboxId);
  
  if (!canSend.canSend) {
    return {
      success: false,
      reason: canSend.reason || 'limit_reached',
      mailboxId,
    };
  }

  // 4. Record send (will be incremented when actually sent)
  // Note: This should be called after successful send, not before
  // For now, we just return success

  return {
    success: true,
    mailboxId,
    riskScore: riskCheck.riskScore,
  };
}










