import { createSupabaseServer } from "@/lib/supabaseServer";

export interface LogTeamActivityParams {
  workspaceId: string;
  userId: string | null;
  type: string;
  title?: string;
  body?: string;
  metadata?: Record<string, any>;
  leadId?: string | null;
  companyId?: string | null;
  campaignId?: string | null;
  dealId?: string | null;
}

/**
 * Log an activity to the team activity feed
 */
export async function logTeamActivity(params: LogTeamActivityParams): Promise<void> {
  try {
    const supabase = createSupabaseServer();
    
    // Use the database function to log activity
    const { error } = await supabase.rpc('log_team_activity', {
      p_workspace_id: params.workspaceId,
      p_user_id: params.userId || null,
      p_lead_id: params.leadId || null,
      p_company_id: params.companyId || null,
      p_campaign_id: params.campaignId || null,
      p_deal_id: params.dealId || null,
      p_type: params.type,
      p_title: params.title || null,
      p_body: params.body || null,
      p_metadata: params.metadata || {},
    });

    if (error) {
      console.error('Error logging team activity:', error);
      // Don't throw - activity logging should not break the main flow
    }
  } catch (error) {
    console.error('Error logging team activity:', error);
    // Don't throw - activity logging should not break the main flow
  }
}








