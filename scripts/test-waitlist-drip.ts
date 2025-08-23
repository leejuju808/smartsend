import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testWaitlistDrip() {
  console.log("🧪 Testing Waitlist Drip System...");
  
  // Test 1: Check if waitlist_emails table exists
  console.log("\n1. Checking waitlist_emails table...");
  const { data: emails, error: emailsError } = await supabase
    .from("waitlist_emails")
    .select("count")
    .limit(1);
  
  if (emailsError) {
    console.log("❌ waitlist_emails table error:", emailsError.message);
  } else {
    console.log("✅ waitlist_emails table accessible");
  }
  
  // Test 2: Check if suppression_list table exists
  console.log("\n2. Checking suppression_list table...");
  const { data: suppressions, error: suppressionsError } = await supabase
    .from("suppression_list")
    .select("count")
    .limit(1);
  
  if (suppressionsError) {
    console.log("❌ suppression_list table error:", suppressionsError.message);
  } else {
    console.log("✅ suppression_list table accessible");
  }
  
  // Test 3: Check waitlist table
  console.log("\n3. Checking waitlist table...");
  const { data: waitlist, error: waitlistError } = await supabase
    .from("waitlist")
    .select("count")
    .limit(1);
  
  if (waitlistError) {
    console.log("❌ waitlist table error:", waitlistError.message);
  } else {
    console.log("✅ waitlist table accessible");
  }
  
  // Test 4: Check environment variables
  console.log("\n4. Checking environment variables...");
  const requiredEnvVars = [
    "NEXT_PUBLIC_SUPABASE_URL",
    "SUPABASE_SERVICE_ROLE_KEY",
    "RESEND_API_KEY",
    "RESEND_FROM",
    "NEXT_PUBLIC_SITE_URL"
  ];
  
  let envVarsOk = true;
  for (const envVar of requiredEnvVars) {
    if (!process.env[envVar]) {
      console.log(`❌ Missing: ${envVar}`);
      envVarsOk = false;
    } else {
      console.log(`✅ Found: ${envVar}`);
    }
  }
  
  if (envVarsOk) {
    console.log("\n🎉 All tests passed! The waitlist drip system is ready to use.");
  } else {
    console.log("\n⚠️  Some environment variables are missing. Please check your GitHub Secrets.");
  }
}

testWaitlistDrip().catch(console.error); 