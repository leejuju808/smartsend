#!/usr/bin/env tsx

/**
 * Test script for Slack slash command functionality
 * Run with: npm run test:slack-slash
 */

import { supabaseAdmin } from "../src/server/supabase";

async function testSlackSlashCommand() {
  console.log("🧪 Testing Slack Slash Command functionality...\n");

  try {
    // Test 1: Check if required tables exist
    console.log("1. Checking database tables...");
    
    const { data: slackTokens } = await supabaseAdmin
      .from("slack_tokens")
      .select("team_id, workspace_name")
      .limit(1);
    
    if (slackTokens && slackTokens.length > 0) {
      console.log("✅ slack_tokens table exists and has data");
      console.log(`   Found team: ${slackTokens[0].workspace_name || slackTokens[0].team_id}`);
    } else {
      console.log("⚠️  slack_tokens table exists but is empty");
    }

    const { data: slackSettings } = await supabaseAdmin
      .from("slack_settings")
      .select("team_id, channel_id")
      .limit(1);
    
    if (slackSettings && slackSettings.length > 0) {
      console.log("✅ slack_settings table exists and has data");
      console.log(`   Found channel: ${slackSettings[0].channel_id}`);
    } else {
      console.log("⚠️  slack_settings table exists but is empty");
    }

    // Test 2: Check if ai_reply_events table exists
    const { data: aiReplies } = await supabaseAdmin
      .from("ai_reply_events")
      .select("id", { count: "exact", head: true })
      .limit(1);
    
    if (aiReplies !== null) {
      console.log("✅ ai_reply_events table exists");
    } else {
      console.log("❌ ai_reply_events table missing");
    }

    // Test 3: Check if leaderboard function exists
    try {
      const { data: leaderboard } = await supabaseAdmin.rpc("leaderboard_for_team", { 
        tid: slackTokens?.[0]?.team_id || "00000000-0000-0000-0000-000000000000" 
      });
      console.log("✅ leaderboard_for_team RPC function exists");
    } catch (error) {
      console.log("❌ leaderboard_for_team RPC function missing or has issues");
      console.log(`   Error: ${error}`);
    }

    // Test 4: Check environment variables
    console.log("\n2. Checking environment variables...");
    
    const requiredEnvVars = [
      "SLACK_SIGNING_SECRET",
      "NEXT_PUBLIC_SITE_URL"
    ];

    for (const envVar of requiredEnvVars) {
      if (process.env[envVar]) {
        console.log(`✅ ${envVar} is set`);
      } else {
        console.log(`❌ ${envVar} is missing`);
      }
    }

    // Test 5: Check API endpoint accessibility
    console.log("\n3. Testing API endpoint...");
    
    const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000";
    const testUrl = `${siteUrl}/api/integrations/slack/commands`;
    
    try {
      const response = await fetch(testUrl, {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: "text=help"
      });
      
      if (response.status === 401) {
        console.log("✅ API endpoint is accessible (returns 401 for invalid signature - expected)");
      } else {
        console.log(`⚠️  API endpoint returned unexpected status: ${response.status}`);
      }
    } catch (error) {
      console.log("❌ API endpoint is not accessible");
      console.log(`   Error: ${error}`);
    }

    console.log("\n🎯 Summary:");
    console.log("To complete the Slack slash command setup:");
    console.log("1. Add SLACK_SIGNING_SECRET to your .env.local file");
    console.log("2. Create the /smartsend slash command in your Slack app");
    console.log("3. Set the Request URL to: " + testUrl);
    console.log("4. Install the app to your workspace with required scopes");
    console.log("5. Test with: /smartsend help");

  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Run the test
testSlackSlashCommand().catch(console.error); 