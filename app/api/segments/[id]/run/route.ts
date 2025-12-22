import { NextResponse } from 'next/server';

import { getSupabaseServerClient, requireUserAndAccount } from '@/lib/supabase/server';

type RouteParams = {
  params: { id: string };
};

export async function GET(_req: Request, { params }: RouteParams) {
  try {
    const supabase = getSupabaseServerClient();
    const { user, account } = await requireUserAndAccount(supabase);

    // 1. Load segment definition
    const { data: segment, error: loadErr } = await supabase
      .from('segment_definitions')
      .select('*')
      .eq('id', params.id)
      .eq('account_id', account.id)
      .eq('owner_id', user.id)
      .single();

    if (loadErr || !segment) {
      return NextResponse.json({ error: 'Segment not found' }, { status: 404 });
    }

    const filters = segment.filters ?? [];

    // 2. Build dynamic query for leads
    // Check if we need to filter by score
    const scoreFilter = filters.find((f: any) => f.field === 'lead_score');
    
    let query = supabase.from('leads').select('*').eq('account_id', account.id);

    // Handle lead_score filtering using a subquery
    if (scoreFilter) {
      let scoreQuery = supabase.from('lead_scores').select('lead_id');
      
      switch (scoreFilter.op) {
        case '=':
          scoreQuery = scoreQuery.eq('score', scoreFilter.value);
          break;
        case '!=':
          scoreQuery = scoreQuery.neq('score', scoreFilter.value);
          break;
        case '>=':
        case 'gte':
          scoreQuery = scoreQuery.gte('score', scoreFilter.value);
          break;
        case '<=':
        case 'lte':
          scoreQuery = scoreQuery.lte('score', scoreFilter.value);
          break;
        case 'between':
          scoreQuery = scoreQuery
            .gte('score', scoreFilter.value.from)
            .lte('score', scoreFilter.value.to);
          break;
      }

      const { data: matchingScoreLeads } = await scoreQuery;
      const matchingLeadIds = matchingScoreLeads?.map((s: any) => s.lead_id) || [];
      
      if (matchingLeadIds.length > 0) {
        query = query.in('id', matchingLeadIds);
      } else {
        // No leads match the score filter
        return NextResponse.json({ leads: [] });
      }
    }

    for (const f of filters) {
      // Skip lead_score as we handled it above
      if (f.field === 'lead_score') {
        continue;
      }

      // Handle other fields
      switch (f.op) {
        case '=':
          query = query.eq(f.field, f.value);
          break;
        case '!=':
          query = query.neq(f.field, f.value);
          break;
        case 'contains':
          query = query.ilike(f.field, `%${f.value}%`);
          break;
        case 'starts_with':
          query = query.ilike(f.field, `${f.value}%`);
          break;
        case 'in':
          query = query.in(f.field, f.value);
          break;
        case 'between':
          query = query.gte(f.field, f.value.from).lte(f.field, f.value.to);
          break;
        default:
          console.warn('Unknown operator', f.op);
      }
    }

    // 3. Execute query
    const { data, error } = await query;

    if (error) {
      console.error('RUN SEGMENT ERROR', error);
      return NextResponse.json({ error: 'Failed to run segment' }, { status: 500 });
    }

    return NextResponse.json({ leads: data ?? [] });
  } catch (err) {
    console.error('RUN SEGMENT EXCEPTION', err);
    return NextResponse.json({ error: 'Unexpected error' }, { status: 500 });
  }
}












