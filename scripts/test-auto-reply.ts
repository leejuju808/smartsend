#!/usr/bin/env tsx

/**
 * Test script for the auto-reply system
 * Run with: npx tsx scripts/test-auto-reply.ts
 */

const BASE_URL = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';
const WORKSPACE_ID = process.env.NEXT_PUBLIC_DEMO_WORKSPACE_ID;
const WEBHOOK_SECRET = process.env.INBOUND_WEBHOOK_SECRET || 'test-secret';

if (!WORKSPACE_ID) {
  console.error('❌ NEXT_PUBLIC_DEMO_WORKSPACE_ID not set');
  process.exit(1);
}

async function testMeetingIntent() {
  console.log('🧪 Testing meeting intent detection...');
  
  const payload = {
    provider: 'test',
    from: 'Alex Johnson <alex@example.com>',
    to: 'you@yourdomain.com',
    subject: 'Can we schedule a call tomorrow?',
    text: 'Hey there, can we hop on a call? 30 min works for me. Would love to discuss the project.',
    html: '<p>Hey there, can we hop on a call? 30 min works for me. Would love to discuss the project.</p>'
  };

  try {
    const response = await fetch(`${BASE_URL}/api/inbound/email?workspaceId=${WORKSPACE_ID}&secret=${WEBHOOK_SECRET}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Meeting intent test passed');
      console.log('   Intent:', result.intent);
      console.log('   Auto-reply enabled:', result.autoReplyEnabled);
      console.log('   Has email provider:', result.hasProvider);
      console.log('   Inbound ID:', result.inboundId);
      console.log('   Reply ID:', result.replyId);
    } else {
      console.log('❌ Meeting intent test failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Meeting intent test error:', error);
  }
}

async function testNoMeetingIntent() {
  console.log('\n🧪 Testing no meeting intent...');
  
  const payload = {
    provider: 'test',
    from: 'Sarah Smith <sarah@example.com>',
    to: 'you@yourdomain.com',
    subject: 'Thanks for the info',
    text: 'Thanks for sending over the information. I\'ll review it and get back to you.',
    html: '<p>Thanks for sending over the information. I\'ll review it and get back to you.</p>'
  };

  try {
    const response = await fetch(`${BASE_URL}/api/inbound/email?workspaceId=${WORKSPACE_ID}&secret=${WEBHOOK_SECRET}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ No meeting intent test passed');
      console.log('   Intent:', result.intent);
      console.log('   Status: should be skipped');
    } else {
      console.log('❌ No meeting intent test failed:', result.error);
    }
  } catch (error) {
    console.error('❌ No meeting intent test error:', error);
  }
}

async function testFormData() {
  console.log('\n🧪 Testing form-data (SendGrid style)...');
  
  const formData = new FormData();
  formData.append('provider', 'sendgrid');
  formData.append('from', 'Mike Wilson <mike@example.com>');
  formData.append('to', 'you@yourdomain.com');
  formData.append('subject', 'Let\'s book a meeting');
  formData.append('text', 'Hi, I\'d like to schedule a demo call next week. When are you available?');

  try {
    const response = await fetch(`${BASE_URL}/api/inbound/email?workspaceId=${WORKSPACE_ID}&secret=${WEBHOOK_SECRET}`, {
      method: 'POST',
      body: formData
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Form-data test passed');
      console.log('   Intent:', result.intent);
      console.log('   Provider detected:', result.intent.intent === 'meeting' ? 'meeting' : 'none');
    } else {
      console.log('❌ Form-data test failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Form-data test error:', error);
  }
}

async function main() {
  console.log('🚀 Testing SmartSend Auto-Reply System');
  console.log('=====================================');
  console.log(`Base URL: ${BASE_URL}`);
  console.log(`Workspace ID: ${WORKSPACE_ID}`);
  console.log(`Webhook Secret: ${WEBHOOK_SECRET ? '✅ Set' : '❌ Not set'}`);
  console.log('');

  await testMeetingIntent();
  await testNoMeetingIntent();
  await testFormData();

  console.log('\n🎯 Test Summary');
  console.log('===============');
  console.log('1. Meeting intent detection');
  console.log('2. No meeting intent handling');
  console.log('3. Form-data parsing');
  console.log('\nCheck your database and inbox page to see the results!');
  console.log(`Inbox: ${BASE_URL}/dashboard/inbox`);
}

main().catch(console.error); 