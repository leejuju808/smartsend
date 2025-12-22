import { NextResponse } from 'next/server';
import { getSupabaseServer } from '@/lib/supabase/server';

export async function GET() {
  const supabase = getSupabaseServer();
  const { data: { user } } = await supabase.auth.getUser();
  
  if (!user) {
    return NextResponse.json(
      { ok: false, error: { code: 'AUTH', msg: 'Sign in required' } },
      { status: 401 }
    );
  }

  const { data, error } = await supabase
    .from('saved_templates')
    .select('template:templates(id,title,tags,updated_at)')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    return NextResponse.json(
      { ok: false, error: { code: 'DB', msg: error.message } },
      { status: 500 }
    );
  }

  const items = (data || [])
    .map((row: any) => row.template)
    .filter(Boolean);

  return NextResponse.json({ ok: true, data: { items } });
} 