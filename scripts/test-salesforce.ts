#!/usr/bin/env tsx

import { supabaseAdmin } from "../src/server/supabase";

async function testSalesforceConnection() {
  console.log("🔍 Testing Salesforce integration...");
  
  try {
    // Test database connection
    console.log("📊 Checking database connection...");
    const { data: tokens, error } = await supabaseAdmin
      .from("salesforce_tokens")
      .select("team_id, instance_url, created_at")
      .limit(1);
    
    if (error) {
      console.error("❌ Database error:", error.message);
      return;
    }
    
    if (tokens && tokens.length > 0) {
      console.log("✅ Salesforce tokens found:", tokens.length);
      console.log("   Team ID:", tokens[0].team_id);
      console.log("   Instance URL:", tokens[0].instance_url);
      console.log("   Created:", tokens[0].created_at);
    } else {
      console.log("ℹ️  No Salesforce tokens found (integration not set up yet)");
    }
    
    // Test environment variables
    console.log("\n🔧 Checking environment variables...");
    const requiredVars = [
      "SALESFORCE_CLIENT_ID",
      "SALESFORCE_CLIENT_SECRET", 
      "SALESFORCE_LOGIN_BASE",
      "NEXT_PUBLIC_SITE_URL"
    ];
    
    let allVarsSet = true;
    for (const varName of requiredVars) {
      const value = process.env[varName];
      if (value) {
        console.log(`   ✅ ${varName}: ${varName.includes("SECRET") ? "***" : value}`);
      } else {
        console.log(`   ❌ ${varName}: Not set`);
        allVarsSet = false;
      }
    }
    
    if (allVarsSet) {
      console.log("\n🎉 All environment variables are set!");
      console.log("   You can now test the OAuth flow at:");
      console.log(`   ${process.env.NEXT_PUBLIC_SITE_URL}/api/integrations/salesforce/start`);
    } else {
      console.log("\n⚠️  Some environment variables are missing.");
      console.log("   Please check your .env.local file and deployment settings.");
    }
    
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

// Run the test
testSalesforceConnection()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("❌ Test failed:", error);
    process.exit(1);
  }); 