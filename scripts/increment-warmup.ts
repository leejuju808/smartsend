#!/usr/bin/env tsx

import { createClient } from "@supabase/supabase-js";

// Load environment variables from .env.local
// This assumes the script is run from the project root

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function incrementWarmupLevels() {
  console.log("Starting warmup level increment...");
  
  try {
    // Call the database function to increment warmup levels
    const { error } = await supabase.rpc('increment_warmup');
    
    if (error) {
      console.error('Error incrementing warmup levels:', error);
      process.exit(1);
    }
    
    console.log("Successfully incremented warmup levels for all users");
    
    // Get some stats about the update
    const { data: profiles, error: statsError } = await supabase
      .from('profiles')
      .select('warmup_level, daily_send_cap')
      .order('warmup_level', { ascending: false })
      .limit(10);
    
    if (!statsError && profiles) {
      console.log("\nTop 10 warmup levels:");
      profiles.forEach((profile, index) => {
        console.log(`${index + 1}. Level ${profile.warmup_level}x (Cap: ${profile.daily_send_cap})`);
      });
    }
    
  } catch (error) {
    console.error('Exception during warmup increment:', error);
    process.exit(1);
  }
}

// Run the function
incrementWarmupLevels()
  .then(() => {
    console.log("Warmup increment completed successfully");
    process.exit(0);
  })
  .catch((error) => {
    console.error("Warmup increment failed:", error);
    process.exit(1);
  }); 