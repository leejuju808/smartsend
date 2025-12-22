import { serve } from "https://deno.land/std@0.216.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  if (req.method !== 'POST') {
    return new Response('Method Not Allowed', { status: 405 });
  }

  try {
    const { thread_id, status } = await req.json();
    
    if (!thread_id || !['unreplied','replied','needs_review','archived'].includes(status)) {
      return new Response(JSON.stringify({ error: 'Bad Request' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    
    if (!supabaseUrl || !supabaseServiceKey) {
      return new Response(JSON.stringify({ error: 'Server configuration error' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const supa = createClient(supabaseUrl, supabaseServiceKey);
    
    // Get user from token
    const token = req.headers.get('Authorization')?.replace('Bearer ','');
    if (!token) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const { data: userData, error: userError } = await supa.auth.getUser(token);
    
    if (userError || !userData?.user) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    const user = userData.user;
    
    // Get org_id from user metadata or profile
    let org_id: string | null = user.app_metadata?.org_id || null;
    
    if (!org_id) {
      // Fallback: get from profiles table
      const { data: profile } = await supa
        .from('profiles')
        .select('org_id')
        .eq('id', user.id)
        .single();
      
      org_id = profile?.org_id || null;
    }

    if (!org_id) {
      return new Response(JSON.stringify({ error: 'No organization found' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Update thread status (RLS will ensure org_id matches)
    const { error } = await supa
      .from('email_threads')
      .update({ 
        status, 
        updated_at: new Date().toISOString() 
      })
      .eq('id', thread_id)
      .eq('org_id', org_id);

    if (error) {
      console.error('Error updating thread:', error);
      return new Response(JSON.stringify({ error: error.message }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ok: true }), {
      headers: { 'Content-Type': 'application/json' }
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

