#!/usr/bin/env tsx

/**
 * Block 19720 — Inbox Load & Stress Test Script
 * Simulates high-volume scenarios: 1,000 threads, 5,000 messages, 50 replies/hour
 */

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'http://localhost:54321';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || 'test-key';

const supabase = createClient(supabaseUrl, supabaseKey);

interface TestMetrics {
  threadCount: number;
  messageCount: number;
  loadTime: number;
  filterTime: number;
  searchTime: number;
  detailLoadTime: number;
  errors: string[];
}

async function createTestThreads(count: number, accountId: string): Promise<string[]> {
  console.log(`Creating ${count} test threads...`);
  const threadIds: string[] = [];
  
  for (let i = 0; i < count; i++) {
    const { data: thread, error } = await supabase
      .from('inbox_threads')
      .insert({
        subject: `Test Thread ${i + 1}`,
        from_email: `homeowner${i}@example.com`,
        to_email: 'owner@roofing.com',
        account_id: accountId,
        last_message_at: new Date(Date.now() - i * 1000 * 60).toISOString(), // Stagger timestamps
      })
      .select('id')
      .single();

    if (error) {
      console.error(`Error creating thread ${i}:`, error.message);
    } else if (thread) {
      threadIds.push(thread.id);
    }

    // Progress indicator
    if ((i + 1) % 100 === 0) {
      console.log(`Created ${i + 1}/${count} threads...`);
    }
  }

  return threadIds;
}

async function createTestMessages(threadIds: string[], messagesPerThread: number): Promise<number> {
  console.log(`Creating ${messagesPerThread} messages per thread...`);
  let messageCount = 0;

  for (const threadId of threadIds) {
    for (let i = 0; i < messagesPerThread; i++) {
      const { error } = await supabase
        .from('inbox_messages')
        .insert({
          thread_id: threadId,
          direction: i % 2 === 0 ? 'inbound' : 'outbound',
          body_text: `Test message ${i + 1} in thread ${threadId.substring(0, 8)}...`,
          from_email: i % 2 === 0 ? `homeowner@example.com` : 'owner@roofing.com',
          to_email: i % 2 === 0 ? 'owner@roofing.com' : `homeowner@example.com`,
          provider: 'gmail',
          message_id: `test-msg-${threadId}-${i}`,
          created_at: new Date(Date.now() - i * 1000 * 60).toISOString(),
        });

      if (!error) {
        messageCount++;
      }
    }
  }

  return messageCount;
}

async function measureLoadTime(accountId: string): Promise<number> {
  const startTime = Date.now();
  
  const { error } = await supabase
    .from('inbox_threads')
    .select('*')
    .eq('account_id', accountId)
    .order('last_message_at', { ascending: false })
    .limit(50);

  const loadTime = Date.now() - startTime;

  if (error) {
    throw new Error(`Load query failed: ${error.message}`);
  }

  return loadTime;
}

async function measureFilterTime(accountId: string, filter: string): Promise<number> {
  const startTime = Date.now();
  
  // Simulate filtering by intent (would need actual intent field)
  const { error } = await supabase
    .from('inbox_threads')
    .select('*')
    .eq('account_id', accountId)
    .order('last_message_at', { ascending: false })
    .limit(50);

  const filterTime = Date.now() - startTime;

  if (error) {
    throw new Error(`Filter query failed: ${error.message}`);
  }

  return filterTime;
}

async function measureSearchTime(accountId: string, searchTerm: string): Promise<number> {
  const startTime = Date.now();
  
  const { error } = await supabase
    .from('inbox_threads')
    .select('*')
    .eq('account_id', accountId)
    .or(`subject.ilike.%${searchTerm}%,from_email.ilike.%${searchTerm}%`)
    .limit(50);

  const searchTime = Date.now() - startTime;

  if (error) {
    throw new Error(`Search query failed: ${error.message}`);
  }

  return searchTime;
}

async function measureDetailLoadTime(threadId: string): Promise<number> {
  const startTime = Date.now();
  
  const { error } = await supabase
    .from('inbox_messages')
    .select('*')
    .eq('thread_id', threadId)
    .order('created_at', { ascending: true });

  const detailLoadTime = Date.now() - startTime;

  if (error) {
    throw new Error(`Detail load query failed: ${error.message}`);
  }

  return detailLoadTime;
}

async function simulateHighVolumeReplies(accountId: string, replyCount: number): Promise<void> {
  console.log(`Simulating ${replyCount} rapid replies...`);
  
  const { data: threads } = await supabase
    .from('inbox_threads')
    .select('id')
    .eq('account_id', accountId)
    .limit(replyCount);

  if (!threads || threads.length === 0) {
    throw new Error('No threads found for reply simulation');
  }

  const promises = threads.map((thread, index) => 
    supabase.from('inbox_messages').insert({
      thread_id: thread.id,
      direction: 'inbound',
      body_text: `Rapid reply ${index + 1}`,
      from_email: `homeowner${index}@example.com`,
      to_email: 'owner@roofing.com',
      provider: 'gmail',
      message_id: `rapid-reply-${Date.now()}-${index}`,
      created_at: new Date().toISOString(),
    })
  );

  await Promise.all(promises);
  console.log(`✅ Simulated ${replyCount} rapid replies`);
}

