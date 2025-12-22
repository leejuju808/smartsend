// scripts/test-contacts-lists-flow.ts
// Test script to demonstrate the complete contacts, lists, and bulk email flow

import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

// Sample CSV data
const sampleCSV = `email,first_name,last_name,company
john.doe@example.com,John,Doe,Acme Corp
jane.smith@example.com,Jane,Smith,Tech Solutions
bob.wilson@example.com,Bob,Wilson,Startup Inc`;

// Sample email templates
const subjectTemplate = "Hey {{contact.first_name}}, quick question about {{contact.company}}";
const htmlTemplate = `
<html>
<body>
  <h2>Hello {{contact.first_name}} {{contact.last_name}}!</h2>
  <p>I hope this email finds you well at {{contact.company}}.</p>
  <p>I wanted to reach out regarding a potential opportunity...</p>
  <p>Best regards,<br>Your Name</p>
</body>
</html>`;

async function testCompleteFlow() {
  console.log('🚀 Testing complete contacts, lists, and bulk email flow...\n');

  try {
    // Step 1: Test CSV import
    console.log('📥 Step 1: Testing CSV import...');
    const importResponse = await fetch('http://localhost:3000/api/contacts/import-simple', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        listName: 'Test List',
        csv: sampleCSV
      })
    });

    if (!importResponse.ok) {
      const error = await importResponse.text();
      throw new Error(`Import failed: ${error}`);
    }

    const importResult = await importResponse.json();
    console.log('✅ Import successful:', importResult);
    const listId = importResult.listId;

    // Step 2: Test bulk email scheduling
    console.log('\n📧 Step 2: Testing bulk email scheduling...');
    const scheduleResponse = await fetch('http://localhost:3000/api/campaigns/schedule-bulk', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        listId: listId,
        campaignId: 'test-campaign-123',
        subjectTemplate: subjectTemplate,
        htmlTemplate: htmlTemplate,
        scheduledAt: new Date(Date.now() + 60000).toISOString() // Schedule for 1 minute from now
      })
    });

    if (!scheduleResponse.ok) {
      const error = await scheduleResponse.text();
      throw new Error(`Scheduling failed: ${error}`);
    }

    const scheduleResult = await scheduleResponse.json();
    console.log('✅ Bulk scheduling successful:', scheduleResult);

    // Step 3: Verify data in database
    console.log('\n🔍 Step 3: Verifying data in database...');
    
    // Check contacts
    const { data: contacts } = await supabase
      .from('contacts')
      .select('*')
      .limit(5);
    console.log('📋 Contacts:', contacts);

    // Check lists
    const { data: lists } = await supabase
      .from('lists')
      .select('*')
      .limit(5);
    console.log('📝 Lists:', lists);

    // Check list members
    const { data: listMembers } = await supabase
      .from('list_members')
      .select('*')
      .limit(5);
    console.log('👥 List Members:', listMembers);

    // Check email jobs
    const { data: emailJobs } = await supabase
      .from('email_jobs')
      .select('*')
      .limit(5);
    console.log('📬 Email Jobs:', emailJobs);

    console.log('\n🎉 Complete flow test successful!');

  } catch (error) {
    console.error('❌ Test failed:', error);
  }
}

// Run the test
testCompleteFlow();