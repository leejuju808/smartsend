#!/usr/bin/env tsx

import { createClient } from "@supabase/supabase-js";
require('dotenv').config();

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function generateTestData() {
  try {
    console.log("🎯 Generating test data for AI Insights...");

    // Get a test user (you'll need to replace this with an actual user ID)
    const { data: users } = await sb
      .from("users")
      .select("id")
      .limit(1);

    if (!users || users.length === 0) {
      console.log("❌ No users found. Please create a user first.");
      return;
    }

    const userId = users[0].id;
    console.log(`👤 Using user ID: ${userId}`);

    // Create a test campaign
    const { data: campaign } = await sb
      .from("campaigns")
      .insert({
        user_id: userId,
        title: "Test Campaign - AI Insights Demo",
        status: "active"
      })
      .select()
      .single();

    if (!campaign) {
      console.log("❌ Failed to create test campaign");
      return;
    }

    console.log(`📧 Created campaign: ${campaign.title}`);

    // Generate email events for the last 14 days
    const now = new Date();
    const events = [];

    // Current week events (higher engagement)
    for (let i = 0; i < 7; i++) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      
      // Generate 20-30 events per day
      const dailyEvents = Math.floor(Math.random() * 11) + 20;
      
      for (let j = 0; j < dailyEvents; j++) {
        const eventType = getRandomEventType();
        const event = {
          campaign_id: campaign.id,
          user_id: userId,
          contact_id: null,
          email_lower: `test${j}@example.com`,
          event_type: eventType,
          event_data: {},
          ip_address: null,
          user_agent: "Mozilla/5.0 (Test Browser)",
          created_at: date.toISOString()
        };
        events.push(event);
      }
    }

    // Previous week events (lower engagement for comparison)
    for (let i = 7; i < 14; i++) {
      const date = new Date(now.getTime() - i * 24 * 60 * 60 * 1000);
      
      // Generate 15-25 events per day (lower than current week)
      const dailyEvents = Math.floor(Math.random() * 11) + 15;
      
      for (let j = 0; j < dailyEvents; j++) {
        const eventType = getRandomEventType();
        const event = {
          campaign_id: campaign.id,
          user_id: userId,
          contact_id: null,
          email_lower: `test${j}@example.com`,
          event_type: eventType,
          event_data: {},
          ip_address: null,
          user_agent: "Mozilla/5.0 (Test Browser)",
          created_at: date.toISOString()
        };
        events.push(event);
      }
    }

    // Insert all events
    const { data: insertedEvents, error } = await sb
      .from("email_events")
      .insert(events)
      .select();

    if (error) {
      console.log("❌ Error inserting events:", error);
      return;
    }

    console.log(`✅ Successfully created ${insertedEvents.length} test events`);
    console.log(`📊 Events span the last 14 days for week-over-week comparison`);
    
    // Show summary
    const eventCounts = events.reduce((acc, event) => {
      acc[event.event_type] = (acc[event.event_type] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);

    console.log("\n📈 Event Summary:");
    Object.entries(eventCounts).forEach(([type, count]) => {
      console.log(`   ${type}: ${count}`);
    });

    console.log("\n🎉 Test data ready! You can now:");
    console.log("   1. Visit /dashboard/reports/insights");
    console.log("   2. Click 'Refresh Insights'");
    console.log("   3. See AI-generated insights based on this data");

  } catch (error) {
    console.error("❌ Error generating test data:", error);
  }
}

function getRandomEventType(): string {
  const types = ["sent", "delivered", "opened", "clicked", "replied", "bounced", "unsubscribed"];
  const weights = [0.3, 0.25, 0.2, 0.15, 0.05, 0.03, 0.02]; // Realistic distribution
  
  const random = Math.random();
  let cumulative = 0;
  
  for (let i = 0; i < types.length; i++) {
    cumulative += weights[i];
    if (random <= cumulative) {
      return types[i];
    }
  }
  
  return types[0];
}

// Run the script
generateTestData().then(() => {
  console.log("\n🏁 Script completed");
  process.exit(0);
}).catch((error) => {
  console.error("💥 Script failed:", error);
  process.exit(1);
}); 