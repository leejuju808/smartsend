// API endpoint for bulk phone audit
// POST /api/phone/audit

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { getPhoneIntelligence } from "@/lib/phone-intelligence";
import { normalizePhoneNumber } from "@/lib/providers/sms";

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json(
        { error: "Not authenticated" },
        { status: 401 }
      );
    }

    // Get user's organization
    const { data: orgMember } = await supabase
      .from("org_members")
      .select("org_id")
      .eq("user_id", user.id)
      .maybeSingle();

    if (!orgMember?.org_id) {
      return NextResponse.json(
        { error: "Organization not found" },
        { status: 404 }
      );
    }

    const body = await req.json();
    const { 
      contactIds, // Optional: specific contacts to audit
      limit = 1000, // Max contacts to process
      minQualityScore, // Optional: filter by quality score
      lineTypes, // Optional: filter by line types
    } = body;

    // Build query
    let query = supabase
      .from("contacts")
      .select("id, phone, email, first_name, last_name, street, city, state, zip")
      .eq("org_id", orgMember.org_id)
      .not("phone", "is", null)
      .limit(limit);

    if (contactIds && Array.isArray(contactIds) && contactIds.length > 0) {
      query = query.in("id", contactIds);
    }

    const { data: contacts, error: contactsError } = await query;

    if (contactsError) {
      return NextResponse.json(
        { error: "Failed to fetch contacts" },
        { status: 500 }
      );
    }

    if (!contacts || contacts.length === 0) {
      return NextResponse.json({
        total: 0,
        processed: 0,
        results: [],
        summary: {
          mobile: 0,
          landline: 0,
          voip: 0,
          disconnected: 0,
          smsReady: 0,
          highQuality: 0,
          lowQuality: 0,
          spamRisk: 0,
        },
      });
    }

    // Process each contact
    const results: any[] = [];
    const summary = {
      mobile: 0,
      landline: 0,
      voip: 0,
      disconnected: 0,
      smsReady: 0,
      highQuality: 0,
      lowQuality: 0,
      spamRisk: 0,
    };

    for (const contact of contacts) {
      if (!contact.phone) continue;

      try {
        const intelligence = await getPhoneIntelligence(
          supabase,
          contact.phone,
          orgMember.org_id,
          contact.id
        );

        // Apply filters
        if (minQualityScore !== undefined && intelligence.qualityScore < minQualityScore) {
          continue;
        }

        if (lineTypes && Array.isArray(lineTypes) && lineTypes.length > 0) {
          if (!lineTypes.includes(intelligence.lineType.lineType)) {
            continue;
          }
        }

        // Update summary
        if (intelligence.lineType.lineType === 'mobile') summary.mobile++;
        if (intelligence.lineType.lineType === 'landline') summary.landline++;
        if (intelligence.lineType.lineType === 'voip') summary.voip++;
        if (intelligence.validation.isDisconnected) summary.disconnected++;
        if (intelligence.smsReadiness.status === 'sms_ready') summary.smsReady++;
        if (intelligence.qualityScore >= 90) summary.highQuality++;
        if (intelligence.qualityScore < 50) summary.lowQuality++;
        if (intelligence.homeownerSignals.isSpamRisk) summary.spamRisk++;

        results.push({
          contactId: contact.id,
          phone: intelligence.phoneNumber,
          email: contact.email,
          name: `${contact.first_name || ''} ${contact.last_name || ''}`.trim(),
          address: `${contact.street || ''}, ${contact.city || ''}, ${contact.state || ''} ${contact.zip || ''}`.trim(),
          lineType: intelligence.lineType.lineType,
          carrier: intelligence.carrier.carrierName,
          smsReadiness: intelligence.smsReadiness.status,
          qualityScore: intelligence.qualityScore,
          spamRiskScore: intelligence.spamRiskScore,
          homeownerLikelihood: intelligence.homeownerSignals.likelihood,
          tags: intelligence.tags,
          isValid: intelligence.validation.isValid,
          isDisconnected: intelligence.validation.isDisconnected,
        });
      } catch (error: any) {
        console.error(`Error processing contact ${contact.id}:`, error);
        results.push({
          contactId: contact.id,
          phone: contact.phone,
          error: error.message,
        });
      }
    }

    // Sort by quality score (descending)
    results.sort((a, b) => (b.qualityScore || 0) - (a.qualityScore || 0));

    return NextResponse.json({
      total: contacts.length,
      processed: results.length,
      results,
      summary,
    });
  } catch (error: any) {
    console.error("Error in phone audit:", error);
    return NextResponse.json(
      { error: error.message || "Failed to audit phone numbers" },
      { status: 500 }
    );
  }
}





















































