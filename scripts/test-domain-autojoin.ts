#!/usr/bin/env tsx

import { supabaseAdmin } from "../src/server/supabase";

async function testDomainAutojoin() {
  console.log("Testing domain auto-join system...");
  
  try {
    // Test 1: Check if company_domains table exists
    const { data: domains, error } = await supabaseAdmin
      .from("company_domains")
      .select("*")
      .limit(1);
    
    if (error) {
      console.log("❌ company_domains table error:", error.message);
    } else {
      console.log("✅ company_domains table accessible");
    }
    
    // Test 2: Check if we can query teams
    const { data: teams, error: teamsError } = await supabaseAdmin
      .from("teams")
      .select("id, name")
      .limit(1);
    
    if (teamsError) {
      console.log("❌ teams table error:", teamsError.message);
    } else {
      console.log("✅ teams table accessible");
      if (teams && teams.length > 0) {
        console.log("   Sample team:", teams[0]);
      }
    }
    
    // Test 3: Check if we can query team_members
    const { data: members, error: membersError } = await supabaseAdmin
      .from("team_members")
      .select("team_id, user_id, role")
      .limit(1);
    
    if (membersError) {
      console.log("❌ team_members table error:", membersError.message);
    } else {
      console.log("✅ team_members table accessible");
    }
    
    console.log("\n🎯 Domain auto-join system ready for testing!");
    console.log("Next steps:");
    console.log("1. Run the migration: supabase db push");
    console.log("2. Test the API endpoints manually");
    console.log("3. Try claiming a domain and verifying with DNS TXT");
    
  } catch (error) {
    console.error("❌ Test failed:", error);
  }
}

testDomainAutojoin(); 