#!/usr/bin/env tsx

import { supabaseAdmin } from "../src/server/supabase";

async function main() {
  console.log("Refreshing recent domain signups...");
  
  try {
    // Refresh the materialized view
    await supabaseAdmin.rpc("refresh_recent_domain_signups");
    console.log("✅ Materialized view refreshed");
    
    // Optionally send notifications (uncomment if you want this)
    // const response = await fetch(`${process.env.NEXT_PUBLIC_SITE_URL}/api/domains/notify-owner`, {
    //   method: "POST"
    // });
    // if (response.ok) {
    //   const result = await response.json();
    //   console.log(`✅ Sent ${result.count} domain notifications`);
    // }
    
  } catch (error) {
    console.error("❌ Error refreshing domain signups:", error);
    process.exit(1);
  }
}

main(); 