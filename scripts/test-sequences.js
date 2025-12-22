#!/usr/bin/env node

/**
 * Test script for the Email Sequences system
 */

const BASE_URL = process.env.BASE_URL || 'http://localhost:3000';

async function testSequences() {
  console.log('🧪 Testing Email Sequences System...\n');

  try {
    // Test 1: Create a sequence
    console.log('1. Creating test sequence...');
    const createResponse = await fetch(`${BASE_URL}/api/sequences`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Test Welcome Sequence' })
    });
    
    if (!createResponse.ok) {
      throw new Error(`Failed to create sequence: ${createResponse.status}`);
    }
    
    const sequence = await createResponse.json();
    console.log(`✅ Created sequence: ${sequence.name} (ID: ${sequence.id})`);

    // Test 2: Add steps to sequence
    console.log('\n2. Adding steps to sequence...');
    const steps = [
      {
        subject: 'Welcome to SmartSend!',
        body_text: 'Hi there! Welcome to our platform.',
        delay_days: 0,
        condition: 'always'
      },
      {
        subject: 'Getting Started Guide',
        body_text: 'Here\'s a quick guide to get you started...',
        delay_days: 3,
        condition: 'opened'
      }
    ];

    for (let i = 0; i < steps.length; i++) {
      const stepResponse = await fetch(`${BASE_URL}/api/sequences/${sequence.id}/steps`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(steps[i])
      });
      
      if (!stepResponse.ok) {
        throw new Error(`Failed to add step ${i + 1}: ${stepResponse.status}`);
      }
      
      const step = await stepResponse.json();
      console.log(`✅ Added step ${i + 1}: ${step.subject}`);
    }

    console.log('\n🎉 All tests passed! The Email Sequences system is working correctly.');

  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    process.exit(1);
  }
}

testSequences(); 