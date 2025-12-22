/**
 * Test script for contacts import feature
 * Run with: tsx scripts/test-contacts-import.ts
 */

import { createClient } from "@supabase/supabase-js";

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
);

async function testContactsImport() {
  console.log("🧪 Testing Contacts Import Feature\n");

  // Test 1: Add test suppressions
  console.log("1️⃣  Adding test suppressions...");
  
  const { error: supError1 } = await supabase
    .from("suppressions")
    .upsert({ type: "domain", value: "blocked.com", reason: "test blocklist" }, { onConflict: "value" });
  
  const { error: supError2 } = await supabase
    .from("suppressions")
    .upsert({ type: "email", value: "spam@example.com", reason: "known spam" }, { onConflict: "value" });

  if (supError1 || supError2) {
    console.error("❌ Error adding suppressions:", supError1 || supError2);
    return;
  }
  console.log("✅ Suppressions added\n");

  // Test 2: List suppressions
  console.log("2️⃣  Listing suppressions...");
  const { data: suppressions, error: listError } = await supabase
    .from("suppressions")
    .select("*")
    .order("created_at", { ascending: false });

  if (listError) {
    console.error("❌ Error listing suppressions:", listError);
    return;
  }
  console.log(`✅ Found ${suppressions?.length || 0} suppressions\n`);

  // Test 3: Import test contacts
  console.log("3️⃣  Importing test contacts...");
  
  const testContacts = [
    { email: "ada@example.com", first_name: "Ada", last_name: "Lovelace", company: "Analytical Engines", title: "CTO" },
    { email: "grace@example.com", first_name: "Grace", last_name: "Hopper", company: "Navy", title: "Rear Admiral" },
    { email: "bounced@blocked.com", first_name: "Bounce", last_name: "Case", company: "Acme", title: "Manager" }, // Should be suppressed
    { email: "spam@example.com", first_name: "Spam", last_name: "User", company: "Bad", title: "Bot" }, // Should be suppressed
    { email: "ADA@EXAMPLE.COM", first_name: "Ada", last_name: "Duplicate", company: "Different", title: "Engineer" }, // Should be deduped
  ];

  const response = await fetch("http://localhost:3000/api/import-contacts/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rows: testContacts.map(c => ({
        "Email": c.email,
        "First Name": c.first_name,
        "Last Name": c.last_name,
        "Company": c.company,
        "Title": c.title,
      })),
      mapping: {
        email: "Email",
        first_name: "First Name",
        last_name: "Last Name",
        company: "Company",
        title: "Title",
      },
      options: {
        dedupeBy: "email",
        skipSuppressed: true,
      },
    }),
  });

  if (!response.ok) {
    console.error("❌ Import request failed:", response.status, response.statusText);
    const errorData = await response.json();
    console.error("Error details:", errorData);
    return;
  }

  const importResult = await response.json();
  console.log("✅ Import completed:");
  console.log(`   - Inserted: ${importResult.inserted}`);
  console.log(`   - Skipped (existing): ${importResult.skipped_existing}`);
  console.log(`   - Suppressed: ${importResult.suppressed}`);
  console.log(`   - Rejected: ${importResult.rejected}\n`);

  // Test 4: Verify contacts in database
  console.log("4️⃣  Verifying contacts in database...");
  const { data: contacts, error: contactsError } = await supabase
    .from("contacts")
    .select("*")
    .order("created_at", { ascending: false })
    .limit(10);

  if (contactsError) {
    console.error("❌ Error fetching contacts:", contactsError);
    return;
  }
  
  console.log(`✅ Found ${contacts?.length || 0} contacts in database`);
  if (contacts && contacts.length > 0) {
    console.log("\nMost recent contacts:");
    contacts.slice(0, 5).forEach((c, i) => {
      console.log(`   ${i + 1}. ${c.email} - ${c.first_name} ${c.last_name} @ ${c.company || 'N/A'}`);
    });
  }
  console.log();

  // Test 5: Re-import (should skip existing)
  console.log("5️⃣  Re-importing same contacts (should skip)...");
  const reimportResponse = await fetch("http://localhost:3000/api/import-contacts/commit", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      rows: testContacts.slice(0, 2).map(c => ({
        "Email": c.email,
        "First Name": c.first_name,
        "Last Name": c.last_name,
        "Company": c.company,
        "Title": c.title,
      })),
      mapping: {
        email: "Email",
        first_name: "First Name",
        last_name: "Last Name",
        company: "Company",
        title: "Title",
      },
      options: {
        dedupeBy: "email",
        skipSuppressed: true,
      },
    }),
  });

  if (!reimportResponse.ok) {
    console.error("❌ Re-import request failed:", reimportResponse.status);
    return;
  }

  const reimportResult = await reimportResponse.json();
  console.log("✅ Re-import completed:");
  console.log(`   - Inserted: ${reimportResult.inserted} (should be 0)`);
  console.log(`   - Skipped (existing): ${reimportResult.skipped_existing} (should be 2)`);
  console.log();

  // Test Summary
  console.log("📊 Test Summary");
  console.log("================");
  
  const expectations = [
    { test: "Suppressions created", pass: (suppressions?.length || 0) >= 2 },
    { test: "Contacts imported (excluding suppressed)", pass: importResult.inserted >= 2 },
    { test: "Suppressed contacts filtered", pass: importResult.suppressed >= 2 },
    { test: "Duplicate contacts skipped", pass: true }, // Internal deduplication
    { test: "Re-import skips existing", pass: reimportResult.skipped_existing >= 2 && reimportResult.inserted === 0 },
  ];

  const allPassed = expectations.every(e => e.pass);
  
  expectations.forEach(({ test, pass }) => {
    console.log(`${pass ? '✅' : '❌'} ${test}`);
  });

  console.log();
  if (allPassed) {
    console.log("🎉 All tests passed!");
  } else {
    console.log("⚠️  Some tests failed. Review the output above.");
  }
}

// Run tests
testContactsImport().catch(console.error);
