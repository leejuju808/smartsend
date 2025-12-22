/**
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... tsx scripts/seed-rewriter-cases.ts
 */
import { createClient } from '@supabase/supabase-js';

const url = process.env.SUPABASE_URL;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url) {
  throw new Error('SUPABASE_URL env var is required');
}

if (!key) {
  throw new Error('SUPABASE_SERVICE_ROLE_KEY env var is required');
}

const sb = createClient(url, key, { auth: { persistSession: false } });

async function rpc<T = any>(fn: string, args?: Record<string, unknown>) {
  const { data, error } = await sb.rpc(fn, args ?? {});
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

async function sel(table: string, sel = '*', match: Record<string, unknown> = {}) {
  let q = sb.from(table).select(sel);
  for (const [k, v] of Object.entries(match)) {
    q = q.eq(k, v as any);
  }
  const { data, error } = await q;
  if (error) throw new Error(`select ${table}: ${error.message}`);
  return data ?? [];
}

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function makeCase(subject: string, outbound: string, inbound: string, label: string) {
  const tId = await rpc<string>('test_make_thread', { p_subject: subject });
  const inId = await rpc<string>('test_thread_messages', {
    p_thread: tId,
    p_outbound: outbound,
    p_inbound: inbound,
  });

  const thread = (await sel('inbox_threads', 'id,campaign_id', { id: tId }))[0];

  const { error: rcErr } = await sb.from('reply_classes').insert({
    message_id: inId,
    thread_id: tId,
    campaign_id: (thread as any)?.campaign_id,
    label,
    confidence: 0.9,
    ai_version: 'v1',
  });
  if (rcErr) throw new Error(`insert reply_classes: ${rcErr.message}`);

  return { tId, inId, label };
}

async function main() {
  console.log('🔧 Cleanup…');
  await rpc('test_cleanup_rewriter').catch(() => {});

  console.log('🚩 Ensure feature flag is ON');
  await sb
    .from('feature_flags')
    .upsert({ key: 'template_rewriter_enabled', enabled: true }, { onConflict: 'key' });

  console.log('🧪 Creating cases…');
  await makeCase(
    'Positive → book',
    'Following up on SmartSend. We help automate follow-ups and tracking.',
    'Looks good — we can move forward this week.',
    'positive'
  );
  await makeCase(
    'Question → answer + CTA',
    'Quick intro to SmartSend.',
    'Can you share pricing and whether you support Outlook + Gmail?',
    'question'
  );
  await makeCase(
    'Neutral → value + soft CTA',
    'Checking in on the automation piece.',
    'Thanks, will review with the team.',
    'neutral'
  );
  await makeCase(
    'Routing → confirm + handoff',
    'Following up on your workflow.',
    'Please contact our ops manager at ops@acme.com.',
    'routing'
  );

  console.log('⏳ Waiting for rewriter to run…');
  await sleep(4000);

  const drafts = await sel('v_test_rewrites');
  console.log('\n=== Rewrites (latest first) ===');
  for (const d of drafts as any[]) {
    console.log(`${(d as any).created_at} | ${d.reply_label} | ${d.thread_id} | ${d.subject}`);
  }

  if ((drafts as any[]).length < 4) {
    console.log('\n❌ Expected ≥ 4 rewrites. Check function logs and feature flag.');
    process.exit(1);
  }

  console.log('\n✅ Done. Rewriter produced drafts for all qualifying labels.');
}

main().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});


