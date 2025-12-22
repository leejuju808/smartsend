import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { toCSV } from '@/lib/csv';

type Kind = 'activity' | 'send_logs' | 'inbox' | 'billing';

export async function GET(req: Request) {
  const url = new URL(req.url);
  const kind = (url.searchParams.get('kind') as Kind) || 'activity';
  const fmt = (url.searchParams.get('format') || 'csv').toLowerCase(); // csv | json
  const campaignId = url.searchParams.get('campaignId'); // optional for activity/send/inbox
  const from = url.searchParams.get('from'); // ISO
  const to = url.searchParams.get('to'); // ISO
  const limit = Math.min(Number(url.searchParams.get('limit') || 5000), 50000);

  const supabase = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });

  // Build query per kind (RLS ensures only allowed rows)
  let rows: any[] = [];
  const dateCol = (k: Kind) =>
    k === 'billing' ? 'updated_at_utc' : k === 'inbox' ? 'received_at_utc' : 'created_at_utc';

  if (kind === 'activity') {
    let q = supabase.from('v_export_activity').select('*', { count: 'exact', head: false });
    if (campaignId) q = q.eq('campaign_id', campaignId);
    if (from) q = q.gte(dateCol(kind), from);
    if (to) q = q.lte(dateCol(kind), to);
    q = q.order(dateCol(kind) as any, { ascending: false }).limit(limit);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    rows = data || [];
  }

  if (kind === 'send_logs') {
    let q = supabase.from('v_export_send_logs').select('*');
    if (campaignId) q = q.eq('campaign_id', campaignId);
    if (from) q = q.gte(dateCol(kind), from);
    if (to) q = q.lte(dateCol(kind), to);
    q = q.order(dateCol(kind) as any, { ascending: false }).limit(limit);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    rows = data || [];
  }

  if (kind === 'inbox') {
    let q = supabase.from('v_export_inbox').select('*').eq('direction', 'in');
    if (campaignId) q = q.eq('campaign_id', campaignId);
    if (from) q = q.gte(dateCol(kind), from);
    if (to) q = q.lte(dateCol(kind), to);
    q = q.order(dateCol(kind) as any, { ascending: false }).limit(limit);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    rows = data || [];
  }

  if (kind === 'billing') {
    // Billing is user-scoped; only return current user's record
    let q = supabase.from('v_export_billing').select('*').eq('user_id', user.id);
    if (from) q = q.gte(dateCol(kind), from);
    if (to) q = q.lte(dateCol(kind), to);
    q = q.order(dateCol(kind) as any, { ascending: false }).limit(limit);
    const { data, error } = await q;
    if (error) return NextResponse.json({ error: error.message }, { status: 400 });
    rows = data || [];
  }

  if (fmt === 'json') {
    return NextResponse.json({ rows });
  }

  const csv = toCSV(rows);
  const filename = `smartsend_${kind}_${new Date().toISOString().slice(0, 10)}.csv`;
  return new NextResponse(csv, {
    status: 200,
    headers: {
      'Content-Type': 'text/csv; charset=utf-8',
      'Content-Disposition': `attachment; filename="${filename}"`,
    },
  });
}

