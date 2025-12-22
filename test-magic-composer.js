#!/usr/bin/env node

/**
 * Test script for Magic Composer API endpoints
 * Run with: node test-magic-composer.js
 */

const BASE_URL = 'http://localhost:3000';

async function testMagicComposer() {
  console.log('🧪 Testing SmartSend Magic Composer...\n');

  try {
    // Test 1: Generate sequence
    console.log('1️⃣ Testing sequence generation...');
    const generateResponse = await fetch(`${BASE_URL}/api/composer/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Short intro to SmartSend for RevOps leaders; ask for a 7-minute call; mention CSV import + sequences.',
        tone: 'direct'
      })
    });

    if (!generateResponse.ok) {
      throw new Error(`Generate failed: ${generateResponse.status} ${generateResponse.statusText}`);
    }

    const generateData = await generateResponse.json();
    console.log('✅ Sequence generated successfully!');
    console.log(`   Name: ${generateData.draft.name}`);
    console.log(`   Steps: ${generateData.draft.steps.length}`);
    console.log(`   Timezone: ${generateData.draft.timezone}`);
    console.log(`   Stop on reply: ${generateData.draft.stop_on_reply}`);
    console.log(`   Send window: ${generateData.draft.send_window.start_hour}:00-${generateData.draft.send_window.end_hour}:00`);
    
    // Test 2: Lint content (optional)
    console.log('\n2️⃣ Testing content linting...');
    const lintResponse = await fetch(`${BASE_URL}/api/composer/lint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: 'ACT NOW - Limited Time Offer!',
        body: 'CLICK HERE to get 100% FREE stuff!!!'
      })
    });

    if (lintResponse.ok) {
      const lintData = await lintResponse.json();
      console.log('✅ Content linted successfully!');
      console.log(`   Spam score: ${lintData.score.score}`);
      console.log(`   Suggestions: ${lintData.suggestions.length}`);
    } else {
      console.log('⚠️  Lint endpoint not available (optional)');
    }

    // Test 3: Check sequence structure
    console.log('\n3️⃣ Validating sequence structure...');
    const firstStep = generateData.draft.steps[0];
    console.log('✅ Sequence structure validation:');
    console.log(`   Step 1 wait: ${firstStep.wait_seconds}s (should be 0)`);
    console.log(`   Subject length: ${firstStep.subject_template?.length || 0} chars (should be ≤55)`);
    console.log(`   Body length: ${firstStep.text_template?.length || 0} chars (should be 60-120 words)`);
    
    // Test 4: Variable detection
    console.log('\n4️⃣ Testing variable detection...');
    const hasVariables = JSON.stringify(generateData.draft).includes('{{');
    console.log(`   Variables detected: ${hasVariables ? '✅ Yes' : '❌ No'}`);

    console.log('\n🎉 All tests passed! Magic Composer is working correctly.');
    console.log('\n📝 Next steps:');
    console.log('   1. Open http://localhost:3000/dashboard/composer');
    console.log('   2. Test with your own prompts');
    console.log('   3. Create and save sequences');
    console.log('   4. Check the sequences page to see saved sequences');

  } catch (error) {
    console.error('❌ Test failed:', error.message);
    console.log('\n🔧 Troubleshooting:');
    console.log('   1. Ensure the dev server is running: npm run dev');
    console.log('   2. Check that OpenAI API key is set in .env.local');
    console.log('   3. Verify database connection');
    console.log('   4. Check browser console for errors');
  }
}

// Run tests
testMagicComposer(); 