#!/usr/bin/env tsx

import { detectObjections } from '../src/lib/objection-detector';
import { craftReply } from '../src/lib/playbooks';

// Test messages
const testMessages = [
  "This looks too expensive for our budget right now",
  "Not interested, thanks",
  "Can you send me more information about this?",
  "We're pretty busy this quarter, maybe next time",
  "We already have a tool for this",
  "Who are you guys? What does SmartSendAI do?",
  "The price is way too high for what you're offering",
  "Send me a deck or PDF with more details",
  "We're swamped with work right now, circle back later",
  "We're already using a similar solution from another vendor"
];

console.log('🧪 Testing Objection Detection System\n');

// Test objection detection
console.log('📝 Testing Objection Detection:');
testMessages.forEach((message, i) => {
  const objections = detectObjections(message);
  console.log(`${i + 1}. "${message}"`);
  console.log(`   Detected: ${objections.length > 0 ? objections.join(', ') : 'None'}`);
  console.log('');
});

// Test response generation
console.log('💬 Testing Response Generation:');
const sampleMessage = "This is too expensive for our budget";
const objections = detectObjections(sampleMessage);

if (objections.length > 0) {
  const objection = objections[0];
  console.log(`Message: "${sampleMessage}"`);
  console.log(`Detected objection: ${objection}`);
  console.log('');
  
  const tones = ['direct', 'friendly', 'consultative'] as const;
  const vars = {
    first_name: 'Demo User',
    company: 'Demo Company',
    my_name: 'SmartSendAI Team',
    calendly: 'https://calendly.com/demo/intro-30'
  };
  
  tones.forEach(tone => {
    const response = craftReply(objection as any, tone, vars);
    console.log(`${tone.charAt(0).toUpperCase() + tone.slice(1)} tone:`);
    console.log(response);
    console.log('');
  });
}

console.log('✅ Objection detection system test completed!'); 