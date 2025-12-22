import { NextRequest, NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function hashKey(k: string): string {
  return crypto.createHash('sha256').update(k).digest('hex');
}

// POST /api/hq/v1/auth/token - Exchange API key for JWT
export async function POST(req: NextRequest) {
  try {
    const { api_key } = await req.json();

    if (!api_key) {
      return NextResponse.json({ error: 'api_key is required' }, { status: 400 });
    }

    // Find API key
    const { data: keyRow, error } = await supabase
      .from('developer_api_keys')
      .select('id, user_id, status')
      .eq('key_hash', hashKey(api_key))
      .maybeSingle();

    if (error || !keyRow) {
      return NextResponse.json({ error: 'Invalid API key' }, { status: 401 });
    }

    if (keyRow.status !== 'active') {
      return NextResponse.json({ error: 'API key is not active' }, { status: 403 });
    }

    // Generate JWT token for the user
    const { data: { session }, error: sessionError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: '', // We'll just generate a token directly
    });

    // For now, return a simple success response
    // In production, you'd generate a proper JWT here
    return NextResponse.json({
      token: 'jwt_token_placeholder', // TODO: Implement JWT generation
      expires_in: 3600
    });
  } catch (error: any) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

