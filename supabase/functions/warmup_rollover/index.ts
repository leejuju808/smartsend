import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const supabase = createClient(
  Deno.env.get('SUPABASE_URL')!,
  Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
);

Deno.serve(async () => {
  // Initialize start date if missing; increment day if warmup enabled
  const { error } = await supabase.rpc('warmup_rollover_task');
  
  if (error) {
    console.error('Warmup rollover error:', error);
    return new Response(JSON.stringify({ error: error.message }), { status: 500 });
  }
  
  return new Response('ok');
});

