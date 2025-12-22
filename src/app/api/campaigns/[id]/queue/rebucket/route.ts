import { NextRequest, NextResponse } from "next/server";
import { cookies } from "next/headers";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";

export async function POST(req: NextRequest, { params }: { params: { id: string }}) {
  const sb = createRouteHandlerClient({ cookies });
  const { data: role } = await sb.rpc('get_user_campaign_role', { p_campaign: params.id });
  if (!['owner', 'editor'].includes(role)) return NextResponse.json({ error: 'not authorized' }, { status: 403 });

  const { limit = 2000 } = await req.json().catch(()=>({}));
  const { data, error } = await sb.rpc("rebucket_queue_to_business_days", { p_campaign: params.id, p_limit: limit });
  if (error) return NextResponse.json({ error: error.message }, { status: 400 });
  return NextResponse.json({ ok: true, shifted: data ?? 0 });
}

