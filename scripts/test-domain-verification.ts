#!/usr/bin/env tsx

/**
 * Test script for domain verification functionality
 * Run with: npx tsx scripts/test-domain-verification.ts
 */

import { promises as dns } from "dns";

async function testDNSLookups() {
  console.log("🧪 Testing DNS Lookup Functions...\n");

  const testDomain = "example.com";
  
  try {
    // Test TXT record lookup
    console.log(`📝 Testing TXT record lookup for ${testDomain}...`);
    const txtRecords = await dns.resolveTxt(testDomain);
    console.log("✅ TXT records found:", txtRecords.flat());
    
    // Test CNAME lookup
    console.log(`\n🔗 Testing CNAME lookup for t.${testDomain}...`);
    try {
      const cnameRecords = await dns.resolveCname(`t.${testDomain}`);
      console.log("✅ CNAME records found:", cnameRecords);
    } catch (error) {
      console.log("ℹ️  No CNAME records found (expected for example.com)");
    }
    
    // Test specific DNS records that should exist
    console.log(`\n🔍 Testing specific DNS records...`);
    
    // SPF record
    try {
      const spfRecords = await dns.resolveTxt(testDomain);
      const spf = spfRecords.flat().find(record => record.startsWith("v=spf1"));
      if (spf) {
        console.log("✅ SPF record found:", spf);
      } else {
        console.log("ℹ️  No SPF record found");
      }
    } catch (error) {
      console.log("ℹ️  Error checking SPF:", error instanceof Error ? error.message : String(error));
    }
    
    // DMARC record
    try {
      const dmarcRecords = await dns.resolveTxt(`_dmarc.${testDomain}`);
      const dmarc = dmarcRecords.flat().find(record => record.startsWith("v=DMARC1"));
      if (dmarc) {
        console.log("✅ DMARC record found:", dmarc);
      } else {
        console.log("ℹ️  No DMARC record found");
      }
    } catch (error) {
      console.log("ℹ️  Error checking DMARC:", error instanceof Error ? error.message : String(error));
    }
    
    // DKIM record
    try {
      const dkimRecords = await dns.resolveTxt(`mail._domainkey.${testDomain}`);
      if (dkimRecords.length > 0) {
        console.log("✅ DKIM record found:", dkimRecords.flat());
      } else {
        console.log("ℹ️  No DKIM record found");
      }
    } catch (error) {
      console.log("ℹ️  Error checking DKIM:", error instanceof Error ? error.message : String(error));
    }
    
  } catch (error) {
    console.error("❌ Error in DNS testing:", error);
  }
}

async function testDomainExtraction() {
  console.log("\n🔍 Testing Domain Extraction Logic...\n");
  
  const testEmails = [
    "user@example.com",
    "Name <user@example.com>",
    "user@subdomain.example.com",
    "invalid-email",
    "user@",
    "@example.com"
  ];
  
  testEmails.forEach(email => {
    try {
      // Simple domain extraction (matching our logic)
      let domain = null;
      
      // Handle "Name <email@domain.com>" format
      const match = email.match(/@([^>]+)>?$/);
      if (match) {
        domain = match[1].toLowerCase();
      } else {
        // Fallback to simple @ split
        const parts = email.split("@");
        if (parts.length === 2) {
          domain = parts[1].toLowerCase();
        }
      }
      
      console.log(`📧 ${email} → Domain: ${domain || "null"}`);
    } catch (error) {
      console.log(`❌ ${email} → Error: ${error instanceof Error ? error.message : String(error)}`);
    }
  });
}

async function testProviderDefaults() {
  console.log("\n🏢 Testing Provider Default Configurations...\n");
  
  const testDomain = "example.com";
  const testSelector = "mail";
  
  // Brevo defaults
  const brevoDefaults = {
    spfWanted: `v=spf1 include:spf.brevo.com ~all`,
    dkimName: `${testSelector}._domainkey.${testDomain}`,
    dkimWantedParts: [`v=DKIM1`, `k=rsa`],
    dmarcName: `_dmarc.${testDomain}`,
    dmarcWanted: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${testDomain}; pct=100`,
    trackHost: `t.${testDomain}`,
    trackTargetHint: `uXXXXX.wl.sendgrid.net or brevo tracking target`
  };
  
  // MailerSend defaults
  const mailersendDefaults = {
    spfWanted: `v=spf1 include:_spf.mailersend.net ~all`,
    dkimName: `${testSelector}._domainkey.${testDomain}`,
    dkimWantedParts: [`v=DKIM1`, `k=rsa`],
    dmarcName: `_dmarc.${testDomain}`,
    dmarcWanted: `v=DMARC1; p=quarantine; rua=mailto:dmarc@${testDomain}; pct=100`,
    trackHost: `t.${testDomain}`,
    trackTargetHint: `track.mailersend.net`
  };
  
  console.log("📧 Brevo Configuration:");
  console.log("  SPF:", brevoDefaults.spfWanted);
  console.log("  DKIM Name:", brevoDefaults.dkimName);
  console.log("  DMARC Name:", brevoDefaults.dmarcName);
  console.log("  Tracking Host:", brevoDefaults.trackHost);
  
  console.log("\n📧 MailerSend Configuration:");
  console.log("  SPF:", mailersendDefaults.spfWanted);
  console.log("  DKIM Name:", mailersendDefaults.dkimName);
  console.log("  DMARC Name:", mailersendDefaults.dmarcName);
  console.log("  Tracking Host:", mailersendDefaults.trackHost);
}

async function main() {
  console.log("🚀 Domain Verification Test Suite\n");
  console.log("=" .repeat(50));
  
  await testDNSLookups();
  await testDomainExtraction();
  await testProviderDefaults();
  
  console.log("\n" + "=" .repeat(50));
  console.log("✅ Test suite completed!");
  console.log("\n💡 Next steps:");
  console.log("  1. Run the database migration: supabase db push");
  console.log("  2. Test the API endpoint: POST /api/domain/check");
  console.log("  3. Visit /dashboard/domain-setup to test the UI");
  console.log("  4. Check domain verification in campaigns");
}

if (require.main === module) {
  main().catch(console.error);
} 