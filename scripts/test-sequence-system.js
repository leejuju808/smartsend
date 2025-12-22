#!/usr/bin/env node

/**
 * Test script for the email sequence system
 * 
 * Usage:
 * 1. First run the Supabase migration: supabase/migrations/20250129_email_sequence_system.sql
 * 2. Create a sequence with steps in your UI
 * 3. Run this script to test enrollment
 */

const API_BASE = process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:3000';

async function testEnrollment() {
  console.log('🧪 Testing Email Sequence System...\n');

  // You'll need to replace these with actual values from your database
  const testData = {
    email: 'test@example.com',
    name: 'Test Lead',
    sequence_id: 'YOUR_SEQUENCE_ID_HERE', // Replace with actual sequence ID
    start_in_hours: 0
  };

  console.log('📝 Test data:', testData);
  console.log('\n⚠️  Make sure to:');
  console.log('1. Replace YOUR_SEQUENCE_ID_HERE with an actual sequence ID');
  console.log('2. Have a sequence with at least one step in your database');
  console.log('3. Be authenticated (this script assumes you have a valid session)');
  
  try {
    const response = await fetch(`${API_BASE}/api/enroll`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        // You'll need to add authentication headers here
        // 'Cookie': 'your-session-cookie'
      },
      body: JSON.stringify(testData)
    });

    const result = await response.json();
    
    if (response.ok) {
      console.log('\n✅ Enrollment successful!');
      console.log('📊 Result:', result);
      console.log('\n🔄 Next steps:');
      console.log('1. Wait for the scheduler cron (runs every 5 minutes)');
      console.log('2. Check /api/jobs to see if a job was created');
      console.log('3. Wait for the worker cron to process the job');
    } else {
      console.log('\n❌ Enrollment failed:');
      console.log('Status:', response.status);
      console.log('Error:', result);
    }
  } catch (error) {
    console.log('\n💥 Network error:', error.message);
  }
}

// Manual testing instructions
console.log(`
🚀 Email Sequence System Test Instructions:

1. Database Setup:
   - Run the migration: supabase/migrations/20250129_email_sequence_system.sql
   - Create a sequence with steps using your existing UI

2. Test Enrollment:
   - Replace YOUR_SEQUENCE_ID_HERE in this script with a real sequence ID
   - Run: node scripts/test-sequence-system.js

3. Monitor Progress:
   - Check /api/jobs for created jobs
   - Check /api/cron/scheduler for scheduler activity
   - Check /api/cron/worker for worker activity

4. Cron Jobs:
   - Scheduler: runs every 5 minutes, promotes enrollments to jobs
   - Worker: runs every 5 minutes, processes queued jobs
   - Both are configured in vercel.json

📋 API Endpoints:
   - POST /api/enroll - Enroll a lead into a sequence
   - GET /api/jobs - View all jobs for the current user
   - GET /api/cron/scheduler - Manual trigger for scheduler
   - GET /api/cron/worker - Manual trigger for worker
`);

if (require.main === module) {
  testEnrollment();
}