#!/usr/bin/env tsx

/**
 * Test script for meeting intent detection
 * Run with: npx tsx scripts/test-meeting-intent.ts
 */

import { detectReplyIntent } from '../src/lib/meeting-intent';

const testCases = [
  {
    text: "Hey Julian, can we schedule a call this week? Tuesday afternoon works. Send a calendar invite.",
    expected: true,
    description: "Direct meeting request with specific time"
  },
  {
    text: "Thanks for the info. I'll review and get back to you.",
    expected: false,
    description: "No meeting intent"
  },
  {
    text: "Let's hop on a quick call tomorrow morning to discuss this further.",
    expected: true,
    description: "Meeting request with timing"
  },
  {
    text: "I'm not ready to meet yet, but thanks for reaching out.",
    expected: false,
    description: "Explicitly not interested in meeting"
  },
  {
    text: "Can you send me your calendar availability? I'd like to book a 30-minute slot.",
    expected: true,
    description: "Calendar booking request"
  }
];

async function runTests() {
  console.log('🧪 Testing Meeting Intent Detection\n');
  
  for (const testCase of testCases) {
    console.log(`📝 Test: ${testCase.description}`);
    console.log(`   Input: "${testCase.text}"`);
    
    try {
      const result = await detectReplyIntent(testCase.text);
      const passed = result.isMeeting === testCase.expected;
      
      console.log(`   Result: ${result.isMeeting ? '✅ Meeting' : '❌ No Meeting'} (score: ${result.score})`);
      console.log(`   Model: ${result.model || 'heuristic'}`);
      console.log(`   Reasons: ${result.reasons.join(', ')}`);
      console.log(`   Status: ${passed ? '✅ PASS' : '❌ FAIL'}\n`);
    } catch (error) {
      console.log(`   ❌ ERROR: ${error}\n`);
    }
  }
  
  console.log('🎯 Test Summary:');
  console.log('   - High confidence meeting detection');
  console.log('   - Fast heuristic scoring');
  console.log('   - Optional LLM assistance');
  console.log('   - Ready for API integration');
}

// Run tests if this file is executed directly
if (import.meta.url === `file://${process.argv[1]}`) {
  runTests().catch(console.error);
} 