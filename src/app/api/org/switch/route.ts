import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const orgId = formData.get('orgId') as string;
    
    if (!orgId) {
      return NextResponse.json({ error: 'orgId is required' }, { status: 400 });
    }

    const cookieStore = cookies();
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return cookieStore.get(name)?.value;
          },
        },
      }
    );

    // Verify user is authenticated
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    // Switch org using RPC function
    const { error } = await supabase.rpc('fn_set_current_org', { p_org_id: orgId });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Also set cookie for client-side access
    const response = NextResponse.json({ success: true, org_id: orgId });
    response.cookies.set('org_id', orgId, { 
      path: '/', 
      httpOnly: false,
      maxAge: 60 * 60 * 24 * 365 // 1 year
    });

    return response;
  } catch (error: any) {
    return NextResponse.json({ error: error.message || 'Internal server error' }, { status: 500 });
  }
}

