import { NextRequest, NextResponse } from 'next/server';
import { checkRepliesForCampaign } from '@/lib/email/replyDetection';
import { supabaseAdmin } from '@/lib/supabase/server';

export async function POST(
  req: NextRequest,
  { params }: { params: { id: string } }
) {
  try {
    const campaignId = params.id;
    const authHeader = req.headers.get('authorization');
    
    if (!authHeader) {
      return NextResponse.json(
        { error: 'Unauthorized - missing authorization header' },
        { status: 401 }
      );
    }

    // Extract user ID from auth token (simplified - you may need to verify the token properly)
    const token = authHeader.replace('Bearer ', '');
    // In production, verify this token and extract userId properly
    const userId = req.headers.get('x-user-id');

    if (!userId) {
      return NextResponse.json(
        { error: 'User ID required' },
        { status: 401 }
      );
    }

    // Get campaign to verify ownership
    const supabase = supabaseAdmin();
    const { data: campaign, error: campaignError } = await supabase
      .from('campaigns')
      .select('id, workspace_id')
      .eq('id', campaignId)
      .maybeSingle();

    if (campaignError || !campaign) {
      return NextResponse.json(
        { error: 'Campaign not found' },
        { status: 404 }
      );
    }

    // Check if user has access to this workspace
    // Add your access control logic here if needed

    // Check for replies
    const repliedEmails = await checkRepliesForCampaign(campaignId, campaign.workspace_id);

    return NextResponse.json({
      success: true,
      campaignId,
      repliedCount: repliedEmails.length,
      repliedEmails,
      message: `Checked ${repliedEmails.length} leads for replies`,
    });

  } catch (error: any) {
    console.error('Error checking replies:', error);
    return NextResponse.json(
      { 
        error: 'Failed to check replies',
        details: error.message 
      },
      { status: 500 }
    );
  }
}
