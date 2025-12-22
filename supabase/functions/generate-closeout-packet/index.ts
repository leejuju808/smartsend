// Block 45000 — SmartSend Roofing "AI Job Summary + Homeowner Closeout Packet" v1
// Edge Function: Generate AI-powered closeout packet when job is completed

import { serve } from "https://deno.land/std@0.177.1/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import OpenAI from "https://esm.sh/openai@4";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SERVICE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
const OPENAI_API_KEY = Deno.env.get("OPENAI_API_KEY")!;

serve(async (req) => {
  const supabase = createClient(SUPABASE_URL, SERVICE_KEY);
  const openai = new OpenAI({ apiKey: OPENAI_API_KEY });

  try {
    const { packet_id, job_id } = await req.json().catch(() => ({}));

    // If packet_id provided, use it; otherwise find pending packets
    let packet;
    if (packet_id) {
      const { data, error } = await supabase
        .from("closeout_packets")
        .select("*")
        .eq("id", packet_id)
        .single();
      
      if (error || !data) {
        return new Response(
          JSON.stringify({ error: "Closeout packet not found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
      packet = data;
    } else if (job_id) {
      const { data, error } = await supabase
        .from("closeout_packets")
        .select("*")
        .eq("job_id", job_id)
        .in("status", ["pending", "generating"])
        .order("created_at", { ascending: true })
        .limit(1)
        .single();
      
      if (error || !data) {
        return new Response(
          JSON.stringify({ error: "No pending closeout packet found" }),
          { status: 404, headers: { "Content-Type": "application/json" } }
        );
      }
      packet = data;
    } else {
      // Find next pending packet
      const { data, error } = await supabase
        .from("closeout_packets")
        .select("*")
        .eq("status", "pending")
        .order("created_at", { ascending: true })
        .limit(1)
        .single();
      
      if (error || !data) {
        return new Response(
          JSON.stringify({ ok: true, message: "No pending packets" }),
          { status: 200, headers: { "Content-Type": "application/json" } }
        );
      }
      packet = data;
    }

    const jobId = packet.job_id;

    // Update status to generating
    await supabase
      .from("closeout_packets")
      .update({ 
        status: "generating",
        generation_attempts: (packet.generation_attempts || 0) + 1
      })
      .eq("id", packet.id);

    // ============================================================================
    // STEP 1: Gather all job data
    // ============================================================================

    // Get job details
    const { data: job, error: jobError } = await supabase
      .from("roofing_jobs")
      .select(`
        *,
        leads:lead_id (
          id,
          first_name,
          last_name,
          email,
          phone,
          address_line1,
          address_line2,
          city,
          state,
          zip_code
        ),
        workspaces:workspace_id (
          id,
          name,
          owner_id
        )
      `)
      .eq("id", jobId)
      .single();

    if (jobError || !job) {
      throw new Error(`Job not found: ${jobError?.message}`);
    }

    // Get photos (before, after, issue, material)
    const { data: photos, error: photosError } = await supabase
      .from("job_field_photos")
      .select("id, tag, caption, storage_path")
      .eq("job_id", jobId)
      .in("tag", ["before", "after", "issue", "material", "during"]);

    if (photosError) {
      console.error("Error fetching photos:", photosError);
    }

    // Get public URLs for photos
    const photosWithUrls = (photos || []).map((photo) => {
      const { data: urlData } = supabase.storage
        .from("field-photos")
        .getPublicUrl(photo.storage_path);
      
      return {
        ...photo,
        url: urlData.publicUrl,
      };
    });

    // Group photos by category
    const photosByCategory: Record<string, typeof photosWithUrls> = {};
    photosWithUrls.forEach((photo) => {
      const category = photo.tag || "other";
      if (!photosByCategory[category]) {
        photosByCategory[category] = [];
      }
      photosByCategory[category].push(photo);
    });

    // Get materials usage
    const { data: materials, error: materialsError } = await supabase
      .from("material_usage")
      .select("material_name, quantity, unit")
      .eq("job_id", jobId);

    if (materialsError) {
      console.error("Error fetching materials:", materialsError);
    }

    // Get estimated materials from job_estimates
    const { data: estimate, error: estimateError } = await supabase
      .from("job_estimates")
      .select("estimated_materials")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false })
      .limit(1)
      .single();

    // Get labor hours
    const { data: laborLogs, error: laborError } = await supabase
      .from("job_labor_costs")
      .select("tot_hours, toi_hours, extra_hours, crew_size, notes")
      .eq("job_id", jobId);

    if (laborError) {
      console.error("Error fetching labor:", laborError);
    }

    // Get change orders
    const { data: changeOrders, error: coError } = await supabase
      .from("roofing_change_orders")
      .select(`
        id,
        description,
        status,
        created_at,
        approved_at,
        roofing_change_order_revenue(amount)
      `)
      .eq("job_id", jobId)
      .eq("status", "approved");

    if (coError) {
      console.error("Error fetching change orders:", coError);
    }

    // Get crew notes from job_field_sessions
    const { data: sessions, error: sessionsError } = await supabase
      .from("job_field_sessions")
      .select("notes, weather_conditions, created_at")
      .eq("job_id", jobId)
      .order("created_at", { ascending: false });

    if (sessionsError) {
      console.error("Error fetching sessions:", sessionsError);
    }

    // ============================================================================
    // STEP 2: Generate AI Summary
    // ============================================================================

    const lead = job.leads || {};
    const homeownerName = `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Valued Customer";
    const address = [
      lead.address_line1,
      lead.address_line2,
      `${lead.city || ""}, ${lead.state || ""} ${lead.zip_code || ""}`.trim()
    ].filter(Boolean).join(", ");

    // Build prompt for AI
    const materialsList = (materials || []).map(m => 
      `- ${m.material_name}: ${m.quantity} ${m.unit || "units"}`
    ).join("\n");

    const changeOrdersList = (changeOrders || []).map(co => {
      const amount = co.roofing_change_order_revenue?.[0]?.amount || 0;
      return `- ${co.description}: $${amount.toFixed(2)} (Approved: ${co.approved_at || co.created_at})`;
    }).join("\n");

    const laborSummary = (laborLogs || []).reduce((acc, log) => {
      const total = (log.tot_hours || 0) + (log.toi_hours || 0) + (log.extra_hours || 0);
      return acc + total;
    }, 0);

    const crewNotes = (sessions || [])
      .map(s => s.notes)
      .filter(Boolean)
      .join("\n");

    const weatherConditions = (sessions || [])
      .map(s => s.weather_conditions)
      .filter(Boolean)
      .join(", ");

    const prompt = `Create a professional roofing closeout summary for a homeowner.

Job Information:
- Homeowner: ${homeownerName}
- Address: ${address}
- Job Type: ${job.job_type || "Roof Replacement"}
- Job Value: $${job.job_value || 0}
- Completion Date: ${new Date().toLocaleDateString()}

Materials Used:
${materialsList || "No materials data available"}

Labor Hours: ${laborSummary.toFixed(1)} hours

Change Orders Approved:
${changeOrdersList || "No change orders"}

Crew Notes:
${crewNotes || "No crew notes available"}

Weather Conditions: ${weatherConditions || "Not recorded"}

Before Photos: ${photosByCategory.before?.length || 0} photos
After Photos: ${photosByCategory.after?.length || 0} photos
Issue Photos: ${photosByCategory.issue?.length || 0} photos

Create a professional roofing closeout summary for a homeowner.

Include:
1. Overview of the job
2. What work was completed
3. Materials used (list in human-friendly language)
4. Problems discovered & how they were handled
5. Change orders approved
6. Before/after improvements
7. Warranty information
8. Maintenance recommendations

Keep tone professional, simple, and reassuring.

Return JSON in this format:
{
  "overview": "Brief overview paragraph",
  "work_completed": ["Item 1", "Item 2", "Item 3"],
  "materials_used": ["Material 1", "Material 2"],
  "problems_discovered": ["Problem 1 and how it was handled"],
  "change_orders": ["Change order 1 description"],
  "before_after_improvements": "Description of improvements",
  "warranty_info": "Warranty information",
  "maintenance_recommendations": ["Recommendation 1", "Recommendation 2"]
}`;

    // Call OpenAI
    const completion = await openai.chat.completions.create({
      model: "gpt-4o",
      messages: [
        {
          role: "system",
          content: "You are a professional roofing company assistant. Generate clear, professional summaries for homeowners. Return valid JSON only, no markdown formatting."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.7,
      response_format: { type: "json_object" }
    });

    const aiResponse = completion.choices[0]?.message?.content;
    if (!aiResponse) {
      throw new Error("No response from AI");
    }

    let aiSummary;
    try {
      const cleaned = aiResponse.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
      aiSummary = JSON.parse(cleaned);
    } catch (parseError) {
      console.error("Failed to parse AI response:", parseError, aiResponse);
      throw new Error("Failed to parse AI response");
    }

    // Create human-readable summary text
    const summaryText = `
${aiSummary.overview || ""}

Work Completed:
${(aiSummary.work_completed || []).map((item: string) => `• ${item}`).join("\n")}

Materials Used:
${(aiSummary.materials_used || []).map((item: string) => `• ${item}`).join("\n")}

${aiSummary.problems_discovered && aiSummary.problems_discovered.length > 0 ? `
Problems Discovered & Resolved:
${aiSummary.problems_discovered.map((item: string) => `• ${item}`).join("\n")}
` : ""}

${aiSummary.change_orders && aiSummary.change_orders.length > 0 ? `
Change Orders Approved:
${aiSummary.change_orders.map((item: string) => `• ${item}`).join("\n")}
` : ""}

${aiSummary.before_after_improvements ? `
Before/After Improvements:
${aiSummary.before_after_improvements}
` : ""}

Warranty Information:
${aiSummary.warranty_info || "Your roof is covered by our workmanship warranty and manufacturer warranty. Details will be provided separately."}

Maintenance Recommendations:
${(aiSummary.maintenance_recommendations || []).map((item: string) => `• ${item}`).join("\n")}
`.trim();

    // ============================================================================
    // STEP 3: Store media groupings
    // ============================================================================

    // Store photo groupings
    for (const [category, categoryPhotos] of Object.entries(photosByCategory)) {
      if (categoryPhotos.length > 0) {
        const photoUrls = categoryPhotos.map(p => p.url);
        const photoIds = categoryPhotos.map(p => p.id);
        const captions = categoryPhotos.map(p => p.caption || "");

        await supabase
          .from("closeout_media")
          .insert({
            packet_id: packet.id,
            category: category,
            photo_urls: photoUrls,
            photo_ids: photoIds,
            captions: captions,
            ai_description: `Photos showing ${category} stage of the project`
          });
      }
    }

    // ============================================================================
    // STEP 4: Store materials breakdown
    // ============================================================================

    const estimatedMaterials = estimate?.estimated_materials || {};
    
    for (const material of materials || []) {
      const estimatedQty = estimatedMaterials[material.material_name] || null;
      
      await supabase
        .from("closeout_materials")
        .insert({
          packet_id: packet.id,
          material_name: material.material_name,
          estimated_quantity: estimatedQty,
          actual_quantity: material.quantity,
          unit: material.unit || "units"
        });
    }

    // ============================================================================
    // STEP 5: Store replacements (from change orders and job notes)
    // ============================================================================

    // Extract replacements from change orders
    for (const co of changeOrders || []) {
      if (co.description) {
        await supabase
          .from("closeout_replacements")
          .insert({
            packet_id: packet.id,
            item_description: co.description,
            reason: "Change order approved",
            photo_urls: [] // Could be enhanced to pull photos from change order
          });
      }
    }

    // ============================================================================
    // STEP 6: Store change order receipts
    // ============================================================================

    for (const co of changeOrders || []) {
      const amount = co.roofing_change_order_revenue?.[0]?.amount || 0;
      
      await supabase
        .from("closeout_change_orders")
        .insert({
          packet_id: packet.id,
          change_order_id: co.id,
          description: co.description,
          amount: amount,
          approved_at: co.approved_at || co.created_at
        });
    }

    // ============================================================================
    // STEP 7: Generate PDF (HTML for now, can be converted to PDF later)
    // ============================================================================

    const pdfHtml = generateCloseoutPDFHTML(job, lead, aiSummary, photosByCategory, materials, changeOrders, summaryText);

    // Store PDF HTML in storage (we'll convert to actual PDF in a separate step)
    const pdfFileName = `closeout-packet-${jobId}-${Date.now()}.html`;
    const pdfStoragePath = `${packet.workspace_id}/closeout-packets/${pdfFileName}`;

    const { error: uploadError } = await supabase.storage
      .from("closeout-packets")
      .upload(pdfStoragePath, new TextEncoder().encode(pdfHtml), {
        contentType: "text/html",
        upsert: true
      });

    if (uploadError) {
      console.error("Error uploading PDF:", uploadError);
      // Continue anyway - we can regenerate PDF later
    }

    const { data: pdfUrlData } = supabase.storage
      .from("closeout-packets")
      .getPublicUrl(pdfStoragePath);

    // ============================================================================
    // STEP 8: Update closeout packet
    // ============================================================================

    await supabase
      .from("closeout_packets")
      .update({
        status: "generated",
        pdf_url: pdfUrlData.publicUrl,
        pdf_storage_path: pdfStoragePath,
        summary_json: aiSummary,
        ai_summary_text: summaryText,
        generated_at: new Date().toISOString()
      })
      .eq("id", packet.id);

    // ============================================================================
    // STEP 9: Send to homeowner (via email)
    // ============================================================================

    // Trigger email send (will be handled by API route or webhook)
    // For now, we'll call the email API if available
    try {
      const emailApiUrl = Deno.env.get("APP_URL") || "https://app.smartsend.ai";
      await fetch(`${emailApiUrl}/api/jobs/${jobId}/closeout-packet/send-email`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
      }).catch((err) => {
        console.warn("Failed to trigger email send:", err);
        // Non-critical - email can be sent manually later
      });
    } catch (emailError) {
      console.warn("Email send trigger failed (non-critical):", emailError);
    }

    return new Response(
      JSON.stringify({
        ok: true,
        packet_id: packet.id,
        job_id: jobId,
        pdf_url: pdfUrlData.publicUrl,
        status: "generated"
      }),
      { headers: { "Content-Type": "application/json" } }
    );

  } catch (error: any) {
    console.error("Error generating closeout packet:", error);
    
    // Update packet status to failed
    if (packet?.id) {
      await supabase
        .from("closeout_packets")
        .update({
          status: "failed",
          error_message: error.message
        })
        .eq("id", packet.id);
    }

    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// Helper function to generate PDF HTML
function generateCloseoutPDFHTML(
  job: any,
  lead: any,
  aiSummary: any,
  photosByCategory: Record<string, any[]>,
  materials: any[],
  changeOrders: any[],
  summaryText: string
): string {
  const homeownerName = `${lead.first_name || ""} ${lead.last_name || ""}`.trim() || "Valued Customer";
  const address = [
    lead.address_line1,
    lead.address_line2,
    `${lead.city || ""}, ${lead.state || ""} ${lead.zip_code || ""}`.trim()
  ].filter(Boolean).join(", ");

  const companyName = job.workspaces?.name || "Your Roofing Company";
  const completionDate = new Date().toLocaleDateString("en-US", {
    year: "numeric",
    month: "long",
    day: "numeric"
  });

  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <title>Your Roof Replacement Summary - ${companyName}</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      background: #f5f5f5;
      padding: 20px;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      background: white;
      padding: 40px;
      box-shadow: 0 2px 10px rgba(0,0,0,0.1);
    }
    .header {
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    h1 {
      color: #2563eb;
      font-size: 28px;
      margin-bottom: 10px;
    }
    .subtitle {
      color: #666;
      font-size: 14px;
    }
    .section {
      margin-bottom: 40px;
    }
    .section h2 {
      color: #1e40af;
      font-size: 20px;
      margin-bottom: 15px;
      border-bottom: 2px solid #e5e7eb;
      padding-bottom: 8px;
    }
    .summary-text {
      white-space: pre-line;
      line-height: 1.8;
      color: #374151;
    }
    .photo-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
      margin-top: 15px;
    }
    .photo-item {
      border: 1px solid #e5e7eb;
      border-radius: 8px;
      overflow: hidden;
    }
    .photo-item img {
      width: 100%;
      height: 200px;
      object-fit: cover;
    }
    .photo-caption {
      padding: 10px;
      background: #f9fafb;
      font-size: 12px;
      color: #6b7280;
    }
    .materials-table {
      width: 100%;
      border-collapse: collapse;
      margin-top: 15px;
    }
    .materials-table th,
    .materials-table td {
      padding: 12px;
      text-align: left;
      border-bottom: 1px solid #e5e7eb;
    }
    .materials-table th {
      background: #f9fafb;
      font-weight: 600;
      color: #374151;
    }
    .change-order-item {
      background: #f9fafb;
      padding: 15px;
      border-radius: 8px;
      margin-bottom: 10px;
      border-left: 4px solid #2563eb;
    }
    .footer {
      margin-top: 40px;
      padding-top: 20px;
      border-top: 2px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 12px;
    }
    .before-after {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 20px;
      margin-top: 15px;
    }
    .before-after-item h3 {
      font-size: 16px;
      margin-bottom: 10px;
      color: #374151;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>Your Roof Replacement Summary</h1>
      <div class="subtitle">
        Completed by ${companyName}<br>
        ${completionDate}
      </div>
    </div>

    <div class="section">
      <h2>Project Overview</h2>
      <div class="summary-text">${summaryText}</div>
    </div>

    ${photosByCategory.before && photosByCategory.before.length > 0 && photosByCategory.after && photosByCategory.after.length > 0 ? `
    <div class="section">
      <h2>Before & After Photos</h2>
      <div class="before-after">
        <div class="before-after-item">
          <h3>Before</h3>
          ${photosByCategory.before.slice(0, 2).map((photo: any) => `
            <div class="photo-item">
              <img src="${photo.url}" alt="Before photo">
              ${photo.caption ? `<div class="photo-caption">${photo.caption}</div>` : ''}
            </div>
          `).join('')}
        </div>
        <div class="before-after-item">
          <h3>After</h3>
          ${photosByCategory.after.slice(0, 2).map((photo: any) => `
            <div class="photo-item">
              <img src="${photo.url}" alt="After photo">
              ${photo.caption ? `<div class="photo-caption">${photo.caption}</div>` : ''}
            </div>
          `).join('')}
        </div>
      </div>
    </div>
    ` : ''}

    ${materials && materials.length > 0 ? `
    <div class="section">
      <h2>Materials Used</h2>
      <table class="materials-table">
        <thead>
          <tr>
            <th>Material</th>
            <th>Estimated</th>
            <th>Actual</th>
            <th>Difference</th>
          </tr>
        </thead>
        <tbody>
          ${materials.map((m: any) => `
            <tr>
              <td>${m.material_name}</td>
              <td>${m.estimated_quantity || 'N/A'}</td>
              <td>${m.quantity} ${m.unit || ''}</td>
              <td>${(m.quantity - (m.estimated_quantity || 0)).toFixed(1)}</td>
            </tr>
          `).join('')}
        </tbody>
      </table>
    </div>
    ` : ''}

    ${changeOrders && changeOrders.length > 0 ? `
    <div class="section">
      <h2>Change Orders Approved</h2>
      ${changeOrders.map((co: any) => {
        const amount = co.roofing_change_order_revenue?.[0]?.amount || 0;
        return `
          <div class="change-order-item">
            <strong>${co.description}</strong><br>
            Amount: $${amount.toFixed(2)}<br>
            Approved: ${new Date(co.approved_at || co.created_at).toLocaleDateString()}
          </div>
        `;
      }).join('')}
    </div>
    ` : ''}

    <div class="section">
      <h2>Warranty Information</h2>
      <div class="summary-text">
        ${aiSummary.warranty_info || "Your roof is covered by our workmanship warranty and manufacturer warranty. Details will be provided separately."}
      </div>
    </div>

    <div class="section">
      <h2>Maintenance Recommendations</h2>
      <ul style="line-height: 2;">
        ${(aiSummary.maintenance_recommendations || []).map((rec: string) => `<li>${rec}</li>`).join('')}
      </ul>
    </div>

    <div class="footer">
      <p>Thank you for choosing ${companyName}!</p>
      <p>If you have any questions, please don't hesitate to contact us.</p>
    </div>
  </div>
</body>
</html>`;
}

