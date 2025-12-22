import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { createServerClient } from '@supabase/ssr';

export async function POST(req: Request) {
  try {
    const formData = await req.formData();
    const name = formData.get('name') as string;
    
    if (!name || !name.trim()) {
      return NextResponse.json({ error: 'Workspace name is required' }, { status: 400 });
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

    // Create org using RPC function
    const { data: orgId, error } = await supabase.rpc('fn_create_org', { p_name: name.trim() });
    if (error) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    // Also set cookie for client-side access
    const response = NextResponse.redirect(new URL('/settings/workspaces', req.url));
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

