import { serve } from "https://deno.land/std@0.216.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

serve(async (req) => {
  try {
    // CORS headers
    if (req.method === 'OPTIONS') {
      return new Response(null, { 
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
        }
      });
    }

    if (req.method !== 'POST') {
      return new Response(JSON.stringify({ error: 'Method Not Allowed' }), { 
        status: 405,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Get Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supa = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const body = await req.json();
    const { app, org_id, user_id, type, meta } = body;

    // Validate required fields
    if (!app || !type) {
      return new Response(JSON.stringify({ error: 'Missing required fields: app, type' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Validate app value
    if (!['smartsend', 'opsgrid', 'agentcloud'].includes(app)) {
      return new Response(JSON.stringify({ error: 'Invalid app. Must be: smartsend, opsgrid, or agentcloud' }), { 
        status: 400,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    // Insert event
    const { data, error } = await supa
      .from('events_bus')
      .insert({
        app,
        org_id: org_id || null,
        user_id: user_id || null,
        type,
        meta: meta || {}
      })
      .select()
      .single();

    if (error) {
      console.error('Error inserting event:', error);
      return new Response(JSON.stringify({ error: error.message }), { 
        status: 500,
        headers: { 'Content-Type': 'application/json' }
      });
    }

    return new Response(JSON.stringify({ ok: true, id: data.id }), { 
      status: 200,
      headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
      }
    });
  } catch (error) {
    console.error('Unexpected error:', error);
    return new Response(JSON.stringify({ error: 'Internal Server Error' }), { 
      status: 500,
      headers: { 'Content-Type': 'application/json' }
    });
  }
});

