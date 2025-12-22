import { NextRequest } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import crypto from 'node:crypto';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

function hashKey(k: string): string {
  return crypto.createHash('sha256').update(k).digest('hex');
}

export interface ApiAuthResult {
  ok: boolean;
  status?: number;
  msg?: string;
  userId?: string;
  keyId?: string;
  keyData?: any;
}

/**
 * Authenticate API request using JWT or API key
 */
export async function authenticateApiRequest(authorization?: string): Promise<ApiAuthResult> {
  if (!authorization) {
    return { ok: false, status: 401, msg: 'Missing authorization header' };
  }

  // Try JWT auth first
  if (authorization.startsWith('Bearer ')) {
    const token = authorization.slice('Bearer '.length).trim();
    
    // Check if it's a JWT (basic heuristic: contains dots)
    if (token.includes('.')) {
      try {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) {
          return { ok: false, status: 401, msg: 'Invalid JWT token' };
        }
        return { ok: true, userId: user.id };
      } catch (e) {
        return { ok: false, status: 401, msg: 'Invalid JWT token' };
      }
    }
    
    // Otherwise treat as API key
    return authenticateApiKey(token);
  }

  return { ok: false, status: 401, msg: 'Invalid authorization format' };
}

/**
 * Authenticate using API key
 */
async function authenticateApiKey(key: string): Promise<ApiAuthResult> {
  const { data: keyRow, error } = await supabase
    .from('developer_api_keys')
    .select('id, user_id, org_id, scope, status')
    .eq('key_hash', hashKey(key))
    .maybeSingle();

  if (error || !keyRow) {
    return { ok: false, status: 401, msg: 'Invalid API key' };
  }

  // Check if key is active
  if (keyRow.status !== 'active') {
    return { ok: false, status: 403, msg: 'API key is not active' };
  }

  // Rate limit (simple per-minute cap)
  const rateLimitPerMin = keyRow.rate_limit_per_min || 100;
  const { data: count } = await supabase.rpc('developer_api_usage_inc', {
    p_key_id: keyRow.id,
    p_endpoint: '', // Will be set by caller
    p_method: '',
    p_status_code: 200
  }) as { data: number };

  if ((count as any) > rateLimitPerMin) {
    return { ok: false, status: 429, msg: 'Rate limit exceeded' };
  }

  // Update last_used_at (best effort)
  supabase
    .from('developer_api_keys')
    .update({ last_used_at: new Date().toISOString() })
    .eq('id', keyRow.id)
    .then(() => {}, () => {});

  return {
    ok: true,
    userId: keyRow.user_id,
    keyId: keyRow.id,
    keyData: keyRow
  };
}

/**
 * Create middleware for API authentication
 */
export function withApiAuth(handler: (req: NextRequest, auth: ApiAuthResult) => Promise<Response>) {
  return async (req: NextRequest): Promise<Response> => {
    const auth = await authenticateApiRequest(req.headers.get('authorization'));
    
    if (!auth.ok) {
      return new Response(
        JSON.stringify({ error: auth.msg }),
        { 
          status: auth.status || 401,
          headers: { 'Content-Type': 'application/json' }
        }
      );
    }

    return handler(req, auth);
  };
}

