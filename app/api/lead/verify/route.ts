/**
 * Block 19500 — SmartSend Lead Verification Engine v1
 * POST /api/lead/verify
 * Verify a lead across all 9 categories and generate quality score
 */

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import {
  verifyEmail,
  verifyPhone,
  verifyAddress,
  verifyHomeowner,
  verifyIntent,
  verifySpam,
  calculateQualityScore,
  generateRedAlerts,
  type DuplicateVerificationResult,
  type TerritoryVerificationResult,
} from "@/lib/lead-verification/verification-workers";

// Helper function to check duplicates in database
async function checkDuplicates(
  supabase: any,
  workspaceId: string,
  email: string | null,
  phone: string | null,
  address: string | null,
  contactId: string | null,
  leadId: string | null
): Promise<DuplicateVerificationResult> {
  const result: DuplicateVerificationResult = {
    isDuplicate: false,
    matches: [],
    matchFields: [],
    status: "unique",
    score: 100,
  };

  if (!email && !phone) {
    return result;
  }

  // Check for duplicate emails
  if (email) {
    const emailQuery = supabase
      .from("contacts")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("email", email.toLowerCase())
      .limit(10);

    if (contactId) {
      emailQuery.neq("id", contactId);
    }

    const { data: emailMatches } = await emailQuery;

    if (emailMatches && emailMatches.length > 0) {
      result.isDuplicate = true;
      result.matches.push(...emailMatches.map((m: any) => m.id));
      result.matchFields.push("email");
    }

    // Also check leads table
    const leadEmailQuery = supabase
      .from("leads")
      .select("id")
      .eq("workspace_id", workspaceId)
      .eq("email", email.toLowerCase())
      .limit(10);

    if (leadId) {
      leadEmailQuery.neq("id", leadId);
    }

    const { data: leadEmailMatches } = await leadEmailQuery;

    if (leadEmailMatches && leadEmailMatches.length > 0) {
      result.isDuplicate = true;
      result.matches.push(...leadEmailMatches.map((m: any) => m.id));
      if (!result.matchFields.includes("email")) {
        result.matchFields.push("email");
      }
    }
  }

  // Check for duplicate phones
  if (phone) {
    const phoneDigits = phone.replace(/\D/g, "");
    if (phoneDigits.length >= 10) {
      const phoneQuery = supabase
        .from("contacts")
        .select("id")
        .eq("workspace_id", workspaceId)
        .limit(10);

      if (contactId) {
        phoneQuery.neq("id", contactId);
      }

      const { data: phoneMatches } = await phoneQuery;

      if (phoneMatches) {
        const matchingPhones = phoneMatches.filter((contact: any) => {
          if (!contact.phone) return false;
          const contactDigits = contact.phone.replace(/\D/g, "");
          return contactDigits === phoneDigits || contactDigits.endsWith(phoneDigits) || phoneDigits.endsWith(contactDigits);
        });

        if (matchingPhones.length > 0) {
          result.isDuplicate = true;
          result.matches.push(...matchingPhones.map((m: any) => m.id));
          if (!result.matchFields.includes("phone")) {
            result.matchFields.push("phone");
          }
        }
      }
    }
  }

  if (result.isDuplicate) {
    result.status = result.matches.length > 1 ? "duplicate" : "possible_duplicate";
    result.score = Math.max(0, 100 - (result.matches.length * 20));
  }

  return result;
}

