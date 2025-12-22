// Block 257000 — AI Office Admin Engine v1
// POST /api/office-admin/intake
// Customer intake bot - collects details automatically from any message

import { NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

export async function POST(req: NextRequest) {
  try {
    const supabase = createClient();
    const body = await req.json();
    const {
      company_id,
      source_type, // 'email', 'voicemail', 'webform', 'sms'
      source_data, // The message content
      from_name,
      from_email,
      from_phone,
    } = body;

    if (!company_id || !source_data) {
      return NextResponse.json(
        { error: "Missing required fields: company_id, source_data" },
        { status: 400 }
      );
    }

    // Step 1: AI Extract Customer Intake Information
    const intakePrompt = `You are SmartSend's AI Customer Intake Bot for a roofing company.

Extract all customer information from this message:

${source_data}

Extract and return ONLY valid JSON with these fields (use null if not found):
{
  "name": "full name or null",
  "first_name": "first name or null",
  "last_name": "last name or null",
  "email": "email address or null",
  "phone": "phone number or null",
  "address": "full address or null",
  "city": "city or null",
  "state": "state or null",
  "zip_code": "zip code or null",
  "roof_type": "asphalt, metal, tile, flat, other, or null",
  "issue_description": "description of roof issue or null",
  "insurance_claim": true/false/null,
  "out_of_pocket": true/false/null,
  "preferred_appointment_time": "date/time preference or null",
  "urgency": "low, normal, high, urgent, or null",
  "lead_score": 0-100 number or null
}`;

    const intakeCompletion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: "You are a helpful AI assistant that extracts customer information for roofing companies." },
        { role: "user", content: intakePrompt },
      ],
      temperature: 0.2,
      response_format: { type: "json_object" },
    });

    const intakeText = intakeCompletion.choices[0]?.message?.content || "{}";
    const intakeData = JSON.parse(intakeText);

    // Step 2: Merge with provided data
    const finalData = {
      name: intakeData.name || from_name || null,
      first_name: intakeData.first_name || (intakeData.name ? intakeData.name.split(" ")[0] : null) || null,
      last_name: intakeData.last_name || (intakeData.name ? intakeData.name.split(" ").slice(1).join(" ") : null) || null,
      email: intakeData.email || from_email || null,
      phone: intakeData.phone || from_phone || null,
      address: intakeData.address || null,
      city: intakeData.city || null,
      state: intakeData.state || null,
      zip_code: intakeData.zip_code || null,
      roof_type: intakeData.roof_type || null,
      issue_description: intakeData.issue_description || null,
      insurance_claim: intakeData.insurance_claim || false,
      out_of_pocket: intakeData.out_of_pocket || false,
      preferred_appointment_time: intakeData.preferred_appointment_time || null,
      urgency: intakeData.urgency || "normal",
      lead_score: intakeData.lead_score || null,
    };

    // Step 3: Create or update lead
    let leadId: string | null = null;

    if (finalData.email || finalData.phone) {
      // Check for existing lead
      const { data: existingLead } = await supabase
        .from("leads")
        .select("id")
        .or(
          finalData.email && finalData.phone
            ? `email.eq.${finalData.email},phone.eq.${finalData.phone}`
            : finalData.email
            ? `email.eq.${finalData.email}`
            : `phone.eq.${finalData.phone}`
        )
        .maybeSingle();

      if (existingLead) {
        leadId = existingLead.id;
        // Update lead with new information
        await supabase
          .from("leads")
          .update({
            first_name: finalData.first_name || undefined,
            last_name: finalData.last_name || undefined,
            email: finalData.email || undefined,
            phone: finalData.phone || undefined,
            address: finalData.address || undefined,
            city: finalData.city || undefined,
            state: finalData.state || undefined,
            zip_code: finalData.zip_code || undefined,
          })
          .eq("id", leadId);
      } else {
        // Create new lead
        const { data: newLead, error: leadError } = await supabase
          .from("leads")
          .insert({
            first_name: finalData.first_name,
            last_name: finalData.last_name,
            email: finalData.email,
            phone: finalData.phone,
            address: finalData.address,
            city: finalData.city,
            state: finalData.state,
            zip_code: finalData.zip_code,
            lead_source: source_type || "webform",
            status: "new",
          })
          .select()
          .single();

        if (!leadError && newLead) {
          leadId = newLead.id;
        }
      }
    }

    // Step 4: Create inbox entry
    const { data: inboxItem } = await supabase
      .from("office_inbox")
      .insert({
        company_id,
        source: source_type || "webform",
        from_name: finalData.name,
        from_email: finalData.email,
        from_phone: finalData.phone,
        subject: `New ${source_type || "inquiry"} from ${finalData.name || "Customer"}`,
        message: source_data,
        ai_category: "new_lead",
        ai_urgency: finalData.urgency,
        ai_summary: `Customer intake: ${finalData.issue_description || "No description"}`,
        ai_extracted_data: finalData,
        priority: finalData.urgency,
        status: "new",
        lead_id: leadId,
      })
      .select()
      .single();

    // Step 5: Log activity
    await supabase.from("office_activity_log").insert({
      company_id,
      activity_type: "customer_intake_completed",
      inbox_id: inboxItem?.id || null,
      lead_id: leadId,
      performed_by_ai: true,
      details: {
        source_type: source_type || "webform",
        lead_score: finalData.lead_score,
        extracted_fields: Object.keys(finalData).filter(k => finalData[k as keyof typeof finalData] !== null),
      },
    });

    return NextResponse.json({
      success: true,
      lead_id: leadId,
      intake_data: finalData,
      lead_score: finalData.lead_score,
      next_step: finalData.lead_score && finalData.lead_score > 70 ? "Schedule inspection" : "Follow up",
    });
  } catch (error: any) {
    console.error("Error processing customer intake:", error);
    return NextResponse.json(
      { error: error.message || "Failed to process customer intake" },
      { status: 500 }
    );
  }
}





















