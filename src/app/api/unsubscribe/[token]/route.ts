import { NextRequest, NextResponse } from 'next/server';
import { createEnhancedUnsubscribeManager } from '@/lib/unsub-enhanced';
import { createClient } from '@supabase/supabase-js';

export async function POST(
  request: NextRequest,
  { params }: { params: { token: string } }
) {
  try {
    const { token } = params;

    if (!token) {
      return NextResponse.json(
        { success: false, message: 'Missing unsubscribe token' },
        { status: 400 }
      );
    }

    // Process the unsubscribe token
    const unsubscribeManager = createEnhancedUnsubscribeManager();
    const result = await unsubscribeManager.useToken(token);

    if (!result) {
      return NextResponse.json(
        { success: false, message: 'Invalid or expired unsubscribe token' },
        { status: 400 }
      );
    }

    // Get campaign name if available
    let campaignName: string | undefined;
    if (result.campaignId) {
      const supabase = createClient(
        process.env.NEXT_PUBLIC_SUPABASE_URL!,
        process.env.SUPABASE_SERVICE_ROLE_KEY!
      );

      const { data: campaign } = await supabase
        .from('campaigns')
        .select('name')
        .eq('id', result.campaignId)
        .single();

      campaignName = campaign?.name;
    }

    // Auto-stop future sends if this was campaign-specific
    if (result.campaignId && result.contactId) {
      try {
        const supabase = createClient(
          process.env.NEXT_PUBLIC_SUPABASE_URL!,
          process.env.SUPABASE_SERVICE_ROLE_KEY!
        );

        // Use the database function for auto-stop
        await supabase.rpc('stop_future_sends', {
          p_workspace_id: result.workspaceId,
          p_contact_id: result.contactId,
          p_campaign_id: result.campaignId,
          p_reason: 'unsubscribed',
        });
      } catch (error) {
        console.error('Error auto-stopping future sends:', error);
      }
    }

    return NextResponse.json({
      success: true,
      message: 'Successfully unsubscribed',
      email: result.email,
      campaignName,
      workspaceId: result.workspaceId,
      campaignId: result.campaignId,
      contactId: result.contactId,
    });

  } catch (error) {
    console.error('Error processing unsubscribe token:', error);
    return NextResponse.json(
      { success: false, message: 'Failed to process unsubscribe request' },
      { status: 500 }
    );
  }
} 