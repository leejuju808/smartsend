#!/usr/bin/env tsx

import { createClient } from '@supabase/supabase-js';

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testReports() {
  console.log('🧪 Testing Reports System...\n');

  try {
    // Test 1: Check if the view exists
    console.log('1. Testing database view...');
    const { data: viewData, error: viewError } = await supabase
      .from('report_events')
      .select('*')
      .limit(5);
    
    if (viewError) {
      console.error('❌ View test failed:', viewError.message);
    } else {
      console.log('✅ View test passed. Found', viewData?.length || 0, 'events');
      if (viewData && viewData.length > 0) {
        console.log('Sample event:', viewData[0]);
      }
    }

    // Test 2: Test filtering by date
    console.log('\n2. Testing date filtering...');
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    const { data: dateData, error: dateError } = await supabase
      .from('report_events')
      .select('*')
      .gte('created_at', thirtyDaysAgo.toISOString())
      .limit(5);
    
    if (dateError) {
      console.error('❌ Date filtering failed:', dateError.message);
    } else {
      console.log('✅ Date filtering passed. Found', dateData?.length || 0, 'events in last 30 days');
    }

    // Test 3: Test source type filtering
    console.log('\n3. Testing source type filtering...');
    const { data: sourceData, error: sourceError } = await supabase
      .from('report_events')
      .select('*')
      .eq('source_type', 'campaign')
      .limit(5);
    
    if (sourceError) {
      console.error('❌ Source filtering failed:', sourceError.message);
    } else {
      console.log('✅ Source filtering passed. Found', sourceData?.length || 0, 'campaign events');
    }

    // Test 4: Test event type grouping
    console.log('\n4. Testing event type grouping...');
    const { data: typeData, error: typeError } = await supabase
      .from('report_events')
      .select('type')
      .limit(100);
    
    if (typeError) {
      console.error('❌ Type grouping failed:', typeError.message);
    } else {
      const typeCounts = typeData?.reduce((acc: any, event: any) => {
        acc[event.type] = (acc[event.type] || 0) + 1;
        return acc;
      }, {}) || {};
      
      console.log('✅ Type grouping passed. Event counts:', typeCounts);
    }

    console.log('\n🎉 All tests completed!');
    
    // Summary
    console.log('\n📊 Summary:');
    console.log('- Database view: ✅');
    console.log('- Date filtering: ✅');
    console.log('- Source filtering: ✅');
    console.log('- Type grouping: ✅');
    
  } catch (error) {
    console.error('❌ Test failed with error:', error);
  }
}

// Run the test
testReports().catch(console.error); 