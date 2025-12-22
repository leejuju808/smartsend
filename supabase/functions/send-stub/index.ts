// Simulates sending and randomly fails or succeeds, writing logs and status
import { serve } from 'https://deno.land/std@0.224.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);

serve(async () => {
  const { data: leads } = await supabase.from('leads').select('*').eq('status', 'queued').limit(50);
  if (!leads?.length) return new Response('no queued');

  for (const l of leads) {
    await supabase.from('leads').update({ status: 'sending' }).eq('id', l.id);
    const ok = Math.random() > 0.2;
    await new Promise(r => setTimeout(r, 50));
    await supabase.from('leads').update({ status: ok ? 'sent' : 'failed' }).eq('id', l.id);
    await supabase.from('campaign_logs').insert({
      campaign_id: l.campaign_id,
      lead_id: l.id,
      event: ok ? 'send_success' : 'send_failed',
      meta: { stub: true }
    });
  }
  return new Response('done');
});


