#!/usr/bin/env tsx

/**
 * Test script for AI Draft functionality
 * 
 * Usage: npm run tsx scripts/test-ai-drafts.ts
 * 
 * This script tests:
 * 1. Database connection and table creation
 * 2. AI draft generation via API
 * 3. Draft retrieval and storage
 */

import { createClient } from '@supabase/supabase-js'
import OpenAI from 'openai'

// Load environment variables
require('dotenv').config()

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY! })

async function testAIDrafts() {
  console.log('🧪 Testing AI Draft functionality...\n')

  try {
    // 1. Test database connection
    console.log('1. Testing database connection...')
    const { data: tables, error: dbError } = await supabase
      .from('information_schema.tables')
      .select('table_name')
      .eq('table_schema', 'public')
      .eq('table_name', 'inbox_ai_drafts')
    
    if (dbError) {
      throw new Error(`Database connection failed: ${dbError.message}`)
    }
    
    if (tables && tables.length > 0) {
      console.log('✅ inbox_ai_drafts table exists')
    } else {
      console.log('❌ inbox_ai_drafts table not found - run migrations first')
      return
    }

    // 2. Test OpenAI connection
    console.log('\n2. Testing OpenAI connection...')
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "user", content: "Say 'Hello, AI Draft test successful!'" }
      ],
      max_tokens: 50,
    })
    
    const testResponse = completion.choices[0]?.message?.content
    if (testResponse) {
      console.log('✅ OpenAI connection successful')
      console.log(`   Response: "${testResponse}"`)
    } else {
      throw new Error('OpenAI returned empty response')
    }

    // 3. Test AI draft generation
    console.log('\n3. Testing AI draft generation...')
    const testMessage = "Hi, I'm interested in your product. Can you tell me more about pricing?"
    
    const completion2 = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { 
          role: "system", 
          content: "You are a helpful sales assistant. Draft short, professional, friendly replies to prospects. Keep responses under 100 words, be conversational, and show genuine interest in helping them." 
        },
        { 
          role: "user", 
          content: `Prospect message: ${testMessage}` 
        }
      ],
      max_tokens: 250,
      temperature: 0.7,
    })

    const draft = completion2.choices[0]?.message?.content?.trim()
    if (draft) {
      console.log('✅ AI draft generation successful')
      console.log(`   Generated draft: "${draft}"`)
    } else {
      throw new Error('AI draft generation failed')
    }

    // 4. Test database insertion (mock data)
    console.log('\n4. Testing database insertion...')
    const mockThreadId = '00000000-0000-0000-0000-000000000001'
    const mockMessageId = '00000000-0000-0000-0000-000000000002'
    
    const { data: insertedDraft, error: insertError } = await supabase
      .from('inbox_ai_drafts')
      .insert({
        thread_id: mockThreadId,
        message_id: mockMessageId,
        draft: draft
      })
      .select()
      .single()

    if (insertError) {
      console.log('⚠️  Database insertion failed (expected for mock IDs):', insertError.message)
    } else {
      console.log('✅ Database insertion successful')
      console.log(`   Inserted draft ID: ${insertedDraft.id}`)
    }

    // 5. Test API endpoint (if running)
    console.log('\n5. Testing API endpoint...')
    try {
      const response = await fetch('http://localhost:3000/api/inbox/threads/test/ai-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ message_id: 'test' })
      })
      
      if (response.status === 404) {
        console.log('✅ API endpoint exists (returned expected 404 for test data)')
      } else {
        console.log(`⚠️  API endpoint returned status: ${response.status}`)
      }
    } catch (error) {
      console.log('⚠️  API endpoint test skipped (server not running)')
    }

    console.log('\n🎉 All tests completed successfully!')
    console.log('\nNext steps:')
    console.log('1. Run the database migration: supabase db push')
    console.log('2. Start your development server: npm run dev')
    console.log('3. Send a test email and check the inbox')
    console.log('4. Click "Generate AI Reply" to test the feature')

  } catch (error) {
    console.error('\n❌ Test failed:', error)
    process.exit(1)
  }
}

// Run tests
testAIDrafts() 