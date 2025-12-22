#!/usr/bin/env tsx

/**
 * Test script for SmartSend Sending Guardrails
 * 
 * This script demonstrates:
 * 1. Preflight guard checks
 * 2. Atomic send reservations
 * 3. Bounce rate monitoring
 * 4. Cooldown enforcement
 * 
 * Run with: npx tsx scripts/test-sending-guardrails.ts
 */

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testSendingGuardrails() {
  console.log('🧪 Testing SmartSend Sending Guardrails...\n');

  const workspaceId = process.env.NEXT_PUBLIC_DEMO_WORKSPACE_ID;
  if (!workspaceId) {
    console.error('❌ NEXT_PUBLIC_DEMO_WORKSPACE_ID not set');
    return;
  }

  try {
    // Set workspace context
    await supabase.rpc('app.set_workspace', { id: workspaceId });
    console.log('✅ Workspace context set');

    // Test 1: Check current policy
    console.log('\n📋 Test 1: Current Sending Policy');
    const { data: policy, error: policyError } = await supabase
      .from('send_policies')
      .select('*')
      .eq('workspace_id', workspaceId)
      .single();

    if (policyError) {
      console.log('⚠️  No policy found, using defaults');
    } else {
      console.log('📊 Policy loaded:', {
        warmup_enabled: policy.warmup_enabled,
        ramp_start_per_day: policy.ramp_start_per_day,
        weekly_increment: policy.weekly_increment,
        ramp_max_per_day: policy.ramp_max_per_day,
        domain_max_per_day: policy.domain_max_per_day,
        bounce_rate_threshold: `${(Number(policy.bounce_rate_threshold) * 100).toFixed(1)}%`,
        cooldown_minutes: policy.cooldown_minutes
      });
    }

    // Test 2: Check today's allowed cap
    console.log('\n📈 Test 2: Today\'s Allowed Cap');
    const today = new Date().toISOString().slice(0, 10);
    const pol = policy || {
      ramp_start_per_day: 25,
      weekly_increment: 25,
      ramp_max_per_day: 500,
      ramp_start_date: today
    };

    const { data: capResult } = await supabase.rpc('app.allowed_cap', {
      p_ramp_start_per_day: pol.ramp_start_per_day,
      p_weekly_increment: pol.weekly_increment,
      p_ramp_max_per_day: pol.ramp_max_per_day,
      p_ramp_start_date: pol.ramp_start_date,
      p_today: today
    });

    const todayCap = Array.isArray(capResult) ? capResult[0] : capResult;
    console.log(`🎯 Today's cap: ${todayCap} emails`);

    // Test 3: Check current send counters
    console.log('\n📊 Test 3: Current Send Counters');
    const { data: counters } = await supabase
      .from('send_counters')
      .select('domain, sent_count, cooldown_until')
      .eq('workspace_id', workspaceId)
      .eq('day', today);

    if (counters && counters.length > 0) {
      counters.forEach(counter => {
        console.log(`  ${counter.domain}: ${counter.sent_count} sent`);
        if (counter.cooldown_until) {
          console.log(`    ⚠️  Cooldown until: ${new Date(counter.cooldown_until).toLocaleString()}`);
        }
      });
    } else {
      console.log('  No sends recorded today');
    }

    // Test 4: Test bounce rate function
    console.log('\n📉 Test 4: Bounce Rate Check');
    const { data: bounceStats } = await supabase.rpc('app.bounce_stats', {
      p_workspace: workspaceId,
      p_domain: '',
      p_window_days: 7
    });

    if (bounceStats) {
      console.log(`📊 Workspace bounce rate: ${(Number(bounceStats.rate) * 100).toFixed(2)}%`);
      console.log(`   Total: ${bounceStats.total}, Bounces: ${bounceStats.bounces}`);
    } else {
      console.log('📊 No bounce data available');
    }

    // Test 5: Test send reservation
    console.log('\n🔒 Test 5: Send Reservation Test');
    const testDomain = 'example.com';
    const { data: reservationOk } = await supabase.rpc('app.reserve_send', {
      p_workspace: workspaceId,
      p_domain: testDomain,
      p_day: today,
      p_limit: 1000 // High limit for testing
    });

    console.log(`🔐 Reservation result: ${reservationOk ? 'SUCCESS' : 'FAILED'}`);

    // Test 6: Check audit log
    console.log('\n📝 Test 6: Recent Audit Logs');
    const { data: auditLogs } = await supabase
      .from('sending_audit')
      .select('domain, to_email, allowed, reason, created_at')
      .eq('workspace_id', workspaceId)
      .order('created_at', { ascending: false })
      .limit(5);

    if (auditLogs && auditLogs.length > 0) {
      auditLogs.forEach(log => {
        const status = log.allowed ? '✅' : '❌';
        console.log(`  ${status} ${log.to_email} (${log.domain}) - ${log.reason}`);
      });
    } else {
      console.log('  No audit logs found');
    }

    console.log('\n🎉 Sending Guardrails test completed!');
    console.log('\n💡 Next steps:');
    console.log('  1. Visit /dashboard/sending to see the UI');
    console.log('  2. Use /api/sending/guarded-send to test protected sends');
    console.log('  3. Monitor bounce rates and cooldowns');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testSendingGuardrails().catch(console.error); 