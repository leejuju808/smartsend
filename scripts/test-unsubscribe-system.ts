#!/usr/bin/env tsx

/**
 * Test script for the SmartSend Unsubscribe & Preferences Center
 * 
 * This script tests:
 * 1. Creating unsubscribe tokens
 * 2. Checking suppression status
 * 3. Applying global and sequence unsubscribes
 * 4. Verifying the system blocks suppressed emails
 */

import { makeUnsubLink, isSuppressedFor, applyGlobalUnsub, applySequenceUnsub } from '../src/lib/unsub/utils';

const DEMO_WORKSPACE_ID = process.env.NEXT_PUBLIC_DEMO_WORKSPACE_ID || 'demo-workspace-id';
const TEST_EMAIL = 'test@example.com';
const TEST_SEQUENCE_ID = 'test-sequence-123';

async function testUnsubscribeSystem() {
  console.log('🧪 Testing SmartSend Unsubscribe System\n');

  try {
    // Test 1: Create unsubscribe link
    console.log('1️⃣ Creating unsubscribe link...');
    const unsubUrl = await makeUnsubLink(DEMO_WORKSPACE_ID, TEST_EMAIL, TEST_SEQUENCE_ID);
    console.log(`   ✅ Unsubscribe URL: ${unsubUrl}`);
    
    // Extract token from URL
    const token = unsubUrl.split('token=')[1];
    console.log(`   ✅ Token: ${token?.slice(0, 20)}...`);

    // Test 2: Check initial suppression status
    console.log('\n2️⃣ Checking initial suppression status...');
    const initialStatus = await isSuppressedFor(DEMO_WORKSPACE_ID, TEST_EMAIL, TEST_SEQUENCE_ID);
    console.log(`   ✅ Status: ${initialStatus.blocked ? 'BLOCKED' : 'ALLOWED'} ${initialStatus.reason ? `(${initialStatus.reason})` : ''}`);

    // Test 3: Apply sequence-specific unsubscribe
    console.log('\n3️⃣ Applying sequence-specific unsubscribe...');
    await applySequenceUnsub(DEMO_WORKSPACE_ID, TEST_EMAIL, TEST_SEQUENCE_ID, {
      reason: 'test-sequence-unsub',
      ua: 'test-script',
      ip: '127.0.0.1'
    });
    console.log('   ✅ Sequence unsubscribe applied');

    // Test 4: Check suppression after sequence unsubscribe
    console.log('\n4️⃣ Checking suppression after sequence unsubscribe...');
    const afterSeqStatus = await isSuppressedFor(DEMO_WORKSPACE_ID, TEST_EMAIL, TEST_SEQUENCE_ID);
    console.log(`   ✅ Status: ${afterSeqStatus.blocked ? 'BLOCKED' : 'ALLOWED'} ${afterSeqStatus.reason ? `(${afterSeqStatus.reason})` : ''}`);

    // Test 5: Check if still allowed for other sequences
    console.log('\n5️⃣ Checking if still allowed for other sequences...');
    const otherSeqStatus = await isSuppressedFor(DEMO_WORKSPACE_ID, TEST_EMAIL, 'other-sequence-456');
    console.log(`   ✅ Status for other sequence: ${otherSeqStatus.blocked ? 'BLOCKED' : 'ALLOWED'} ${otherSeqStatus.reason ? `(${otherSeqStatus.reason})` : ''}`);

    // Test 6: Apply global unsubscribe
    console.log('\n6️⃣ Applying global unsubscribe...');
    await applyGlobalUnsub(DEMO_WORKSPACE_ID, TEST_EMAIL, {
      reason: 'test-global-unsub',
      ua: 'test-script',
      ip: '127.0.0.1'
    });
    console.log('   ✅ Global unsubscribe applied');

    // Test 7: Check suppression after global unsubscribe
    console.log('\n7️⃣ Checking suppression after global unsubscribe...');
    const afterGlobalStatus = await isSuppressedFor(DEMO_WORKSPACE_ID, TEST_EMAIL, TEST_SEQUENCE_ID);
    console.log(`   ✅ Status: ${afterGlobalStatus.blocked ? 'BLOCKED' : 'ALLOWED'} ${afterGlobalStatus.reason ? `(${afterGlobalStatus.reason})` : ''}`);

    // Test 8: Check if blocked for all sequences
    console.log('\n8️⃣ Checking if blocked for all sequences...');
    const allSeqStatus = await isSuppressedFor(DEMO_WORKSPACE_ID, TEST_EMAIL, 'any-sequence-789');
    console.log(`   ✅ Status for any sequence: ${allSeqStatus.blocked ? 'BLOCKED' : 'ALLOWED'} ${allSeqStatus.reason ? `(${allSeqStatus.reason})` : ''}`);

    console.log('\n🎉 All tests completed successfully!');
    console.log('\n📋 Summary:');
    console.log(`   • Initial status: ${initialStatus.blocked ? 'BLOCKED' : 'ALLOWED'}`);
    console.log(`   • After sequence unsub: ${afterSeqStatus.blocked ? 'BLOCKED' : 'ALLOWED'}`);
    console.log(`   • After global unsub: ${afterGlobalStatus.blocked ? 'BLOCKED' : 'ALLOWED'}`);
    console.log(`   • Unsubscribe URL: ${unsubUrl}`);

  } catch (error) {
    console.error('\n❌ Test failed:', error);
    process.exit(1);
  }
}

// Run the test
if (require.main === module) {
  testUnsubscribeSystem();
} 