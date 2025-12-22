// supabase/functions/reset-mailbox-daily/index.ts
// Daily reset cron job for mailbox counters and warmup progression

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const supabase = createClient(supabaseUrl, supabaseServiceKey, {
  auth: { persistSession: false },
});

Deno.serve(async () => {
  try {
    console.log('Starting daily mailbox reset...');

    // Call the database function to reset all mailboxes
    const { data, error } = await supabase.rpc('reset_mailbox_daily');

    if (error) {
      console.error('Error resetting mailboxes:', error);
      return new Response(
        JSON.stringify({ ok: false, error: error.message }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const resetCount = data || 0;
    console.log(`Reset ${resetCount} mailboxes`);

    return new Response(
      JSON.stringify({ 
        ok: true, 
        resetCount,
        timestamp: new Date().toISOString() 
      }),
      { 
        status: 200, 
        headers: { 'Content-Type': 'application/json' } 
      }
    );
  } catch (err) {
    console.error('Unexpected error:', err);
    return new Response(
      JSON.stringify({ ok: false, error: String(err) }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});










