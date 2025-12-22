import { NextResponse } from 'next/server';
import { serverSB } from '@/lib/org';

export async function GET() {
  try {
    const sb = await serverSB();
    
    const { data: current } = await sb.rpc('fn_current_org');
    const { data: orgs } = await sb.rpc('fn_list_my_orgs');
    
    return NextResponse.json({ current, orgs: orgs ?? [] });
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

