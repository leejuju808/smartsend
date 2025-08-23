#!/usr/bin/env tsx

import { supabaseAdmin } from "../src/server/supabase";

async function testRoiTracking() {
  console.log("🧪 Testing ROI Tracking Implementation...\n");

  try {
    // Test 1: Check if meeting_booked column exists
    console.log("1. Checking if meeting_booked column exists...");
    const { data: columns, error: columnError } = await supabaseAdmin
      .from("information_schema.columns")
      .select("column_name")
      .eq("table_name", "ai_reply_events")
      .eq("column_name", "meeting_booked");

    if (columnError) {
      console.error("❌ Error checking columns:", columnError);
      return;
    }

    if (columns && columns.length > 0) {
      console.log("✅ meeting_booked column exists");
    } else {
      console.log("❌ meeting_booked column not found - run migration first");
      return;
    }

    // Test 2: Check analytics summary API
    console.log("\n2. Testing analytics summary API...");
    const response = await fetch("http://localhost:3000/api/analytics/summary");
    
    if (response.ok) {
      const data = await response.json();
      console.log("✅ Analytics API working:", data);
    } else {
      console.log("❌ Analytics API failed:", response.status, response.statusText);
    }

    // Test 3: Check sample data
    console.log("\n3. Checking sample data...");
    const { data: events, error: eventsError } = await supabaseAdmin
      .from("ai_reply_events")
      .select("id, team_id, user_id, meeting_booked, created_at")
      .limit(5);

    if (eventsError) {
      console.error("❌ Error fetching events:", eventsError);
    } else {
      console.log(`✅ Found ${events?.length || 0} events`);
      if (events && events.length > 0) {
        console.log("Sample event:", events[0]);
      }
    }

    // Test 4: Test meeting booking update
    console.log("\n4. Testing meeting booking update...");
    if (events && events.length > 0) {
      const testEvent = events[0];
      const { error: updateError } = await supabaseAdmin
        .from("ai_reply_events")
        .update({ meeting_booked: true })
        .eq("id", testEvent.id);

      if (updateError) {
        console.error("❌ Error updating meeting_booked:", updateError);
      } else {
        console.log("✅ Successfully updated meeting_booked to true");
        
        // Revert the change
        await supabaseAdmin
          .from("ai_reply_events")
          .update({ meeting_booked: false })
          .eq("id", testEvent.id);
        console.log("✅ Reverted meeting_booked back to false");
      }
    }

    console.log("\n🎉 ROI Tracking tests completed!");

  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Run the test
testRoiTracking().catch(console.error); 