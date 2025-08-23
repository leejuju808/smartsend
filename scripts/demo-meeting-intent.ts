#!/usr/bin/env tsx

import { wantsMeeting } from '../src/lib/meeting-intent';
import { buildSimpleICS } from '../src/lib/ics';

console.log('=== Meeting Intent Detection Demo ===\n');

const testCases = [
  'Can we set up a call next week?',
  'I would like to meet tomorrow',
  'Let\'s schedule a zoom call this afternoon',
  'We should have a meeting soon',
  'Hello, how are you?',
  'Thanks for the information',
  'I want to call you',
  'I\'m available next week',
];

testCases.forEach(text => {
  const hasIntent = wantsMeeting(text);
  console.log(`"${text}" -> ${hasIntent ? '✅ Meeting Intent' : '❌ No Meeting Intent'}`);
});

console.log('\n=== ICS Generation Demo ===\n');

if (wantsMeeting('Can we set up a call next week?')) {
  const start = new Date(Date.now() + 48 * 3600 * 1000); // 2 days out
  const end = new Date(start.getTime() + 30 * 60 * 1000); // 30 mins
  
  const ics = buildSimpleICS({
    title: 'Intro Call – SmartSendAI',
    description: 'Looking forward to chatting!',
    url: 'https://calendly.com/yourname/intro-30',
    start,
    end,
    organizer: 'mailto:hello@yourdomain.com',
  });
  
  console.log('Generated ICS file:');
  console.log(ics);
} 