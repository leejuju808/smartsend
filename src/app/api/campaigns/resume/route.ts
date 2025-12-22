import { NextRequest, NextResponse } from 'next/server';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';
import { blockIfAutopilotEnabled } from "@/lib/autopilot/guard";

export async function POST(request: NextRequest) {
  try {
    // Verify authentication
    const supabase = createRouteHandlerClient({ cookies });
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Parse request body
    const body = await request.json();
    const { id: campaign_id } = body;
    
    if (!campaign_id) {
      return NextResponse.json(
        { error: 'Missing campaign id' },
        { status: 400 }
      );
    }

    // BLOCK 273000 — AUTOPILOT: owner cannot resume campaigns.
    const { data: campRow } = await supabase
      .from("campaigns")
      .select("workspace_id")
      .eq("id", campaign_id)
      .maybeSingle();
    const workspaceId = String((campRow as any)?.workspace_id || "");
    if (workspaceId) {
      const gate = await blockIfAutopilotEnabled({
        req: request,
        workspaceId,
        action: "Resume campaign",
      });
      if (gate.blocked) return gate.response;
    }

    // Set all send_queue state back to Queued (resume)
    await supabase
      .from('send_queue')
      .update({ 
        state: 'Queued',
        locked_at: null,
        worker_id: null
      })
      .eq('campaign_id', campaign_id)
      .in('state', ['Locked', 'Error']);

    // Update campaign status to Running
    const { error: updateError } = await supabase
      .from('campaigns')
      .update({
        status: 'Running',
        updated_at: new Date().toISOString()
      })
      .eq('id', campaign_id);

    if (updateError) {
      console.error('Error resuming campaign:', updateError);
      if (String((updateError as any)?.message || "").includes("System performance indicates continuation")) {
        return NextResponse.json({ error: "System performance indicates continuation." }, { status: 423 });
      }
      return NextResponse.json(
        { error: 'Failed to resume campaign' },
        { status: 500 }
      );
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    console.error('Campaign resume error:', error);
    return NextResponse.json(
      { error: 'Failed to resume campaign' },
      { status: 500 }
    );
  }
}

