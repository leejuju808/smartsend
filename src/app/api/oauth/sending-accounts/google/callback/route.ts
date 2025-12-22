import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { createRouteHandlerClient } from '@supabase/auth-helpers-nextjs';
import { cookies } from 'next/headers';

const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!);

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  if (!code) return NextResponse.json({ error: 'No code' }, { status: 400 });

  // Exchange code for tokens
  const r = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      code,
      client_id: process.env.GOOGLE_CLIENT_ID!,
      client_secret: process.env.GOOGLE_CLIENT_SECRET!,
      redirect_uri: `${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL}/api/oauth/sending-accounts/google/callback`,
      grant_type: 'authorization_code'
    }),
    cache: 'no-store'
  });
  
  const tok = await r.json();
  if (!r.ok) return NextResponse.json(tok, { status: 400 });

  // Get user email for this Google account
  const ir = await fetch('https://www.googleapis.com/oauth2/v2/userinfo', {
    headers: { Authorization: `Bearer ${tok.access_token}` }
  });
  const info = await ir.json();

  // Calculate token expiration
  const expiresAt = new Date(Date.now() + (tok.expires_in ?? 3600) * 1000).toISOString();

  // Get current user session
  const supabaseAuth = createRouteHandlerClient({ cookies });
  const { data: { user } } = await supabaseAuth.auth.getUser();
  
  if (!user) {
    return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  }

  // Upsert sending account with user_id
  await supabase.from('sending_accounts').upsert({
    user_id: user.id,
    provider: 'gmail',
    email_address: info.email,
    oauth_access_token: tok.access_token,
    oauth_refresh_token: tok.refresh_token,
    token_expires_at: expiresAt,
    provider_scopes: ['gmail.send', 'gmail.readonly']
  }, { onConflict: 'email_address' });

  return NextResponse.redirect(`${process.env.APP_URL || process.env.NEXT_PUBLIC_APP_URL}/dashboard/settings?connected=gmail`);
}
