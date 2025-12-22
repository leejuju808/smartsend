#!/usr/bin/env tsx

/**
 * Test script for Magic Composer API endpoints
 * 
 * Usage: npm run test:composer
 * or: npx tsx scripts/test-magic-composer.ts
 */

// Load environment variables
require('dotenv').config({ path: '.env.local' });

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function testComposerGenerate() {
  console.log('\n🧪 Testing Magic Composer Generate API...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/composer/generate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        prompt: 'Short intro to SmartSend for RevOps leaders; ask for a 7-minute call; mention CSV import + sequences.',
        tone: 'direct'
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.ok && data.draft) {
      console.log('✅ Generate API successful!');
      console.log(`📧 Sequence: ${data.draft.name}`);
      console.log(`📝 Steps: ${data.draft.steps.length}`);
      console.log(`⏰ Timezone: ${data.draft.timezone}`);
      console.log(`🛑 Stop on reply: ${data.draft.stop_on_reply}`);
      
      // Show first step details
      const firstStep = data.draft.steps[0];
      if (firstStep) {
        console.log(`\n📋 Step 1 Preview:`);
        console.log(`   Subject: ${firstStep.subject_template}`);
        console.log(`   Body: ${(firstStep.text_template || '').substring(0, 100)}...`);
      }
    } else {
      console.log('❌ Generate API failed:', data);
    }
  } catch (error) {
    console.error('❌ Generate API error:', error);
  }
}

async function testComposerLint() {
  console.log('\n🧪 Testing Magic Composer Lint API...');
  
  try {
    const response = await fetch(`${BASE_URL}/api/composer/lint`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        subject: 'ACT NOW! 100% FREE TRIAL!!!',
        body: 'Click here to get your FREE offer NOW! Don\'t wait, this is LIMITED TIME!'
      })
    });

    if (!response.ok) {
      throw new Error(`HTTP ${response.status}: ${response.statusText}`);
    }

    const data = await response.json();
    
    if (data.ok && data.score) {
      console.log('✅ Lint API successful!');
      console.log(`🚨 Spam Score: ${data.score.score}/10`);
      console.log(`📢 Shouty words: ${data.score.caps}`);
      console.log(`❗ Exclamations: ${data.score.excls}`);
      console.log(`🔗 Links: ${data.score.links}`);
      
      if (data.suggestions && data.suggestions.length > 0) {
        console.log(`\n💡 Suggestions:`);
        data.suggestions.forEach((suggestion: string, i: number) => {
          console.log(`   ${i + 1}. ${suggestion}`);
        });
      }
    } else {
      console.log('❌ Lint API failed:', data);
    }
  } catch (error) {
    console.error('❌ Lint API error:', error);
  }
}

async function testEnvironment() {
  console.log('🔍 Checking environment configuration...');
  
  const required = ['OPENAI_API_KEY', 'NEXT_PUBLIC_SUPABASE_URL', 'SUPABASE_SERVICE_ROLE_KEY'];
  const missing = required.filter(key => !process.env[key]);
  
  if (missing.length > 0) {
    console.log('❌ Missing environment variables:', missing.join(', '));
    console.log('💡 Make sure you have a .env.local file with the required variables');
    return false;
  }
  
  console.log('✅ Environment configuration looks good');
  return true;
}

async function main() {
  console.log('🚀 Magic Composer Test Suite');
  console.log('============================');
  
  // Check environment first
  const envOk = await testEnvironment();
  if (!envOk) {
    console.log('\n❌ Environment check failed. Please fix the issues above.');
    process.exit(1);
  }
  
  // Test the APIs
  await testComposerGenerate();
  await testComposerLint();
  
  console.log('\n✨ Test suite completed!');
  console.log('\n💡 To use the Magic Composer:');
  console.log('   1. Start your Next.js dev server: npm run dev');
  console.log('   2. Navigate to: http://localhost:3000/dashboard/composer');
  console.log('   3. Enter a prompt and click Generate');
}

if (require.main === module) {
  main().catch(console.error);
} 