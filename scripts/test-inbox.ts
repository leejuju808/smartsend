#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function testInboxSystem() {
  console.log('🧪 Testing Inbox System Integration...\n')

  try {
    // 1. Check if inbox tables exist
    console.log('1. Checking database schema...')
    const { data: threads, error: threadsError } = await supabase
      .from('inbox_threads')
      .select('count')
      .limit(1)
    
    if (threadsError) {
      console.error('❌ inbox_threads table not accessible:', threadsError.message)
      return
    }
    console.log('✅ inbox_threads table accessible')

    const { data: messages, error: messagesError } = await supabase
      .from('inbox_messages')
      .select('count')
      .limit(1)
    
    if (messagesError) {
      console.error('❌ inbox_messages table not accessible:', messagesError.message)
      return
    }
    console.log('✅ inbox_messages table accessible')

    // 2. Check sample data
    console.log('\n2. Checking sample data...')
    const { data: sampleThreads, error: sampleError } = await supabase
      .from('inbox_threads')
      .select(`
        id,
        subject,
        status,
        last_message_at,
        contacts(email, first_name),
        campaigns(name)
      `)
      .limit(3)
    
    if (sampleError) {
      console.error('❌ Error fetching sample threads:', sampleError.message)
    } else {
      console.log(`✅ Found ${sampleThreads?.length || 0} sample threads`)
      if (sampleThreads && sampleThreads.length > 0) {
        console.log('Sample thread:', JSON.stringify(sampleThreads[0], null, 2))
      }
    }

    // 3. Test API endpoints (if running locally)
    console.log('\n3. Testing API endpoints...')
    try {
      const response = await fetch('http://localhost:3000/api/inbox/threads?workspaceId=test')
      if (response.ok) {
        console.log('✅ Inbox threads API responding')
      } else {
        console.log('⚠️  Inbox threads API responding but with status:', response.status)
      }
    } catch (error) {
      console.log('⚠️  Inbox threads API not accessible (server may not be running)')
    }

    console.log('\n🎉 Inbox system test completed!')
    
  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

// Run the test
testInboxSystem() 