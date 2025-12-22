// Block 228000 — Generate Insurance Supplement Document
// POST /api/supplements/generate-document
// Generates AI-written supplement letter with Xactimate line items

import { NextRequest, NextResponse } from "next/server";
import { getServerSupabase } from "@/lib/supabase/server";
import OpenAI from "openai";

const openai = new OpenAI({
  apiKey: process.env.OPENAI_API_KEY!,
});

export async function POST(req: NextRequest) {
  try {
    const supabase = await getServerSupabase();
    const { data: { user }, error: authError } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { supplement_id } = await req.json();

    if (!supplement_id) {
      return NextResponse.json(
        { error: "supplement_id is required" },
        { status: 400 }
      );
    }

    // Get supplement with items and job info
    const { data: supplement, error: supplementError } = await supabase
      .from("insurance_supplements")
      .select(`
        *,
        supplement_items (*),
        jobs!inner (
          id,
          address,
          homeowner_name
        )
      `)
      .eq("id", supplement_id)
      .single();

    if (supplementError || !supplement) {
      // Try roofing_jobs
      const { data: roofingSupplement, error: roofingError } = await supabase
        .from("insurance_supplements")
        .select(`
          *,
          supplement_items (*),
          roofing_jobs!inner (
            id,
            address,
            homeowner_name
          )
        `)
        .eq("id", supplement_id)
        .single();

      if (roofingError || !roofingSupplement) {
        return NextResponse.json(
          { error: "Supplement not found" },
          { status: 404 }
        );
      }

      // Use roofing supplement
      const jobInfo = Array.isArray(roofingSupplement.roofing_jobs) 
        ? roofingSupplement.roofing_jobs[0] 
        : roofingSupplement.roofing_jobs;

      // Generate AI-written supplement letter
      const supplementLetter = await generateSupplementLetter(
        roofingSupplement,
        roofingSupplement.supplement_items || [],
        jobInfo
      );

      return NextResponse.json({
        success: true,
        supplement_id,
        letter_html: supplementLetter.html,
        letter_text: supplementLetter.text,
        document_url: null, // Would be uploaded to storage in production
      });
    }

    // Use jobs table data
    const jobInfo = Array.isArray(supplement.jobs) 
      ? supplement.jobs[0] 
      : supplement.jobs;

    // Generate AI-written supplement letter
    const supplementLetter = await generateSupplementLetter(
      supplement,
      supplement.supplement_items || [],
      jobInfo
    );

    return NextResponse.json({
      success: true,
      supplement_id,
      letter_html: supplementLetter.html,
      letter_text: supplementLetter.text,
      document_url: null, // Would be uploaded to storage in production
    });
  } catch (error: any) {
    console.error("Error generating supplement document:", error);
    return NextResponse.json(
      { error: error.message || "Failed to generate supplement document" },
      { status: 500 }
    );
  }
}

async function generateSupplementLetter(
  supplement: any,
  items: any[],
  jobInfo: any
): Promise<{ html: string; text: string }> {
  const itemsList = items.map(item => 
    `- ${item.description} (${item.xactimate_code || 'N/A'}): ${item.qty} @ $${item.unit_price} = $${item.line_total}`
  ).join('\n');

  const prompt = `You are a professional roofing contractor writing an insurance supplement request letter. 

Job Address: ${jobInfo?.address || 'N/A'}
Reason: ${supplement.reason}
Description: ${supplement.description}
Requested Amount: $${supplement.requested_amount?.toFixed(2) || '0.00'}

Line Items:
${itemsList}

Write a professional, clear insurance supplement request letter that:
1. Clearly explains why additional work is needed
2. References local building codes where applicable
3. Lists all Xactimate line items
4. Justifies the additional costs professionally
5. Uses contractor-standard language that adjusters expect
6. Is polite but firm

Format the response as a professional business letter with proper headings, date, and closing.`;

  const completion = await openai.chat.completions.create({
    model: "gpt-4o-mini",
    messages: [
      {
        role: "system",
        content: "You are a professional roofing contractor writing insurance supplement requests. You write clear, professional letters that adjusters understand and respect.",
      },
      {
        role: "user",
        content: prompt,
      },
    ],
    max_tokens: 1500,
    temperature: 0.7,
  });

  const letterText = completion.choices[0]?.message?.content || supplement.description;

  // Convert to HTML
  const letterHtml = `
    <div style="font-family: 'Times New Roman', serif; max-width: 800px; margin: 0 auto; padding: 40px;">
      <div style="text-align: right; margin-bottom: 30px;">
        <p>${new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' })}</p>
      </div>
      
      ${letterText.split('\n\n').map(para => 
        `<p style="margin-bottom: 15px; line-height: 1.6;">${para.replace(/\n/g, '<br>')}</p>`
      ).join('')}
      
      <div style="margin-top: 40px;">
        <p>Sincerely,</p>
        <p>${supplement.created_by || 'Contractor'}</p>
      </div>
      
      ${items.length > 0 ? `
        <div style="margin-top: 40px; page-break-inside: avoid;">
          <h3 style="border-bottom: 2px solid #000; padding-bottom: 5px;">Supplement Line Items</h3>
          <table style="width: 100%; border-collapse: collapse; margin-top: 20px;">
            <thead>
              <tr style="background-color: #f5f5f5;">
                <th style="padding: 10px; text-align: left; border: 1px solid #000;">Xactimate Code</th>
                <th style="padding: 10px; text-align: left; border: 1px solid #000;">Description</th>
                <th style="padding: 10px; text-align: right; border: 1px solid #000;">Qty</th>
                <th style="padding: 10px; text-align: right; border: 1px solid #000;">Unit Price</th>
                <th style="padding: 10px; text-align: right; border: 1px solid #000;">Total</th>
              </tr>
            </thead>
            <tbody>
              ${items.map((item: any) => `
                <tr>
                  <td style="padding: 10px; border: 1px solid #000;">${item.xactimate_code || 'N/A'}</td>
                  <td style="padding: 10px; border: 1px solid #000;">${item.description}</td>
                  <td style="padding: 10px; text-align: right; border: 1px solid #000;">${item.qty}</td>
                  <td style="padding: 10px; text-align: right; border: 1px solid #000;">$${item.unit_price?.toFixed(2)}</td>
                  <td style="padding: 10px; text-align: right; border: 1px solid #000;">$${item.line_total?.toFixed(2)}</td>
                </tr>
              `).join('')}
            </tbody>
            <tfoot>
              <tr style="font-weight: bold;">
                <td colspan="4" style="padding: 10px; text-align: right; border: 1px solid #000;">Total Supplement Request:</td>
                <td style="padding: 10px; text-align: right; border: 1px solid #000;">$${supplement.requested_amount?.toFixed(2)}</td>
              </tr>
            </tfoot>
          </table>
        </div>
      ` : ''}
    </div>
  `;

  return {
    html: letterHtml,
    text: letterText,
  };
}

























