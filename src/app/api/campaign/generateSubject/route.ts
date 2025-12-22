import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { generateSubjectLine, EnhancementContext } from '@/lib/campaign-enhancer';

/**
 * POST /api/campaign/generateSubject
 * 
 * Generates optimized subject lines for a campaign
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user } } = await supabase.auth.getUser();
    
    if (!user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const {
      campaignId,
      originalSubject,
      recipientData,
      listType,
      stormData,
    } = body;

    if (!campaignId && !originalSubject) {
      return NextResponse.json(
        { error: 'campaignId or originalSubject is required' },
        { status: 400 }
      );
    }

    let subject = originalSubject;
    let contextData: any = {};

    // Load campaign if campaignId provided
    if (campaignId) {
      const { data: campaign } = await supabase
        .from('campaigns_new')
        .select('subject')
        .eq('id', campaignId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (campaign) {
        subject = campaign.subject;
      }
    }

    // Build context
    const context: EnhancementContext = {
      campaignId: campaignId || '',
      userId: user.id,
      originalSubject: subject,
      originalBodyHtml: '',
      originalBodyText: '',
      recipientData,
      listType,
      stormData,
    };

    // Generate subject
    const result = await generateSubjectLine(context, subject);

    return NextResponse.json({
      subject: result.subject,
      generated: result.generated,
    });
  } catch (error: any) {
    console.error('Subject generation error:', error);
    return NextResponse.json(
      { error: error.message || 'Subject generation failed' },
      { status: 500 }
    );
  }
}

// Export the function for use in other modules
export { generateSubjectLine };





















































