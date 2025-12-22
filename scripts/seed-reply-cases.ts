/**
 * Usage:
 *   SUPABASE_URL=... SUPABASE_SERVICE_ROLE_KEY=... tsx scripts/seed-reply-cases.ts
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

async function rpc<T = any>(fn: string, args?: any) {
  const { data, error } = await sb.rpc(fn, args ?? {});
  if (error) throw new Error(`${fn}: ${error.message}`);
  return data as T;
}

async function select(table: string, sel = '*', match: Record<string, unknown> = {}) {
  let q = sb.from(table).select(sel);
  for (const [k, v] of Object.entries(match)) {
    q = q.eq(k, v as any);
  }
  const { data, error } = await q;
  if (error) throw new Error(`select ${table}: ${error.message}`);
  return data ?? [];
}

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  console.log('🔧 Cleanup old test data…');
  await rpc('test_cleanup').catch(() => {});

  console.log('🧪 Create threads…');
  const tOOO = await rpc<string>('test_make_thread', { p_subject: 'OOO Case' });
  const tHuman = await rpc<string>('test_make_thread', { p_subject: 'Human Case' });
  const tPositive = await rpc<string>('test_make_thread', { p_subject: 'Positive Case' });
  const tBounce = await rpc<string>('test_make_thread', { p_subject: 'Bounce Case' });

  console.log('✉️ Insert inbound messages…');
  await rpc('test_inbound', {
    p_thread: tOOO,
    p_text: "Auto-reply: I'm out of office until Nov 28. Please reach out to Jane.",
  });
  await rpc('test_inbound', {
    p_thread: tHuman,
    p_text: 'Hey, thanks for reaching out. Can you send pricing for 10 seats?',
  });
  await rpc('test_inbound', {
    p_thread: tPositive,
    p_text: "This looks great. Let's book a call this week.",
  });
  await rpc('test_inbound', {
    p_thread: tBounce,
    p_text:
      "Delivery has failed to these recipients or groups. The email address you entered couldn't be found.",
  });

  console.log('⏳ Waiting for Edge Function classification (triggered)…');
  await sleep(3500);

  console.log('🔎 Fetch labels…');
  const labels = await select('v_test_labels', 'thread_id,label,confidence,created_at');
  const threads = await select('v_test_threads', '*');

  const byThread: Record<string, any[]> = {};
  for (const row of labels) {
    const threadId = (row as any).thread_id as string;
    byThread[threadId] = byThread[threadId] ?? [];
    byThread[threadId].push(row);
  }

  console.log('\n=== Classification Results ===');
  for (const [threadId, rows] of Object.entries(byThread)) {
    const summary = rows
      .map((r: any) => `${r.label}(${Number(r.confidence).toFixed(2)})`)
      .join(', ');
    console.log(threadId, summary);
  }

  console.log('\n=== Thread Snooze State ===');
  for (const thread of threads as any[]) {
    console.log(
      `${thread.thread_id} | ${thread.subject} | snoozed_until=${thread.snoozed_until ?? 'NULL'}`
    );
  }

  console.log('\n✅ Done. Expect: OOO thread snoozed≈Nov 28; labels present for all four.');
}

main().catch((error) => {
  console.error('❌ Seed failed:', error);
  process.exit(1);
});

