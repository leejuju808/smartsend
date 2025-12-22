import { NextResponse } from 'next/server';
import { checkRepliesForAllCampaigns } from '@/lib/email/replyDetection';
import { supabaseAdmin } from '@/lib/supabase/server';

/**
 * Cron job endpoint to periodically check for replies across all campaigns
 * This should be called by a scheduled job (e.g., every 15 minutes)
 */
export async function GET(req: Request) {
  try {
    const authHeader = req.headers.get('authorization');
    
    // Verify cron job authentication (add your secret check here)
    const expectedSecret = process.env.CRON_SECRET;
    const providedSecret = req.headers.get('x-cron-secret');
    
    if (expectedSecret && providedSecret !== expectedSecret) {
      return NextResponse.json(
        { error: 'Unauthorized' },
        { status: 401 }
      );
    }

    console.log('🔄 Starting automated reply detection...');

    // Get all active workspaces/users
    const supabase = supabaseAdmin();
    const { data: mailboxes, error: mailboxesError } = await supabase
      .from('mailboxes')
      .select('owner, provider')
      .eq('provider', 'gmail')
      .eq('verified', true);

    if (mailboxesError || !mailboxes?.length) {
      return NextResponse.json({
        success: true,
        message: 'No Gmail mailboxes to check',
        processed: 0,
      });
    }

    const results: Array<{
      ownerId: string;
      campaignsChecked: number;
      leadsReplied: number;
    }> = [];

    // Check replies for each mailbox owner
    for (const mailbox of mailboxes) {
      try {
        const result = await checkRepliesForAllCampaigns(mailbox.owner);
        results.push({
          ownerId: mailbox.owner,
          ...result,
        });
      } catch (error) {
        console.error(`Error checking replies for owner ${mailbox.owner}:`, error);
      }
    }

    const totalCampaigns = results.reduce((sum, r) => sum + r.campaignsChecked, 0);
    const totalReplied = results.reduce((sum, r) => sum + r.leadsReplied, 0);

    console.log(`✅ Reply check complete: ${totalReplied} leads marked as replied across ${totalCampaigns} campaigns`);

    return NextResponse.json({
      success: true,
      processed: mailboxes.length,
      totalCampaigns,
      totalLeadsReplied: totalReplied,
      results,
      timestamp: new Date().toISOString(),
    });

  } catch (error: any) {
    console.error('Error in cron reply check:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message,
      },
      { status: 500 }
    );
  }
}
