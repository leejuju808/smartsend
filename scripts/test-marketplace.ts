#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

async function testMarketplace() {
  console.log('🧪 Testing marketplace functionality...')

  try {
    // 1. Test GET templates
    console.log('\n1. Testing GET /api/marketplace/templates...')
    const response = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('supabase.co', 'localhost:3000')}/api/marketplace/templates`)
    const templates = await response.json()
    console.log(`✅ Found ${templates.length} templates:`, templates.map((t: any) => ({ id: t.id, name: t.name, kind: t.kind })))

    // 2. Test search
    console.log('\n2. Testing search functionality...')
    const searchResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('supabase.co', 'localhost:3000')}/api/marketplace/templates?q=saas`)
    const searchResults = await searchResponse.json()
    console.log(`✅ Search for "saas" returned ${searchResults.length} results`)

    // 3. Test tag filtering
    console.log('\n3. Testing tag filtering...')
    const tagResponse = await fetch(`${process.env.NEXT_PUBLIC_SUPABASE_URL?.replace('supabase.co', 'localhost:3000')}/api/marketplace/templates?tag=saas`)
    const tagResults = await tagResponse.json()
    console.log(`✅ Tag filter "saas" returned ${tagResults.length} results`)

    // 4. Check database tables exist
    console.log('\n4. Checking database tables...')
    const { data: templatesTable, error: templatesError } = await supabase
      .from('marketplace_templates')
      .select('count')
      .limit(1)
    
    if (templatesError) {
      console.log('❌ marketplace_templates table error:', templatesError.message)
    } else {
      console.log('✅ marketplace_templates table accessible')
    }

    const { data: installsTable, error: installsError } = await supabase
      .from('marketplace_installs')
      .select('count')
      .limit(1)
    
    if (installsError) {
      console.log('❌ marketplace_installs table error:', installsError.message)
    } else {
      console.log('✅ marketplace_installs table accessible')
    }

    console.log('\n🎉 Marketplace test completed!')
    console.log('\nNext steps:')
    console.log('1. Run the seed script: npx tsx scripts/seed-marketplace.ts')
    console.log('2. Visit /dashboard/marketplace to see the UI')
    console.log('3. Test installing templates')

  } catch (error) {
    console.error('❌ Test failed:', error)
  }
}

// Run if called directly
if (import.meta.url === `file://${process.argv[1]}`) {
  testMarketplace()
} 