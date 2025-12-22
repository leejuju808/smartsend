import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;

/**
 * Get the next batch of jobs from send_queue, ordered by lead priority
 * 
 * This function:
 * 1. Fetches pending jobs from send_queue
 * 2. Joins with lead_scores to get priority scores
 * 3. Orders by priority (desc) first, then scheduled_for (asc)
 * 4. Returns the hottest leads first
 */
export async function nextJobs(batch = 50, orgId?: string): Promise<any[]> {
  const sb = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    // If no org_id provided, we'll need to filter in the application
    let query = sb
      .from('send_queue')
      .select(`
        id,
        lead_id,
        campaign_id,
        scheduled_for,
        org_id
      `)
      .eq('status', 'pending')
      .lte('scheduled_for', new Date().toISOString());

    if (orgId) {
      query = query.eq('org_id', orgId);
    }

    const { data: jobs, error } = await query
      .order('scheduled_for', { ascending: true })
      .limit(500);

    if (error) {
      console.error('Failed to fetch jobs:', error);
      return [];
    }

    if (!jobs || jobs.length === 0) {
      return [];
    }

    // Extract unique lead_ids
    const leadIds = jobs.map(j => j.lead_id).filter(Boolean);
    
    if (leadIds.length === 0) {
      // No lead_ids, return jobs as-is (first scheduled first)
      return jobs.slice(0, batch);
    }

    // Fetch scores for these leads
    const { data: scores, error: scoresError } = await sb
      .from('lead_scores')
      .select('lead_id, priority')
      .in('lead_id', leadIds);

    if (scoresError) {
      console.error('Failed to fetch lead scores:', scoresError);
      // Fall back to regular ordering if scores fail
      return jobs.slice(0, batch);
    }

    // Create a map of lead_id -> priority
    const scoreMap = new Map<string, number>();
    scores?.forEach((s: any) => {
      scoreMap.set(s.lead_id, s.priority || 0);
    });

    // Sort jobs by priority (desc) first, then scheduled_for (asc)
    const sorted = jobs.sort((a: any, b: any) => {
      const aPriority = a.lead_id ? (scoreMap.get(a.lead_id) || 0) : 0;
      const bPriority = b.lead_id ? (scoreMap.get(b.lead_id) || 0) : 0;
      
      // If priorities differ, sort by priority (higher first)
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      
      // Same priority, sort by scheduled_for (earlier first)
      const aScheduled = new Date(a.scheduled_for).getTime();
      const bScheduled = new Date(b.scheduled_for).getTime();
      return aScheduled - bScheduled;
    });

    return sorted.slice(0, batch);
  } catch (error) {
    console.error('Error in nextJobs:', error);
    return [];
  }
}

/**
 * Get jobs for a specific campaign, prioritized by lead score
 */
export async function nextJobsForCampaign(campaignId: string, batch = 50): Promise<any[]> {
  const sb = createClient(supabaseUrl, supabaseServiceKey);
  
  try {
    const { data: jobs, error } = await sb
      .from('send_queue')
      .select(`
        id,
        lead_id,
        campaign_id,
        scheduled_for,
        org_id
      `)
      .eq('status', 'pending')
      .eq('campaign_id', campaignId)
      .lte('scheduled_for', new Date().toISOString())
      .order('scheduled_for', { ascending: true })
      .limit(500);

    if (error || !jobs || jobs.length === 0) {
      return [];
    }

    const leadIds = jobs.map(j => j.lead_id).filter(Boolean);
    
    if (leadIds.length === 0) {
      return jobs.slice(0, batch);
    }

    const { data: scores } = await sb
      .from('lead_scores')
      .select('lead_id, priority')
      .in('lead_id', leadIds);

    const scoreMap = new Map<string, number>();
    scores?.forEach((s: any) => {
      scoreMap.set(s.lead_id, s.priority || 0);
    });

    const sorted = jobs.sort((a: any, b: any) => {
      const aPriority = a.lead_id ? (scoreMap.get(a.lead_id) || 0) : 0;
      const bPriority = b.lead_id ? (scoreMap.get(b.lead_id) || 0) : 0;
      
      if (aPriority !== bPriority) {
        return bPriority - aPriority;
      }
      
      return new Date(a.scheduled_for).getTime() - new Date(b.scheduled_for).getTime();
    });

    return sorted.slice(0, batch);
  } catch (error) {
    console.error('Error in nextJobsForCampaign:', error);
    return [];
  }
}

