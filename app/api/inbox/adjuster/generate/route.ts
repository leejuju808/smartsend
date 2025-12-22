import { NextRequest, NextResponse } from "next/server";
import { createRouteHandlerClient } from "@supabase/auth-helpers-nextjs";
import { cookies } from "next/headers";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY,
});

/**
 * POST /api/inbox/adjuster/generate
 * Generates professional adjuster email content using AI
 */
export async function POST(req: NextRequest) {
  try {
    const supabase = createRouteHandlerClient({ cookies });
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const { thread_id, email_type, trigger_reason } = body;

    if (!thread_id || !email_type) {
      return NextResponse.json(
        { error: "thread_id and email_type are required" },
        { status: 400 }
      );
    }

    // Get thread data with all related information
    const { data: thread, error: threadError } = await supabase
      .from("inbox_threads")
      .select(
        `
        *,
        contact:contacts!inbox_threads_contact_id_fkey(id, name, email),
        workspace:workspaces(id, name, phone, email)
      `
      )
      .eq("id", thread_id)
      .single();

    if (threadError || !thread) {
      return NextResponse.json(
        { error: "Thread not found" },
        { status: 404 }
      );
    }

    // Get contractor info
    const { data: contractorSettings } = await supabase
      .from("company_settings")
      .select("*")
      .eq("workspace_id", thread.workspace_id)
      .single();

    const { data: userProfile } = await supabase
      .from("profiles")
      .select("email_signature, phone, company_name")
      .eq("id", user.id)
      .single();

    // Parse missing items
    let missingItems: string[] = [];
    try {
      const missingItemsJson = thread.profitability_signals?.missing_items;
      if (missingItemsJson && Array.isArray(missingItemsJson)) {
        missingItems = missingItemsJson;
      } else if (typeof missingItemsJson === "string") {
        missingItems = JSON.parse(missingItemsJson);
      }
    } catch (e) {
      console.error("Error parsing missing items:", e);
    }

    // Get SmartSend estimate if available
    const { data: roofEstimate } = await supabase
      .from("roof_estimates")
      .select("*")
      .eq("thread_id", thread_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Get contact separately if not included
    let contactName = "Homeowner";
    let contactEmail = "";
    if (thread.contact_id) {
      const { data: contact } = await supabase
        .from("contacts")
        .select("name, email")
        .eq("id", thread.contact_id)
        .single();
      if (contact) {
        contactName = contact.name || "Homeowner";
        contactEmail = contact.email || "";
      }
    }

    // Build context for AI
    const adjusterName =
      thread.insurance_adjuster_name || "Sir/Madam";
    const homeownerName = contactName;
    const claimNumber = thread.insurance_claim_number || "N/A";
    const carrier = thread.insurance_carrier || "Insurance Company";
    const companyName =
      contractorSettings?.company_name ||
      userProfile?.company_name ||
      thread.workspace?.name ||
      "Our Roofing Company";
    const companyPhone =
      contractorSettings?.company_phone ||
      userProfile?.phone ||
      thread.workspace?.phone ||
      "";
    const companyEmail =
      contractorSettings?.company_email ||
      user?.email ||
      thread.workspace?.email ||
      "";

    // Get SmartSend estimate if available
    const { data: roofEstimate } = await supabase
      .from("roof_estimates")
      .select("*")
      .eq("thread_id", thread_id)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Build AI prompt based on email type
    let systemPrompt = "";
    let userPrompt = "";

    switch (email_type) {
      case "supplement_request":
        systemPrompt = `You are a professional roofing contractor writing a supplement request email to an insurance adjuster. 
        Be professional, concise, and reference building codes and standard practices. 
        Format the email with proper greeting, clear missing items list, and professional closing.`;
        userPrompt = `Write a supplement request email with these details:
- Adjuster name: ${adjusterName}
- Homeowner name: ${homeownerName}
- Claim number: ${claimNumber}
- Insurance carrier: ${carrier}
- Missing items: ${missingItems.join(", ")}
- Company name: ${companyName}
- Company phone: ${companyPhone}
- Company email: ${companyEmail}

Subject line should be: "Supplement Request — Missing Items on Claim #${claimNumber}"

Include:
1. Professional greeting
2. Brief introduction (company name, assisting homeowner with claim)
3. List of missing code-required items
4. Reference to building codes and standard practices
5. Request for approval
6. Professional closing with contact info`;
        break;

      case "approval_nudge":
        systemPrompt = `You are a professional roofing contractor writing a follow-up email to an insurance adjuster about a pending claim approval.
        Be polite, professional, and reference the homeowner's need to proceed.`;
        userPrompt = `Write an approval nudge email with these details:
- Adjuster name: ${adjusterName}
- Homeowner name: ${homeownerName}
- Claim number: ${claimNumber}
- Insurance carrier: ${carrier}
- Company name: ${companyName}
- Company phone: ${companyPhone}
- Company email: ${companyEmail}

Subject line should be: "Follow-Up — Claim #${claimNumber} (Pending Approval)"

Keep it brief and professional. Reference that documentation was submitted and the homeowner is waiting to proceed.`;
        break;

      case "pricing_dispute":
        systemPrompt = `You are a professional roofing contractor writing a pricing clarification email to an insurance adjuster.
        Be professional and reference market rates and scope requirements.`;
        userPrompt = `Write a pricing dispute/clarification email with these details:
- Adjuster name: ${adjusterName}
- Homeowner name: ${homeownerName}
- Claim number: ${claimNumber}
- Insurance carrier: ${carrier}
- Insurance RCV: $${thread.claim_financials?.rcv_total || "N/A"}
- SmartSend Estimate: $${roofEstimate?.final_bid_price || "N/A"}
- Roof squares: ${thread.roof_scope?.total_squares || "N/A"}
- Steep charge: ${thread.roof_scope?.steep_charge ? "Yes" : "No"}
- 2-story: ${(thread.roof_scope?.stories || 1) >= 2 ? "Yes" : "No"}
- Company name: ${companyName}
- Company phone: ${companyPhone}
- Company email: ${companyEmail}

Subject line should be: "Pricing Clarification — Claim #${claimNumber}"

Explain that the RCV doesn't reflect standard market rates for the scope and reference your estimate.`;
        break;

      default:
        return NextResponse.json(
          { error: `Unknown email type: ${email_type}` },
          { status: 400 }
        );
    }

    // Generate email using OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
    });

    const generatedText = completion.choices[0].message.content || "";
    
    // Extract subject and body
    const lines = generatedText.split("\n");
    let subject = "";
    let bodyText = "";
    let bodyHtml = "";

    // Try to extract subject line
    const subjectMatch = generatedText.match(/Subject[:\s]+(.+)/i);
    if (subjectMatch) {
      subject = subjectMatch[1].trim();
      bodyText = generatedText.replace(/Subject[:\s]+.+?\n/i, "").trim();
    } else {
      // Use default subject based on type
      switch (email_type) {
        case "supplement_request":
          subject = `Supplement Request — Missing Items on Claim #${claimNumber}`;
          break;
        case "approval_nudge":
          subject = `Follow-Up — Claim #${claimNumber} (Pending Approval)`;
          break;
        case "pricing_dispute":
          subject = `Pricing Clarification — Claim #${claimNumber}`;
          break;
      }
      bodyText = generatedText.trim();
    }

    // Convert body to HTML (simple conversion)
    bodyHtml = bodyText
      .split("\n\n")
      .map((para) => {
        if (para.trim() === "") return "";
        // Check if it's a list item
        if (para.match(/^[-•]\s/)) {
          return `<ul><li>${para.replace(/^[-•]\s/, "").trim()}</li></ul>`;
        }
        return `<p>${para.replace(/\n/g, "<br>")}</p>`;
      })
      .join("");

    // Also try to extract HTML if provided
    const htmlMatch = generatedText.match(/<html>[\s\S]*<\/html>/i);
    if (htmlMatch) {
      bodyHtml = htmlMatch[0];
    }

    // Save draft to adjuster_emails table
    const { data: adjusterEmail, error: saveError } = await supabase
      .from("adjuster_emails")
      .insert({
        thread_id: thread_id,
        contact_id: thread.contact_id,
        lead_id: thread.lead_id,
        adjuster_name: adjusterName,
        adjuster_email: thread.insurance_adjuster_email,
        homeowner_name: homeownerName,
        claim_number: claimNumber,
        email_type: email_type,
        trigger_reason: trigger_reason || "manual_trigger",
        subject: subject,
        body_html: bodyHtml,
        body_text: bodyText,
        missing_items: missingItems,
        insurance_rcv: thread.claim_financials?.rcv_total || null,
        insurance_acv: thread.claim_financials?.acv_total || null,
        smart_send_estimate: roofEstimate?.final_bid_price || null,
        status: "draft",
      })
      .select()
      .single();

    if (saveError) {
      console.error("Error saving adjuster email:", saveError);
      // Don't fail the request, just log it
    }

    return NextResponse.json({
      email: {
        id: adjusterEmail?.id,
        subject,
        body_html: bodyHtml,
        body_text: bodyText,
        adjuster_name: adjusterName,
        adjuster_email: thread.insurance_adjuster_email,
        homeowner_name: homeownerName,
        claim_number: claimNumber,
      },
      thread_id: thread_id,
    });
  } catch (error: any) {
    console.error("[Generate Adjuster Email] Error:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate adjuster email" },
      { status: 500 }
    );
  }
}

