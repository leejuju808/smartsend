// /app/api/campaigns/[id]/queue/route.ts
import { NextRequest, NextResponse } from "next/server";
import { requireWorkspace } from "@/lib/workspace/withWorkspace";
import { buildQueueForCampaign } from "@/lib/campaigns/buildQueue";
import { getServerSupabase } from "@/lib/supabase/server";

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const supabase = getServerSupabase();
  const { data: { user }, error: uerr } = await supabase.auth.getUser();
  if (uerr || !user) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  try {
    const { data, error } = await supabase
      .from('campaign_recipients')
      .select('*, campaign_messages(id, open_count, click_count, last_open_at, last_click_at)')
      .eq('campaign_id', params.id);
    
    if (error) throw error;
    
    return NextResponse.json({ queue: data || [] });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "fetch failed" }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const gate = await requireWorkspace(req);
  if ("error" in gate) return gate.error;

  try {
    const { enqueued } = await buildQueueForCampaign(params.id, gate.workspace_id);
    return NextResponse.json({ success: true, enqueued });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e?.message || "queue build failed" }, { status: 500 });
  }
}