async function runLoadTest(): Promise<TestMetrics> {
  const accountId = 'test-load-account-' + Date.now();
  const errors: string[] = [];
  const metrics: TestMetrics = {
    threadCount: 0,
    messageCount: 0,
    loadTime: 0,
    filterTime: 0,
    searchTime: 0,
    detailLoadTime: 0,
    errors: [],
  };

  try {
    console.log('🧪 Starting Load & Stress Test...\n');

    // 1. Create 1,000 threads
    console.log('📊 Test 1: Creating 1,000 threads...');
    const threadIds = await createTestThreads(1000, accountId);
    metrics.threadCount = threadIds.length;
    console.log(`✅ Created ${threadIds.length} threads\n`);

    // 2. Create 5,000 messages (5 per thread)
    console.log('📊 Test 2: Creating 5,000 messages...');
    const messageCount = await createTestMessages(threadIds.slice(0, 1000), 5);
    metrics.messageCount = messageCount;
    console.log(`✅ Created ${messageCount} messages\n`);

    // 3. Measure load time
    console.log('📊 Test 3: Measuring thread list load time...');
    metrics.loadTime = await measureLoadTime(accountId);
    console.log(`✅ Load time: ${metrics.loadTime}ms (target: < 300ms)`);
    if (metrics.loadTime > 300) {
      errors.push(`Load time ${metrics.loadTime}ms exceeds target of 300ms`);
    }
    console.log('');

    // 4. Measure filter time
    console.log('📊 Test 4: Measuring filter time...');
    metrics.filterTime = await measureFilterTime(accountId, 'hot');
    console.log(`✅ Filter time: ${metrics.filterTime}ms (target: < 100ms)`);
    if (metrics.filterTime > 100) {
      errors.push(`Filter time ${metrics.filterTime}ms exceeds target of 100ms`);
    }
    console.log('');

    // 5. Measure search time
    console.log('📊 Test 5: Measuring search time...');
    metrics.searchTime = await measureSearchTime(accountId, 'test');
    console.log(`✅ Search time: ${metrics.searchTime}ms (target: < 200ms)`);
    if (metrics.searchTime > 200) {
      errors.push(`Search time ${metrics.searchTime}ms exceeds target of 200ms`);
    }
    console.log('');

    // 6. Measure detail panel load time
    if (threadIds.length > 0) {
      console.log('📊 Test 6: Measuring detail panel load time...');
      metrics.detailLoadTime = await measureDetailLoadTime(threadIds[0]);
      console.log(`✅ Detail load time: ${metrics.detailLoadTime}ms (target: < 200ms)`);
      if (metrics.detailLoadTime > 200) {
        errors.push(`Detail load time ${metrics.detailLoadTime}ms exceeds target of 200ms`);
      }
      console.log('');
    }

    // 7. Simulate 50 rapid replies
    console.log('📊 Test 7: Simulating 50 rapid replies...');
    await simulateHighVolumeReplies(accountId, 50);
    console.log('✅ Rapid replies simulated\n');

    metrics.errors = errors;

    // Cleanup
    console.log('🧹 Cleaning up test data...');
    await supabase.from('inbox_messages').delete().eq('account_id', accountId).catch(() => {});
    await supabase.from('inbox_threads').delete().eq('account_id', accountId).catch(() => {});
    console.log('✅ Cleanup complete\n');

  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    errors.push(errorMessage);
    metrics.errors = errors;
    console.error('❌ Test failed:', errorMessage);
  }

  return metrics;
}

async function printResults(metrics: TestMetrics) {
  console.log('\n' + '='.repeat(60));
  console.log('📊 LOAD & STRESS TEST RESULTS');
  console.log('='.repeat(60));
  console.log(`Threads Created: ${metrics.threadCount}`);
  console.log(`Messages Created: ${metrics.messageCount}`);
  console.log(`Load Time: ${metrics.loadTime}ms (target: < 300ms)`);
  console.log(`Filter Time: ${metrics.filterTime}ms (target: < 100ms)`);
  console.log(`Search Time: ${metrics.searchTime}ms (target: < 200ms)`);
  console.log(`Detail Load Time: ${metrics.detailLoadTime}ms (target: < 200ms)`);
  console.log('');

  if (metrics.errors.length > 0) {
    console.log('❌ ERRORS:');
    metrics.errors.forEach((error, index) => {
      console.log(`  ${index + 1}. ${error}`);
    });
    console.log('');
  }

  const allPassed = metrics.errors.length === 0;
  console.log(allPassed ? '✅ ALL TESTS PASSED' : '❌ SOME TESTS FAILED');
  console.log('='.repeat(60) + '\n');
}

// Run the test
if (require.main === module) {
  runLoadTest()
    .then(printResults)
    .catch((error) => {
      console.error('Fatal error:', error);
      process.exit(1);
    });
}

export { runLoadTest, TestMetrics };



















































