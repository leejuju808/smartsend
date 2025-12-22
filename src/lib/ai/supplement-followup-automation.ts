// Block 256600 — SmartSend Insurance Supplement Engine v1
// Insurance Follow-Up Timeline Automation
// Automates follow-up reminders for supplement requests

export interface FollowUpSchedule {
  type: 'initial_submission' | 'day_3_reminder' | 'day_7_escalation' | 'day_14_supervisor' | 'custom';
  scheduledFor: Date;
  action: string;
  priority: 'low' | 'medium' | 'high';
}

export interface FollowUpTimeline {
  followUps: FollowUpSchedule[];
  nextAction: string;
  daysSinceSubmission: number;
  recommendedAction: string;
}

/**
 * Generate follow-up timeline for supplement request
 */
export function generateFollowUpTimeline(
  submittedAt: Date,
  status: 'submitted' | 'under_review' | 'negotiating',
  lastFollowUpAt?: Date
): FollowUpTimeline {
  const now = new Date();
  const daysSinceSubmission = Math.floor(
    (now.getTime() - submittedAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  const followUps: FollowUpSchedule[] = [];

  // Day 3: First follow-up reminder
  const day3 = new Date(submittedAt);
  day3.setDate(day3.getDate() + 3);
  if (day3 <= now) {
    followUps.push({
      type: 'day_3_reminder',
      scheduledFor: day3,
      action: 'Send follow-up email to adjuster',
      priority: 'medium',
    });
  }

  // Day 7: Escalation request
  const day7 = new Date(submittedAt);
  day7.setDate(day7.getDate() + 7);
  if (day7 <= now) {
    followUps.push({
      type: 'day_7_escalation',
      scheduledFor: day7,
      action: 'Request escalation to supervisor',
      priority: 'high',
    });
  }

  // Day 14: Supervisor request
  const day14 = new Date(submittedAt);
  day14.setDate(day14.getDate() + 14);
  if (day14 <= now) {
    followUps.push({
      type: 'day_14_supervisor',
      scheduledFor: day14,
      action: 'Request supervisor review',
      priority: 'high',
    });
  }

  // Determine next action
  let nextAction = 'No action needed';
  let recommendedAction = 'Waiting for adjuster response';

  if (daysSinceSubmission < 3) {
    nextAction = 'Wait for initial response';
    recommendedAction = 'Allow 3 days for initial review';
  } else if (daysSinceSubmission >= 3 && daysSinceSubmission < 7) {
    nextAction = 'Send follow-up email';
    recommendedAction = 'Follow up on supplement request status';
  } else if (daysSinceSubmission >= 7 && daysSinceSubmission < 14) {
    nextAction = 'Request escalation';
    recommendedAction = 'Escalate to supervisor if no response';
  } else if (daysSinceSubmission >= 14) {
    nextAction = 'Request supervisor review';
    recommendedAction = 'Escalate to supervisor immediately';
  }

  // Filter out past follow-ups that haven't been completed
  const upcomingFollowUps = followUps.filter(
    (fu) => fu.scheduledFor > now || (lastFollowUpAt && fu.scheduledFor <= lastFollowUpAt)
  );

  return {
    followUps: upcomingFollowUps,
    nextAction,
    daysSinceSubmission,
    recommendedAction,
  };
}

/**
 * Generate follow-up email template
 */
export function generateFollowUpEmail(
  type: FollowUpSchedule['type'],
  supplementData: {
    claimNumber: string;
    carrier: string;
    adjusterName?: string;
    totalRequested: number;
    submittedAt: Date;
  }
): { subject: string; body: string } {
  const daysSince = Math.floor(
    (new Date().getTime() - supplementData.submittedAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  let subject = '';
  let body = '';

  switch (type) {
    case 'day_3_reminder':
      subject = `Follow-Up: Supplement Request - Claim ${supplementData.claimNumber}`;
      body = `Dear ${supplementData.adjusterName || 'Adjuster'},

I wanted to follow up on the supplement request submitted ${daysSince} days ago for claim ${supplementData.claimNumber}.

The supplement request includes ${supplementData.totalRequested.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} in additional items that were omitted from the original scope.

Please let me know if you need any additional information or documentation to process this request.

Thank you for your attention to this matter.

Best regards`;
      break;

    case 'day_7_escalation':
      subject = `Escalation Request: Supplement Request - Claim ${supplementData.claimNumber}`;
      body = `Dear ${supplementData.adjusterName || 'Adjuster'},

I am following up on the supplement request for claim ${supplementData.claimNumber}, which was submitted ${daysSince} days ago.

As we have not received a response, I would like to request escalation to a supervisor for review.

The supplement request totals ${supplementData.totalRequested.toLocaleString('en-US', { style: 'currency', currency: 'USD' })} and includes code-required items and standard roofing components.

I am available to discuss this at your convenience.

Thank you.

Best regards`;
      break;

    case 'day_14_supervisor':
      subject = `URGENT: Supervisor Review Requested - Claim ${supplementData.claimNumber}`;
      body = `Dear Supervisor,

I am requesting immediate supervisor review of the supplement request for claim ${supplementData.claimNumber}.

This request was submitted ${daysSince} days ago and we have not received a response despite multiple follow-ups.

The supplement request includes:
- Code-required items
- Standard roofing components
- Total requested: ${supplementData.totalRequested.toLocaleString('en-US', { style: 'currency', currency: 'USD' })}

All supporting documentation and evidence photos have been provided.

I would appreciate your prompt attention to this matter.

Thank you.

Best regards`;
      break;

    default:
      subject = `Follow-Up: Supplement Request - Claim ${supplementData.claimNumber}`;
      body = `Following up on supplement request for claim ${supplementData.claimNumber}.`;
  }

  return { subject, body };
}

/**
 * Check if follow-up is due
 */
export function isFollowUpDue(
  submittedAt: Date,
  lastFollowUpAt?: Date,
  type: FollowUpSchedule['type'] = 'day_3_reminder'
): boolean {
  const now = new Date();
  const daysSinceSubmission = Math.floor(
    (now.getTime() - submittedAt.getTime()) / (1000 * 60 * 60 * 24)
  );

  let requiredDays = 0;
  switch (type) {
    case 'day_3_reminder':
      requiredDays = 3;
      break;
    case 'day_7_escalation':
      requiredDays = 7;
      break;
    case 'day_14_supervisor':
      requiredDays = 14;
      break;
    default:
      return false;
  }

  // Check if enough days have passed
  if (daysSinceSubmission < requiredDays) {
    return false;
  }

  // Check if this follow-up was already sent
  if (lastFollowUpAt) {
    const daysSinceLastFollowUp = Math.floor(
      (now.getTime() - lastFollowUpAt.getTime()) / (1000 * 60 * 60 * 24)
    );
    // Don't send same type of follow-up if one was sent recently
    if (daysSinceLastFollowUp < requiredDays) {
      return false;
    }
  }

  return true;
}





















