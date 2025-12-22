// Block 24900 — Follow-Up Brain v2: Follow-Up Brain Score (Diagnostics)
// Tracks follow-up effectiveness metrics

import { supabaseAdmin } from "@/server/supabase";

export interface FollowUpBrainScore {
  overallScore: number;
  avgReplyTimeMinutes: number;
  autoFollowupsSent: number;
  hotLeadsCaught: number;
  missedLeads: number;
  replyRate: number;
  conversionRate: number;
  alerts: string[];
}

/**
 * Calculates Follow-Up Brain Score for a workspace or lead
 */
export async function calculateFollowUpBrainScore(
  workspaceId?: string,
  leadId?: string,
  periodStart?: Date,
  periodEnd?: Date
): Promise<FollowUpBrainScore> {
  const start = periodStart || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000); // Last 30 days
  const end = periodEnd || new Date();

  try {
    // Build query
    let query = supabaseAdmin
      .from('email_logs')
      .select('*');

    if (leadId) {
      query = query.eq('lead_id', leadId);
    } else if (workspaceId) {
      // Get leads for workspace
      const { data: workspaceLeads } = await supabaseAdmin
        .from('leads')
        .select('id')
        .eq('workspace_id', workspaceId);
      
      if (workspaceLeads && workspaceLeads.length > 0) {
        const leadIds = workspaceLeads.map(l => l.id);
        query = query.in('lead_id', leadIds);
      } else {
        return getDefaultScore();
      }
    }

    const { data: emailLogs } = await query
      .gte('sent_at', start.toISOString())
      .lte('sent_at', end.toISOString())
      .eq('source', 'followup_brain_v2');

    if (!emailLogs || emailLogs.length === 0) {
      return getDefaultScore();
    }

    // Calculate metrics
    const totalEmails = emailLogs.length;
    const leadIds = [...new Set(emailLogs.map(e => e.lead_id))];

    // Get replies
    const { data: replies } = await supabaseAdmin
      .from('email_replies')
      .select('*')
      .in('lead_id', leadIds)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    const replyCount = replies?.length || 0;
    const replyRate = totalEmails > 0 ? (replyCount / totalEmails) * 100 : 0;

    // Calculate average reply time
    let avgReplyTimeMinutes = 0;
    if (replies && replies.length > 0) {
      const replyTimes: number[] = [];
      for (const reply of replies) {
        // Find corresponding email log
        const emailLog = emailLogs.find(e => e.lead_id === reply.lead_id);
        if (emailLog && emailLog.sent_at) {
          const sentTime = new Date(emailLog.sent_at).getTime();
          const replyTime = new Date(reply.created_at).getTime();
          const minutes = (replyTime - sentTime) / (1000 * 60);
          if (minutes > 0 && minutes < 7 * 24 * 60) { // Within 7 days
            replyTimes.push(minutes);
          }
        }
      }
      if (replyTimes.length > 0) {
        avgReplyTimeMinutes = replyTimes.reduce((a, b) => a + b, 0) / replyTimes.length;
      }
    }

    // Get hot leads caught
    const { data: hotActivations } = await supabaseAdmin
      .from('hot_lead_activations')
      .select('*')
      .in('lead_id', leadIds)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    const hotLeadsCaught = hotActivations?.length || 0;

    // Calculate missed leads (leads that should have been followed up but weren't)
    const { data: allLeads } = await supabaseAdmin
      .from('leads')
      .select('id, created_at, status')
      .in('id', leadIds)
      .gte('created_at', start.toISOString())
      .lte('created_at', end.toISOString());

    const leadsNeedingFollowup = allLeads?.filter(l => 
      l.status !== 'closed_lost' && 
      l.status !== 'unsubscribed'
    ).length || 0;

    const missedLeads = Math.max(0, leadsNeedingFollowup - totalEmails);

    // Calculate conversion rate (leads that became qualified/won)
    const { data: convertedLeads } = await supabaseAdmin
      .from('leads')
      .select('id')
      .in('id', leadIds)
      .in('status', ['qualified', 'won', 'hot_lead'])
      .gte('updated_at', start.toISOString())
      .lte('updated_at', end.toISOString());

    const conversionRate = leadIds.length > 0 
      ? ((convertedLeads?.length || 0) / leadIds.length) * 100 
      : 0;

    // Calculate overall score (0-100)
    let overallScore = 0;
    
    // Reply rate component (40%)
    overallScore += Math.min(40, (replyRate / 100) * 40);
    
    // Hot leads component (30%)
    const hotLeadScore = Math.min(30, (hotLeadsCaught / Math.max(1, leadIds.length / 10)) * 30);
    overallScore += hotLeadScore;
    
    // Reply time component (20%) - faster is better
    const replyTimeScore = Math.max(0, 20 - (avgReplyTimeMinutes / 60) * 5);
    overallScore += replyTimeScore;
    
    // Conversion rate component (10%)
    overallScore += Math.min(10, (conversionRate / 100) * 10);

    // Generate alerts
    const alerts: string[] = [];
    
    if (missedLeads > 0) {
      alerts.push(`You're missing ${missedLeads} follow-ups worth potential revenue.`);
    }
    
    if (avgReplyTimeMinutes > 240) { // 4 hours
      alerts.push('Reply consistency dropped — average reply time is high.');
    }
    
    if (replyRate < 10) {
      alerts.push('Reply rate is low — consider adjusting follow-up timing.');
    }

    return {
      overallScore: Math.round(overallScore),
      avgReplyTimeMinutes: Math.round(avgReplyTimeMinutes * 100) / 100,
      autoFollowupsSent: totalEmails,
      hotLeadsCaught,
      missedLeads,
      replyRate: Math.round(replyRate * 100) / 100,
      conversionRate: Math.round(conversionRate * 100) / 100,
      alerts,
    };
  } catch (error) {
    console.error('Error calculating Follow-Up Brain Score:', error);
    return getDefaultScore();
  }
}

/**
 * Saves Follow-Up Brain Score to database
 */
export async function saveFollowUpBrainScore(
  score: FollowUpBrainScore,
  workspaceId?: string,
  leadId?: string,
  periodStart?: Date,
  periodEnd?: Date
): Promise<void> {
  try {
    await supabaseAdmin
      .from('followup_brain_scores')
      .insert({
        workspace_id: workspaceId || null,
        lead_id: leadId || null,
        score_period_start: (periodStart || new Date()).toISOString(),
        score_period_end: (periodEnd || new Date()).toISOString(),
        overall_score: score.overallScore,
        avg_reply_time_minutes: score.avgReplyTimeMinutes,
        auto_followups_sent: score.autoFollowupsSent,
        hot_leads_caught: score.hotLeadsCaught,
        missed_leads: score.missedLeads,
        reply_rate: score.replyRate,
        conversion_rate: score.conversionRate,
        metrics: {},
        alerts: score.alerts,
      });
  } catch (error) {
    console.error('Error saving Follow-Up Brain Score:', error);
  }
}

function getDefaultScore(): FollowUpBrainScore {
  return {
    overallScore: 0,
    avgReplyTimeMinutes: 0,
    autoFollowupsSent: 0,
    hotLeadsCaught: 0,
    missedLeads: 0,
    replyRate: 0,
    conversionRate: 0,
    alerts: [],
  };
}






































