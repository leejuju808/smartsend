#!/usr/bin/env tsx

/**
 * Test script for meeting booking API
 * Usage: tsx scripts/test-meeting-booking.ts
 */

const INTERNAL_WEBHOOK_SECRET = process.env.INTERNAL_WEBHOOK_SECRET;
const API_BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

if (!INTERNAL_WEBHOOK_SECRET) {
  console.error('❌ INTERNAL_WEBHOOK_SECRET not set in environment');
  process.exit(1);
}

async function testMeetingBooking() {
  console.log('🧪 Testing meeting booking API...');
  
  try {
    // You'll need to replace this with an actual meeting ID from your database
    const meetingId = 'YOUR_MEETING_ID_HERE';
    
    if (meetingId === 'YOUR_MEETING_ID_HERE') {
      console.log('⚠️  Please update the meetingId in this script with a real meeting ID');
      console.log('💡 You can find meeting IDs in your meetings table');
      return;
    }

    const response = await fetch(`${API_BASE}/api/meetings/book`, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${INTERNAL_WEBHOOK_SECRET}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ meetingId }),
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('✅ Meeting booking successful!');
      console.log('📧 Meeting data:', JSON.stringify(result.meeting, null, 2));
      
      if (result.meeting.status === 'booked' && result.meeting.booked_at) {
        console.log('✅ Meeting status updated to "booked"');
        console.log('✅ booked_at timestamp set:', result.meeting.booked_at);
      }
      
      if (result.meeting.contact_email) {
        console.log('📧 Check the inbox for:', result.meeting.contact_email);
        console.log('📎 Email should include .ics attachment');
      }
    } else {
      console.error('❌ Meeting booking failed:', result.error);
    }
  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testMeetingBooking(); 