// Helper function to check territory compliance
async function checkTerritory(
  supabase: any,
  workspaceId: string,
  zip: string | null,
  city: string | null,
  state: string | null
): Promise<TerritoryVerificationResult> {
  const result: TerritoryVerificationResult = {
    compliant: false,
    matchZip: null,
    matchNeighborhood: null,
    matchCounty: null,
    status: "unknown",
    reasons: [],
    score: 50,
  };

  if (!zip) {
    result.reasons.push("No ZIP code provided");
    return result;
  }

  // Get contractor territory settings
  const { data: territory } = await supabase
    .from("contractor_territory")
    .select("zip_codes, neighborhoods, counties")
    .eq("workspace_id", workspaceId)
    .maybeSingle();

  if (!territory) {
    result.reasons.push("No territory configuration found");
    result.status = "unknown";
    return result;
  }

  // Check ZIP code match
  if (territory.zip_codes && Array.isArray(territory.zip_codes) && territory.zip_codes.length > 0) {
    const zipMatch = territory.zip_codes.includes(zip) || territory.zip_codes.some((tz: string) => zip.startsWith(tz));
    result.matchZip = zipMatch;
    
    if (zipMatch) {
      result.compliant = true;
      result.status = "in_territory";
      result.score = 100;
      return result;
    } else {
      result.reasons.push("ZIP code not in territory");
      result.status = "out_of_area";
      result.score = 0;
    }
  }

  // Check neighborhood match (if ZIP doesn't match)
  if (!result.compliant && territory.neighborhoods && Array.isArray(territory.neighborhoods) && city) {
    const neighborhoodMatch = territory.neighborhoods.some((n: string) =>
      city.toLowerCase().includes(n.toLowerCase()) || n.toLowerCase().includes(city.toLowerCase())
    );
    result.matchNeighborhood = neighborhoodMatch;
    
    if (neighborhoodMatch) {
      result.compliant = true;
      result.status = "in_territory";
      result.score = 80;
      return result;
    }
  }

  // Check county match
  if (!result.compliant && territory.counties && Array.isArray(territory.counties) && city) {
    // Basic county check (would need more sophisticated matching in production)
    result.matchCounty = false;
  }

  if (!result.compliant) {
    result.score = 0;
  }

  return result;
}

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const { data: { user } } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { contact_id, lead_id, force_reverify = false } = body;

    if (!contact_id && !lead_id) {
      return NextResponse.json(
        { error: "contact_id or lead_id is required" },
        { status: 400 }
      );
    }

    // Get contact or lead data
    let workspaceId: string;
    let contactData: any = null;
    let leadData: any = null;

    if (contact_id) {
      const { data: contact, error: contactError } = await supabase
        .from("contacts")
        .select("*")
        .eq("id", contact_id)
        .single();

      if (contactError || !contact) {
        return NextResponse.json(
          { error: "Contact not found" },
          { status: 404 }
        );
      }

      workspaceId = contact.workspace_id;
      contactData = contact;
    } else if (lead_id) {
      const { data: lead, error: leadError } = await supabase
        .from("leads")
        .select("*")
        .eq("id", lead_id)
        .single();

      if (leadError || !lead) {
        return NextResponse.json(
          { error: "Lead not found" },
          { status: 404 }
        );
      }

      workspaceId = lead.workspace_id;
      leadData = lead;
    }

    // Check if verification already exists
    let existingVerification = null;
    if (!force_reverify) {
      const { data: existing } = await supabase
        .from("lead_verification")
        .select("*")
        .eq("workspace_id", workspaceId)
        .eq(contact_id ? "contact_id" : "lead_id", contact_id || lead_id)
        .order("created_at", { ascending: false })
        .limit(1)
        .single();

      existingVerification = existing;
    }

    if (existingVerification && !force_reverify) {
      return NextResponse.json({
        verification: existingVerification,
        cached: true,
      });
    }

    // Run all verification checks
    const emailResult = await verifyEmail(contactData || leadData);
    const phoneResult = await verifyPhone(contactData || leadData);
    const addressResult = await verifyAddress(contactData || leadData, workspaceId);
    const homeownerResult = await verifyHomeowner(contactData || leadData);
    const intentResult = await verifyIntent(contactData || leadData);
    const spamResult = await verifySpam(contactData || leadData);
    
    // Database-backed checks
    const duplicateResult = await checkDuplicates(
      supabase,
      workspaceId,
      (contactData || leadData)?.email || null,
      (contactData || leadData)?.phone || null,
      (contactData || leadData)?.address || null,
      contact_id || null,
      lead_id || null
    );
    
    const territoryResult = await checkTerritory(
      supabase,
      workspaceId,
      (contactData || leadData)?.zip || (contactData || leadData)?.postal_code || null,
      (contactData || leadData)?.city || null,
      (contactData || leadData)?.state || null
    );

    // Calculate quality score
    const qualityScore = calculateQualityScore({
      email: emailResult,
      phone: phoneResult,
      address: addressResult,
      homeowner: homeownerResult,
      intent: intentResult,
      territory: territoryResult,
      spam: spamResult,
      duplicate: duplicateResult,
    });

    // Generate red alerts
    const redAlerts = generateRedAlerts({
      email: emailResult,
      phone: phoneResult,
      homeowner: homeownerResult,
      territory: territoryResult,
      spam: spamResult,
      duplicate: duplicateResult,
      intent: intentResult,
    });

    // Determine quality category
    let qualityCategory: "high" | "medium" | "low" | "junk";
    if (qualityScore >= 90) {
      qualityCategory = "high";
    } else if (qualityScore >= 70) {
      qualityCategory = "medium";
    } else if (qualityScore >= 40) {
      qualityCategory = "low";
    } else {
      qualityCategory = "junk";
    }

    // Create verification record
    const verificationData = {
      workspace_id: workspaceId,
      contact_id: contact_id || null,
      lead_id: lead_id || null,
      // Email
      email_valid: emailResult.valid,
      email_format_valid: emailResult.formatValid,
      email_mailbox_exists: emailResult.mailboxExists,
      email_domain_reputation: emailResult.domainReputation,
      email_spam_markers: emailResult.spamMarkers || [],
      email_disposable: emailResult.disposable,
      email_verification_status: emailResult.status,
      email_verification_reasons: emailResult.reasons || [],
      // Phone
      phone_valid: phoneResult.valid,
      phone_type: phoneResult.type,
      phone_carrier: phoneResult.carrier,
      phone_spam_level: phoneResult.spamLevel,
      phone_verification_status: phoneResult.status,
      phone_verification_reasons: phoneResult.reasons || [],
      // Address
      address_valid: addressResult.valid,
      address_formatted: addressResult.formatted,
      address_in_territory: addressResult.inTerritory,
      address_is_po_box: addressResult.isPoBox,
      address_is_commercial: addressResult.isCommercial,
      address_is_multi_family: addressResult.isMultiFamily,
      address_verification_status: addressResult.status,
      address_verification_reasons: addressResult.reasons || [],
      // Homeowner
      homeowner_verified: homeownerResult.verified,
      homeowner_match_score: homeownerResult.matchScore,
      homeowner_match_sources: homeownerResult.matchSources || [],
      homeowner_verification_status: homeownerResult.status,
      homeowner_verification_reasons: homeownerResult.reasons || [],
      // Intent
      intent_roofing_relevant: intentResult.roofingRelevant,
      intent_score: intentResult.score,
      intent_keywords: intentResult.keywords || [],
      intent_verification_status: intentResult.status,
      intent_verification_reasons: intentResult.reasons || [],
      // Territory
      territory_compliant: territoryResult.compliant,
      territory_match_zip: territoryResult.matchZip,
      territory_match_neighborhood: territoryResult.matchNeighborhood,
      territory_match_county: territoryResult.matchCounty,
      territory_status: territoryResult.status,
      territory_reasons: territoryResult.reasons || [],
      // Spam
      spam_detected: spamResult.detected,
      spam_score: spamResult.score,
      spam_patterns: spamResult.patterns || [],
      spam_type: spamResult.type,
      spam_verification_status: spamResult.status,
      spam_verification_reasons: spamResult.reasons || [],
      // Duplicate
      is_duplicate: duplicateResult.isDuplicate,
      duplicate_matches: duplicateResult.matches || [],
      duplicate_match_fields: duplicateResult.matchFields || [],
      duplicate_status: duplicateResult.status,
      // Quality
      quality_score: qualityScore,
      quality_category: qualityCategory,
      red_alerts: redAlerts,
      verification_metadata: {
        email: emailResult.metadata || {},
        phone: phoneResult.metadata || {},
        address: addressResult.metadata || {},
        homeowner: homeownerResult.metadata || {},
        intent: intentResult.metadata || {},
        spam: spamResult.metadata || {},
        duplicate: duplicateResult.metadata || {},
        territory: territoryResult.metadata || {},
      },
    };

    const { data: verification, error: verificationError } = await supabase
      .from("lead_verification")
      .insert(verificationData)
      .select()
      .single();

    if (verificationError) {
      console.error("Error creating verification:", verificationError);
      return NextResponse.json(
        { error: "Failed to create verification record" },
        { status: 500 }
      );
    }

    // Create quality score record
    await supabase.from("lead_quality_scores").insert({
      workspace_id: workspaceId,
      contact_id: contact_id || null,
      lead_id: lead_id || null,
      verification_id: verification.id,
      quality_score: qualityScore,
      quality_category: qualityCategory,
      email_score: emailResult.score || 0,
      phone_score: phoneResult.score || 0,
      address_score: addressResult.score || 0,
      homeowner_score: homeownerResult.score || 0,
      intent_score: intentResult.score || 0,
      territory_score: territoryResult.score || 0,
      spam_score: spamResult.score || 0,
      duplicate_score: duplicateResult.score || 0,
      score_factors: {
        email: emailResult,
        phone: phoneResult,
        address: addressResult,
        homeowner: homeownerResult,
        intent: intentResult,
        territory: territoryResult,
        spam: spamResult,
        duplicate: duplicateResult,
      },
    });

    // Log verification timeline
    const checks = [
      { type: "email", result: emailResult },
      { type: "phone", result: phoneResult },
      { type: "address", result: addressResult },
      { type: "homeowner", result: homeownerResult },
      { type: "intent", result: intentResult },
      { type: "spam", result: spamResult },
      { type: "territory", result: territoryResult },
      { type: "duplicate", result: duplicateResult },
    ];

    for (const check of checks) {
      await supabase.from("lead_verification_timeline").insert({
        workspace_id: workspaceId,
        contact_id: contact_id || null,
        lead_id: lead_id || null,
        verification_id: verification.id,
        check_type: check.type,
        check_status: check.result.status === "valid" || check.result.status === "verified" || check.result.status === "relevant" || check.result.status === "in_territory" || check.result.status === "unique" ? "passed" : check.result.status === "unknown" ? "unknown" : "failed",
        check_result: check.result,
        details: JSON.stringify(check.result),
      });
    }

    return NextResponse.json({
      verification,
      quality_score: qualityScore,
      quality_category: qualityCategory,
      red_alerts: redAlerts,
    });
  } catch (error: any) {
    console.error("Error verifying lead:", error);
    return NextResponse.json(
      { error: error.message || "Failed to verify lead" },
      { status: 500 }
    );
  }
}

